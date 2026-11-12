"""Session management — admin-scope equivalent of authn's own self-service
`/sessions` endpoint (which only ever shows a caller their OWN sessions)
and its CLI's clear-sessions/prune-sessions commands, reimplemented here
directly. _sessions is a "system": true table with no soft-delete
(docs/arc.MD §3.9) — revoke sets revoked_at; prune is a genuine hard
delete of already-inactive rows, mirroring the CLI exactly."""

import arc

from admin._security import by_of
from admin._pagination import cursor_page

#: rows deleted per statement by prune_sessions
_PRUNE_BATCH = 5_000


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
        arc.pgdb.schema("_sessions"),
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
            "_sessions", {"id": row["id"], "revoked_at": arc.tz.utcnow()}, by=by_of(identity)
        )
        await arc.authn.invalidate_session_cache(row["token_hash"])
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def clear_sessions(email: str | None = None, all_users: bool = False, identity=None) -> dict:
    """Never runs unscoped — same rule `arc pgdb clear` and the CLI's own
    clear-sessions already enforce."""
    if not email and not all_users:
        arc.relay.throw("must specify either email or all_users=true", code="scope_required")
    by = by_of(identity)
    # One UPDATE either way (not one save per session): "all_users=True" means EVERY active session,
    # and `revoked` is how many of them were still live.
    if email:
        user = await arc.relay.get("_users", {"email": email.strip().lower()}, ["id"])
        if user is None:
            arc.relay.throw("no such user", status=404, code="not_found")
        revoked = await arc.authn.revoke_user_sessions(user["id"], by=by)
    else:
        revoked = await arc.authn.revoke_all_sessions(by=by)
    return {"ok": True, "revoked": revoked}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def prune_sessions(older_than_days: int = 30) -> dict:
    """Deletes sessions already inactive (revoked OR expired — most
    sessions are never explicitly logged out, so expires_at alone has to
    count too) and older than the cutoff. _sessions has no created_at
    (a "system": true table declares only what it needs), so "older than"
    is judged off whichever of revoked_at/expires_at applies — same
    semantics as the CLI's prune-sessions. Done in the database, in batches
    of _PRUNE_BATCH rows (one short statement each, so no long lock and no
    table's worth of ids in memory); `_sessions` has no relay hooks, and the
    audit trigger fires for these deletes like for any other."""
    cutoff = arc.tz.ago(days=older_than_days)
    deleted = 0
    while True:
        rows = await arc.relay.sql(
            'DELETE FROM "_sessions" WHERE id IN ('
            'SELECT id FROM "_sessions" WHERE revoked_at < $1 OR expires_at < $1 LIMIT $2) RETURNING id',
            cutoff,
            _PRUNE_BATCH,
        )
        deleted += len(rows)
        if len(rows) < _PRUNE_BATCH:
            return {"ok": True, "deleted": deleted}
