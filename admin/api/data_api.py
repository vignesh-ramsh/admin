"""Generic data browser — list/view/edit/delete rows on ANY table, driven
entirely by psqldb's own schema metadata. No new read/write logic: this is
a thin, friendly-error wrapper directly over arc.relay.list/get/save/delete
— the same Query Engine and CRUD every other caller in the system uses.

_users/_roles/_sessions/_access_keys are excluded from the WRITE path here
on purpose (reads are fine, see below) — the dedicated users_api/roles_api/
sessions_api/access_keys_api endpoints exist specifically because those
tables have real invariants a raw save_row() would silently bypass (e.g.
writing a plaintext password_hash instead of going through set_password's
hashing, or hand-editing has_roles/token_hash/revoked_at directly). Reads
stay open here since browsing them is safe and sometimes convenient."""

import arc
from psqldb.model import SchemaError
from psqldb.validation import ValidationError

_PROTECTED_WRITE_TABLES = frozenset({"_users", "_roles", "_sessions", "_access_keys"})
_READ_ERRORS = (SchemaError, ValidationError, arc.relay.QueryError)


def _friendly(exc: Exception):
    arc.relay.throw(str(exc), status=400, code="bad_request")


def _require_not_protected(table: str) -> None:
    if table in _PROTECTED_WRITE_TABLES:
        arc.relay.throw(
            f"'{table}' is managed through its own dedicated endpoints "
            f"(users/roles/sessions/access-keys) — not the generic data browser",
            status=409, code="protected_table",
        )


@arc.relay.whitelist(methods=["GET"], roles=["Superuser"])
async def list_rows(
    table: str,
    filters: dict | None = None,
    order_by: list[str] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    try:
        return await arc.relay.list(table, filters=filters, order_by=order_by, limit=limit, offset=offset)
    except _READ_ERRORS as exc:
        _friendly(exc)


@arc.relay.whitelist(methods=["GET"], roles=["Superuser"])
async def get_row(table: str, id: str) -> dict:
    try:
        row = await arc.relay.get(table, id)
    except _READ_ERRORS as exc:
        _friendly(exc)
    if row is None:
        arc.relay.throw("no such row", status=404, code="not_found")
    return row


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def save_row(table: str, data: dict) -> dict:
    _require_not_protected(table)
    try:
        return await arc.relay.save(table, data)
    except _READ_ERRORS as exc:
        _friendly(exc)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_row(table: str, id: str) -> dict:
    _require_not_protected(table)
    try:
        await arc.relay.delete(table, id)
    except _READ_ERRORS as exc:
        _friendly(exc)
    return {"ok": True}
