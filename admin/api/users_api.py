"""User management — the HTTP-reachable equivalent of authn's own
`arc authn create-user/set-status/add-role/remove-role/set-password` CLI
commands, reimplemented directly here (per this plugin's explicit
self-containment) against arc.relay.save/get/list and arc.authn's already-
public capability methods (min_password_score, invalidate_session_cache).

Every _users write below fires authn's own after_save cache-invalidation
hook and validate has_roles-exists hook (authn/hooks/_users.py) — those
are registered against the TABLE at authn's own boot time, so they run
regardless of which plugin calls arc.relay.save("_users", ...). Password
hashing/strength live in admin/_security.py."""

import secrets
from datetime import datetime, timezone

import arc
from psqldb.validation import ValidationError

from admin._security import check_password_strength, hash_password

# Matches authn's own SUPERUSER_ROLE_NAME constant exactly (authn/authn/__init__.py)
# — an ordinary _roles row, nothing magic about the string itself.
SUPERUSER_ROLE_NAME = "Superuser"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@arc.relay.whitelist(methods=["GET"], roles=["Superuser"])
async def list_users(role: str | None = None, q: str | None = None) -> list[dict]:
    users = await arc.relay.list(
        "_users",
        fields=["id", "email", "status", "has_roles", "max_sessions", "locked_until", "last_login_at"],
        order_by=["email"],
    )
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
) -> dict:
    email = email.strip().lower()
    roles = list(roles or [])

    if superuser:
        if await arc.relay.get("_roles", {"name": SUPERUSER_ROLE_NAME}) is None:
            await arc.relay.save(
                "_roles", {"name": SUPERUSER_ROLE_NAME, "description": "Bypasses all role checks."}
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
        check_password_strength(raw_password, min_score=arc.authn.min_password_score(), user_inputs=[email])
    except ValueError as exc:
        arc.relay.throw(str(exc), status=400, code="weak_password")

    try:
        user = await arc.relay.save(
            "_users",
            {
                "email": email,
                "password_hash": hash_password(raw_password),
                "status": "Active",
                "has_roles": roles,
                "max_sessions": max_sessions,
            },
        )
    except ValidationError as exc:
        arc.relay.throw(str(exc), status=400, code="invalid_user")

    return {
        "user": {k: v for k, v in user.items() if k != "password_hash"},
        "generated_password": None if password else raw_password,
        "skipped_unknown_roles": skipped,
    }


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_status(email: str, status: str) -> dict:
    if status not in ("Active", "Inactive", "Locked"):
        arc.relay.throw("status must be Active, Inactive, or Locked", code="bad_status")
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")

    update = {"id": user["id"], "status": status}
    if status == "Active":
        # A status change alone wouldn't otherwise lift a still-active
        # brute-force lock — same reasoning as authn's own CLI.
        update["failed_login_count"] = 0
        update["locked_until"] = None
    await arc.relay.save("_users", update)
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def add_role(email: str, role: str) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    current = list(user.get("has_roles") or [])
    if role not in current:  # idempotent, same as the CLI
        current.append(role)
        await arc.relay.save("_users", {"id": user["id"], "has_roles": current})
    return {"ok": True, "has_roles": current}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def remove_role(email: str, role: str) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    before = list(user.get("has_roles") or [])
    current = [r for r in before if r != role]
    if current != before:  # idempotent, same as the CLI
        await arc.relay.save("_users", {"id": user["id"], "has_roles": current})
    return {"ok": True, "has_roles": current}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def set_password(email: str, password: str) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    try:
        check_password_strength(password, min_score=arc.authn.min_password_score(), user_inputs=[email])
    except ValueError as exc:
        arc.relay.throw(str(exc), status=400, code="weak_password")

    await arc.relay.save(
        "_users",
        {"id": user["id"], "password_hash": hash_password(password), "failed_login_count": 0, "locked_until": None},
    )

    # An admin-assisted reset is exactly the moment an old, possibly-
    # compromised session shouldn't keep working — same reasoning authn's
    # own CLI set-password already documents.
    sessions = await arc.relay.list("_sessions", filters={"user": user["id"], "revoked_at": {"is_null": True}})
    for s in sessions:
        await arc.relay.save("_sessions", {"id": s["id"], "revoked_at": _utcnow()})
        await arc.authn.invalidate_session_cache(s["token_hash"])
    return {"ok": True, "sessions_revoked": len(sessions)}
