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


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_roles() -> list[dict]:
    return await arc.relay.list("_roles", order_by=["name"])


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def create_role(name: str, description: str | None = None) -> dict:
    try:
        return await arc.relay.save("_roles", {"name": name, "description": description})
    except ValidationError as exc:
        arc.relay.throw(str(exc), status=400, code="invalid_role")


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_role(name: str) -> dict:
    role = await arc.relay.get("_roles", {"name": name})
    if role is None:
        arc.relay.throw("no such role", status=404, code="not_found")

    users = await arc.relay.list("_users", fields=["id", "has_roles"])
    affected = [u for u in users if name in (u.get("has_roles") or [])]
    for u in affected:
        remaining = [r for r in (u["has_roles"] or []) if r != name]
        await arc.relay.save("_users", {"id": u["id"], "has_roles": remaining})

    await arc.relay.delete("_roles", role["id"])
    return {"ok": True, "users_updated": len(affected)}
