"""
admin._exclusions
------------------
Which plugins are hidden from each admin surface's plugin picker.

Kept here, server-side, rather than in the SPA: the UI can only ever hide
what the API hands it, so filtering at the source means one list to edit
and no way for a stale bundle — or a hand-made request — to surface
something meant to be hidden.

TWO INDEPENDENT LISTS, on purpose. "Don't author schemas for this plugin"
and "don't browse this plugin's rows" are different questions, and a shared
base set makes them fight each other the moment they diverge. Each list
below is complete and standalone — edit either without thinking about the
other.
"""

from __future__ import annotations

from typing import Iterable

# Surfaces (the `surface` argument admin's own endpoints accept).
DATA_BROWSER = "data_browser"
SCHEMA_BUILDER = "schema_builder"


# Hidden from the Data Browser's plugin picker (and its tables refused).
#   admin/gateway/redix       — own no tables at all.
#   relay                     — its own _job_log (§3.11/§3.15) has a dedicated
#                               Jobs page instead of a raw row editor.
#   authn                     — _users/_roles/_sessions/_access_keys have real
#                               invariants; the Users/Roles/Sessions/Access Keys
#                               screens own those instead of a raw row editor.
#   psqldb                    — _trash/_field_registry/_patch_history are the
#                               framework's own bookkeeping, not app data.
DATA_BROWSER_EXCLUDED_PLUGINS = frozenset(
    {
        "admin",
        "gateway",
        "redix",
        "relay",
        "authn",
        "psqldb",
    }
)

# Hidden from the Schema Builder's plugin picker.
#   admin/gateway/redix/relay — declare no schema files.
#   authn                     — its four system tables are self-declared and
#                               security-critical; editing them here is sharp-edged.
#   psqldb                    — its own tables are created by raw bootstrap SQL,
#                               not schema files, so there is nothing to author.
SCHEMA_BUILDER_EXCLUDED_PLUGINS = frozenset(
    {
        "admin",
        "gateway",
        "redix",
        "relay",
        "psqldb",
    }
)

EXCLUDED_PLUGINS: dict[str, frozenset[str]] = {
    DATA_BROWSER: DATA_BROWSER_EXCLUDED_PLUGINS,
    SCHEMA_BUILDER: SCHEMA_BUILDER_EXCLUDED_PLUGINS,
}


def excluded_for(surface: str | None) -> frozenset[str]:
    if surface is None:
        return frozenset()
    return EXCLUDED_PLUGINS.get(surface, frozenset())


def filter_plugins(names: Iterable[str], surface: str | None) -> list[str]:
    hidden = excluded_for(surface)
    return [n for n in names if n not in hidden]
