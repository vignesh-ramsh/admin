"""Trash — browse rows soft-deleted into `_trash` (pgdb/ddl.py's
arc_soft_delete_to_trash trigger) and restore them.

`_trash` is raw bootstrap DDL (docs/arc.MD §3.9), never a declared
TableSchema, so it's invisible to arc.pgdb.schema()/cursor_page() the
same way _audit_{plugin} tables are — see audit_api.py's own module
docstring for the identical situation. This hand-rolls cursor pagination
the same way, reusing only the schema-independent encode_cursor/
decode_cursor halves of admin._pagination.

Scoped to drop_type='Row' only — a 'Table'/'Column' trash entry (written
by pgdb.migrate on a destructive schema change, not by a row delete)
doesn't represent a single restorable document the way this page's
"preview the doc, click Restore" flow assumes; that's `arc pgdb trash
recover` CLI territory, not this page's.

Restore re-inserts the row into its original table AND hard-deletes the
trash entry in one step (rather than the CLI/test's own softer approach
of just stamping restored_at) — this page's own stated behavior: once
restored, it's just gone from Trash, not merely marked recovered."""

from __future__ import annotations

import arc
from pgdb.model import SchemaError

from admin._pagination import PaginationError, decode_cursor, encode_cursor

_DROP_TYPE = "Row"


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_trash_tables() -> list[str]:
    """Distinct tables actually represented in trash right now — populates
    the list page's own "table" filter dropdown without guessing at names."""
    rows = await arc.relay.sql(
        'SELECT DISTINCT "table" FROM _trash WHERE drop_type = $1 AND restored_at IS NULL ORDER BY "table"',
        _DROP_TYPE,
    )
    return [r["table"] for r in rows]


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def list_trash_rows(table: str | None = None, after: str | None = None, limit: int = 50) -> dict:
    """Cursor-paginated — {rows, next_cursor, total}, same shape every
    other list endpoint in admin returns. id DESC alone (UUIDv7 is already
    chronological — see audit_api.list_audit_entries's own docstring for
    the full reasoning), newest-deleted first."""
    limit = int(limit)

    where = ["drop_type = $1", "restored_at IS NULL"]
    params: list = [_DROP_TYPE]
    if table:
        params.append(table)
        where.append(f'"table" = ${len(params)}')

    count_where = f"WHERE {' AND '.join(where)}"
    total = await arc.relay.sql_val(f"SELECT count(*) FROM _trash {count_where}", *params)

    if after is not None:
        try:
            cursor_id, _ = decode_cursor(after)
        except PaginationError as exc:
            arc.relay.throw(str(exc), status=400, code="bad_cursor")
        params.append(cursor_id)
        where.append(f"id < ${len(params)}")

    where_clause = f"WHERE {' AND '.join(where)}"
    params.append(limit + 1)
    query = (
        f'SELECT id, "table", deleted_by, deleted_at FROM _trash {where_clause} '
        f"ORDER BY id DESC LIMIT ${len(params)}"
    )
    fetched = await arc.relay.sql(query, *params)

    has_more = len(fetched) > limit
    page_rows = fetched[:limit]
    next_cursor = encode_cursor(page_rows[-1]["id"], page_rows[-1]["id"]) if has_more and page_rows else None
    shaped = [
        {
            "id": str(r["id"]),
            "table": r["table"],
            "deleted_by": r["deleted_by"],
            "deleted_at": r["deleted_at"].isoformat(),
        }
        for r in page_rows
    ]
    return {"rows": shaped, "next_cursor": next_cursor, "total": total}


@arc.relay.whitelist(methods=["GET", "QUERY", "POST"], roles=["Superuser"])
async def get_trash_row(trash_id: str) -> dict:
    row = await arc.relay.sql_one(
        'SELECT id, "table", drop_type, snapshot, deleted_by, deleted_at FROM _trash WHERE id = $1',
        trash_id,
    )
    if row is None:
        arc.relay.throw("no such trash entry", status=404, code="not_found")
    return {
        "id": str(row["id"]),
        "table": row["table"],
        "drop_type": row["drop_type"],
        "snapshot": row["snapshot"],
        "deleted_by": row["deleted_by"],
        "deleted_at": row["deleted_at"].isoformat(),
    }


@arc.relay.whitelist(methods=["POST"], roles=["Superuser"])
async def restore_trash_row(trash_id: str) -> dict:
    trash_row = await arc.relay.sql_one(
        'SELECT id, "table", drop_type, snapshot FROM _trash WHERE id = $1', trash_id
    )
    if trash_row is None:
        arc.relay.throw("no such trash entry", status=404, code="not_found")
    if trash_row["drop_type"] != _DROP_TYPE:
        arc.relay.throw(
            f"this trash entry is a '{trash_row['drop_type']}' snapshot, not a single row — cannot restore here",
            status=409,
            code="not_a_row",
        )

    table = trash_row["table"]
    try:
        arc.pgdb.schema(table)
    except SchemaError:
        arc.relay.throw(f"'{table}' no longer exists — cannot restore into it", status=409, code="table_gone")

    async with arc.pgdb.acquire() as conn:
        async with conn.transaction():
            inserted_id = await conn.fetchval(
                f'INSERT INTO "{table}" SELECT * FROM jsonb_populate_record(null::"{table}", $1::jsonb) '
                f"ON CONFLICT (id) DO NOTHING RETURNING id",
                trash_row["snapshot"],
            )
            if inserted_id is None:
                arc.relay.throw(
                    f"a row with this id already exists in '{table}' — delete the conflicting row first, "
                    f"or restore manually",
                    status=409,
                    code="restore_conflict",
                )
            await conn.execute("DELETE FROM _trash WHERE id = $1", trash_row["id"])

    return {"id": str(inserted_id), "table": table}
