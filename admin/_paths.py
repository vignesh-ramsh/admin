"""
admin._paths
-------------
Filesystem conventions the schema/patch builder needs — where a given
plugin's own schemas/patches directories physically live on disk. Nothing
in psqldb retains this mapping after boot (register_model/register_patches
parse a directory into TableSchema objects immediately and never keep the
path), so admin derives it itself, purely from the project's own directory
convention (docs/arc.MD §3.7: a plugin's package folder matches its repo
name, both under `plugins/`) — zero changes to psqldb needed for this.
"""

from __future__ import annotations

from pathlib import Path

import arc

# admin/admin/_paths.py -> admin/admin -> admin/ -> plugins/
PLUGINS_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = PLUGINS_ROOT.parent


def plugin_dir(plugin: str) -> Path:
    return PLUGINS_ROOT / plugin / plugin


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
    """The plugin's own package directory must exist on disk and follow the
    plugins/<name>/<name>/ convention (§3.7) before admin will write a
    schema/patch file into it — a clear error beats a silently-wrong path."""
    require_known_plugin(plugin)
    directory = plugin_dir(plugin)
    if not directory.is_dir():
        arc.relay.throw(
            f"plugin '{plugin}' does not follow the plugins/<name>/<name>/ layout "
            f"convention (expected {directory}) — cannot determine where to write "
            f"its schema/patch files",
            status=409, code="unconventional_plugin_layout",
        )
    return directory
