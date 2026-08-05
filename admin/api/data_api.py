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

from uuid import UUID

import arc
from psqldb.model import SchemaError
from psqldb.validation import ValidationError
from relay import query as relay_query

from admin._coerce import CoercionError, coerce_filters, coerce_row, throw_coercion
from admin._security import by_of, redact_row
from admin.api._pagination import PaginationError, _renumber, cursor_page

_PROTECTED_WRITE_TABLES = frozenset(
    {"_users", "_roles", "_sessions", "_access_keys", "_trash", "_field_registry", "_patch_history"}
)
_READ_ERRORS = (SchemaError, ValidationError, arc.relay.QueryError, PaginationError)

#: Data Browser's own list-view column cap (format.ts's listColumns(schema, max=6))
#: — kept in sync by hand since the two are independent implementations of the
#: same "what does the table visually show" question, one per side of the wire.
_LIST_VIEW_MAX = 6


def _escape_like(value: str) -> str:
    """Same escaping the Query Engine's own `contains` operator does
    (relay.query._escape_like) — a search term that happens to contain a
    literal '%'/'_' shouldn't silently become a wildcard. Copied rather than
    imported since it's two lines and already duplicated once (users_api.py's
    own copy, for the exact same reason)."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_where(schema, search: list[str] | None) -> tuple[str, list]:
    """Free-text search across exactly the columns the table visually shows —
    "id" plus schema.fields where is_column and list, capped the same way
    format.ts's listColumns() caps them, recomputed here rather than trusted
    off the wire (a client-supplied column list would let a caller search
    columns the UI never actually displays).

    Every (term × column) pair becomes one ILIKE, all OR'd together in ONE
    flat clause — multiple search pills are still just more terms in the same
    OR, per spec ("All search is OR condition only"), not one AND'd group per
    term. Every column is cast ::text so this works uniformly across UUID/
    INT/BOOL/DATE/JSONB columns, not just TEXT ones — a deliberate "friendly
    wrapper, not an indexed full-text search" trade-off, consistent with the
    rest of this bounded Query Engine.

    Returns ("", []) when there's nothing to search — the caller ANDs this in
    only when non-empty, same contract cursor_page's own extra_where has."""
    if not search:
        return "", []
    columns = [f.name for f in schema.fields if f.is_column() and f.list][:_LIST_VIEW_MAX]
    columns = ["id", *columns]
    if not columns:
        return "", []
    clauses: list[str] = []
    params: list = []
    for term in search:
        term = term.strip()
        if not term:
            continue
        for col in columns:
            params.append(f"%{_escape_like(term)}%")
            clauses.append(f'"{col}"::text ILIKE ${len(params)} ESCAPE \'\\\'')
    if not clauses:
        return "", []
    return "(" + " OR ".join(clauses) + ")", params


async def _resolve_filtered_ids(table: str, schema, filters: dict | None, search: list[str] | None) -> list[UUID]:
    """Every id matching `filters` + `search` — unbounded, no LIMIT. The one
    place in this module allowed to do that: it backs "act on every row
    matching the current filter," which is the entire point of the two
    by-filter bulk endpoints below. Builds its WHERE the same way cursor_page
    does (parse_filters/render_where + the same _search_where extra clause
    list_rows uses) so the id set resolved here can never drift from what
    list_rows's own `total` showed the caller."""
    ref_columns = arc.psqldb.ref_columns()
    parsed, any_of = relay_query.parse_filters(schema, filters)
    where_sql, params = relay_query.render_where(table, parsed, any_of, ref_columns, start=1)
    clauses = [where_sql] if where_sql else []
    search_sql, search_params = _search_where(schema, search)
    if search_sql:
        # _search_where numbers its own placeholders from $1 — renumber to
        # land after `params`, reusing the exact same shift cursor_page's own
        # extra_where does for its own callers (users_api's `q`, this
        # module's own `search` in list_rows below).
        clauses.append(_renumber(search_sql, len(params)))
        params = [*params, *search_params]
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = await arc.relay.sql(f'SELECT id FROM "{table}" {where}', *params)
    return [r["id"] for r in rows]


def _single_order_by(order_by: list[str] | None) -> tuple[str, bool]:
    """Cursor pagination's keyset clause only works against ONE sort
    column (plus id as the tiebreak) — Data Browser's own sort control only
    ever picks one at a time anyway, so this is never a real restriction,
    just narrower than relay.query's own (unrelated, OFFSET-based)
    multi-column order_by."""
    if not order_by:
        return ("id", False)
    if len(order_by) > 1:
        arc.relay.throw(
            "cursor pagination supports exactly one sort column at a time",
            code="bad_order_by",
        )
    raw = order_by[0]
    desc = raw.startswith("-")
    return (raw[1:] if desc else raw, desc)


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
            status=409,
            code="protected_table",
        )
    if table.startswith("_audit_"):
        # Integrity bookkeeping (docs/arc.MD §3.9's audit trigger writes
        # these), not application data — hand-editing a historical audit
        # row defeats the point of it existing. Browsable, never editable,
        # same posture as the protected tables above.
        arc.relay.throw(
            f"'{table}' is an audit trail, written only by its table's trigger — read-only here",
            status=409,
            code="protected_table",
        )


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_rows(
    table: str,
    filters: dict | None = None,
    search: list[str] | None = None,
    order_by: list[str] | None = None,
    after: str | None = None,
    limit: int = 50,
) -> dict:
    """Cursor/keyset-paginated — {rows, next_cursor, total}, not a bare
    list (admin._pagination.cursor_page). `after` is the opaque cursor
    returned as `next_cursor` by the previous call, or omitted for the
    first page. A caller that only ever wants a first, bounded page and
    doesn't care about `next_cursor` (ReferencePicker) can just ignore it.

    `search` is free text, OR'd across every list-view column (see
    _search_where) — a separate concern from `filters` (structured,
    AND'd, one condition per column), combined here as one more clause
    ANDed alongside the caller's own filters."""
    schema = _schema_or_throw(table)
    try:
        # Filter operands arrive as JSON (always strings from a form input)
        # but reach asyncpg as real query parameters — a typed column needs
        # a real Python value, same as the write path. See admin._coerce.
        filters = coerce_filters(schema, filters)
    except CoercionError as exc:
        throw_coercion(exc)
    sort_col, desc = _single_order_by(order_by)
    search_where, search_params = _search_where(schema, search)
    try:
        # A generic Data Browser needs every column by design — that's
        # what "browse any table" means — so this is the one place in
        # admin that deliberately asks arc.relay for the full row rather
        # than a short, curated list. redact_row() below still hides hash
        # material by VALUE regardless of which columns came back.
        rows, next_cursor, total = await cursor_page(
            table,
            schema,
            fields=arc.relay.all_columns(table),
            filters=filters,
            order_by=(sort_col, desc),
            after=after,
            limit=limit,
            extra_where=search_where,
            extra_params=search_params,
        )
    except _READ_ERRORS as exc:
        _friendly(exc)
    # Reads on protected tables are open by design, but hash material never
    # leaves the server — same posture (and same field set) audit_api
    # already enforces; the browse path used to leak these raw.
    return {"rows": [redact_row(r) for r in rows], "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def get_row(table: str, id: str) -> dict:
    try:
        row = await arc.relay.get(table, id, arc.relay.all_columns(table))
    except _READ_ERRORS as exc:
        _friendly(exc)
    if row is None:
        arc.relay.throw("no such row", status=404, code="not_found")
    return redact_row(row)


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
async def save_rows_bulk(table: str, ids: list[str], patch: dict, identity=None) -> dict:
    """Applies the SAME field/value patch to every row in `ids` — the bulk-
    edit counterpart to save_row, built on the exact same coerce_row +
    arc.relay.save_many primitives (no new write-path logic). `ids` is
    always the caller's own already-selected/filtered set — this never
    takes its own `filters` and re-resolves rows server-side, so a bulk
    edit can only ever touch rows the UI actually showed and the user
    actually selected."""
    _require_not_protected(table)
    schema = _schema_or_throw(table)
    if not ids:
        arc.relay.throw("ids must be a non-empty list", code="empty_selection")
    try:
        patch = coerce_row(schema, patch)
    except CoercionError as exc:
        throw_coercion(exc)
    try:
        # save_many()'s update path matches its own RETURNING rows back to
        # the caller's input by a plain Python dict lookup on "id" (relay/
        # __init__.py's results_by_id), not a SQL-level comparison — that
        # only lines up against a real UUID object, the same type every
        # other admin module already passes (e.g. role["id"] read back off
        # a prior arc.relay.get/list call). `ids` arrives here as JSON
        # strings from the browser, so they're parsed back into UUID here
        # first; a plain string would silently come back as `None` in
        # `rows` below instead of raising.
        uuids = [UUID(i) for i in ids]
    except ValueError:
        arc.relay.throw(f"'{table}': ids must be valid UUIDs", status=400, code="bad_id")
    try:
        rows = await arc.relay.save_many(
            table, [{**patch, "id": i} for i in uuids], by=by_of(identity)
        )
    except _READ_ERRORS as exc:
        _friendly(exc)
    return {"ok": True, "count": len(rows), "rows": [redact_row(r) for r in rows]}


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


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def save_rows_bulk_by_filter(
    table: str, filters: dict | None, search: list[str] | None, patch: dict, identity=None
) -> dict:
    """The "edit ALL N records matching the current filter" counterpart to
    save_rows_bulk — deliberately a SEPARATE endpoint rather than an
    optional `filters` param bolted onto save_rows_bulk, so that one keeps
    its own documented ids-only safety boundary unchanged for every
    existing caller. Resolves ids server-side via the exact same
    filters+search WHERE list_rows itself builds (_resolve_filtered_ids),
    so the count the Data Browser showed the user and the rows actually
    touched here can never drift apart. No row-count cap — the UI's own
    confirm step (a scope checkbox showing the real total) is the
    intended safeguard, not a hard limit here."""
    _require_not_protected(table)
    schema = _schema_or_throw(table)
    try:
        filters = coerce_filters(schema, filters)
        patch = coerce_row(schema, patch)
    except CoercionError as exc:
        throw_coercion(exc)
    try:
        ids = await _resolve_filtered_ids(table, schema, filters, search)
    except _READ_ERRORS as exc:
        _friendly(exc)
    if not ids:
        return {"ok": True, "count": 0, "rows": []}
    try:
        rows = await arc.relay.save_many(table, [{**patch, "id": i} for i in ids], by=by_of(identity))
    except _READ_ERRORS as exc:
        _friendly(exc)
    return {"ok": True, "count": len(rows), "rows": [redact_row(r) for r in rows]}


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def delete_rows_by_filter(table: str, filters: dict | None, search: list[str] | None, identity=None) -> dict:
    """The "delete ALL N records matching the current filter" counterpart
    to delete_rows — see save_rows_bulk_by_filter's docstring immediately
    above for why this is a separate endpoint and how the id set is
    resolved consistently with what the UI displayed."""
    _require_not_protected(table)
    schema = _schema_or_throw(table)
    try:
        filters = coerce_filters(schema, filters)
    except CoercionError as exc:
        throw_coercion(exc)
    try:
        ids = await _resolve_filtered_ids(table, schema, filters, search)
    except _READ_ERRORS as exc:
        _friendly(exc)
    if not ids:
        return {"ok": True, "count": 0}
    try:
        await arc.relay.delete_many(table, ids, by=by_of(identity))
    except _READ_ERRORS as exc:
        _friendly(exc)
    return {"ok": True, "count": len(ids)}
