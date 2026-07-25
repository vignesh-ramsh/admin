"""Settings & Secrets — a system-wide view onto arc.settings/arc.secrets
(docs/arc.MD §3.5), which had no enumeration surface at all before this: a
plugin could `arc.settings.declare()`/`set()` a key at boot, but nothing
could answer "what keys exist" afterward. `arc.settings.list_all()` — a
small, additive, read-only Kernel change (arc/arc/settings.py, not a
plugin — the same class of deliberate, flagged exception as authn's
schema change, §3.14) — is the fix; this module is admin's own thin
wrapper around it, same self-containment posture as everywhere else in
this plugin.

Secret VALUES are never included in list_settings() — only their names,
mirroring arc.settings.get()'s own masking default. reveal_secret() is the
one explicit, separate action that surfaces a real secret value; there is
deliberately no step-up re-auth or audit trail beyond the existing
roles=["Superuser"] gate on every function here — a known, flagged
simplicity choice, not an oversight.

set_setting() relies entirely on arc.settings.set()'s own existing rules
(psqldb/arc/settings.py) rather than reimplementing them: flipping an
existing key's secret-ness without deleting it first is already a hard
SettingsError there, surfaced here as a clean 400. The UI additionally
locks the secret/plain toggle for an existing key so this path is never
actually reachable by hand — the server-side guard is what makes that
safe to rely on, not the other way around."""

import arc


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_settings() -> list[dict]:
    # list_all() is already one dict per key (kind/value/type/default/doc,
    # §1 P0) — this is now a thin key-in/row-out reshape, not the two-list
    # merge it used to be.
    data = arc.settings.list_all()
    rows = [{"key": key, **info} for key, info in data.items()]
    rows.sort(key=lambda r: r["key"])
    return rows


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def reveal_secret(key: str) -> dict:
    if not arc.settings.is_secret(key):
        arc.relay.throw(f"'{key}' is not a declared secret", status=404, code="not_a_secret")
    value = arc.settings.get(key, reveal=True)
    if value is None:
        arc.relay.throw(f"'{key}' has no value set", status=404, code="no_value")
    return {"key": key, "value": value}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_setting(key: str, value: str, secret: bool = False) -> dict:
    key = key.strip()
    if not key:
        arc.relay.throw("key is required", code="bad_key")
    try:
        arc.settings.set(key, value, secret=secret)
    except arc.settings.SettingsError as exc:
        arc.relay.throw(str(exc), status=400, code="bad_setting")
    return {"key": key, "kind": "secret" if secret else "setting"}
