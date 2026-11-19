"""Settings — a system-wide view onto arc.settings (docs/arc.MD §3.5), which
had no enumeration surface at all before this: a plugin could
`arc.settings.declare()`/`set()` a key at boot, but nothing could answer
"what keys exist" afterward. `arc.settings.list_all()` — a small,
additive, read-only Kernel change (arc/arc/settings.py, not a plugin —
the same class of deliberate, flagged exception as authn's schema change,
§3.14) — is the fix; this module is admin's own thin wrapper around it,
same self-containment posture as everywhere else in this plugin.

SECRETS ARE NOT HERE. They are listed, written and revealed from the command line only
(`arc settings list --secrets`, `arc settings set <key> <value> --secret`,
`arc settings get <key> --reveal`), by whoever has the server. This module
therefore treats a secret as if the admin console did not know it:

  * list_settings() leaves every secret out — not even its name or whether
    it has a value;
  * set_setting(), set_setting_description() and reset_setting_description()
    refuse a key that is a secret (403 `secret_cli_only`), and set_setting()
    refuses `secret=True` for a new one;
  * there is no reveal function and no listing of who revealed what — that
    audit trail (arc.settings.access_log) is read with
    `arc settings access-log`, and written by `arc settings get --reveal`.

The check is on the kernel's own record of a key (arc.settings.is_secret), not on
anything the caller sends, so it cannot be sidestepped by leaving a flag out.

set_setting() relies entirely on arc.settings.set()'s own existing rules
(arc/arc/settings.py) rather than reimplementing them, and every function
here is for a Superuser (roles=["Superuser"])."""

import arc

_SECRET_CLI_ONLY = (
    "'{key}' is a secret. Secrets are managed from the command line only: "
    "`arc settings list --secrets`, `arc settings set {key} <value> --secret`, "
    "`arc settings get {key} --reveal`."
)


def _refuse_secret(key: str) -> None:
    """403 when `key` is a secret (declared or stored as one); the admin console never touches those."""
    if arc.settings.is_secret(key):
        arc.relay.throw(_SECRET_CLI_ONLY.format(key=key), status=403, code="secret_cli_only")


def _plain_settings() -> dict[str, dict]:
    """arc.settings.list_all() without the secrets — the only view of the store this module gives out."""
    return {key: info for key, info in arc.settings.list_all().items() if info["kind"] != "secret"}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_settings() -> list[dict]:
    """Every setting (never a secret), one row per key, sorted by key. A row is the key plus what list_all()
    knows of it: value, type, default, description and who last edited the description."""
    rows = [{"key": key, **info} for key, info in _plain_settings().items()]
    rows.sort(key=lambda r: r["key"])
    return rows


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_setting(
    key: str,
    value: str,
    secret: bool = False,
    value_type: str | None = None,
    description: str | None = None,
) -> dict:
    """Set a setting's value; with a key that does not exist yet, create it. Never a secret: `secret=True`, or a
    key that is a secret, is refused with 403 (secrets are written with `arc settings set --secret`). The
    `secret` parameter exists only so a client written before that rule gets that answer, not an unknown-argument
    error.

    Creating takes `value_type` (str, int, float or bool; none means text with no checking) and a `description`
    that is required: every setting says what it is for. Both are fixed at creation, so a call that
    names an existing key and also gives either is refused with 409: its type never changes, and its description
    is changed with set_setting_description. Changing only the value of an existing key takes just key and value.
    A value that is not of the key's type is refused with 400, and a refused call writes nothing."""
    key = key.strip()
    if not key:
        arc.relay.throw("key is required", code="bad_key")
    if secret:
        arc.relay.throw(_SECRET_CLI_ONLY.format(key=key), status=403, code="secret_cli_only")
    _refuse_secret(key)
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
            secret=False,
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
    return {"key": key, "kind": "setting"}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_setting_description(key: str, description: str) -> dict:
    """Replace the text shown for a setting in the Settings page. It changes only the copy kept in the
    settings store (with who and when), never the description in the code, the key's value, or who set the value.
    An empty text is refused (use reset_setting_description to bring the original back) and so is one over 2000
    characters. A secret is refused with 403. Returns the key's refreshed entry."""
    _refuse_secret(key)
    if key not in arc.settings.list_all():
        arc.relay.throw(f"there is no setting '{key}'", status=404, code="no_such_key")
    try:
        arc.settings.set_description(key, description, by=arc.relay.context().user)
    except arc.settings.SettingsError as exc:
        arc.relay.throw(str(exc), status=400, code="bad_description")
    return {"key": key, **arc.settings.list_all()[key]}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def reset_setting_description(key: str) -> dict:
    """Put back the description the code declares for a setting, discarding an edit made here. A secret is
    refused with 403. Returns the key's refreshed entry, or just the key when it was a hand-added one with
    nothing left to show."""
    _refuse_secret(key)
    if key not in arc.settings.list_all():
        arc.relay.throw(f"there is no setting '{key}'", status=404, code="no_such_key")
    try:
        arc.settings.reset_description(key)
    except arc.settings.SettingsError as exc:
        arc.relay.throw(str(exc), status=400, code="bad_description")
    entry = arc.settings.list_all().get(key)
    return {"key": key, **entry} if entry else {"key": key, "removed": True}
