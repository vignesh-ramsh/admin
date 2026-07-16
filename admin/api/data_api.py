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

from admin._coerce import CoercionError, coerce_filters, coerce_row, throw_coercion
from admin._security import by_of

_PROTECTED_WRITE_TABLES = frozenset(
    {"_users", "_roles", "_sessions", "_access_keys", "_trash", "_field_registry", "_patch_history"}
)
_READ_ERRORS = (SchemaError, ValidationError, arc.relay.QueryError)


def _friendly(exc: Exception):
    arc.relay.throw(str(exc), status=400, code="bad_request")


def _schema_or_throw(table: str):
    try:
        return arc.psqldb.schema(table)
    except SchemaError as exc:
        arc.relay.throw(str(exc), status=404, code="unknown_table")


def _require_not_protected(table: str) -> None:
    if table in _PROTECTED_WRITE_TABLES:
        arc.relay.throw(
            f"'{table}' is managed through its own dedicated endpoints "
            f"(users/roles/sessions/access-keys) — not the generic data browser",
            status=409, code="protected_table",
        )
    if table.startswith("_audit_"):
        # Integrity bookkeeping (docs/arc.MD §3.9's audit trigger writes
        # these), not application data — hand-editing a historical audit
        # row defeats the point of it existing. Browsable, never editable,
        # same posture as the protected tables above.
        arc.relay.throw(
            f"'{table}' is an audit trail, written only by its table's trigger — read-only here",
            status=409, code="protected_table",
        )


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def list_rows(
    table: str,
    filters: dict | None = None,
    order_by: list[str] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    schema = _schema_or_throw(table)
    try:
        # Filter operands arrive as JSON (always strings from a form input)
        # but reach asyncpg as real query parameters — a typed column needs
        # a real Python value, same as the write path. See admin._coerce.
        filters = coerce_filters(schema, filters)
    except CoercionError as exc:
        throw_coercion(exc)
    try:
        return await arc.relay.list(table, filters=filters, order_by=order_by, limit=limit, offset=offset)
    except _READ_ERRORS as exc:
        _friendly(exc)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def get_row(table: str, id: str) -> dict:
    try:
        row = await arc.relay.get(table, id)
    except _READ_ERRORS as exc:
        _friendly(exc)
    if row is None:
        arc.relay.throw("no such row", status=404, code="not_found")
    return row


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def save_row(table: str, data: dict, identity=None) -> dict:
    _require_not_protected(table)
    schema = _schema_or_throw(table)
    try:
        # JSON can't carry a datetime/date/Decimal — convert to what
        # asyncpg actually needs before the write. See admin._coerce.
        data = coerce_row(schema, data)
    except CoercionError as exc:
        throw_coercion(exc)
    try:
        return await arc.relay.save(table, data, by=by_of(identity))
    except _READ_ERRORS as exc:
        _friendly(exc)


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_row(table: str, id: str, identity=None) -> dict:
    _require_not_protected(table)
    try:
        await arc.relay.delete(table, id, by=by_of(identity))
    except _READ_ERRORS as exc:
        _friendly(exc)
    return {"ok": True}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_rows(table: str, ids: list[str], identity=None) -> dict:
    _require_not_protected(table)
    try:
        await arc.relay.delete_many(table, ids, by=by_of(identity))
    except _READ_ERRORS as exc:
        _friendly(exc)
    return {"ok": True, "count": len(ids)}
