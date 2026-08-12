"""
admin._paths
-------------
Filesystem conventions the schema/patch builder needs — where a given
plugin's own schemas/patches directories physically live on disk. Nothing
in psqldb retains this mapping after boot (register_model/register_patches
parse a directory into TableSchema objects immediately and never keep the
path), so admin derives it itself, purely from the project's own directory
convention — zero changes to psqldb needed for this.

schemas/patches (and hooks/api/tasks) live at the plugin ROOT
(plugins/<name>/schemas/), siblings of the <name>/ package dir, NOT
nested inside it — every plugin's own register(kernel) already reflects
this (Path(__file__).parent.parent / "schemas"). plugin_dir() used to
return the nested plugins/<name>/<name>/ package directory instead — a
stale convention from before that move, never updated here when it
happened, which made Schema Builder silently show zero schemas/patches
for every plugin (the package directory itself still exists, so
require_plugin_dir's own existence check never caught it; only the
`/schemas`, `/patches` children built on top of the wrong base were
missing).
"""

from __future__ import annotations

from pathlib import Path

import arc

# admin/admin/_paths.py -> admin/admin -> admin/ -> plugins/
PLUGINS_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = PLUGINS_ROOT.parent


def plugin_dir(plugin: str) -> Path:
    return PLUGINS_ROOT / plugin


def schemas_dir(plugin: str) -> Path:
    return plugin_dir(plugin) / "schemas"


def patches_dir(plugin: str) -> Path:
    return plugin_dir(plugin) / "patches"


def require_known_plugin(plugin: str) -> None:
    """A plugin name is only ever meaningful if it's actually installed and
    booted (arc.admin.list_installed_plugins(), which forwards to the real
    Kernel instance admin's own register(kernel) was handed — there's no
    arc.kernel capability, the Kernel itself is the container, not
    something a plugin exports) — not just "some directory happens to
    exist under plugins/". Every write-capable admin endpoint checks this
    before touching disk."""
    if plugin not in arc.admin.list_installed_plugins():
        arc.relay.throw(f"no such installed plugin: '{plugin}'", status=404, code="unknown_plugin")


def require_plugin_dir(plugin: str) -> Path:
    """The plugin's own root directory must exist on disk (plugins/<name>/)
    before admin will write a schema/patch file into it — a clear error
    beats a silently-wrong path."""
    require_known_plugin(plugin)
    directory = plugin_dir(plugin)
    if not directory.is_dir():
        arc.relay.throw(
            f"plugin '{plugin}' has no directory at the expected location "
            f"({directory}) — cannot determine where to write its schema/patch "
            f"files",
            status=409,
            code="unconventional_plugin_layout",
        )
    return directory
