"""admin.jobs._file_reading — CSV/Excel parsing shared between
preview_import_columns (admin/api/data_import_api.py) and the actual
import job (admin/jobs/data_import_job.py), so the two can never sniff
the format or read cell values differently from one another.

Format is sniffed off the ORIGINAL filename's extension, not the
uploaded content-type — filer's own upload() only maps a handful of
content types to a real extension (csv isn't one of them, see its
_EXTENSION_FOR), and different browsers/OSes report different content
types for the same .csv file anyway. The filename extension is stable
and always available (filerfile.original_filename)."""

from __future__ import annotations

import csv
import io
from typing import Any

import arc

_PREVIEW_SAMPLE_ROWS = 10


def _is_xlsx(file_row: dict) -> bool:
    return file_row["original_filename"].lower().endswith(".xlsx")


async def _read_bytes(file_row: dict) -> bytes:
    from filer.providers import PROVIDERS

    return await PROVIDERS[file_row["storage"]].read(file_row["storage_key"])


async def iter_rows_preview(file_row: dict) -> tuple[list[str], list[list[str]], int | None]:
    """(columns, up to _PREVIEW_SAMPLE_ROWS sample rows as strings,
    row_count_hint). row_count_hint is a real count for CSV (cheap — it's
    already fully in memory to get the header) and None for xlsx (would
    need a second full pass to count with openpyxl's own API; not worth
    it just for a preview hint)."""
    content = await _read_bytes(file_row)
    if _is_xlsx(file_row):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header = [str(c) if c is not None else "" for c in next(rows_iter)]
        except StopIteration:
            return [], [], 0
        samples = []
        for i, row in enumerate(rows_iter):
            if i >= _PREVIEW_SAMPLE_ROWS:
                break
            samples.append(["" if v is None else str(v) for v in row])
        wb.close()
        return header, samples, None

    text = content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return [], [], 0
    samples = []
    total = 0
    for row in reader:
        total += 1
        if len(samples) < _PREVIEW_SAMPLE_ROWS:
            samples.append(row)
    return header, samples, total


async def read_all_rows(file_row: dict) -> tuple[list[str], list[list[Any]]]:
    """(columns, every data row's raw cell values) — the full file, used
    once by the import job's own first-run bookkeeping pass (see
    data_import_job.py). Loads the whole file's TEXT into memory (not the
    whole target TABLE) — a deliberate, pragmatic v1 choice: a CSV/XLSX
    sized for an admin bulk import is realistically thousands to tens of
    thousands of rows, single-digit MB of text, categorically different
    from the "never fetch the whole table" constraint the export job's
    own cursor-paginated read actually has to honor."""
    content = await _read_bytes(file_row)
    if _is_xlsx(file_row):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header = [str(c) if c is not None else "" for c in next(rows_iter)]
        except StopIteration:
            return [], []
        data_rows = [["" if v is None else v for v in row] for row in rows_iter]
        wb.close()
        return header, data_rows

    text = content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return [], []
    return header, list(reader)
