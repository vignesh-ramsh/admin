"""Admin's File Manager surface — a curated view onto `arc.filer`'s own
FilerFile rows and the `filer_*` keys in arc.settings.

Deliberately NOT built on top of the generic Settings & Secrets page
(settings_api.py's list_settings()/set_setting()): those show every
`filer_*` key as a flat, untyped string, and — a real gap, not just a UX
one — a plain (non-secret) key that's been `declare()`d but never
`set()` doesn't appear in list_settings() at all (arc.settings.declare()
is a no-op for a non-secret key; see arc/arc/settings.py). File Manager
needs the full, typed list of known filer_* keys whether or not each one
has a value yet, so this module owns a small, explicit registry instead
— the same self-contained-thin-wrapper posture settings_api.py itself
already takes, just scoped to filer's own keys and shaped for a real
form (bool -> checkbox, int -> number input, ...) rather than generic
key/value/secret CRUD.

Secret values (S3 credentials) are never returned — only whether one is
currently set — mirroring list_settings()'s own masking; reveal, if
ever needed, is the existing generic admin.reveal_secret(key), not
reimplemented here.
"""

import arc

# key -> (kind, secret). Single source of truth for both what
# list_filer_settings() reads and what set_filer_settings() is allowed to
# write — a key absent from this dict is never touched in either
# direction, so this is NOT a passthrough to arbitrary arc.settings keys.
# kind drives the frontend's form control: "bool" -> checkbox, "int" ->
# number input, "select:a,b" -> dropdown, "text"/"secret" -> text input.
_FILER_SETTINGS: dict[str, tuple[str, bool]] = {
    "filer_scan_public": ("bool", False),
    "filer_scan_private": ("bool", False),
    "filer_clamav_socket": ("text", False),
    "filer_max_upload_bytes": ("int", False),
    "filer_allowed_content_types": ("text", False),
    "filer_purge_after_days": ("int", False),
    "filer_default_link_ttl_seconds": ("int", False),
    "filer_default_storage": ("select:local,s3", False),
    "filer_local_root": ("text", False),
    "filer_s3_bucket": ("text", False),
    "filer_s3_region": ("text", False),
    "filer_s3_endpoint_url": ("text", False),
    "filer_s3_access_key_id": ("secret", True),
    "filer_s3_secret_access_key": ("secret", True),
    "filer_max_request_body_bytes": ("int", False),
}


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_filer_settings() -> list[dict]:
    rows = []
    for key, (kind, secret) in _FILER_SETTINGS.items():
        value = arc.settings.get(key, reveal=not secret)
        rows.append({
            "key": key,
            "kind": kind,
            "secret": secret,
            "value": None if secret else value,
            "is_set": value is not None,
        })
    return rows


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_filer_settings(values: dict) -> dict:
    """Only keys already known to `_FILER_SETTINGS` are ever written — an
    unrecognized key in `values` is silently ignored, not an error (the
    form only ever sends known keys; a stray extra key here is far more
    likely a stale client than something to fail loudly over). A blank
    value for a SECRET key means "leave it unchanged" (never overwrite a
    real credential with an empty string just because the field was left
    blank in a re-save) — a blank value for a plain key clears it, same
    as arc.settings.set()'s own normal behavior."""
    updated = []
    for key, raw in (values or {}).items():
        entry = _FILER_SETTINGS.get(key)
        if entry is None or raw is None:
            continue
        kind, secret = entry
        if kind == "bool":
            value = "true" if (raw is True or str(raw).strip().lower() in ("1", "true", "yes", "on")) else "false"
        else:
            value = str(raw).strip()
            if secret and not value:
                continue
        arc.settings.set(key, value, secret=secret)
        updated.append(key)
    return {"updated": updated}


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in ("false", "0", "no", "")


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_filer_files(
    status: str | None = None,
    storage: str | None = None,
    private: bool | str | None = None,
    q: str | None = None,
    limit: int | str = 50,
    offset: int | str = 0,
) -> list[dict]:
    """Every row enriched with a ready-to-use `url` (signed if private,
    plain if public, null if the file isn't currently servable) —
    Superuser already sees the raw row via the generic Data Browser
    (table="filerfile"); this is the same data, purpose-shaped for a
    preview/download UI instead of a raw grid."""
    filters: dict = {}
    if status:
        filters["status"] = status
    if storage:
        filters["storage"] = storage
    if private is not None and private != "":
        filters["private"] = _as_bool(private)
    if q:
        filters["original_filename"] = {"contains": q}

    # limit/offset arrive as plain query-string strings when this is
    # called via GET (relay's kwarg merging never coerces beyond that —
    # the same documented limitation file_upload's `private` and filer's
    # own `serve_file`'s `exp` already had to work around) — relay's own
    # query engine then rejects a numeric STRING outright rather than
    # silently accepting it, which is what actually surfaced this.
    rows = await arc.relay.list(
        "filerfile", filters=filters or None, order_by=["-created_at"], limit=int(limit), offset=int(offset)
    )
    out = []
    for row in rows:
        url = await arc.filer.sign_url(row["file_id"]) if row["status"] in ("clean", "skipped") else None
        out.append({**row, "url": url})
    return out


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_filer_file(file_id: str) -> dict:
    """Thin wrapper over arc.filer.delete() — Superuser IS the
    authorization here (filer itself performs none of its own, docs §8),
    so no owner check is needed beyond the role gate already on this
    function. Queues for the normal 30-day purge grace window, same as
    any other deletion path — never an immediate hard delete."""
    await arc.filer.delete(file_id)
    return {"ok": True}


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def get_filer_antivirus_status() -> dict:
    return await arc.filer.antivirus_status()
