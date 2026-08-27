"""admin.api.data_jobs_api — the shared surface for the standalone Data
Import & Export page: list every job (either direction), poll one job's
live status, and prune old finished ones. Direction-specific actions
(start_import/commit_import/replace_import_file/resume_import,
start_export) stay in their own data_import_api.py/data_export_api.py —
this file is only what genuinely doesn't care which direction a job is.
"""

from __future__ import annotations

import arc

from admin._dataops import load_filerfile_row_by_id
from admin._pagination import cursor_page

JOB_TABLE = "_data_import_export_job"

_DIRECTIONS = frozenset({"Import", "Export"})
_TERMINAL_STATUSES = frozenset({"Completed", "CompletedWithErrors", "Failed"})


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_data_jobs(
    direction: str | None = None,
    table: str | None = None,
    status: str | None = None,
    after: str | None = None,
    limit: int = 50,
) -> dict:
    schema = arc.pgdb.schema(JOB_TABLE)
    filters: dict = {}
    if direction:
        if direction not in _DIRECTIONS:
            arc.relay.throw(f"direction must be one of {sorted(_DIRECTIONS)}", code="bad_direction")
        filters["direction"] = direction
    if table:
        filters["table"] = table
    if status:
        filters["status"] = status
    rows, next_cursor, total = await cursor_page(
        JOB_TABLE,
        schema,
        fields=arc.relay.all_columns(JOB_TABLE),
        filters=filters or None,
        order_by=("id", False),
        after=after,
        limit=limit,
    )
    return {"rows": rows, "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def get_data_job(job_id: str) -> dict:
    """Same shape for both directions; download_url/scan_pending are
    computed fresh on every poll (never stored — a signed URL expires)
    and only ever populated for a Completed Export."""
    job = await arc.relay.get(JOB_TABLE, job_id, arc.relay.all_columns(JOB_TABLE))
    if job is None:
        arc.relay.throw("no such job", status=404, code="not_found")

    job["download_url"] = None
    job["scan_pending"] = False
    if job["direction"] == "Export" and job["status"] == "Completed" and job.get("file"):
        file_row = await load_filerfile_row_by_id(job["file"])
        if file_row is None:
            job["error"] = job["error"] or "exported file is missing"
        elif file_row["status"] not in ("clean", "skipped"):
            job["scan_pending"] = True
        else:
            job["download_url"] = await arc.filer.sign_url(file_row["file_id"])
    return job


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def prune_data_import_export_log(older_than_days: int = 30) -> dict:
    """Hard-deletes job log rows that are already finished (Completed/
    CompletedWithErrors/Failed — never Queued/PendingReview/Running,
    regardless of age) and older than the cutoff. For a pruned IMPORT
    job, its _data_import_row staging rows are deleted too — there's no
    reason to keep a per-row audit trail for a job whose own summary row
    is gone. The export job's own generated file (if any) is left alone;
    filer's own purge-after-days policy reclaims it independently, same
    as any other file admin never explicitly deletes."""
    cutoff = arc.tz.ago(days=older_than_days)
    to_prune = await arc.relay.list(
        JOB_TABLE,
        fields=["id", "direction"],
        filters={"status": {"in": sorted(_TERMINAL_STATUSES)}, "finished_at": {"lt": cutoff}},
        limit=None,
    )
    if not to_prune:
        return {"ok": True, "deleted": 0}

    import_job_ids = [j["id"] for j in to_prune if j["direction"] == "Import"]
    if import_job_ids:
        row_ids = await arc.relay.list(
            "_data_import_row", fields=["id"], filters={"job": {"in": import_job_ids}}, limit=None
        )
        if row_ids:
            await arc.relay.delete_many("_data_import_row", [r["id"] for r in row_ids])

    await arc.relay.delete_many(JOB_TABLE, [j["id"] for j in to_prune])
    return {"ok": True, "deleted": len(to_prune)}
