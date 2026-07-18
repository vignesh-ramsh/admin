"""User management — the HTTP-reachable equivalent of authn's own
`arc authn create-user/set-status/add-role/remove-role/set-password` CLI
commands, reimplemented directly here (per this plugin's explicit
self-containment) against arc.relay.save/get/list and arc.authn's already-
public capability methods (min_password_score, invalidate_session_cache).

Every _users write below fires authn's own after_save cache-invalidation
hook, has_roles-exists validate hook, and username validate hook
(authn/hooks/_users.py) — those are registered against the TABLE at
authn's own boot time, so they run regardless of which plugin calls
arc.relay.save("_users", ...). Password hashing/strength live in
admin/_security.py, alongside by_of() — the identity -> `by=` attribution
helper every write below uses so created_by/updated_by (and, via authn's
own audit trigger, _audit_authn.changed_by) are populated instead of NULL.

REQUIRES authn's _users/_roles/_sessions/_access_keys to have been
migrated with the created_by/updated_by columns added in this same
change (schemas/_users.json etc.) — every write here will raise a raw
UndefinedColumnError until `arc psqldb migrate -p authn` has been run."""

import asyncio
import ipaddress
import secrets
from datetime import datetime, timezone

import arc
from psqldb.validation import ValidationError

from admin._security import by_of, check_password_strength, hash_password

# Matches authn's own SUPERUSER_ROLE_NAME constant exactly (authn/authn/__init__.py)
# — an ordinary _roles row, nothing magic about the string itself.
SUPERUSER_ROLE_NAME = "Superuser"

_USER_LIST_FIELDS = [
    "id", "email", "username", "full_name", "status", "has_roles",
    "max_sessions", "allowed_ips", "locked_until", "last_login_at",
    "created_by", "updated_by",
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _validate_allowed_ips(allowed_ips: list[str] | None) -> list[str] | None:
    """Same shape authn's own `_ip_allowed` (authn/authn/__init__.py)
    parses at request time — a plain IP or a CIDR network. Rejected here,
    before ever being written, rather than silently accepted and only
    discovered broken the next time someone actually tries to log in from
    that address."""
    if allowed_ips is None:
        return None
    cleaned = []
    for entry in allowed_ips:
        entry = entry.strip()
        if not entry:
            continue
        try:
            ipaddress.ip_network(entry, strict=False) if "/" in entry else ipaddress.ip_address(entry)
        except ValueError:
            arc.relay.throw(f"'{entry}' is not a valid IP address or CIDR range", code="invalid_ip")
        cleaned.append(entry)
    return cleaned


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_users(role: str | None = None, q: str | None = None) -> list[dict]:
    users = await arc.relay.list("_users", fields=_USER_LIST_FIELDS, order_by=["email"])
    if role:
        # JSONB array membership has no Query Engine filter operator
        # (docs/arc.MD §3.4) — filtering client-side is the established
        # pattern authn's own `list-users --role` already uses.
        users = [u for u in users if role in (u.get("has_roles") or [])]
    if q:
        q_lower = q.lower()
        users = [u for u in users if u["email"].lower().startswith(q_lower)]
    return users


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def create_user(
    email: str,
    password: str | None = None,
    roles: list[str] | None = None,
    superuser: bool = False,
    max_sessions: int | None = None,
    username: str | None = None,
    full_name: str | None = None,
    allowed_ips: list[str] | None = None,
    identity=None,
) -> dict:
    email = email.strip().lower()
    roles = list(roles or [])
    allowed_ips = _validate_allowed_ips(allowed_ips)

    if superuser:
        if await arc.relay.get("_roles", {"name": SUPERUSER_ROLE_NAME}) is None:
            await arc.relay.save(
                "_roles", {"name": SUPERUSER_ROLE_NAME, "description": "Bypasses all role checks."},
                by=by_of(identity),
            )
        if SUPERUSER_ROLE_NAME not in roles:
            roles.append(SUPERUSER_ROLE_NAME)

    # Unknown role names are warned-and-skipped, not a hard failure — same
    # as authn's own CLI. authn's has_roles validation hook would reject
    # them anyway; filtering first gives a clearer response shape than a
    # generic "no role named X" thrown mid-save.
    known = {r["name"] for r in await arc.relay.list("_roles", fields=["name"])}
    skipped = [r for r in roles if r not in known]
    roles = [r for r in roles if r in known]

    raw_password = password or secrets.token_urlsafe(16)
    try:
        # to_thread: zxcvbn scoring and (below) Argon2 hashing are real CPU
        # — running them on the event loop stalls every in-flight request.
        await asyncio.to_thread(
            check_password_strength, raw_password,
            min_score=arc.authn.min_password_score(), user_inputs=[email],
        )
    except ValueError as exc:
        arc.relay.throw(str(exc), status=400, code="weak_password")

    password_hash = await asyncio.to_thread(hash_password, raw_password)
    try:
        user = await arc.relay.save(
            "_users",
            {
                "email": email,
                "password_hash": password_hash,
                "status": "Active",
                "has_roles": roles,
                "max_sessions": max_sessions,
                "username": username or None,
                "full_name": full_name or None,
                "allowed_ips": allowed_ips,
            },
            by=by_of(identity),
        )
    except ValidationError as exc:
        arc.relay.throw(str(exc), status=400, code="invalid_user")

    return {
        "user": {k: v for k, v in user.items() if k != "password_hash"},
        "generated_password": None if password else raw_password,
        "skipped_unknown_roles": skipped,
    }


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def update_profile(
    email: str,
    full_name: str | None = None,
    username: str | None = None,
    allowed_ips: list[str] | None = None,
    clear_username: bool = False,
    identity=None,
) -> dict:
    """full_name/username/allowed_ips only — a separate, narrow endpoint
    from set_status/add_role/remove_role/set_password on purpose, same
    reasoning as those already being split apart: each has its own shape
    of change and its own reason to exist independently.

    `clear_username=True` is how a caller actually sets username back to
    NULL — plain absence of the `username` kwarg here means "leave it
    unchanged" (the same convention save_row's partial-update semantics
    already use elsewhere), so there has to be an explicit way to say
    "clear it" rather than "didn't mention it"."""
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")

    update: dict = {"id": user["id"]}
    if full_name is not None:
        update["full_name"] = full_name.strip() or None
    if clear_username:
        update["username"] = None
    elif username is not None:
        update["username"] = username
    if allowed_ips is not None:
        update["allowed_ips"] = _validate_allowed_ips(allowed_ips)

    try:
        await arc.relay.save("_users", update, by=by_of(identity))
    except ValidationError as exc:
        arc.relay.throw(str(exc), status=400, code="invalid_profile")
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_status(email: str, status: str, locked_until: str | None = None, identity=None) -> dict:
    if status not in ("Active", "Inactive", "Locked"):
        arc.relay.throw("status must be Active, Inactive, or Locked", code="bad_status")
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")

    update: dict = {"id": user["id"], "status": status}
    if status == "Active":
        # A status change alone wouldn't otherwise lift a still-active
        # brute-force lock — same reasoning as authn's own CLI.
        update["failed_login_count"] = 0
        update["locked_until"] = None
    elif status == "Locked":
        # NOT self-expiring: authn's login() blocks on status != "Active"
        # regardless of this date (verified directly against auth_api.py)
        # — only the automatic brute-force path (status stays "Active",
        # only locked_until set) actually self-clears on next login. This
        # is stored purely so admins can see when a manual lock was meant
        # to end; lifting it still requires setting status back to Active.
        if locked_until:
            try:
                parsed = datetime.fromisoformat(locked_until)
            except ValueError:
                arc.relay.throw("locked_until must be an ISO datetime", code="bad_locked_until")
            update["locked_until"] = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    await arc.relay.save("_users", update, by=by_of(identity))
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def add_role(email: str, role: str, identity=None) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    current = list(user.get("has_roles") or [])
    if role not in current:  # idempotent, same as the CLI
        current.append(role)
        await arc.relay.save("_users", {"id": user["id"], "has_roles": current}, by=by_of(identity))
    return {"ok": True, "has_roles": current}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def remove_role(email: str, role: str, identity=None) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    before = list(user.get("has_roles") or [])
    current = [r for r in before if r != role]
    if current != before:  # idempotent, same as the CLI
        await arc.relay.save("_users", {"id": user["id"], "has_roles": current}, by=by_of(identity))
    return {"ok": True, "has_roles": current}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_password(email: str, password: str, identity=None) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    try:
        await asyncio.to_thread(
            check_password_strength, password,
            min_score=arc.authn.min_password_score(), user_inputs=[email],
        )
    except ValueError as exc:
        arc.relay.throw(str(exc), status=400, code="weak_password")

    by = by_of(identity)
    password_hash = await asyncio.to_thread(hash_password, password)
    await arc.relay.save(
        "_users",
        {"id": user["id"], "password_hash": password_hash, "failed_login_count": 0, "locked_until": None},
        by=by,
    )

    # An admin-assisted reset is exactly the moment an old, possibly-
    # compromised session shouldn't keep working — same reasoning authn's
    # own CLI set-password already documents.
    sessions = await arc.relay.list("_sessions", filters={"user": user["id"], "revoked_at": {"is_null": True}})
    for s in sessions:
        await arc.relay.save("_sessions", {"id": s["id"], "revoked_at": _utcnow()}, by=by)
        await arc.authn.invalidate_session_cache(s["token_hash"])
    return {"ok": True, "sessions_revoked": len(sessions)}
