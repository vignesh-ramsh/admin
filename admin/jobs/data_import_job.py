"""admin.jobs.data_import_job — the background job `start_import`/
`resume_import` (admin/api/data_import_api.py) enqueue. Deliberately NOT
in api/ — same reasoning as data_export_job.py's own module docstring.

Resume is retry-only, by design (confirmed with the user, not an
oversight): re-processing only ever reads back already-stored
_data_import_row.raw_data, never the original file again. That's what
makes a resumed run cheap and correct without needing the upload to still
exist, but it also means a row that failed because of a genuinely bad
cell in the source file will fail again on resume — fixing that requires
a fresh import with a corrected file, not a resume of this one.
"""

from __future__ import annotations

import logging
import time
from typing import Any, AsyncIterator

import arc

from admin._coerce import CoercionError, coerce_value
from admin._pagination import cursor_page
from admin.jobs._file_reading import read_all_rows

logger = logging.getLogger("admin.jobs.data_import")

_BOOKKEEPING_BATCH = 100
_ABORT_CHUNK = 2000
_SKIP_OPTIMISTIC_BATCH = 20
_REFERENCE_CHUNK = 1000
_PROGRESS_EVERY_ROWS = 200
_PROGRESS_EVERY_SECONDS = 2.0
#: Batch size for the chunked _data_import_row scan (_iter_work_row_batches)
#: that replaced a single `limit=None` fetch of the whole job's work queue.
#: Same order of magnitude as _ABORT_CHUNK — this governs how many
#: {id, row_number, raw_data} rows are held in memory AT ONCE, not how
#: many get written in one statement (abort mode still writes in its own
#: _ABORT_CHUNK-sized groups within one page when a page is larger).
_WORK_ROW_SCAN_BATCH = 2000


async def _resolve_references(
    schema: Any, column_mapping: dict[str, str], row_dicts: AsyncIterator[dict[str, Any]]
) -> dict[str, set[str]]:
    """{field_name: set of raw string values that already exist on the
    reference's real target column} — one arc.relay.list() call per
    REFERENCE column for the WHOLE work queue, never per-chunk, never
    per-row (mirrors relay.crud.save_many's own match_on distinct-value
    batching, for the same reason: this is what keeps it fast).

    `row_dicts` is a single-use async iterator (a chunked scan over
    _data_import_row, not a materialized list — see
    _iter_work_row_batches) — collects EVERY reference field's distinct
    values in ONE pass over it, not one pass per field the way a
    materialized list could afford to do, since a second pass over an
    already-exhausted async generator would just see nothing.

    What "the reference's real target column" is depends on
    Field.target_field (see psqldb.migrate.resolve_ref_columns): unset ->
    this column is a raw UUID FK to target.id, so the file must supply
    that id directly, existence is checked against target.id, and the id
    string is written straight through. Set -> the column's REAL physical
    type is THAT field's own type (e.g. a plain STRING FK against a
    UNIQUE non-PK column, not UUID at all) — the file's raw value IS the
    natural key, existence is checked against that column instead, and
    it's written straight through unchanged too. Either way there is no
    "resolve this string to a different id" step — psqldb's own design
    already puts the resolvable value directly in the column; a UUID
    object is not what a target_field-typed column wants (confirmed the
    hard way: asyncpg rejects one with "expected str, got UUID")."""
    columns_by_name = schema.columns_by_name
    file_col_by_field = {v: k for k, v in column_mapping.items()}
    reference_fields = [f for f in set(column_mapping.values()) if columns_by_name[f].type == "REFERENCE"]
    if not reference_fields:
        return {}

    file_col_for = {f: file_col_by_field[f] for f in reference_fields}
    distinct_by_field: dict[str, set[str]] = {f: set() for f in reference_fields}
    async for raw in row_dicts:
        for field_name in reference_fields:
            value = raw.get(file_col_for[field_name])
            if value not in (None, ""):
                distinct_by_field[field_name].add(str(value))

    schemas_by_stem = {s.source_path.stem: s for s in arc.psqldb.schemas()}
    valid_by_field: dict[str, set[str]] = {}
    for field_name in reference_fields:
        field = columns_by_name[field_name]
        target_schema = schemas_by_stem.get(field.target)
        lookup_column = field.target_field or "id"
        distinct = distinct_by_field[field_name]
        valid: set[str] = set()
        if target_schema is not None and distinct:
            values = list(distinct)
            for i in range(0, len(values), _REFERENCE_CHUNK):
                chunk = values[i : i + _REFERENCE_CHUNK]
                matches = await arc.relay.list(
                    target_schema.table, fields=[lookup_column], filters={lookup_column: {"in": chunk}}, limit=None
                )
                valid.update(str(m[lookup_column]) for m in matches)
        valid_by_field[field_name] = valid
    return valid_by_field


async def _iter_work_row_batches(job_id: str, batch_size: int) -> AsyncIterator[list[dict]]:
    """Yields the job's pending/failed _data_import_row rows in
    row_number order, one bounded batch at a time — the chunked
    replacement for a single `arc.relay.list(..., limit=None)` fetch of
    the WHOLE job's work queue. Built on admin._pagination.cursor_page,
    the same keyset-pagination primitive every other admin list endpoint
    already uses, rather than hand-rolling a second one.

    Safe to call while a CONCURRENT pass is updating already-yielded
    rows' own `status` (skip mode's single streaming pass, and abort
    mode's write pass both do exactly this): cursor_page's keyset
    condition excludes earlier rows by `row_number` POSITION, not by
    re-evaluating `status` on each page — a row this function already
    yielded is never reconsidered by a later page regardless of what its
    status becomes in the meantime."""
    schema = arc.psqldb.schema("_data_import_row")
    cursor: str | None = None
    while True:
        rows, cursor, _total = await cursor_page(
            "_data_import_row",
            schema,
            fields=["id", "row_number", "raw_data"],
            filters={"job": job_id, "status": {"in": ["pending", "failed"]}},
            order_by=("row_number", False),
            after=cursor,
            limit=batch_size,
            with_total=False,
        )
        if not rows:
            return
        yield rows
        if cursor is None:
            return


async def _iter_raw_data(job_id: str, batch_size: int) -> AsyncIterator[dict[str, Any]]:
    """Flattens _iter_work_row_batches into individual raw_data dicts —
    _resolve_references' own input shape."""
    async for batch in _iter_work_row_batches(job_id, batch_size):
        for w in batch:
            yield w["raw_data"]


def _build_row(
    raw_data: dict[str, Any],
    column_mapping: dict[str, str],
    columns_by_name: dict[str, Any],
    valid_by_field: dict[str, set[str]],
) -> tuple[dict | None, str | None]:
    """One mapped-and-coerced row ready for arc.relay.save/save_many, or
    (None, error) if a cell couldn't be turned into something writable."""
    out: dict[str, Any] = {}
    for file_col, field_name in column_mapping.items():
        raw_value = raw_data.get(file_col)
        field = columns_by_name[field_name]
        if field.type == "REFERENCE":
            if raw_value in (None, ""):
                out[field_name] = None
                continue
            if str(raw_value) not in valid_by_field.get(field_name, set()):
                return None, f"'{field_name}': no matching row for {raw_value!r}"
            out[field_name] = str(raw_value)
            continue
        try:
            out[field_name] = coerce_value(field, raw_value)
        except CoercionError as exc:
            return None, str(exc)
    return out, None


async def _ensure_row_bookkeeping(job: dict) -> None:
    """First run only: streams the file once, inserts one _data_import_row
    per data row. A resumed run finds these already present and skips
    this step entirely — the exact thing that makes Resume not need the
    file again."""
    existing = await arc.relay.list("_data_import_row", fields=["id"], filters={"job": job["id"]}, limit=1)
    if existing:
        return

    file_row = await arc.relay.get("filerfile", job["file"], ["storage", "storage_key", "original_filename"])
    columns, data_rows = await read_all_rows(file_row)

    batch: list[dict] = []
    row_number = 0
    async for raw_row in data_rows:
        row_number += 1
        raw_data = dict(zip(columns, raw_row))
        batch.append({"job": job["id"], "row_number": row_number, "raw_data": raw_data, "status": "pending"})
        if len(batch) >= _BOOKKEEPING_BATCH:
            await arc.relay.save_many("_data_import_row", batch)
            batch = []
    if batch:
        await arc.relay.save_many("_data_import_row", batch)

    await arc.relay.save("_data_import_job", {"id": job["id"], "rows_total": row_number})


async def _run_import_job(job_id: str) -> None:
    job = await arc.relay.get("_data_import_job", job_id, arc.relay.all_columns("_data_import_job"))
    if job is None:
        logger.error(f"import job {job_id} vanished before it could run")
        return

    await arc.relay.save("_data_import_job", {"id": job_id, "status": "Running", "started_at": arc.tz.utcnow()})

    try:
        await _ensure_row_bookkeeping(job)
        job = await arc.relay.get("_data_import_job", job_id, arc.relay.all_columns("_data_import_job"))
        schema = arc.psqldb.schema(job["table"])
        columns_by_name = schema.columns_by_name
        column_mapping: dict[str, str] = job["column_mapping"]
        match_on = job["match_on"] or None

        valid_by_field = await _resolve_references(
            schema, column_mapping, _iter_raw_data(job_id, _WORK_ROW_SCAN_BATCH)
        )

        # A resumed run's work queue only holds pending/failed rows — a
        # row that already succeeded on an earlier run isn't reprocessed,
        # so it isn't recounted by the loop below either. Seed from the
        # row table itself (the source of truth) rather than the job's
        # own stale rows_succeeded, so the final write doesn't regress a
        # prior run's already-committed successes back down to just this
        # run's own delta.
        succeeded = await arc.relay.count("_data_import_row", filters={"job": job_id, "status": "success"})
        failed = 0
        last_progress_at = time.monotonic()

        async def flush_progress(force: bool = False) -> None:
            nonlocal last_progress_at
            now = time.monotonic()
            if force or (succeeded + failed) % _PROGRESS_EVERY_ROWS == 0 or now - last_progress_at >= _PROGRESS_EVERY_SECONDS:
                await arc.relay.save(
                    "_data_import_job",
                    {"id": job_id, "rows_processed": succeeded + failed, "rows_succeeded": succeeded, "rows_failed": failed},
                )
                last_progress_at = now

        if job["on_error"] == "abort":
            # Pre-flight: every unresolved REFERENCE must be known BEFORE
            # touching save_many at all — a downstream FK-constraint DB
            # error would be a much worse message, and the whole point of
            # "abort" is nothing gets written if anything's wrong. Streamed
            # via _iter_work_row_batches rather than a materialized
            # `work_rows` list — `preflight_errors` itself still IS a
            # plain list, but its size is bounded by how many rows are
            # actually WRONG, not by the total row count, so holding it
            # is a reasonable, much smaller footprint than the row queue
            # it was found within.
            preflight_errors: list[tuple[dict, str]] = []
            async for batch in _iter_work_row_batches(job_id, _WORK_ROW_SCAN_BATCH):
                for w in batch:
                    _payload, err = _build_row(w["raw_data"], column_mapping, columns_by_name, valid_by_field)
                    if err is not None:
                        preflight_errors.append((w, err))

            if preflight_errors:
                for w, err in preflight_errors:
                    await arc.relay.save("_data_import_row", {"id": w["id"], "status": "failed", "error": err})
                failed = len(preflight_errors)
                await flush_progress(force=True)
                await arc.relay.save(
                    "_data_import_job",
                    {
                        "id": job_id,
                        "status": "Failed",
                        "error": f"{len(preflight_errors)} row(s) failed to resolve — nothing was written",
                        "finished_at": arc.tz.utcnow(),
                    },
                )
                return

            # Second pass, same rows, same order (row_number, unchanged
            # since the preflight pass above never wrote anything) — the
            # preflight pass already proved every row builds cleanly, so
            # rebuilding here (cheap, pure in-memory work, no I/O) instead
            # of holding onto `built` from pass one is what keeps this
            # bounded to _ABORT_CHUNK rows in memory at a time rather than
            # the whole job's queue.
            async for chunk in _iter_work_row_batches(job_id, _ABORT_CHUNK):
                payloads = [
                    _build_row(w["raw_data"], column_mapping, columns_by_name, valid_by_field)[0]
                    for w in chunk
                ]
                try:
                    await arc.relay.save_many(job["table"], payloads, match_on=match_on)
                except Exception as exc:  # noqa: BLE001 - recorded on every row in this chunk, then re-raised path below
                    for w in chunk:
                        await arc.relay.save(
                            "_data_import_row", {"id": w["id"], "status": "failed", "error": str(exc)}
                        )
                    failed += len(chunk)
                    await flush_progress(force=True)
                    await arc.relay.save(
                        "_data_import_job",
                        {
                            "id": job_id,
                            "status": "Failed",
                            "error": f"batch commit failed: {exc}",
                            "finished_at": arc.tz.utcnow(),
                        },
                    )
                    return
                # save_many()'s return is [*inserts, *updates] in that
                # relative order — NOT input order — and a match_on that
                # fans out turns one input row into several updates, so
                # there's no safe way to zip its result back to `chunk`
                # positionally. Record success without resolved_row_id
                # rather than risk attaching the wrong id to a row.
                await arc.relay.save_many(
                    "_data_import_row", [{"id": w["id"], "status": "success", "error": None} for w in chunk]
                )
                succeeded += len(chunk)
                await flush_progress()

        else:  # "skip"
            async for batch in _iter_work_row_batches(job_id, _SKIP_OPTIMISTIC_BATCH):
                built = []
                batch_errors: list[tuple[dict, str]] = []
                for w in batch:
                    payload, err = _build_row(w["raw_data"], column_mapping, columns_by_name, valid_by_field)
                    if err is not None:
                        batch_errors.append((w, err))
                    else:
                        built.append((payload, w))

                for w, err in batch_errors:
                    await arc.relay.save("_data_import_row", {"id": w["id"], "status": "failed", "error": err})
                failed += len(batch_errors)

                if built:
                    try:
                        await arc.relay.save_many(job["table"], [p for p, _w in built], match_on=match_on)
                    except Exception:
                        # Optimistic batch had a bad row somewhere in it —
                        # fall back to one-at-a-time for just this batch,
                        # so the OTHER rows in it (which were actually
                        # fine) don't get punished for the one that wasn't.
                        # arc.relay.save() (unlike save_many()) returns
                        # exactly one row for exactly one call, so
                        # resolved_row_id is safe to record here.
                        for payload, w in built:
                            try:
                                result_row = await arc.relay.save(job["table"], payload)
                                await arc.relay.save(
                                    "_data_import_row",
                                    {"id": w["id"], "status": "success", "resolved_row_id": result_row["id"], "error": None},
                                )
                                succeeded += 1
                            except Exception as row_exc:  # noqa: BLE001 - this row's own failure, recorded and skipped
                                await arc.relay.save(
                                    "_data_import_row", {"id": w["id"], "status": "failed", "error": str(row_exc)}
                                )
                                failed += 1
                    else:
                        # Same non-positional-return caveat as abort-mode
                        # above — mark success without resolved_row_id.
                        await arc.relay.save_many(
                            "_data_import_row", [{"id": w["id"], "status": "success", "error": None} for _p, w in built]
                        )
                        succeeded += len(built)
                await flush_progress()

        await flush_progress(force=True)
        final_status = "Completed" if failed == 0 else "CompletedWithErrors"
        await arc.relay.save("_data_import_job", {"id": job_id, "status": final_status, "finished_at": arc.tz.utcnow()})
    except Exception as exc:  # noqa: BLE001 - a background job must record its own failure, never crash silently
        logger.error(f"import job {job_id} failed: {exc}")
        await arc.relay.save(
            "_data_import_job", {"id": job_id, "status": "Failed", "error": str(exc), "finished_at": arc.tz.utcnow()}
        )
