"""Plugin/table introspection — powers the Data Browser's and Schema
Builder's "pick a plugin, pick a table" flow. Read-only, no writes."""

import arc
from psqldb.model import SchemaError

from admin._paths import require_known_plugin


def _field_to_dict(f) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "type": f.type,
        "required": f.required,
        "unique": f.unique,
        "primary_key": f.primary_key,
        "length": f.length,
        "precision": f.precision,
        "scale": f.scale,
        "default": f.default,
        "options": list(f.options) if f.options is not None else None,
        "target": f.target,
        "target_field": f.target_field,
        "is_column": f.is_column(),
    }


@arc.relay.whitelist(methods=["GET"], roles=["Superuser"])
async def list_plugins() -> list[str]:
    return arc.admin.list_installed_plugins()


@arc.relay.whitelist(methods=["GET"], roles=["Superuser"])
async def list_tables(plugin: str) -> list[str]:
    require_known_plugin(plugin)
    rows = await arc.relay.sql(
        'SELECT DISTINCT "table" FROM "_field_registry" WHERE plugin = $1 ORDER BY "table"', plugin
    )
    return [r["table"] for r in rows]


@arc.relay.whitelist(methods=["GET"], roles=["Superuser"])
async def get_table_schema(table: str) -> dict:
    try:
        schema = arc.psqldb.schema(table)
    except SchemaError as exc:
        arc.relay.throw(str(exc), status=404, code="unknown_table")
    return {
        "table": schema.table,
        "plugin": schema.plugin,
        "system": schema.system,
        "audit": schema.audit,
        "child": schema.child,
        "fields": [_field_to_dict(f) for f in schema.fields],
        "system_fields": [_field_to_dict(f) for f in schema.system_fields],
        "indexes": schema.indexes,
    }
