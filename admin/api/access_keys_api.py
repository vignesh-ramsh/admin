"""Access-key management — admin-scope equivalent of authn's own
`/access-keys` self-service endpoints and its CLI's clear/prune-access-key
commands. The two safety rules authn's own create_access_key enforces
(scopes must be a subset of the owning user's has_roles; scopes may never
include the Superuser/"*" full-bypass) are reimplemented directly here,
same reasoning as sessions_api/users_api — a leaked API key must never be
able to carry the full-role bypass a session can."""

from datetime import datetime, timedelta, timezone

import arc

from admin._security import has_roles_subset, new_access_key


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_access_keys(email: str | None = None) -> list[dict]:
    filters = None
    if email:
        user = await arc.relay.get("_users", {"email": email.strip().lower()})
        if user is None:
            arc.relay.throw("no such user", status=404, code="not_found")
        filters = {"user": user["id"]}
    rows = await arc.relay.list("_access_keys", filters=filters, order_by=["-expires_at"])
    return [
        {
            "id": str(r["id"]),
            "user": str(r["user"]),
            "key_prefix": r["key_prefix"],
            "label": r["label"],
            "scopes": r["scopes"],
            "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
            "last_used_at": r["last_used_at"].isoformat() if r["last_used_at"] else None,
            "revoked_at": r["revoked_at"].isoformat() if r["revoked_at"] else None,
        }
        for r in rows
    ]


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def create_access_key(
    email: str,
    scopes: list[str] | None = None,
    label: str | None = None,
    expires_in_days: int | None = None,
) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()})
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    scopes = list(scopes or [])

    if "Superuser" in scopes or "*" in scopes:
        arc.relay.throw("access key scopes may never include Superuser or '*'", status=400, code="scope_forbidden")
    if not has_roles_subset(scopes, user.get("has_roles")):
        arc.relay.throw("scopes must be a subset of the user's has_roles", status=400, code="invalid_scopes")

    raw_key, prefix, key_hash = new_access_key()
    expires_at = _utcnow() + timedelta(days=expires_in_days) if expires_in_days else None
    row = await arc.relay.save(
        "_access_keys",
        {
            "user": user["id"], "key_prefix": prefix, "key_hash": key_hash,
            "label": label, "scopes": scopes, "expires_at": expires_at,
        },
    )
    # Shown exactly once — only the hash is ever persisted or logged again.
    return {"key": raw_key, "key_prefix": prefix, "id": str(row["id"])}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def revoke_access_key(key_prefix: str) -> dict:
    row = await arc.relay.get("_access_keys", {"key_prefix": key_prefix})
    if row is None:
        arc.relay.throw("no such access key", status=404, code="not_found")
    if row["revoked_at"] is None:
        await arc.relay.save("_access_keys", {"id": row["id"], "revoked_at": _utcnow()})
        await arc.authn.invalidate_access_key_cache(row["key_prefix"])
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def clear_access_keys(email: str | None = None, all_users: bool = False) -> dict:
    if not email and not all_users:
        arc.relay.throw("must specify either email or all_users=true", code="scope_required")
    filters = {"revoked_at": {"is_null": True}}
    if email:
        user = await arc.relay.get("_users", {"email": email.strip().lower()})
        if user is None:
            arc.relay.throw("no such user", status=404, code="not_found")
        filters["user"] = user["id"]
    rows = await arc.relay.list("_access_keys", filters=filters, fields=["id", "key_prefix"])
    for r in rows:
        await arc.relay.save("_access_keys", {"id": r["id"], "revoked_at": _utcnow()})
        await arc.authn.invalidate_access_key_cache(r["key_prefix"])
    return {"ok": True, "revoked": len(rows)}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def prune_access_keys(older_than_days: int = 30) -> dict:
    cutoff = _utcnow() - timedelta(days=older_than_days)
    all_keys = await arc.relay.list("_access_keys", fields=["id", "revoked_at", "expires_at"])
    to_delete = [
        k["id"]
        for k in all_keys
        if (k["revoked_at"] is not None and k["revoked_at"] < cutoff)
        or (k["expires_at"] is not None and k["expires_at"] < cutoff)
    ]
    if to_delete:
        await arc.relay.delete_many("_access_keys", to_delete)
    return {"ok": True, "deleted": len(to_delete)}
