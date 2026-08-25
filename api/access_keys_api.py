"""Access-key management — admin-scope equivalent of authn's own
`/access-keys` self-service endpoints and its CLI's clear/prune-access-key
commands. The two safety rules authn's own create_access_key enforces
(scopes must be a subset of the owning user's has_roles; scopes may never
include the Superuser/"*" full-bypass) are reimplemented directly here,
same reasoning as sessions_api/users_api — a leaked API key must never be
able to carry the full-role bypass a session can."""

import arc
from pgdb.validation import ValidationError

from admin._security import by_of, has_roles_subset, new_access_key
from admin._pagination import cursor_page


def _escape_like(value: str) -> str:
    """Same escaping the Query Engine's own `contains` operator does
    (relay/query.py's _escape_like) — not imported since it's two lines
    and internal, same call every other admin module with a raw-SQL
    search already makes."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_access_keys(
    email: str | None = None, q: str | None = None, after: str | None = None, limit: int = 50
) -> dict:
    """Cursor-paginated — {rows, next_cursor, total}, same shape every
    other list endpoint now returns. `email` is an exact scope (a specific
    user's own keys); `q` is the admin screen's free-text search — label,
    key prefix, or the owning user's email — via the extra_where hook,
    since matching against another table's column has no Query Engine
    filter operator (docs/arc.MD §3.4)."""
    filters = None
    if email:
        user = await arc.relay.get("_users", {"email": email.strip().lower()}, ["id"])
        if user is None:
            arc.relay.throw("no such user", status=404, code="not_found")
        filters = {"user": user["id"]}

    extra_where, extra_params = "", []
    if q:
        pattern = f"%{_escape_like(q)}%"
        extra_where = (
            "(label ILIKE $1 ESCAPE '\\' OR key_prefix ILIKE $1 ESCAPE '\\' OR "
            "\"user\" IN (SELECT id FROM \"_users\" WHERE email ILIKE $1 ESCAPE '\\'))"
        )
        extra_params = [pattern]

    rows, next_cursor, total = await cursor_page(
        "_access_keys",
        arc.pgdb.schema("_access_keys"),
        fields=["id", "user", "key_prefix", "label", "scopes", "expires_at", "last_used_at", "revoked_at"],
        filters=filters,
        order_by=("expires_at", True),
        after=after,
        limit=limit,
        extra_where=extra_where,
        extra_params=extra_params,
    )
    shaped = [
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
    return {"rows": shaped, "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def create_access_key(
    email: str,
    scopes: list[str] | None = None,
    label: str | None = None,
    expires_in_days: int | None = None,
    identity=None,
) -> dict:
    user = await arc.relay.get("_users", {"email": email.strip().lower()}, ["id", "has_roles"])
    if user is None:
        arc.relay.throw("no such user", status=404, code="not_found")
    scopes = list(scopes or [])

    if "Superuser" in scopes or "*" in scopes:
        arc.relay.throw(
            "access key scopes may never include Superuser or '*'",
            status=400,
            code="scope_forbidden",
        )
    if not has_roles_subset(scopes, user.get("has_roles")):
        arc.relay.throw(
            "scopes must be a subset of the user's has_roles", status=400, code="invalid_scopes"
        )

    raw_key, prefix, key_hash = new_access_key()
    expires_at = arc.tz.add(days=expires_in_days) if expires_in_days else None
    try:
        row = await arc.relay.save(
            "_access_keys",
            {
                "user": user["id"],
                "key_prefix": prefix,
                "key_hash": key_hash,
                "label": label,
                "scopes": scopes,
                "expires_at": expires_at,
            },
            by=by_of(identity),
        )
    except ValidationError as exc:
        # key_prefix/key_hash are both unique, generated from 32 random
        # bytes — a collision is astronomically unlikely, but if it ever
        # happens the caller should get a clean "try again", not a raw 500.
        arc.relay.throw(str(exc), status=409, code="key_collision")
    # Shown exactly once — only the hash is ever persisted or logged again.
    return {"key": raw_key, "key_prefix": prefix, "id": str(row["id"])}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def revoke_access_key(key_prefix: str, identity=None) -> dict:
    row = await arc.relay.get(
        "_access_keys", {"key_prefix": key_prefix}, ["id", "revoked_at", "key_prefix"]
    )
    if row is None:
        arc.relay.throw("no such access key", status=404, code="not_found")
    if row["revoked_at"] is None:
        await arc.relay.save(
            "_access_keys", {"id": row["id"], "revoked_at": arc.tz.utcnow()}, by=by_of(identity)
        )
        await arc.authn.invalidate_access_key_cache(row["key_prefix"])
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def clear_access_keys(
    email: str | None = None, all_users: bool = False, identity=None
) -> dict:
    if not email and not all_users:
        arc.relay.throw("must specify either email or all_users=true", code="scope_required")
    filters = {"revoked_at": {"is_null": True}}
    if email:
        user = await arc.relay.get("_users", {"email": email.strip().lower()}, ["id"])
        if user is None:
            arc.relay.throw("no such user", status=404, code="not_found")
        filters["user"] = user["id"]
    by = by_of(identity)
    # Correctness-critical: "all_users=True" means revoke EVERY active key —
    # under-fetching here would silently leave some keys still valid.
    rows = await arc.relay.list(
        "_access_keys", filters=filters, fields=["id", "key_prefix"], limit=None
    )
    for r in rows:
        await arc.relay.save("_access_keys", {"id": r["id"], "revoked_at": arc.tz.utcnow()}, by=by)
        await arc.authn.invalidate_access_key_cache(r["key_prefix"])
    return {"ok": True, "revoked": len(rows)}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def prune_access_keys(older_than_days: int = 30) -> dict:
    cutoff = arc.tz.ago(days=older_than_days)
    # The cutoff comparison itself runs in Postgres now, not in Python
    # after an unbounded fetch — `limit=None` used to mean "every row in
    # the table," not "every row past the cutoff." any_of is relay's own
    # bounded OR escape hatch (relay/query.py), the same mechanism
    # save_rows_bulk_by_filter/delete_rows_by_filter already use for a
    # "resolve the matching ids, then act" pair.
    rows = await arc.relay.list(
        "_access_keys",
        fields=["id"],
        filters={
            "any_of": [
                {"revoked_at": {"lt": cutoff}},
                {"expires_at": {"lt": cutoff}},
            ]
        },
        limit=None,
    )
    to_delete = [r["id"] for r in rows]
    if to_delete:
        await arc.relay.delete_many("_access_keys", to_delete)
    return {"ok": True, "deleted": len(to_delete)}
