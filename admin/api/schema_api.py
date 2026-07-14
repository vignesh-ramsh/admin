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

from admin._paths import require_plugin_dir


def _read_json_files(directory) -> list[str]:
    if not directory.is_dir():
        return []
    return sorted(p.stem for p in directory.glob("*.json"))


def _atomic_write_validated(path: Path, content: dict, *, loader, plugin: str) -> dict:
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
    schema = _atomic_write_validated(path, content, loader=load_patch_file, plugin=plugin)
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
