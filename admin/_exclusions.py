"""
admin._exclusions
------------------
Which plugins are hidden from each admin surface's plugin picker.

Kept here, server-side, rather than in the SPA: the UI can only ever hide
what the API hands it, so filtering at the source means one list to edit
and no way for a stale bundle to surface something that was meant to be
hidden.

Per-surface on purpose — "don't author schemas for this plugin" and
"don't browse this plugin's rows" are different questions. Extend the sets
below; nothing else needs to change.
"""

from __future__ import annotations

from typing import Iterable

# Surfaces (the `surface` argument admin's own endpoints accept).
DATA_BROWSER = "data_browser"
SCHEMA_BUILDER = "schema_builder"

# Plugins that own no tables of their own at all — they'd only ever render
# an empty picker. `admin` itself is included: it declares no schemas.
_NO_TABLES = frozenset({"admin", "gateway", "redix", "relay"})

EXCLUDED_PLUGINS: dict[str, frozenset[str]] = {
    DATA_BROWSER: _NO_TABLES,
    # psqldb additionally: its own _trash/_field_registry/_patch_history are
    # created by raw bootstrap SQL, not by schema files, so there is nothing
    # for the Schema Builder to author or edit there.
    SCHEMA_BUILDER: _NO_TABLES | {"psqldb"},
}

# Candidates worth considering later, deliberately NOT excluded by default:
#   "authn"      — its four system tables are self-declared; editing them
#                  through the builder is possible but sharp-edged.
#   "example_hr" — the reference plugin; useful to keep visible as a live
#                  example of every schema feature.


def excluded_for(surface: str | None) -> frozenset[str]:
    if surface is None:
        return frozenset()
    return EXCLUDED_PLUGINS.get(surface, frozenset())


def filter_plugins(names: Iterable[str], surface: str | None) -> list[str]:
    hidden = excluded_for(surface)
    return [n for n in names if n not in hidden]
