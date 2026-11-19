"""Admin's File Manager surface — a curated view onto `arc.filer`'s own
FilerFile rows and the `filer_*` keys in arc.settings.

Deliberately NOT built on top of the generic Settings page
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

The S3 credentials (`filer_s3_access_key_id`, `filer_s3_secret_access_key`) are
secrets, and secrets are not handled by the admin console at all (see
settings_api.py): they are neither listed here, not even as "configured", nor
written here. They are set with `arc settings set <key> <value> --secret` and
read with `arc settings list --secrets` / `arc settings get <key> --reveal`.
A write that names one is refused with 403, not ignored, so a client that
believes it saved a credential is told it did not.
"""

import arc

from admin._pagination import cursor_page

# key -> kind. Single source of truth for both what list_filer_settings()
# reads and what set_filer_settings() is allowed to write — a key absent
# from this dict is never touched in either direction, so this is NOT a
# passthrough to arbitrary arc.settings keys. No secret is in it (see the
# module docstring). kind drives the frontend's form control: "bool" ->
# checkbox, "int" -> number input, "select:a,b" -> dropdown, "text" ->
# text input.
_FILER_SETTINGS: dict[str, str] = {
    "filer_scan_public": "bool",
    "filer_scan_private": "bool",
    "filer_allow_public_uploads": "bool",  # off = every upload must be private, nobody may upload a public file
    "filer_clamav_socket": "text",
    "filer_max_upload_bytes": "int",
    "filer_allowed_content_types": "text",
    "filer_verify_content_type": "bool",  # on = an upload's first bytes must match the type it declares
    "filer_purge_after_days": "int",
    "filer_default_link_ttl_seconds": "int",
    "filer_default_storage": "select:local,s3",
    "filer_local_root": "text",
    "filer_s3_bucket": "text",
    "filer_s3_region": "text",
    "filer_s3_endpoint_url": "text",
    "filer_max_request_body_bytes": "int",
    "filer_max_upload_request_bytes": "int",
    # uploads: how a file is received, and what the scanner may be sent
    "filer_streaming_uploads": "bool",
    "filer_max_concurrent_uploads": "int",
    "filer_upload_max_seconds": "int",
    "filer_spool_dir": "text",  # operator-only: shown, changed on the server
    "filer_spool_min_free_mb": "int",
    "filer_upload_stale_minutes": "int",
    "filer_scan_max_bytes": "int",
    "filer_scan_timeout_seconds": "int",
    # S3 and S3-compatible services
    "filer_s3_addressing_style": "select:auto,path,virtual",
    "filer_s3_checksum_mode": "select:auto,when_supported,when_required",
    "filer_s3_send_acl": "bool",
    "filer_s3_server_side_encryption": "text",
    "filer_s3_sse_kms_key_id": "text",
    "filer_s3_part_size_mb": "int",
    "filer_s3_upload_concurrency": "int",
    "filer_s3_connect_timeout_seconds": "int",
    "filer_s3_read_timeout_seconds": "int",
    "filer_s3_max_attempts": "int",
    "filer_s3_redirect_over_mb": "int",
    "filer_s3_public_endpoint_url": "text",
}


# The S3 credentials. Not in _FILER_SETTINGS and never handled here: a write that names one is refused (see
# set_filer_settings). Named explicitly, besides the kernel's own is_secret() check, so the refusal holds even
# when the filer plugin is not loaded and has not declared them.
_FILER_SECRET_KEYS = ("filer_s3_access_key_id", "filer_s3_secret_access_key")


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_filer_settings() -> list[dict]:
    """One row per known filer_* setting, whether or not it has a value yet. Never a secret (the S3 credentials
    are not listed, not even as "configured")."""
    rows = []
    for key, kind in _FILER_SETTINGS.items():
        value = arc.settings.get(key)
        rows.append(
            {
                "key": key,
                "kind": kind,
                "value": value,
                "is_set": value is not None,
                # operator-only keys (filer_local_root) show here but can only be changed on the server
                "read_only": arc.settings.is_operator_only(key),
            }
        )
    return rows


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_filer_settings(values: dict) -> dict:
    """Only keys already known to `_FILER_SETTINGS` are ever written — an
    unrecognized key in `values` is silently ignored, not an error (the
    form only ever sends known keys; a stray extra key here is far more
    likely a stale client than something to fail loudly over). A blank
    value clears a plain key, same as arc.settings.set()'s own normal
    behavior.

    The one exception to "unknown is ignored" is a secret (the S3
    credentials, or any key the kernel knows as a secret): a request that
    tries to give one a value is refused with 403 `secret_cli_only` and
    nothing in it is written, because the admin console does not handle
    secrets at all (`arc settings set <key> <value> --secret` does). A
    blank value for one is a no-op, as it always was."""
    # Checked for the whole request before anything is written, so a refused key cannot leave the
    # others half-applied. Sending an operator-only key back with the value it already has is fine
    # (a form that submits every field); changing it is not.
    for key, raw in (values or {}).items():
        if raw is None or not str(raw).strip():
            continue
        if key in _FILER_SECRET_KEYS or arc.settings.is_secret(key):
            arc.relay.throw(
                f"'{key}' is a secret. Secrets are managed from the command line only: "
                f"`arc settings set {key} <value> --secret`.",
                status=403,
                code="secret_cli_only",
            )
    for key, raw in (values or {}).items():
        if key in _FILER_SETTINGS and raw is not None and arc.settings.is_operator_only(key):
            if str(raw).strip() != str(arc.settings.get(key) or ""):
                arc.relay.throw(
                    f"'{key}' can only be changed on the server, with `arc settings set {key} <value>`",
                    status=403,
                    code="operator_only",
                )

    updated = []
    for key, raw in (values or {}).items():
        kind = _FILER_SETTINGS.get(key)
        if kind is None or raw is None:
            continue
        if arc.settings.is_operator_only(key):
            continue  # unchanged (checked above)
        if kind == "bool":
            value = (
                "true"
                if (raw is True or str(raw).strip().lower() in ("1", "true", "yes", "on"))
                else "false"
            )
        else:
            value = str(raw).strip()
        # the signed-in user's e-mail, so the store says who changed it (and `updated_at` says when)
        arc.settings.set(key, value, updated_by=arc.relay.context().user)
        updated.append(key)
    return {"updated": updated}


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in ("false", "0", "no", "")


def _escape_like(value: str) -> str:
    """Same escaping the Query Engine's own `contains` operator does
    (relay/query.py's _escape_like) — a search value that happens to
    contain a literal '%'/'_' shouldn't silently become a wildcard.
    Not imported from relay.query since it's two lines and internal
    (leading underscore) — same "not worth a shared symbol" call the
    rest of this codebase already makes for things this small."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_filer_files(
    status: str | None = None,
    storage: str | None = None,
    private: bool | str | None = None,
    q: str | None = None,
    after: str | None = None,
    limit: int | str = 50,
) -> dict:
    """Cursor-paginated — {rows, next_cursor, total} — every row enriched
    with a ready-to-use `url` (signed if private, plain if public, null if
    the file isn't currently servable). Superuser already sees the raw row
    via the generic Data Browser (table="filerfile"); this is the same
    data, purpose-shaped for a preview/download UI instead of a raw grid.

    `status`/`storage`/`private` are plain equality filters (the Query
    Engine's own `filters` dict, via admin._pagination.cursor_page). `q`
    matches EITHER original_filename OR path (docs/admin-ui-ux-review.md
    #5 — the Files tab used to have two separate boxes for these) — the
    bounded Query Engine's `filters` dict is AND-only across columns with
    no OR between two different fields, so only this one condition goes
    through cursor_page's extra_where raw-SQL hook instead (arc.MD §3.4) —
    still fully parameterized, no string-formatting of any caller value."""
    filters: dict = {}
    if status:
        filters["status"] = status
    if storage:
        filters["storage"] = storage
    if private is not None and private != "":
        filters["private"] = _as_bool(private)

    extra_where, extra_params = "", []
    if q:
        extra_where = "(original_filename ILIKE $1 ESCAPE '\\' OR path ILIKE $1 ESCAPE '\\')"
        extra_params = [f"%{_escape_like(q)}%"]

    # limit arrives as a plain query-string string when this is called via
    # GET (relay's kwarg merging never coerces beyond that — the same
    # documented limitation file_upload's `private` and filer's own
    # `serve_file`'s `exp` already had to work around) — asyncpg rejects a
    # numeric STRING outright rather than silently accepting it.
    rows, next_cursor, total = await cursor_page(
        "filerfile",
        arc.pgdb.schema("filerfile"),
        fields=arc.relay.all_columns("filerfile"),
        filters=filters or None,
        order_by=("created_at", True),
        after=after,
        limit=int(limit),
        extra_where=extra_where,
        extra_params=extra_params,
    )
    out = []
    for row in rows:
        url = (
            await arc.filer.sign_url(row["file_id"])
            if row["status"] in ("clean", "skipped")
            else None
        )
        out.append({**row, "url": url})
    return {"rows": out, "next_cursor": next_cursor, "total": total}


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
