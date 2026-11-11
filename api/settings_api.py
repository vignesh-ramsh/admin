"""Settings & Secrets — a system-wide view onto arc.settings (docs/arc.MD
§3.5), which had no enumeration surface at all before this: a plugin could
`arc.settings.declare()`/`set()` a key at boot, but nothing could answer
"what keys exist" afterward. `arc.settings.list_all()` — a small,
additive, read-only Kernel change (arc/arc/settings.py, not a plugin —
the same class of deliberate, flagged exception as authn's schema change,
§3.14) — is the fix; this module is admin's own thin wrapper around it,
same self-containment posture as everywhere else in this plugin.

Secret VALUES are never included in list_settings() — only their names,
mirroring arc.settings.get()'s own masking default. reveal_secret() is the
one explicit, separate action that surfaces a real secret value to a
person, and it is what writes the audit trail: after reading the value it
calls arc.settings.record_secret_access(key, who), so secret_access_log
holds exactly one row per time an administrator was shown a secret —
never one per list_settings() read, and never one per internal read of a
secret (arc.settings.get(..., reveal=True) writes nothing).
list_secret_access_log() surfaces that trail here; there's still no step-up re-auth beyond the existing
roles=["Superuser"] gate on every function in this module — a known,
flagged simplicity choice, not an oversight.

set_setting() relies entirely on arc.settings.set()'s own existing rules
(arc/arc/settings.py) rather than reimplementing them: flipping an
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
    # The audit record: who was shown this secret, and when (accessed_at is
    # stamped by the store). Written only after a real value was found.
    arc.settings.record_secret_access(key, arc.relay.context().user)
    return {"key": key, "value": value}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_secret_access_log(key: str | None = None, limit: int = 100) -> list[dict]:
    """Every reveal_secret() call, most recent first — who, which key,
    when. Written only by reveal_secret() above; list_settings() and
    internal secret reads never add to it."""
    return arc.settings.access_log(key=key, limit=limit)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_setting(
    key: str,
    value: str,
    secret: bool = False,
    value_type: str | None = None,
    description: str | None = None,
) -> dict:
    """Set a key's value; with a key that does not exist yet, create it.

    Creating takes `value_type` (str, int, float or bool; none means text with no checking) and a `description`
    that is required: every setting and secret says what it is for. Both are fixed at creation, so a call that
    names an existing key and also gives either is refused with 409: its type never changes, and its description
    is changed with set_setting_description. Changing only the value of an existing key takes just key, value and
    secret, as it always did. A value that is not of the key's type is refused with 400, and a refused call
    writes nothing."""
    key = key.strip()
    if not key:
        arc.relay.throw("key is required", code="bad_key")
    if key in arc.settings.list_all():
        if value_type is not None or description is not None:
            arc.relay.throw(
                f"'{key}' already exists. Open it in the list to change its value or its description; its type "
                f"cannot be changed.",
                status=409,
                code="key_exists",
            )
    elif description is None or not description.strip():
        arc.relay.throw(f"Say in a sentence what '{key}' is for.", status=400, code="description_required")
    try:
        arc.settings.set(
            key,
            value,
            secret=secret,
            updated_by=arc.relay.context().user,
            type=value_type,
            description=description,
        )
    except arc.settings.OperatorOnlyError as exc:
        # Not 400: the request is well-formed, this login is simply not allowed to make it. Such a
        # key decides what ARC runs, so it is changed with `arc settings set` on the server.
        arc.relay.throw(str(exc), status=403, code="operator_only")
    except arc.settings.SettingsError as exc:
        arc.relay.throw(str(exc), status=400, code="bad_setting")
    return {"key": key, "kind": "secret" if secret else "setting"}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_setting_description(key: str, description: str) -> dict:
    """Replace the text shown for a setting or secret in the Settings page. It changes only the copy kept in the
    settings store (with who and when), never the description in the code, the key's value, or who set the value.
    An empty text is refused (use reset_setting_description to bring the original back) and so is one over 2000
    characters. Returns the key's refreshed entry."""
    if key not in arc.settings.list_all():
        arc.relay.throw(f"there is no setting or secret '{key}'", status=404, code="no_such_key")
    try:
        arc.settings.set_description(key, description, by=arc.relay.context().user)
    except arc.settings.SettingsError as exc:
        arc.relay.throw(str(exc), status=400, code="bad_description")
    return {"key": key, **arc.settings.list_all()[key]}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def reset_setting_description(key: str) -> dict:
    """Put back the description the code declares for a setting or secret, discarding an edit made here. Returns
    the key's refreshed entry, or just the key when it was a hand-added one with nothing left to show."""
    if key not in arc.settings.list_all():
        arc.relay.throw(f"there is no setting or secret '{key}'", status=404, code="no_such_key")
    try:
        arc.settings.reset_description(key)
    except arc.settings.SettingsError as exc:
        arc.relay.throw(str(exc), status=400, code="bad_description")
    entry = arc.settings.list_all().get(key)
    return {"key": key, **entry} if entry else {"key": key, "removed": True}
