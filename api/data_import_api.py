"""Bulk import — upload a CSV/Excel file, map its columns to a table's
real fields, and run a background job that inserts (or upserts, when a
match-on field set is given) one row per file row.

The upload itself goes through arc.filer (the same /files/upload route
UploadFileRoute.tsx already uses) — this module only ever sees the
resulting TOKEN (filerClient.ts's UploadResult.file_id), never handles
raw multipart data itself. See admin/jobs/data_import_job.py for the
actual parsing/writing; this file is purely validation + job bookkeeping,
same shape as data_export_api.py.
"""

from __future__ import annotations

import arc

from admin._dataops import friendly as _friendly
from admin._dataops import load_filerfile_row
from admin._dataops import require_not_protected as _require_not_protected
from admin._dataops import schema_or_throw as _schema_or_throw
from admin._pagination import cursor_page
from admin._security import by_of
from admin.jobs._file_reading import iter_rows_preview

_ON_ERROR_VALUES = frozenset({"abort", "skip"})
_RESUMABLE_STATUSES = frozenset({"CompletedWithErrors", "Failed"})


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
    identity=None,
) -> dict:
    """`file` is the upload token; `column_mapping` is {file_column:
    field_name} — every mapped field_name is validated against the
    table's real columns up front, so a stale/bad mapping fails
    immediately instead of surfacing later as a confusing per-row error
    in a background job nobody's watching yet."""
    _require_not_protected(table)
    schema = _schema_or_throw(table)
    if on_error not in _ON_ERROR_VALUES:
        arc.relay.throw(f"on_error must be one of {sorted(_ON_ERROR_VALUES)}", code="bad_on_error")
    if not column_mapping:
        arc.relay.throw("column_mapping must map at least one file column", code="empty_mapping")
    known = schema.columns_by_name
    unknown_targets = [v for v in column_mapping.values() if v not in known]
    if unknown_targets:
        arc.relay.throw(
            f"'{table}': unknown field(s) {unknown_targets} in column_mapping", status=400, code="unknown_field"
        )
    # [] and omitted both mean "insert-only" — normalized to None here so
    # the job never has to treat the two differently downstream.
    match_on = match_on or None
    if match_on:
        unknown_match = [f for f in match_on if f not in known]
        if unknown_match:
            arc.relay.throw(
                f"'{table}': unknown match_on field(s) {unknown_match}", status=400, code="unknown_field"
            )

    file_row = await load_filerfile_row(file)

    job = await arc.relay.save(
        "_data_import_job",
        {
            "table": table,
            "file": file_row["id"],
            "column_mapping": column_mapping,
            "match_on": match_on,
            "on_error": on_error,
            "status": "Queued",
            "created_by": by_of(identity),
        },
    )

    from admin.jobs.data_import_job import _run_import_job

    arc.relay.enqueue(_run_import_job, str(job["id"]))
    return job


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def get_import_status(job_id: str) -> dict:
    job = await arc.relay.get("_data_import_job", job_id, arc.relay.all_columns("_data_import_job"))
    if job is None:
        arc.relay.throw("no such import job", status=404, code="not_found")
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
async def resume_import(job_id: str) -> dict:
    """Retry-only (see admin/jobs/data_import_job.py's own docstring): re-
    enqueues the job to re-process whatever's still pending/failed, using
    each row's own already-stored raw_data — never re-reads the original
    file. Rejects a job that isn't in a genuinely resumable terminal
    state, guarding a double-click or a second browser tab against
    launching two overlapping runs of the same job."""
    job = await arc.relay.get("_data_import_job", job_id, ["id", "status"])
    if job is None:
        arc.relay.throw("no such import job", status=404, code="not_found")
    if job["status"] not in _RESUMABLE_STATUSES:
        arc.relay.throw(
            f"job is '{job['status']}' — only {sorted(_RESUMABLE_STATUSES)} jobs can be resumed",
            status=409,
            code="not_resumable",
        )
    updated = await arc.relay.save(
        "_data_import_job",
        {"id": job_id, "status": "Queued", "started_at": None, "finished_at": None, "error": None},
    )

    from admin.jobs.data_import_job import _run_import_job

    arc.relay.enqueue(_run_import_job, str(job_id))
    return updated
