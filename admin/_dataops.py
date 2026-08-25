"""
admin._dataops
----------------
Small helpers shared across every generic-table endpoint file (data_api.py,
data_import_api.py, data_export_api.py) — lifted out of data_api.py once a
second and third file needed the exact same "is this table safe to touch"
checks and error-translation, rather than each copying them.
"""

from __future__ import annotations

import arc
from pgdb.model import SchemaError
from pgdb.validation import ValidationError

from admin._pagination import PaginationError

PROTECTED_WRITE_TABLES = frozenset(
    {
        "_users",
        "_roles",
        "_sessions",
        "_access_keys",
        "_trash",
        "_field_registry",
        "_patch_history",
        # _job_log.payload is executable — a raw save_row() here is a second
        # way to reach the same arbitrary-dispatch surface
        # relay.background_jobs._dispatch_module_allowed now gates on the
        # run side; blocking the write here means a Superuser data-browser
        # slip can't even queue the attempt.
        "_job_log",
        # Both mint a real, usable credential the instant their token_hash
        # matches on a later request (a password-reset link, an
        # impersonation ticket) — a raw save_row() can set expires_at/
        # used_at/token_hash by hand and forge either one for any user.
        "_password_resets",
        "_impersonation_tickets",
    }
)
READ_ERRORS = (SchemaError, ValidationError, arc.relay.QueryError, PaginationError)


def friendly(exc: Exception):
    arc.relay.throw(str(exc), status=400, code="bad_request")


def schema_or_throw(table: str):
    try:
        return arc.pgdb.schema(table)
    except SchemaError as exc:
        arc.relay.throw(str(exc), status=404, code="unknown_table")


def require_not_protected(table: str) -> None:
    if table in PROTECTED_WRITE_TABLES:
        arc.relay.throw(
            f"'{table}' is managed through its own dedicated endpoints "
            f"(users/roles/sessions/access-keys) — not the generic data browser",
            status=409,
            code="protected_table",
        )
    if table.startswith("_audit_"):
        arc.relay.throw(
            f"'{table}' is an audit trail, written only by its table's trigger — read-only here",
            status=409,
            code="protected_table",
        )


async def load_filerfile_row(token: str) -> dict:
    """Resolve an upload TOKEN (what filerClient.ts's uploadFilerFile
    actually returns, e.g. "pri_xxx") to its full filerfile row — every
    caller needs the row's own `id` (the real UUID, for storing into a
    REFERENCE column) and its storage/storage_key to read the bytes back,
    neither of which the token alone gives you. 404s cleanly rather than
    letting a bad/foreign token surface as a confusing downstream error."""
    row = await arc.filer.get_file(token)
    if row is None:
        arc.relay.throw("no such uploaded file", status=404, code="not_found")
    return row
