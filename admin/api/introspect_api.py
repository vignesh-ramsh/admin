"""Plugin/table introspection — powers the Data Browser's and Schema
Builder's "pick a plugin, pick a table" flow. Read-only, no writes."""

import arc
from psqldb.model import SchemaError

from admin._exclusions import filter_plugins
from admin._paths import require_known_plugin


def _parent_tables_by_stem() -> dict[str, str]:
    """A child schema never declares its own parent — only the parent's
    TABLE-typed field names the child (via `target` = the child's file
    stem). So for every child table, its parent is resolved by scanning
    every OTHER schema's fields for a TABLE field whose target matches
    that stem. Shared by list_table_meta and get_table_schema so both
    surfaces agree."""
    by_stem: dict[str, str] = {}
    for s in arc.psqldb.schemas():
        for f in s.fields:
            if f.type == "TABLE" and f.target:
                by_stem[f.target] = s.table
    return by_stem


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


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_plugins(surface: str | None = None) -> list[str]:
    """`surface` ("data_browser" / "schema_builder") applies that surface's
    own exclusion list (admin._exclusions). Omitted -> every installed
    plugin, unfiltered."""
    return filter_plugins(arc.admin.list_installed_plugins(), surface)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_table_meta(surface: str | None = None) -> list[dict]:
    """Every registered table with the metadata the Schema Builder's field
    pickers need.

    `name` is the schema FILE STEM ("Department") and is what a REFERENCE/
    TABLE field's `target` must be set to — psqldb.migrate
    .resolve_ref_targets resolves targets via `{source_path.stem: schema}`,
    so the physical table name ("department") does NOT resolve and raises a
    hard MigrationError on every query. `table` is the physical name, only
    for display and for looking a schema up by table elsewhere.

    Reads arc.psqldb.schemas() (what's declared in schema files) rather
    than _field_registry (what's been migrated): when authoring a schema
    you want to reference a table that exists on disk even if its first
    migration hasn't run yet — and _field_registry only ever knows the
    physical name, never the stem this needs.
    """
    schemas = list(arc.psqldb.schemas())
    parent_by_stem = _parent_tables_by_stem()

    return [
        {
            "name": s.source_path.stem,
            "table": s.table,
            "plugin": s.plugin,
            "system": s.system,
            "child": s.child,
            "audit": s.audit,
            "parent_table": parent_by_stem.get(s.source_path.stem) if s.child else None,
        }
        for s in schemas
        if s.plugin not in _hidden(surface)
    ]


def _hidden(surface: str | None):
    from admin._exclusions import excluded_for

    return excluded_for(surface)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_tables(plugin: str, surface: str | None = None) -> list[str]:
    require_known_plugin(plugin)
    if plugin in _hidden(surface):
        # Hidden for this surface — don't serve its tables even if the
        # plugin is named directly, so the exclusion can't be sidestepped
        # by a stale client or a hand-made request.
        return []
    rows = await arc.relay.sql(
        'SELECT DISTINCT "table" FROM "_field_registry" WHERE plugin = $1 ORDER BY "table"', plugin
    )
    return [r["table"] for r in rows]


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def get_table_schema(table: str) -> dict:
    try:
        schema = arc.psqldb.schema(table)
    except SchemaError as exc:
        arc.relay.throw(str(exc), status=404, code="unknown_table")
    parent_table = (
        _parent_tables_by_stem().get(schema.source_path.stem) if schema.child else None
    )
    return {
        "table": schema.table,
        "plugin": schema.plugin,
        "system": schema.system,
        "audit": schema.audit,
        "child": schema.child,
        "parent_table": parent_table,
        "fields": [_field_to_dict(f) for f in schema.fields],
        "system_fields": [_field_to_dict(f) for f in schema.system_fields],
        "indexes": schema.indexes,
    }
