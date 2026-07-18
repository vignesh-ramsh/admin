"""Audit history — _audit_{plugin} tables are raw-SQL bootstrap structure
(docs/arc.MD §3.9's audit trigger writes them directly), never declared via
a schema file, so they have no TableSchema and are invisible to
arc.psqldb.schema()/the generic Data Browser (get_table_schema/list_rows
both depend on it — verified directly: schema("_audit_example_hr") raises
SchemaError, "no registered schema for table"). There was previously no
way to view this data anywhere in admin at all; this is that view.

changed_by is returned as the raw UUID, same as every other admin
endpoint returning a *_by column — resolving it to an email is the UI's
job (useUserDirectory), not duplicated server-side per endpoint."""

import arc

from admin._paths import require_known_plugin
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


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_audit_plugins() -> list[str]:
    """Which installed plugins actually have an audit table — not every
    plugin does (only schemas declaring "audit": true get one)."""
    out = []
    for plugin in arc.admin.list_installed_plugins():
        if await _table_exists(f"_audit_{plugin}"):
            out.append(plugin)
    return out


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_audit_tables(plugin: str) -> list[str]:
    """Distinct tables actually represented in this plugin's audit trail —
    populates the "table" filter dropdown without guessing at names."""
    audit_table = _audit_table(plugin)
    if not await _table_exists(audit_table):
        return []
    rows = await arc.relay.sql(f'SELECT DISTINCT "table" FROM "{audit_table}" ORDER BY "table"')
    return [r["table"] for r in rows]


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_audit_entries(
    plugin: str,
    table: str | None = None,
    row_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    audit_table = _audit_table(plugin)
    if not await _table_exists(audit_table):
        arc.relay.throw(f"plugin '{plugin}' has no audit trail", status=404, code="no_audit_table")

    where = []
    params: list = []
    if table:
        params.append(table)
        where.append(f'"table" = ${len(params)}')
    if row_id:
        params.append(row_id)
        where.append(f"row_id = ${len(params)}")
    where_clause = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])

    query = (
        f'SELECT id, "table", row_id, changes, changed_by, changed_at '
        f'FROM "{audit_table}" {where_clause} '
        f'ORDER BY changed_at DESC LIMIT ${len(params) - 1} OFFSET ${len(params)}'
    )
    rows = await arc.relay.sql(query, *params)
    return [
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
        for r in rows
    ]
