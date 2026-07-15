"""
admin._coerce
--------------
JSON → Python type coercion for the generic data browser.

Why this exists: psqldb deliberately does no type coercion — insert()/
update() hand a caller's values straight to asyncpg, which requires real
Python objects for typed columns (datetime for TIMESTAMPTZ, date for DATE,
Decimal for NUMERIC, int for INTEGER, ...). Every existing caller is Python
code that already has those objects. The data browser is the first caller
whose values arrive as JSON over HTTP, where a datetime can only ever be a
string — so the conversion has to happen somewhere, and admin's own
endpoint (the thing accepting the untrusted JSON) is where it belongs.
Doing it here rather than in psqldb keeps admin self-contained and leaves
every other caller's contract untouched.

Deliberately narrow: only the types where a JSON value can't already be
the right Python object. STRING/TEXT/EMAIL/PHONE/SELECT are already
strings; REFERENCE is left alone (a str is accepted for both the default
UUID case and a text natural-key target_field — an INT-typed target_field
would need the cross-schema resolution psqldb.migrate.resolve_ref_columns
does, which isn't worth pulling in for that edge).
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import arc

_TEXT_OPS = frozenset({"like", "ilike", "contains", "startswith", "endswith"})
_LIST_OPS = frozenset({"in", "not_in", "range"})

_TRUEISH = frozenset({"1", "true", "yes", "on", "t", "y"})


class CoercionError(ValueError):
    pass


def _fail(field_name: str, value: Any, expected: str) -> None:
    raise CoercionError(f"'{field_name}': {value!r} is not a valid {expected}")


def coerce_value(field: Any, value: Any) -> Any:
    """Convert one JSON-carried value into what asyncpg needs for `field`'s
    column type. An empty string means "cleared" -> None (an HTML input has
    no other way to express it)."""
    if value is None or value == "":
        return None

    t = field.type
    try:
        if t == "INT":
            return value if isinstance(value, int) and not isinstance(value, bool) else int(str(value))
        if t == "FLOAT":
            return float(value)
        if t == "DECIMAL":
            return Decimal(str(value))
        if t == "BOOLEAN":
            return value if isinstance(value, bool) else str(value).strip().lower() in _TRUEISH
        if t == "DATE":
            if isinstance(value, datetime):
                return value.date()
            if isinstance(value, date):
                return value
            return date.fromisoformat(str(value)[:10])
        if t == "TIME":
            if isinstance(value, time):
                return value
            return time.fromisoformat(str(value))
        if t == "DATETIME":
            return _to_datetime(value)
        if t == "JSON":
            # A jsonb column's codec json.dumps() whatever it's given — so a
            # raw '{"a":1}' STRING would persist as a JSON string, not an
            # object. Parse it here so it lands as real structured data.
            return json.loads(value) if isinstance(value, str) else value
    except (ValueError, TypeError, InvalidOperation):
        _fail(field.name, value, t.lower())
    return value


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value))
    # TIMESTAMPTZ: a naive value is ambiguous — assume UTC rather than
    # silently taking the server's local zone.
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _columns_by_name(schema: Any) -> dict[str, Any]:
    fields = [*schema.fields, *schema.system_fields]
    return {f.name: f for f in fields if f.is_column()}


def coerce_row(schema: Any, data: dict) -> dict:
    """Coerce every value in a write payload. Unknown keys are passed
    through untouched — psqldb.validation.validate_columns_known is what
    rejects those, with a better message than this module could give."""
    by_name = _columns_by_name(schema)
    out: dict[str, Any] = {}
    for key, value in data.items():
        field = by_name.get(key)
        out[key] = coerce_value(field, value) if field is not None else value
    return out


def coerce_filters(schema: Any, filters: dict | None) -> dict | None:
    """Same conversion for the read path — a filter operand on a typed
    column reaches asyncpg as a query parameter exactly like a written
    value does, so `{"salary": {"gt": "1000"}}` fails identically without
    this."""
    if not filters:
        return filters
    by_name = _columns_by_name(schema)
    out: dict[str, Any] = {}
    for name, cond in filters.items():
        field = by_name.get(name)
        if field is None:
            out[name] = cond  # let the Query Engine raise its own unknown-column error
        elif not isinstance(cond, dict):
            out[name] = coerce_value(field, cond)
        else:
            new_cond: dict[str, Any] = {}
            for op, operand in cond.items():
                if op == "is_null":
                    new_cond[op] = operand
                elif op in _TEXT_OPS:
                    new_cond[op] = operand  # always a string pattern, never coerced
                elif op in _LIST_OPS:
                    new_cond[op] = [coerce_value(field, v) for v in (operand or [])]
                else:
                    new_cond[op] = coerce_value(field, operand)
            out[name] = new_cond
    return out


def throw_coercion(exc: CoercionError) -> None:
    arc.relay.throw(str(exc), status=400, code="bad_value")
