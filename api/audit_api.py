"""Audit history — _audit_{plugin} tables are raw-SQL bootstrap structure
(docs/arc.MD §3.9's audit trigger writes them directly), never declared via
a schema file, so they have no TableSchema and are invisible to
arc.pgdb.schema()/the generic Data Browser (get_table_schema/list_rows
both depend on it — verified directly: schema("_audit_example_hr") raises
SchemaError, "no registered schema for table"). There was previously no
way to view this data anywhere in admin at all; this is that view.

changed_by is returned as the raw UUID, same as every other admin
endpoint returning a *_by column — resolving it to an email is the UI's
job (useUserDirectory), not duplicated server-side per endpoint."""

import arc

from admin._paths import require_known_plugin
from admin._pagination import PaginationError, decode_cursor, encode_cursor

# One shared redaction set/helper for every admin endpoint that can return
# rows off authn's tables — the Data Browser's read path (data_api) applies
# the identical treatment. Found originally by testing this endpoint against
# a real _users write and seeing a real Argon2id hash come back in plain JSON.
from admin._security import redact_row as _redact


def _audit_table(plugin: str) -> str:
    """Building a table identifier by string interpolation (asyncpg can't
    parameterize identifiers) is only safe because `plugin` is validated
    against the installed-plugins list first — never passed through
    unchecked. Mirrors admin._paths.require_plugin_dir's same reasoning
    for schema/patch file paths."""
    require_known_plugin(plugin)
    return f"_audit_{plugin}"


async def _table_exists(table: str) -> bool:
    row = await arc.relay.sql_one(
        "SELECT 1 FROM information_schema.tables WHERE table_name = $1", table
    )
    return row is not None


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_audit_plugins() -> list[str]:
    """Which installed plugins actually have an audit table — not every
    plugin does (only schemas declaring "audit": true get one)."""
    out = []
    for plugin in arc.admin.list_installed_plugins():
        if await _table_exists(f"_audit_{plugin}"):
            out.append(plugin)
    return out


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_audit_tables(plugin: str) -> list[str]:
    """Distinct tables actually represented in this plugin's audit trail —
    populates the "table" filter dropdown without guessing at names."""
    audit_table = _audit_table(plugin)
    if not await _table_exists(audit_table):
        return []
    rows = await arc.relay.sql(f'SELECT DISTINCT "table" FROM "{audit_table}" ORDER BY "table"')
    return [r["table"] for r in rows]


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_audit_entries(
    plugin: str,
    table: str | None = None,
    row_id: str | None = None,
    after: str | None = None,
    limit: int = 50,
) -> dict:
    """Cursor-paginated — {rows, next_cursor, total}, same shape every
    other list endpoint in admin returns, but hand-rolled rather than
    built on admin._pagination.cursor_page: that helper requires a real
    psqldb TableSchema (arc.pgdb.schema(table)), and _audit_{plugin}
    tables — raw-SQL bootstrap structure, docs/arc.MD §3.9 — have none.
    Reuses cursor_page's own encode_cursor/decode_cursor primitives (both
    schema-independent) for the keyset itself: id DESC alone, newest
    first — no changed_at in the sort at all. id is UUIDv7
    (psqldb/ddl.py's arc_uuid_generate_v7()), which embeds a millisecond
    timestamp in its high bits, so it's already chronologically ordered
    AND already indexed for free via the primary key — the same trick
    cursor_page()'s own default order_by=("id", False) relies on for
    every other admin-browsable table. Sorting by changed_at instead (the
    original approach here) needed its own index to avoid a full table
    scan on every request; id needs none, and being a single globally
    unique column, needs no tie-breaker either."""
    audit_table = _audit_table(plugin)
    if not await _table_exists(audit_table):
        arc.relay.throw(f"plugin '{plugin}' has no audit trail", status=404, code="no_audit_table")

    # limit arrives as a plain query-string string over GET/QUERY (relay's
    # kwarg merging never coerces beyond that) — same fix already applied
    # elsewhere in admin (filer_admin_api.py, jobs_api.py, ...).
    limit = int(limit)

    where: list[str] = []
    params: list = []
    if table:
        params.append(table)
        where.append(f'"table" = ${len(params)}')
    if row_id:
        params.append(row_id)
        where.append(f"row_id = ${len(params)}")

    count_where = f"WHERE {' AND '.join(where)}" if where else ""
    total = await arc.relay.sql_val(f'SELECT count(*) FROM "{audit_table}" {count_where}', *params)

    if after is not None:
        try:
            cursor_id, _ = decode_cursor(after)
        except PaginationError as exc:
            arc.relay.throw(str(exc), status=400, code="bad_cursor")
        n = len(params)
        # DESC (newest first) — the tuple-comparison direction is `<`,
        # mirroring cursor_page's own op-per-direction convention. id
        # alone is a complete, collision-free cursor (see the module
        # docstring above), so encode_cursor's `v`/`id` pair below just
        # carries the same id in both slots — no second column needed.
        where.append(f"id < ${n + 1}")
        params.append(cursor_id)

    where_clause = f"WHERE {' AND '.join(where)}" if where else ""
    params.append(limit + 1)
    query = (
        f'SELECT id, "table", row_id, changes, changed_by, changed_at '
        f'FROM "{audit_table}" {where_clause} '
        f"ORDER BY id DESC LIMIT ${len(params)}"
    )
    fetched = await arc.relay.sql(query, *params)

    has_more = len(fetched) > limit
    page_rows = fetched[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1]["id"], page_rows[-1]["id"])
        if has_more and page_rows
        else None
    )
    shaped = [
        {
            "id": str(r["id"]),
            "table": r["table"],
            "row_id": str(r["row_id"]),
            "changes": {
                "before": _redact((r["changes"] or {}).get("before")),
                "after": _redact((r["changes"] or {}).get("after")),
            },
            "changed_by": str(r["changed_by"]) if r["changed_by"] else None,
            "changed_at": r["changed_at"].isoformat(),
        }
        for r in page_rows
    ]
    return {"rows": shaped, "next_cursor": next_cursor, "total": total}
