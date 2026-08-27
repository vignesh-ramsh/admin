"""Bulk import — upload a CSV/Excel file, map its columns to a table's
real fields, and run a background job that inserts/updates/upserts one
row per file row.

The upload itself goes through arc.filer (the same /files/upload route
UploadFileRoute.tsx already uses) — this module only ever sees the
resulting TOKEN (filerClient.ts's UploadResult.file_id), never handles
raw multipart data itself. See admin/jobs/data_import_job.py for the
actual parsing/writing; this file is purely validation + job bookkeeping,
same shape as data_export_api.py.

Staging and committing are two separate steps now (2026-08-25 design):
start_import only ever gets a job to PendingReview (file staged into
_data_import_row, every row precheck'd, nothing written to the target
table yet) — a human reviews list_import_row_errors and then either
commit_import()s or replace_import_file()s. See
admin/jobs/data_import_job.py's own module docstring for the full
Queued -> PendingReview -> Running -> terminal state machine.
"""

from __future__ import annotations

import arc

from admin._dataops import friendly as _friendly
from admin._dataops import load_filerfile_row
from admin._dataops import load_filerfile_row_by_id
from admin._dataops import require_not_protected as _require_not_protected
from admin._dataops import schema_or_throw as _schema_or_throw
from admin._pagination import cursor_page
from admin._security import by_of
from admin.jobs._file_reading import iter_rows_preview

JOB_TABLE = "_data_import_export_job"

_ON_ERROR_VALUES = frozenset({"abort", "skip"})
_IMPORT_TYPES = frozenset({"insert", "update", "upsert"})
_RESUMABLE_STATUSES = frozenset({"CompletedWithErrors", "Failed"})
_REPLACEABLE_STATUSES = frozenset({"Queued", "PendingReview"})


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def preview_import_columns(file: str) -> dict:
    """`file` is the upload token. Reads just enough of the file (header +
    a handful of sample rows) to drive the column-mapping UI — never the
    whole file, so this stays cheap even for a large upload."""
    file_row = await load_filerfile_row(file)
    columns, sample_rows, row_count_hint = await iter_rows_preview(file_row)
    return {"columns": columns, "sample_rows": sample_rows, "row_count_hint": row_count_hint}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def start_import(
    table: str,
    file: str,
    column_mapping: dict[str, str],
    on_error: str,
    match_on: list[str] | None = None,
    import_type: str = "upsert",
    null_on_empty: bool = False,
    identity=None,
) -> dict:
    """`file` is the upload token; `column_mapping` is {file_column:
    field_name} — every mapped field_name is validated against the
    table's real columns up front, so a stale/bad mapping fails
    immediately instead of surfacing later as a confusing per-row error
    in a background job nobody's watching yet.

    Only ever gets the job to Queued and enqueues staging — never writes
    to the target table itself. See admin.jobs.data_import_job's module
    docstring for the full state machine."""
    _require_not_protected(table)
    schema = _schema_or_throw(table)
    if on_error not in _ON_ERROR_VALUES:
        arc.relay.throw(f"on_error must be one of {sorted(_ON_ERROR_VALUES)}", code="bad_on_error")
    if import_type not in _IMPORT_TYPES:
        arc.relay.throw(f"import_type must be one of {sorted(_IMPORT_TYPES)}", code="bad_import_type")
    if not column_mapping:
        arc.relay.throw("column_mapping must map at least one file column", code="empty_mapping")
    known = schema.columns_by_name
    unknown_targets = [v for v in column_mapping.values() if v not in known]
    if unknown_targets:
        arc.relay.throw(
            f"'{table}': unknown field(s) {unknown_targets} in column_mapping", status=400, code="unknown_field"
        )
    # [] and omitted both mean "no match_on" — normalized to None here so
    # the job never has to treat the two differently downstream.
    match_on = match_on or None
    if import_type == "insert":
        # match_on is meaningless for a pure insert — dropped rather than
        # rejected, so a caller that always sends whatever the UI last had
        # selected doesn't need to remember to clear it too.
        match_on = None
    elif not match_on:
        arc.relay.throw(f"import_type={import_type!r} requires match_on to be set", status=400, code="match_on_required")
    if match_on:
        unknown_match = [f for f in match_on if f not in known]
        if unknown_match:
            arc.relay.throw(
                f"'{table}': unknown match_on field(s) {unknown_match}", status=400, code="unknown_field"
            )

    file_row = await load_filerfile_row(file)

    job = await arc.relay.save(
        JOB_TABLE,
        {
            "table": table,
            "direction": "Import",
            "file": file_row["id"],
            "settings": {
                "column_mapping": column_mapping,
                "match_on": match_on,
                "import_type": import_type,
                "on_error": on_error,
                "null_on_empty": null_on_empty,
            },
            "status": "Queued",
            "created_by": by_of(identity),
        },
    )

    from admin.jobs.data_import_job import _run_import_stage

    arc.relay.enqueue(_run_import_stage, str(job["id"]))
    return job


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_import_row_errors(job_id: str, after: str | None = None, limit: int = 50) -> dict:
    schema = _schema_or_throw("_data_import_row")
    try:
        rows, next_cursor, total = await cursor_page(
            "_data_import_row",
            schema,
            fields=["id", "row_number", "raw_data", "error"],
            filters={"job": job_id, "status": {"eq": "failed"}},
            order_by=("row_number", False),
            after=after,
            limit=limit,
        )
    except Exception as exc:  # noqa: BLE001 - same friendly-error posture as every other admin read
        _friendly(exc)
    return {"rows": rows, "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def commit_import(job_id: str) -> dict:
    """PendingReview -> Running. The one action that actually starts
    writing to the target table — everything before this point (staging,
    precheck, reviewing errors, optionally replacing the file) is
    reversible; this isn't."""
    job = await arc.relay.get(JOB_TABLE, job_id, ["id", "status", "direction"])
    if job is None:
        arc.relay.throw("no such import job", status=404, code="not_found")
    if job["direction"] != "Import":
        arc.relay.throw("not an import job", status=409, code="wrong_direction")
    if job["status"] != "PendingReview":
        arc.relay.throw(
            f"job is '{job['status']}' — only a job awaiting review can be committed", status=409, code="not_pending_review"
        )
    updated = await arc.relay.save(JOB_TABLE, {"id": job_id, "status": "Running"})

    from admin.jobs.data_import_job import _run_import_commit

    arc.relay.enqueue(_run_import_commit, str(job_id))
    return updated


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def replace_import_file(job_id: str, file: str) -> dict:
    """Only valid while the job hasn't started writing anywhere yet
    (Queued/PendingReview) — swaps the source file, wipes whatever was
    already staged into _data_import_row for this job, and re-stages from
    scratch against the new file. The old file is deleted via
    arc.filer.delete() — filer's own soft-delete-then-purge lifecycle
    (queued for its normal purge-after-days window), not an immediate
    hard delete: that's the only deletion primitive filer exposes
    publicly, and admin deliberately never reaches around another
    plugin's API to touch storage directly (see admin/__init__.py's own
    module docstring)."""
    job = await arc.relay.get(JOB_TABLE, job_id, ["id", "status", "direction", "file"])
    if job is None:
        arc.relay.throw("no such import job", status=404, code="not_found")
    if job["direction"] != "Import":
        arc.relay.throw("not an import job", status=409, code="wrong_direction")
    if job["status"] not in _REPLACEABLE_STATUSES:
        arc.relay.throw(
            f"job is '{job['status']}' — the file can only be replaced while {sorted(_REPLACEABLE_STATUSES)}",
            status=409,
            code="not_replaceable",
        )

    new_file_row = await load_filerfile_row(file)

    old_rows = await arc.relay.list("_data_import_row", fields=["id"], filters={"job": job_id}, limit=None)
    if old_rows:
        await arc.relay.delete_many("_data_import_row", [r["id"] for r in old_rows])

    if job["file"]:
        old_file_row = await load_filerfile_row_by_id(job["file"])
        if old_file_row is not None:
            await arc.filer.delete(old_file_row["file_id"])

    updated = await arc.relay.save(
        JOB_TABLE,
        {
            "id": job_id,
            "file": new_file_row["id"],
            "status": "Queued",
            "stats": None,
            "error": None,
            "started_at": None,
            "finished_at": None,
        },
    )

    from admin.jobs.data_import_job import _run_import_stage

    arc.relay.enqueue(_run_import_stage, str(job_id))
    return updated


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def resume_import(job_id: str) -> dict:
    """Retry-only (see admin/jobs/data_import_job.py's own docstring): re-
    enqueues the COMMIT phase to re-process whatever's still pending/
    failed, using each row's own already-stored raw_data — never re-reads
    the original file, never re-stages. Rejects a job that isn't in a
    genuinely resumable terminal state, guarding a double-click or a
    second browser tab against launching two overlapping runs of the same
    job."""
    job = await arc.relay.get(JOB_TABLE, job_id, ["id", "status", "direction"])
    if job is None:
        arc.relay.throw("no such import job", status=404, code="not_found")
    if job["direction"] != "Import":
        arc.relay.throw("not an import job", status=409, code="wrong_direction")
    if job["status"] not in _RESUMABLE_STATUSES:
        arc.relay.throw(
            f"job is '{job['status']}' — only {sorted(_RESUMABLE_STATUSES)} jobs can be resumed",
            status=409,
            code="not_resumable",
        )
    updated = await arc.relay.save(
        JOB_TABLE,
        {"id": job_id, "status": "Running", "finished_at": None, "error": None},
    )

    from admin.jobs.data_import_job import _run_import_commit

    arc.relay.enqueue(_run_import_commit, str(job_id))
    return updated
