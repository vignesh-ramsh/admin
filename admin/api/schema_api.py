"""
Schema/patch builder.

Two distinct steps, deliberately never blurred together:

- SAVE writes the schema/patch JSON file to disk only — the same file a
  developer would hand-edit — and validates it (via psqldb's own
  load_schema_file/load_patch_file, already public) before committing.
  Never touches the database.
- APPLY is never run inline by admin. psqldb caches each plugin's schema
  in a private, in-memory list populated once at boot (register_model/
  register_patches) with no public "reload" method — so admin running
  migrate.apply_plan() itself would leave the CURRENTLY RUNNING process's
  own schema cache stale (the exact problem a live in-process apply would
  hit). Instead, admin hands back the real `arc psqldb migrate` command
  for the operator to run themselves, in a fresh process — which is what
  actually and correctly refreshes everything, the same way it already
  does today with no admin involved at all. preview_migration_plan() is
  provided so the operator can see what that command WOULD do first,
  entirely read-only (build_plan never mutates the database).
"""

import json
import tempfile
from pathlib import Path

import arc
from psqldb import migrate as psqldb_migrate
from psqldb.model import FieldError, SchemaError, load_patch_file, load_patches_dir, load_schema_file, load_schemas_dir

from admin._paths import patches_dir, require_plugin_dir, schemas_dir


def _read_json_files(directory) -> list[str]:
    if not directory.is_dir():
        return []
    return sorted(p.stem for p in directory.glob("*.json"))


# --------------------------------------------------------------------- #
# Cross-schema validation.
#
# psqldb's own load_schema_file validates ONE file in isolation. The rules
# that need every schema at once — does this REFERENCE's target resolve? is
# a TABLE target actually a child? is target_field really unique? — are only
# enforced later, at plan/migrate time (migrate.resolve_ref_targets /
# resolve_ref_columns). That is far too late: an unresolvable target written
# to disk makes resolve_ref_targets raise on EVERY relay read (ref_columns()
# is on the read path), which takes the whole application down at the next
# boot — login included. So admin re-checks those rules HERE, before the
# file is ever written. A bad value then simply cannot be persisted, whether
# it came from this UI, a hand-edited file, or a direct API call.
# --------------------------------------------------------------------- #

def _schemas_on_disk() -> list:
    """Every plugin's schema files as they are RIGHT NOW on disk — not
    arc.psqldb.schemas(), which is the boot-time cache and would miss a
    table authored earlier in this same session."""
    out = []
    for plugin_name in arc.admin.list_installed_plugins():
        directory = schemas_dir(plugin_name)
        if not directory.is_dir():
            continue
        try:
            out.extend(load_schemas_dir(directory, plugin=plugin_name))
        except (SchemaError, FieldError):
            # A broken file belonging to some OTHER plugin must not block
            # this save; it will surface on that plugin's own next save/plan.
            continue
    return out


def _patches_on_disk() -> list:
    out = []
    for plugin_name in arc.admin.list_installed_plugins():
        directory = patches_dir(plugin_name)
        if not directory.is_dir():
            continue
        try:
            out.extend(load_patches_dir(directory, plugin=plugin_name))
        except (SchemaError, FieldError):
            continue
    return out


def _validate_targets(candidate, stem: str) -> None:
    others = {s.source_path.stem: s for s in _schemas_on_disk()}
    # The candidate itself may be brand new (not yet on disk) and may
    # legitimately reference itself.
    others[stem] = candidate
    by_table = {s.table: s for s in others.values()}

    for f in candidate.fields:
        if f.type not in ("REFERENCE", "TABLE") or not f.target:
            continue

        target = others.get(f.target)
        if target is None:
            hint = ""
            if f.target in by_table:
                # The exact mistake that caused a real outage: the physical
                # table name looks right but never resolves.
                hint = (
                    f" — did you mean '{by_table[f.target].source_path.stem}'? "
                    f"A target is the schema FILE name, not the physical table name."
                )
            arc.relay.throw(
                f"field '{f.name}': target '{f.target}' does not match any schema file name{hint}",
                status=400, code="invalid_target",
            )

        if f.type == "TABLE" and not target.child:
            arc.relay.throw(
                f"field '{f.name}': TABLE target '{f.target}' is not a child table — "
                f'its schema must declare "child": true',
                status=400, code="invalid_target",
            )

        if f.type == "REFERENCE" and f.target_field:
            pk = next((x.name for x in target.fields if x.primary_key), "id")
            allowed = {pk} | {x.name for x in target.fields if x.unique and x.is_column()}
            if f.target_field not in allowed:
                arc.relay.throw(
                    f"field '{f.name}': target_field '{f.target_field}' is not unique on "
                    f"'{f.target}' — Postgres can only reference a unique column. "
                    f"Unique options: {sorted(allowed)}",
                    status=400, code="invalid_target_field",
                )


def _validate_no_name_clash(candidate, plugin: str, stem: str, *, is_patch: bool) -> None:
    """A field NAME is a physical column. Two declarations of the same table
    using the same name with DIFFERENT field ids both try to create that
    column — it can never migrate. (A patch redeclaring the same ID is a
    legitimate rename/retype and is left alone.)"""
    table = candidate.table
    taken: dict[str, tuple[str, str]] = {}  # name -> (id, where)

    for other in _schemas_on_disk():
        if other.table != table:
            continue
        if not is_patch and other.source_path.stem == stem and other.plugin == plugin:
            continue  # the candidate's own previous version
        for f in other.fields:
            taken[f.name] = (f.id, f"schema '{other.source_path.stem}' ({other.plugin})")

    for other in _patches_on_disk():
        if other.table != table:
            continue
        if is_patch and other.source_path.stem == stem and other.plugin == plugin:
            continue  # the candidate's own previous version
        for f in other.fields:
            taken[f.name] = (f.id, f"patch '{other.source_path.stem}' ({other.plugin})")

    for f in candidate.fields:
        clash = taken.get(f.name)
        if clash and clash[0] != f.id:
            arc.relay.throw(
                f"field '{f.name}' (id {f.id}) already exists on table '{table}', "
                f"declared as id {clash[0]} by {clash[1]}. Two declarations of the same "
                f"column can never migrate — rename this field, or reuse id {clash[0]}.",
                status=400, code="duplicate_field_name",
            )


def _atomic_write_validated(
    path: Path, content: dict, *, loader, plugin: str, is_patch: bool = False
) -> dict:
    """Validates first, against a copy with the EXACT SAME FILENAME (not
    just directory) as the real target, then only writes the real file if
    that validation passes — a malformed edit never leaves a broken schema
    file in place.

    The table name is derived from the filename's STEM (psqldb.model.
    slugify_table_name), so the temp copy must keep path.name unchanged —
    it lives in a different (temporary) PARENT directory instead. An
    earlier version of this used path.with_suffix(".json.tmp"), which
    corrupted the stem Path.stem sees to "ScratchWidget.json" (only the
    LAST suffix, ".tmp", is stripped) — slugifying to a wrong table name
    ("..._json") that was caught before ever reaching a real migration,
    by testing preview_migration_plan against a real Postgres and noticing
    the previewed table name was wrong."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=path.parent) as tmp_dir:
        tmp_path = Path(tmp_dir) / path.name
        tmp_path.write_text(json.dumps(content, indent=2))
        try:
            schema = loader(tmp_path, plugin=plugin)
        except (SchemaError, FieldError) as exc:
            arc.relay.throw(str(exc), status=400, code="invalid_schema")
        # Rules that need every schema at once — see the block above. These
        # throw (4xx) rather than returning, so nothing is written on failure.
        _validate_targets(schema, path.stem)
        _validate_no_name_clash(schema, plugin, path.stem, is_patch=is_patch)
    path.write_text(json.dumps(content, indent=2))
    return schema


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_schema_files(plugin: str) -> dict:
    directory = require_plugin_dir(plugin)
    return {
        "schemas": _read_json_files(directory / "schemas"),
        "patches": _read_json_files(directory / "patches"),
    }


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def get_schema_file(plugin: str, name: str) -> dict:
    directory = require_plugin_dir(plugin)
    path = directory / "schemas" / f"{name}.json"
    if not path.is_file():
        arc.relay.throw(f"no schema file '{name}.json' for plugin '{plugin}'", status=404, code="not_found")
    return json.loads(path.read_text())


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def get_patch_file(plugin: str, name: str) -> dict:
    directory = require_plugin_dir(plugin)
    path = directory / "patches" / f"{name}.json"
    if not path.is_file():
        arc.relay.throw(f"no patch file '{name}.json' for plugin '{plugin}'", status=404, code="not_found")
    return json.loads(path.read_text())


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def save_schema_file(plugin: str, name: str, content: dict) -> dict:
    """Creates a NEW table declaration, or overwrites an existing one this
    plugin already owns — same file, same rules as hand-editing
    schemas/<name>.json. Disk only; run get_migrate_command afterward to
    see the real command that applies it."""
    directory = require_plugin_dir(plugin)
    path = directory / "schemas" / f"{name}.json"
    schema = _atomic_write_validated(path, content, loader=load_schema_file, plugin=plugin)
    return {"ok": True, "path": str(path), "table": schema.table}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def save_patch_file(plugin: str, name: str, content: dict) -> dict:
    """Adds/modifies fields THIS plugin owns on a table (its own or
    another plugin's) — never creates the table itself (docs/arc.MD
    §3.9). Disk only, same validate-before-write guarantee as
    save_schema_file."""
    directory = require_plugin_dir(plugin)
    path = directory / "patches" / f"{name}.json"
    schema = _atomic_write_validated(path, content, loader=load_patch_file, plugin=plugin, is_patch=True)
    return {"ok": True, "path": str(path), "table": schema.table}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_schema_file(plugin: str, name: str) -> dict:
    directory = require_plugin_dir(plugin)
    path = directory / "schemas" / f"{name}.json"
    if not path.is_file():
        arc.relay.throw(f"no schema file '{name}.json' for plugin '{plugin}'", status=404, code="not_found")
    path.unlink()
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_patch_file(plugin: str, name: str) -> dict:
    directory = require_plugin_dir(plugin)
    path = directory / "patches" / f"{name}.json"
    if not path.is_file():
        arc.relay.throw(f"no patch file '{name}.json' for plugin '{plugin}'", status=404, code="not_found")
    path.unlink()
    return {"ok": True}


def _serialize_op(op) -> dict:
    return {
        "kind": op.kind, "table": op.table, "plugin": op.plugin,
        "description": op.description, "destructive": op.destructive, "source": op.source,
    }


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def preview_migration_plan(plugin: str | None = None, table: str | None = None) -> dict:
    """Entirely read-only — build_plan diffs against the live database but
    never writes to it. Reloads EVERY installed plugin's schemas/patches
    fresh from disk (not arc.psqldb's own cached, boot-time copies), so
    this reflects on-disk edits immediately, exactly what `arc psqldb
    plan` run fresh in a new process would show. load_schemas_dir/
    load_patches_dir already tolerate a missing directory (a plugin with
    no schemas/patches at all, e.g. gateway/redix) by returning []."""
    from admin._paths import plugin_dir

    all_schemas: list = []
    all_patches: list = []
    for name in arc.admin.list_installed_plugins():
        directory = plugin_dir(name)
        all_schemas.extend(load_schemas_dir(directory / "schemas", plugin=name))
        all_patches.extend(load_patches_dir(directory / "patches", plugin=name))

    async with arc.psqldb.acquire() as conn:
        plan = await psqldb_migrate.build_plan(conn, all_schemas, all_patches, only_table=table)
    if plugin:
        plan.ops = [op for op in plan.ops if op.plugin == plugin or op.table == "_bootstrap"]

    return {
        "empty": plan.is_empty(),
        "ops": [_serialize_op(op) for op in plan.ops],
        "warnings": plan.warnings,
    }


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def get_migrate_command(plugin: str | None = None, table: str | None = None) -> dict:
    """The operator runs this themselves, in a fresh process — that's what
    actually and correctly refreshes the running application's own schema
    cache (a fresh `arc.boot()` reloads every schema file from disk).
    Admin deliberately never runs apply_plan() itself — see this module's
    own docstring for why."""
    parts = ["arc", "psqldb", "migrate"]
    if plugin:
        parts += ["-p", plugin]
    if table:
        parts += ["-t", table]
    return {"command": " ".join(parts)}
