"""Bulk export — start a background job that streams a table (optionally
scoped to a filter, and to a chosen subset of fields) into a CSV/Excel
file, then hand back a signed download link once it's ready.

No new write-path logic: the job itself (admin/jobs/data_export_job.py)
reads through admin._pagination.cursor_page — the exact same primitive
list_rows/data_api.py already uses — so an export can never see a
different set of rows than the Data Browser itself would show for the
same filter. The file is delivered through arc.filer (upload + sign_url),
not a new download mechanism.

Export runs straight through in the background (Queued -> Running ->
Completed/Failed) — no PendingReview checkpoint, unlike import: there's
no source file to precheck, and the "settings" are already fully
validated up front, right here, before the job is ever enqueued. Status
polling (get_data_job, including the download_url/scan_pending fields
computed fresh on every poll) lives in admin/api/data_jobs_api.py now —
shared with import, since both directions read from the same
_data_import_export_job table.
"""

from __future__ import annotations

from typing import Final

import arc

from admin._coerce import CoercionError, coerce_filters, throw_coercion
from admin._dataops import schema_or_throw as _schema_or_throw
from admin._security import by_of

# Final: lets arc.relay's generated per-table overloads (arc stubs) narrow
# every arc.relay.*(JOB_TABLE, ...) call below to this literal table and
# validate its field names — a plain `str` assignment doesn't get that
# narrowing outside this module's own local flow.
JOB_TABLE: Final = "_data_import_export_job"

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
        JOB_TABLE,
        {
            "table": table,
            "direction": "Export",
            "settings": {"filters": filters, "search": search, "fields": fields, "format": format},
            "status": "Queued",
            "created_by": by_of(identity),
        },
    )

    from admin.jobs.data_export_job import _run_export_job

    arc.relay.enqueue(_run_export_job, str(job["id"]))
    return job
