"""Session management — admin-scope equivalent of authn's own self-service
`/sessions` endpoint (which only ever shows a caller their OWN sessions)
and its CLI's clear-sessions/prune-sessions commands, reimplemented here
directly. _sessions is a "system": true table with no soft-delete
(docs/arc.MD §3.9) — revoke sets revoked_at; prune is a genuine hard
delete of already-inactive rows, mirroring the CLI exactly."""

from datetime import datetime, timedelta, timezone

import arc

from admin._security import by_of
from admin.api._pagination import cursor_page


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _escape_like(value: str) -> str:
    """Same escaping the Query Engine's own `contains` operator does
    (relay/query.py's _escape_like) — not imported since it's two lines
    and internal, same call every other admin module with a raw-SQL
    search already makes."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_sessions(
    email: str | None = None, q: str | None = None, after: str | None = None, limit: int = 50
) -> dict:
    """Cursor-paginated — {rows, next_cursor, total}, same shape every
    other list endpoint now returns. `email` is an exact scope (a specific
    user's own sessions); `q` is the admin screen's free-text search — IP
    address, or the owning user's email — via the extra_where hook, since
    matching against another table's column has no Query Engine filter
    operator (docs/arc.MD §3.4)."""
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
            "(ip_address ILIKE $1 ESCAPE '\\' OR "
            "\"user\" IN (SELECT id FROM \"_users\" WHERE email ILIKE $1 ESCAPE '\\'))"
        )
        extra_params = [pattern]

    rows, next_cursor, total = await cursor_page(
        "_sessions",
        arc.psqldb.schema("_sessions"),
        fields=["id", "user", "session_type", "expires_at", "revoked_at", "ip_address", "last_seen_at"],
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
            "session_type": r["session_type"],
            "expires_at": r["expires_at"].isoformat(),
            "revoked_at": r["revoked_at"].isoformat() if r["revoked_at"] else None,
            "ip_address": r["ip_address"],
            "last_seen_at": r["last_seen_at"].isoformat() if r["last_seen_at"] else None,
        }
        for r in rows
    ]
    return {"rows": shaped, "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def revoke_session(session_id: str, identity=None) -> dict:
    row = await arc.relay.get("_sessions", session_id, ["id", "revoked_at", "token_hash"])
    if row is None:
        arc.relay.throw("no such session", status=404, code="not_found")
    if row["revoked_at"] is None:
        await arc.relay.save(
            "_sessions", {"id": row["id"], "revoked_at": _utcnow()}, by=by_of(identity)
        )
        await arc.authn.invalidate_session_cache(row["token_hash"])
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def clear_sessions(email: str | None = None, all_users: bool = False, identity=None) -> dict:
    """Never runs unscoped — same rule `arc psqldb clear` and the CLI's own
    clear-sessions already enforce."""
    if not email and not all_users:
        arc.relay.throw("must specify either email or all_users=true", code="scope_required")
    filters = {"revoked_at": {"is_null": True}}
    if email:
        user = await arc.relay.get("_users", {"email": email.strip().lower()}, ["id"])
        if user is None:
            arc.relay.throw("no such user", status=404, code="not_found")
        filters["user"] = user["id"]
    by = by_of(identity)
    # Correctness-critical: "all_users=True" means revoke EVERY active
    # session — under-fetching here would silently leave some logged in.
    rows = await arc.relay.list(
        "_sessions", filters=filters, fields=["id", "token_hash"], limit=None
    )
    for r in rows:
        await arc.relay.save("_sessions", {"id": r["id"], "revoked_at": _utcnow()}, by=by)
        await arc.authn.invalidate_session_cache(r["token_hash"])
    return {"ok": True, "revoked": len(rows)}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def prune_sessions(older_than_days: int = 30) -> dict:
    """Deletes sessions already inactive (revoked OR expired — most
    sessions are never explicitly logged out, so expires_at alone has to
    count too) and older than the cutoff. _sessions has no created_at
    (a "system": true table declares only what it needs), so "older than"
    is judged off whichever of revoked_at/expires_at applies — same
    semantics as the CLI's prune-sessions. The Query Engine has no OR
    grouping (docs/arc.MD §3.4), so this filters client-side, the same
    established pattern already used for has_roles membership checks."""
    cutoff = _utcnow() - timedelta(days=older_than_days)
    # Correctness-critical: every session past the cutoff must be found,
    # or pruning silently stops working once there are more than
    # DEFAULT_LIST_LIMIT sessions in the table.
    all_sessions = await arc.relay.list(
        "_sessions", fields=["id", "revoked_at", "expires_at"], limit=None
    )
    to_delete = [
        s["id"]
        for s in all_sessions
        if (s["revoked_at"] is not None and s["revoked_at"] < cutoff)
        or (s["expires_at"] is not None and s["expires_at"] < cutoff)
    ]
    if to_delete:
        await arc.relay.delete_many("_sessions", to_delete)
    return {"ok": True, "deleted": len(to_delete)}
