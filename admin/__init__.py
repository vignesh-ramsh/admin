"""
admin — ARC provider plugin: the admin backend (Architecture follow-up to
docs/arc.MD §7's Phase 5).

Deliberately self-contained, by explicit instruction: every management
surface it needs (schema/patch builder, generic data browser, user/role/
session/access-key management, health dashboard) is implemented ENTIRELY
inside this plugin, calling only already-public capabilities
(arc.relay.*, arc.psqldb.*, arc.authn.* the exported capability instance,
arc.health.*) — zero code changes to relay/psqldb/authn/gateway. Where
authn's own CLI (plugins/authn/authn/cli.py) has logic admin also needs
(password hashing/strength, token/prefix generation), admin reimplements
it directly against the same libraries (argon2-cffi, zxcvbn) and the same
documented formats (authn's KEY_PREFIX_LEN=12, hash_token's sha256), rather
than importing authn's internal module — the safety nets that actually
matter (has_roles validation, cache invalidation, audit trail) are
TABLE-level hooks/triggers authn already registered at ITS OWN boot time
(authn/hooks/_users.py, _access_keys.py) — they fire on any
arc.relay.save()/delete() call against those tables regardless of which
plugin makes it, so admin gets them for free by writing through Relay,
never through raw SQL.

requires=["relay", "gateway", "authn"] — a deliberate hardening of the
original roadmap's "optional_requires: authn (gates write-endpoints
only)": nearly this entire plugin (user/role/session/access-key
management, and RBAC for everything else) is meaningless without authn
installed, so making it a hard dependency is more honest than pretending
there's a useful authn-less mode.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

CAPABILITY = "admin"

# The route the admin SPA is served under (arc.gateway.mount_spa). Must
# match the Vite build's `base` in admin/ui/vite.config.ts exactly, or the
# built index.html's asset URLs (/admin-desk/assets/...) won't resolve
# through the mount.
UI_PREFIX = "admin-desk"

# The new admin console SPA (admin/ui-console) — a from-scratch, separately
# designed replacement UI living alongside admin-desk, not instead of it.
# Mounted at a different prefix (must match ui-console/vite.config.ts's
# `base`); mount_spa supports multiple simultaneous SPA prefixes, so both
# coexist with no interaction.
CONSOLE_UI_PREFIX = "admin"


class AdminProvider:
    """Deliberately thin — almost all of admin's actual logic lives in its
    whitelisted api/ functions (loaded via relay.register_api below), which
    call arc.relay/arc.psqldb/arc.authn directly. This class exists mainly
    to hold the real Kernel instance register(kernel) receives, so
    admin._paths' plugin-existence check has something authoritative to
    call (there's no separate arc.kernel capability — the Kernel is the
    container, not something a plugin exports, docs/arc.MD §3.1)."""

    def __init__(self, kernel: Any) -> None:
        self._kernel = kernel

    def list_installed_plugins(self) -> list[str]:
        """PLUGIN names, not capability names — the two are equal for every
        in-tree plugin today, but plugin.toml allows them to differ, and
        everything admin does with this list (audit tables `_audit_{plugin}`,
        `plugins/<name>/<name>/` schema paths) is keyed by plugin name."""
        return sorted({cap.plugin for cap in self._kernel.capabilities().values()})

    async def health(self) -> dict:
        return {"ok": True}


def register(kernel: Any) -> None:
    provider = AdminProvider(kernel)
    kernel.export(CAPABILITY, provider, requires=["relay", "gateway", "authn", "filer"], optional_requires=[])

    relay = kernel.get("relay")
    relay.register_api(Path(__file__).parent / "api")

    # Serve the built admin SPA at /admin-desk, if it's been built. The
    # dist/ directory is a build artifact (gitignored, produced by
    # `npm run build` in admin/ui) — a fresh checkout that hasn't built the
    # UI yet has no dist/, and mount_spa hard-errors on a missing dir by
    # design (docs/arc.MD §3.3's boot-time-not-request-time posture). So
    # admin checks for it first and just skips the mount (with a boot
    # advisory) when absent, rather than refusing to boot the whole plugin
    # — the API surface above is fully usable without the UI, and the UI is
    # a `cd admin/ui && npm install && npm run build` away.
    ui_dist = Path(__file__).parent / "ui" / "dist"
    if ui_dist.is_dir():
        kernel.get("gateway").mount_spa(ui_dist, prefix=UI_PREFIX)
    else:
        kernel.advise(
            f"admin: UI not built — /{UI_PREFIX} will 404 until you run "
            f"`cd plugins/admin/admin/ui && npm install && npm run build`. "
            f"The admin API endpoints are unaffected."
        )

    # Same pattern, second SPA: admin/ui-console's own build output.
    console_dist = Path(__file__).parent / "ui-console" / "dist"
    if console_dist.is_dir():
        kernel.get("gateway").mount_spa(console_dist, prefix=CONSOLE_UI_PREFIX)
    else:
        kernel.advise(
            f"admin: console UI not built — /{CONSOLE_UI_PREFIX} will 404 until you run "
            f"`cd plugins/admin/admin/ui-console && yarn install && yarn build`. "
            f"The admin API endpoints are unaffected."
        )
