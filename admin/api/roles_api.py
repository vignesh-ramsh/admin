"""Role CRUD. Plain arc.relay.save/list/delete against _roles — no authn
code touched. delete_role's cascade (strip the role from every user who
has it, then delete the row) is pure orchestration over already-public
arc.relay calls, mirroring what authn's own CLI `delete-role` command
does — reimplemented here directly rather than imported, per this
plugin's self-containment. Every _users write below still fires authn's
own after_save cache-invalidation hook (authn/hooks/_users.py) — that
hook is registered against the TABLE, not the caller, so it runs
regardless of which plugin calls arc.relay.save("_users", ...)."""

import arc
from psqldb.validation import ValidationError

from admin._security import by_of
from admin.api._pagination import cursor_page


def _escape_like(value: str) -> str:
    """Same escaping the Query Engine's own `contains` operator does
    (relay/query.py's _escape_like) — not imported since it's two lines
    and internal, same call every other admin module with a raw-SQL
    search already makes."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_roles(q: str | None = None, after: str | None = None, limit: int = 50) -> dict:
    """Cursor-paginated — {rows, next_cursor, total} — same shape every
    other list endpoint now returns. `q` matches name OR description, the
    bounded Query Engine's filters dict has no OR-across-columns operator
    (docs/arc.MD §3.4), so it goes through the extra_where hook instead."""
    extra_where, extra_params = "", []
    if q:
        pattern = f"%{_escape_like(q)}%"
        extra_where = "(name ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\')"
        extra_params = [pattern]

    rows, next_cursor, total = await cursor_page(
        "_roles",
        arc.psqldb.schema("_roles"),
        fields=arc.relay.all_columns("_roles"),
        order_by=("name", False),
        after=after,
        limit=limit,
        extra_where=extra_where,
        extra_params=extra_params,
    )
    return {"rows": rows, "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def create_role(name: str, description: str | None = None, identity=None) -> dict:
    try:
        return await arc.relay.save(
            "_roles", {"name": name, "description": description}, by=by_of(identity)
        )
    except ValidationError as exc:
        arc.relay.throw(str(exc), status=400, code="invalid_role")


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def update_role(name: str, description: str | None = None, identity=None) -> dict:
    """Description only — `name` is the role's identity, referenced by
    every user's `has_roles` and every access key's `scopes` (both plain
    string arrays, not REFERENCE columns, §3.13), so renaming isn't a
    plain field edit and isn't offered here (docs/admin-ui-ux-review.md
    #4.1 was specifically about a typo'd description being permanent
    short of delete-and-recreate — this closes exactly that gap, nothing
    more)."""
    role = await arc.relay.get("_roles", {"name": name}, ["id"])
    if role is None:
        arc.relay.throw("no such role", status=404, code="not_found")
    return await arc.relay.save(
        "_roles", {"id": role["id"], "description": description}, by=by_of(identity)
    )


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_role(name: str, identity=None) -> dict:
    role = await arc.relay.get("_roles", {"name": name}, ["id"])
    if role is None:
        arc.relay.throw("no such role", status=404, code="not_found")

    by = by_of(identity)
    # Correctness-critical, not just a listing: EVERY user with this role
    # must be found and updated, or deleting a role would silently leave
    # it dangling on any user past DEFAULT_LIST_LIMIT.
    users = await arc.relay.list("_users", fields=["id", "has_roles"], limit=None)
    affected = [u for u in users if name in (u.get("has_roles") or [])]
    for u in affected:
        remaining = [r for r in (u["has_roles"] or []) if r != name]
        await arc.relay.save("_users", {"id": u["id"], "has_roles": remaining}, by=by)

    await arc.relay.delete("_roles", role["id"], by=by)
    return {"ok": True, "users_updated": len(affected)}
