"""admin.jobs.data_export_job — the background job `start_export`
(admin/api/data_export_api.py) enqueues. Deliberately NOT in api/ — this
isn't a whitelisted HTTP endpoint, it's a plain, importable module-level
function (arc.relay.enqueue()'s check_resolvable rejects closures, and it
needs a real (module, qualname) any process can re-import).

Reads through admin._pagination.cursor_page — the exact same primitive
list_rows/data_api.py already uses, cursor-paginated so memory use stays
bounded by one page at a time regardless of table size, never "fetch
everything, then write." Writes the generated file in one shot at the end
via arc.filer.upload() — there's no streaming-upload primitive in filer to
write incrementally, so the output file itself (not the input table) is
what has to fit in memory.
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any

import arc

from admin._pagination import cursor_page

logger = logging.getLogger("admin.jobs.data_export")

_PAGE_SIZE = 500
_PROGRESS_EVERY_ROWS = 500
_PROGRESS_EVERY_SECONDS = 2.0

_CONTENT_TYPE = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


# A spreadsheet application (Excel, LibreOffice, Sheets) treats a cell
# whose text STARTS with one of these as a formula, not literal text — the
# classic =HYPERLINK(...)/=WEBSERVICE(...)/cmd|'/c calc'!A1 exfiltration/
# execution chain, triggered the instant whoever downloaded this export
# opens it. The values being exported here are ordinary business data
# (employee names, chat messages, ...) — genuinely attacker-influenced,
# not staff-authored, so this isn't a hypothetical.
_FORMULA_LEAD_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _safe_cell(value: Any) -> Any:
    """Prefixes a single U+0027 (apostrophe) — the standard "force this
    cell to be read as text" marker every major spreadsheet app already
    honors — rather than stripping the leading character, so the
    exported value still round-trips byte-for-byte on re-import. Only
    ever touches a str; a number/bool/etc. can't begin with any of these
    characters in a way that would parse as a formula."""
    if isinstance(value, str) and value.startswith(_FORMULA_LEAD_CHARS):
        return "'" + value
    return value


def _escape_like(value: str) -> str:
    """Same escaping relay.query._escape_like/data_api.py's own copy do —
    duplicated rather than shared, matching this codebase's own established
    call for a helper this small (data_api.py's own docstring: "copied
    rather than imported since it's two lines and already duplicated
    once")."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_where(schema, search: list[str] | None) -> tuple[str, list]:
    """Same shape as data_api.py's own _search_where — free-text search
    OR'd across the table's list-view columns, cast ::text so it works
    uniformly across column types. Kept in sync by hand (see that
    function's own docstring for the reasoning already established
    there)."""
    if not search:
        return "", []
    columns = [f.name for f in schema.fields if f.is_column() and f.list][:6]
    columns = ["id", *columns]
    clauses: list[str] = []
    params: list = []
    for term in search:
        term = term.strip()
        if not term:
            continue
        for col in columns:
            params.append(f"%{_escape_like(term)}%")
            clauses.append(f'"{col}"::text ILIKE ${len(params)} ESCAPE \'\\\'')
    if not clauses:
        return "", []
    return "(" + " OR ".join(clauses) + ")", params


async def _run_export_job(job_id: str) -> None:
    job = await arc.relay.get("_data_export_job", job_id, arc.relay.all_columns("_data_export_job"))
    if job is None:
        logger.error(f"export job {job_id} vanished before it could run")
        return

    await arc.relay.save("_data_export_job", {"id": job_id, "status": "Running", "started_at": arc.tz.utcnow()})

    try:
        schema = arc.psqldb.schema(job["table"])
        search_where, search_params = _search_where(schema, job["search"])

        rows_written = 0
        rows_total: int | None = None
        buf = io.StringIO()
        writer: "csv.writer | None" = None
        wb = ws = None
        if job["format"] == "xlsx":
            import openpyxl

            wb = openpyxl.Workbook(write_only=True)
            ws = wb.create_sheet(title=job["table"][:31] or "export")
            ws.append(job["fields"])
        else:
            writer = csv.writer(buf)
            writer.writerow(job["fields"])

        last_progress_at = arc.tz.utcnow().timestamp()
        cursor: str | None = None
        while True:
            # with_total only on the FIRST page — a keyset page is
            # O(limit), but count(*) is O(matching rows); every page after
            # the first only ever discarded it anyway (`if rows_total is
            # None` below), so a 1M-row export at _PAGE_SIZE=500 used to
            # pay 2000 sequential full-table counts for exactly one that
            # mattered.
            page_rows, cursor, total = await cursor_page(
                job["table"],
                schema,
                fields=job["fields"],
                filters=job["filters"],
                order_by=("id", False),
                after=cursor,
                limit=_PAGE_SIZE,
                extra_where=search_where,
                extra_params=search_params,
                with_total=rows_total is None,
            )
            if rows_total is None:
                rows_total = total
                await arc.relay.save("_data_export_job", {"id": job_id, "rows_total": rows_total})
            for row in page_rows:
                values = [row.get(f) for f in job["fields"]]
                if writer is not None:
                    writer.writerow(["" if v is None else _safe_cell(v) for v in values])
                else:
                    ws.append([None if v is None else _safe_cell(str(v)) for v in values])
                rows_written += 1

            now_ts = arc.tz.utcnow().timestamp()
            if rows_written % _PROGRESS_EVERY_ROWS == 0 or now_ts - last_progress_at >= _PROGRESS_EVERY_SECONDS:
                await arc.relay.save("_data_export_job", {"id": job_id, "rows_exported": rows_written})
                last_progress_at = now_ts

            if cursor is None:
                break

        await arc.relay.save("_data_export_job", {"id": job_id, "rows_exported": rows_written})

        if writer is not None:
            content = buf.getvalue().encode("utf-8")
        else:
            out = io.BytesIO()
            wb.save(out)
            content = out.getvalue()

        file_row = await arc.filer.upload(
            content,
            filename=f"{job['table']}_export.{job['format']}",
            content_type=_CONTENT_TYPE[job["format"]],
            private=True,
            by=job.get("created_by"),
        )
        await arc.relay.save(
            "_data_export_job",
            {"id": job_id, "status": "Completed", "file": file_row["id"], "finished_at": arc.tz.utcnow()},
        )
    except Exception as exc:  # noqa: BLE001 - a background job must record its own failure, never crash silently
        logger.error(f"export job {job_id} failed: {exc}")
        await arc.relay.save(
            "_data_export_job", {"id": job_id, "status": "Failed", "error": str(exc), "finished_at": arc.tz.utcnow()}
        )
