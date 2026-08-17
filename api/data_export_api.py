"""Bulk export — start a background job that streams a table (optionally
scoped to a filter, and to a chosen subset of fields) into a CSV/Excel
file, then hand back a signed download link once it's ready.

No new write-path logic: the job itself (admin/jobs/data_export_job.py)
reads through admin._pagination.cursor_page — the exact same primitive
list_rows/data_api.py already uses — so an export can never see a
different set of rows than the Data Browser itself would show for the
same filter. The file is delivered through arc.filer (upload + sign_url),
not a new download mechanism.
"""

from __future__ import annotations

import arc

from admin._coerce import CoercionError, coerce_filters, throw_coercion
from admin._dataops import schema_or_throw as _schema_or_throw
from admin._security import by_of

_FORMATS = frozenset({"csv", "xlsx"})


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def start_export(
    table: str,
    fields: list[str],
    format: str,
    filters: dict | None = None,
    search: list[str] | None = None,
    identity=None,
) -> dict:
    """Validates everything up front (table, every requested field name,
    format) so a bad request fails immediately with a clear message,
    rather than surfacing later as a background job silently doing
    nothing useful. `filters`/`search` are optional — omitted means "every
    row" (Export's own "All matching records" scope); when given, they're
    coerced through the exact same path list_rows/save_rows_bulk_by_filter
    already use, so a typed column's filter value works identically here."""
    schema = _schema_or_throw(table)
    if not fields:
        arc.relay.throw("fields must be a non-empty list", code="empty_fields")
    if format not in _FORMATS:
        arc.relay.throw(f"format must be one of {sorted(_FORMATS)}", code="bad_format")
    known = schema.columns_by_name
    unknown = [f for f in fields if f not in known]
    if unknown:
        arc.relay.throw(
            f"'{table}': unknown field(s) {unknown} — not real columns on this table",
            status=400,
            code="unknown_field",
        )
    try:
        filters = coerce_filters(schema, filters)
    except CoercionError as exc:
        throw_coercion(exc)

    job = await arc.relay.save(
        "_data_export_job",
        {
            "table": table,
            "filters": filters,
            "search": search,
            "fields": fields,
            "format": format,
            "status": "Queued",
            "created_by": by_of(identity),
        },
    )

    from admin.jobs.data_export_job import _run_export_job

    arc.relay.enqueue(_run_export_job, str(job["id"]))
    return job


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def get_export_status(job_id: str) -> dict:
    job = await arc.relay.get("_data_export_job", job_id, arc.relay.all_columns("_data_export_job"))
    if job is None:
        arc.relay.throw("no such export job", status=404, code="not_found")

    job["download_url"] = None
    job["scan_pending"] = False
    if job["status"] == "Completed" and job.get("file"):
        file_row = await load_filerfile_row_by_id(job["file"])
        if file_row is None:
            job["error"] = job["error"] or "exported file is missing"
        elif file_row["status"] not in ("clean", "skipped"):
            job["scan_pending"] = True
        else:
            job["download_url"] = await arc.filer.sign_url(file_row["file_id"])
    return job


async def load_filerfile_row_by_id(file_id) -> dict | None:
    """The `file` column on _data_export_job/_data_import_job is a
    REFERENCE (the row's own UUID) — the inverse of
    admin._dataops.load_filerfile_row, which resolves the other
    direction (upload TOKEN -> row). Kept here rather than in _dataops
    since only the status-polling read path needs it."""
    return await arc.relay.get("filerfile", file_id, arc.relay.all_columns("filerfile"))
