"""Jobs — Scheduled Jobs (live config) + Execution Log (history), both
covering background/scheduled work regardless of which mechanism actually
ran it (docs/arc.MD §3.11/§3.15).

`_job_log` is owned by `relay`, not `admin` — reading it is a plain
`arc.relay.list()` Query Engine call, no different from reading any other
table (§3.9: ownership only matters for migration/diffing, never for
reads). It's already invisible to the generic Data Browser, since `relay`
is already in `DATA_BROWSER_EXCLUDED_PLUGINS` (admin/_exclusions.py) —
this page is the dedicated place for it instead, same reasoning as
Users/Roles/Sessions/Access Keys getting their own screens rather than
being browsed generically.

`arc.lineup` is genuinely optional — `hasattr(arc, "lineup")`, not
`arc.admin`'s own installed-plugins list, since lineup may not be
installed at all; every function here degrades to an empty result rather
than erroring when it isn't."""

import arc

from admin.api._pagination import cursor_page


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_scheduled_jobs() -> list[dict]:
    """Every task currently carrying a cron schedule (live config, not
    history), each paired with its own most recent Scheduler-triggered
    execution from _job_log, if any. N here is always small (the number
    of distinct scheduled jobs in the whole system) — a per-task lookup
    is simpler than a single grouped query and entirely adequate at this
    scale (docs/arc.MD §3.11's own "fetch and filter in Python" precedent,
    authn's list-users --role)."""
    if not hasattr(arc, "lineup"):
        return []
    out = []
    for entry in arc.lineup.scheduled_tasks():
        last = await arc.relay.list(
            "_job_log",
            fields=["finished_at", "status"],
            filters={"task_name": entry["task_name"], "job_type": "Scheduler"},
            order_by=["-finished_at"],
            limit=1,
        )
        out.append(
            {
                **entry,
                "last_run_at": last[0]["finished_at"] if last else None,
                "last_status": last[0]["status"] if last else None,
            }
        )
    return out


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_job_log(
    status: str | None = None,
    job_type: str | None = None,
    executor: str | None = None,
    task_name: str | None = None,
    after: str | None = None,
    limit: int = 50,
) -> dict:
    """Cursor-paginated — {rows, next_cursor, total}, same shape every
    other list endpoint now returns."""
    filters: dict = {}
    if status:
        filters["status"] = status
    if job_type:
        filters["job_type"] = job_type
    if executor:
        filters["executor"] = executor
    if task_name:
        filters["task_name"] = {"contains": task_name}
    # limit arrives as a plain query-string string over GET/QUERY (relay's
    # kwarg merging never coerces beyond that) — asyncpg rejects a numeric
    # STRING outright. Same bug/fix already applied to filer_api.py,
    # filer_admin_api.py, and audit_api.py this session.
    rows, next_cursor, total = await cursor_page(
        "_job_log",
        arc.psqldb.schema("_job_log"),
        fields=arc.relay.all_columns("_job_log"),
        filters=filters or None,
        order_by=("finished_at", True),
        after=after,
        limit=int(limit),
    )
    return {"rows": rows, "next_cursor": next_cursor, "total": total}
