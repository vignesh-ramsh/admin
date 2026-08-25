"""admin._pagination
--------------------
Shared cursor/keyset pagination for every list page in the admin console
(Data Browser, Execution Log, Files, Users, Roles, Sessions, Access Keys) —
one implementation instead of seven ad hoc ones.

Why cursor-based, and why here: an OFFSET-based page silently shifts under
an infinite-scroll UI the moment a row is inserted/deleted while scrolling
(the classic skipped-row/repeated-row bug) — a keyset cursor
(WHERE (sort_col, id) > (last_val, last_id)) never has that problem. relay's
own list()/list_page() only do OFFSET (relay/query.py's bounded filter DSL
has no tuple-comparison primitive), so this builds the one extra clause by
hand and reuses everything else: relay.query.parse_filters/render_where for
the caller's own `filters` dict (identical validation/operators the Query
Engine already gives every other caller — same cross-plugin exception
filer/filer/__init__.py's FieldResolver import already takes), arc.relay.sql()
for the actual parameterized query (the same raw-SQL escape hatch
audit_api.py/filer_admin_api.py already use), and admin._coerce.coerce_value
to turn the cursor's JSON-decoded sort value back into whatever real Python
type the column needs (a TIMESTAMPTZ column needs a real datetime, not a
string — same reason coerce_row/coerce_filters exist at all).

Known, documented trade-offs, not oversights:
  * Changing the sort column resets the cursor to page 1 — there's no
    cross-sort-column keyset. Matches how most real infinite-scroll UIs
    already behave (Gmail, Notion) and avoids a much larger multi-column-
    index cursor design for a case this app doesn't need.
  * The sort column is assumed NOT NULL. A plain `>`/`<` keyset comparison
    against a NULLable column can skip or repeat rows straddling a NULL
    (SQL's three-valued logic: `NULL > x` is neither true nor false), the
    same way naive OFFSET pagination already gets subtly wrong on a
    NULLable sort column in most systems. Every current caller defaults to
    a NOT NULL column (id, email, name, ...); a caller sorting by a
    genuinely nullable business column should know this isn't handled.
"""

from __future__ import annotations

import base64
import json
import re
from typing import Any

import arc
from relay import query as relay_query

from admin._coerce import coerce_value

_EXTRA_PARAM_RE = re.compile(r"\$(\d+)")

#: Defense in depth only — the admin UI itself never asks for more than a
#: few hundred rows per scroll-triggered page. Not user-configurable (no
#: settings key) since, unlike relay.list()'s own limit, nothing here is
#: reachable with limit=None-style "fetch everything" semantics anyway.
MAX_LIMIT = 500


class PaginationError(ValueError):
    pass


def _pk_name(schema: Any) -> str:
    """Same "declared primary_key field, else 'id'" lookup schema_api.py's
    own _validate_targets already uses — every normal/child table gets its
    'id' auto-injected, a "system": true table self-declares its own
    (always named 'id' in this codebase's own schemas, but never assumed)."""
    return next((f.name for f in schema.all_fields() if f.primary_key), "id")


def encode_cursor(sort_value: Any, row_id: Any) -> str:
    payload = json.dumps({"v": sort_value, "id": str(row_id)}, default=str)
    return base64.urlsafe_b64encode(payload.encode()).decode()


def decode_cursor(token: str) -> tuple[Any, str]:
    """Public (unlike encode_cursor's other half being an implementation
    detail nowhere else needs) — audit_api.py's own hand-rolled cursor
    reuses this directly: _audit_{plugin} tables are raw-SQL bootstrap
    structure with no TableSchema (see that module's own docstring), so
    they can never go through cursor_page() itself (which requires
    arc.pgdb.schema(table)), only its two small, schema-independent
    encode/decode primitives."""
    try:
        payload = json.loads(base64.urlsafe_b64decode(token.encode()).decode())
        return payload["v"], payload["id"]
    except Exception as exc:
        raise PaginationError(f"invalid pagination cursor: {token!r}") from exc


def _renumber(extra_where: str, offset: int) -> str:
    """extra_where is authored by its own caller with $1, $2, ... placeholders
    relative to its own extra_params, as if it were the only condition in the
    query — this shifts them to land right after the base filters' own
    params once the two are combined into one statement."""
    if offset == 0:
        return extra_where
    return _EXTRA_PARAM_RE.sub(lambda m: f"${int(m.group(1)) + offset}", extra_where)


async def cursor_page(
    table: str,
    schema: Any,
    *,
    fields: list[str],
    filters: dict[str, Any] | None = None,
    order_by: tuple[str, bool] = ("id", False),
    after: str | None = None,
    limit: int = 50,
    extra_where: str = "",
    extra_params: list[Any] = (),
    with_total: bool = True,
) -> tuple[list[dict], str | None, int | None]:
    """Returns (rows, next_cursor, total).

    `order_by` is (column, is_desc) — a single column, validated against the
    table's own schema. `after` is the opaque cursor string returned as
    `next_cursor` by the previous call, or None for the first page.
    `extra_where`/`extra_params` let a caller (Users/Roles/Sessions/Access
    Keys — Work Unit 4) bolt its own raw ILIKE-OR search condition onto the
    same query: write it with $1, $2, ... placeholders as if it were the
    only condition; this renumbers them automatically to fit alongside
    `filters`'s own params.

    `with_total=True` (default) matches every existing caller's own
    contract unchanged — the interactive list pages (Data Browser, Users,
    Jobs, ...) show a live total on every scroll-triggered page. Pass
    `with_total=False` to skip it: a keyset page is O(limit), but
    `count(*)` is O(matching rows) — the export job's own `while True`
    loop over `cursor_page` used to pay that full-table count on EVERY
    page and discard all but the first result (`if rows_total is None`),
    so a 1M-row export at 500/page meant 2000 sequential full-table
    counts. `total` comes back None when skipped — never a stale or
    guessed number."""
    sort_col, desc = order_by
    columns = schema.columns_by_name
    if sort_col not in columns:
        raise PaginationError(f"unknown sort column '{sort_col}' on table '{table}'")
    # `fields` is interpolated straight into the SELECT column list below
    # (quoted identifiers, never a parameter) — validated here for the
    # same reason relay.query.build_select validates its own `fields`:
    # every CURRENT caller happens to pass an already-validated list, but
    # nothing enforced that as a contract, and this is the one place that
    # can actually check it against the schema.
    unknown = [f for f in fields if f not in columns]
    if unknown:
        raise PaginationError(f"unknown field(s) {unknown} on table '{table}'")
    pk = _pk_name(schema)
    ref_columns = arc.pgdb.ref_columns()
    limit = max(1, min(int(limit), MAX_LIMIT))

    parsed, any_of = relay_query.parse_filters(schema, filters)
    where_sql, params = relay_query.render_where(table, parsed, any_of, ref_columns, start=1)

    clauses = [where_sql] if where_sql else []
    if extra_where:
        clauses.append(_renumber(extra_where, len(params)))
        params = [*params, *extra_params]

    total = None
    if with_total:
        count_where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        total = await arc.relay.sql_val(f'SELECT count(*) FROM "{table}" {count_where}', *params)

    page_clauses = list(clauses)
    page_params = list(params)
    if after is not None:
        cursor_value, cursor_id = decode_cursor(after)
        cursor_value = coerce_value(columns[sort_col], cursor_value)
        op = "<" if desc else ">"
        n = len(page_params)
        # Tuple comparison, ties on sort_col broken by pk — no row is ever
        # skipped or repeated across a page boundary even when many rows
        # share the same sort value.
        page_clauses.append(
            f'(("{sort_col}" {op} ${n + 1}) OR ("{sort_col}" = ${n + 1} AND "{pk}" {op} ${n + 2}))'
        )
        page_params.extend([cursor_value, cursor_id])

    page_where = f"WHERE {' AND '.join(page_clauses)}" if page_clauses else ""
    # sort_col/pk are always fetched (the cursor needs both off the last
    # row) even if the caller's own `fields` didn't ask for them — stripped
    # back out of each returned row below, so a caller only ever sees
    # exactly the columns it named, same "no accidental extra column"
    # contract relay.list()'s own `fields` already guarantees.
    query_fields = list(dict.fromkeys([*fields, sort_col, pk]))
    select_cols = ", ".join(f'"{c}"' for c in query_fields)
    direction = "DESC" if desc else "ASC"
    sql = (
        f'SELECT {select_cols} FROM "{table}" {page_where} '
        f'ORDER BY "{sort_col}" {direction}, "{pk}" {direction} '
        f"LIMIT {limit + 1}"
    )
    fetched = await arc.relay.sql(sql, *page_params)

    has_more = len(fetched) > limit
    page_rows = fetched[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1][sort_col], page_rows[-1][pk]) if has_more and page_rows else None
    )
    out_rows = [{k: r[k] for k in fields} for r in page_rows]
    return out_rows, next_cursor, total
