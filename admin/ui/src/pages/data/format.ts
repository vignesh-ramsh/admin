import { call } from "../../api/client";
import type { FieldMeta, FilerFileRow, RowPage, TableSchema } from "../../api/types";

/* Columns psqldb always supplies itself and strips from any write payload
   (psqldb/__init__.py _SYSTEM_COLUMN_NAMES) — never editable. `parent`/
   `idx` are deliberately NOT in this set: a child row must set them. */
export const SYSTEM_STRIPPED = new Set(["id", "created_at", "updated_at", "created_by", "updated_by", "_state"]);

/* Tables whose writes admin routes through dedicated endpoints instead
   (mirrors data_api._PROTECTED_WRITE_TABLES) — browsable, not editable. */
export const PROTECTED_TABLES = new Set(["_users", "_roles", "_sessions", "_access_keys"]);

/** Fields a user may actually set on a write. */
export function editableFields(schema: TableSchema): FieldMeta[] {
  const extras = schema.child ? schema.system_fields.filter((f) => f.name === "parent" || f.name === "idx") : [];
  const own = schema.fields.filter((f) => f.is_column && !f.primary_key && !SYSTEM_STRIPPED.has(f.name));
  return [...extras, ...own];
}

/** Groups fields by their `group` hint, preserving first-appearance order
 *  within each group. Fields with no `group` (the default — most schemas,
 *  unchanged) all collapse into one bucket keyed `null`, so a schema that
 *  never opts in yields a single-entry result — callers should treat that
 *  as "render flat, no section wrapper at all", matching the framework-
 *  wide posture every other UI-only field hint takes (`list`): a schema
 *  that never sets it sees zero visual change.
 *
 *  The ungrouped bucket is always returned FIRST, regardless of where its
 *  fields fall in declaration order — a schema that groups most fields
 *  but leaves a few out (a real, supported case, not just the "nobody
 *  opted in" one above) would otherwise land its ungrouped fields
 *  wherever they happened to appear, easy to miss entirely if that's the
 *  last section, scrolled past without a second look. Nothing is ever
 *  dropped either way; this only changes where it sorts. */
export function groupFields(fields: FieldMeta[]): { group: string | null; fields: FieldMeta[] }[] {
  const order: (string | null)[] = [];
  const byGroup = new Map<string | null, FieldMeta[]>();
  for (const f of fields) {
    const g = f.group ?? null;
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
    byGroup.get(g)!.push(f);
  }
  order.sort((a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : 0));
  return order.map((g) => ({ group: g, fields: byGroup.get(g)! }));
}

/** Columns worth showing in the list view — TABLE fields aren't columns at
 *  all, and a field can opt itself OUT of the table view entirely via its
 *  own schema-declared `list: false`. */
export function listColumns(schema: TableSchema, max = 6): FieldMeta[] {
  return schema.fields.filter((f) => f.is_column && f.list).slice(0, max);
}

/** Human-readable cell text for the list view. `fieldType`, when given,
 *  is used ONLY to special-case MULTIFILE. */
export function formatCell(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (fieldType === "MULTIFILE" && Array.isArray(value)) {
    return `${value.length} file${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16).replace("T", " ");
  return s;
}

/** Row value -> the string an <input> of this field's type expects. */
export function toInputValue(field: FieldMeta, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const s = String(value);
  if (field.type === "DATE") return s.slice(0, 10);
  if (field.type === "DATETIME") return s.slice(0, 16); // YYYY-MM-DDTHH:mm
  if (field.type === "TIME") return s.slice(0, 8);
  return s;
}

/** Short id for display (UUIDs are too long for a table cell). */
export function shortId(value: unknown): string {
  const s = String(value ?? "");
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

/** A resolved FILE/MULTIFILE entry — filename + best-effort servable url. */
export interface FilerLookup {
  filename: string;
  url: string | null;
  status?: string;
}

/* FILE/MULTIFILE fields only ever store filer's own file_id — meaningless
   to a human on its own. Resolves it to a filename (and, best-effort, a
   servable url) via the generic Data Browser's own list_rows against the
   raw "filerfile" table (file_id is an exact, indexed lookup there), then
   a second best-effort call to list_filer_files (by filename) to pick up
   its ready-made signed/public `url` — the same enrichment the Files tab
   itself relies on, reused here rather than duplicated. Cached per file_id
   for the lifetime of the tab: file rows don't change shape once written. */
const filerCache = new Map<string, Promise<FilerLookup | null>>();

export function resolveFilerFile(fileId: string | null | undefined): Promise<FilerLookup | null> {
  if (!fileId) return Promise.resolve(null);
  let p = filerCache.get(fileId);
  if (!p) {
    p = call<RowPage>("list_rows", { table: "filerfile", filters: { file_id: { eq: fileId } }, limit: 1 }, { method: "QUERY" })
      .then(async (page) => {
        const row = page.rows[0];
        if (!row) return null;
        const filename = row.original_filename != null ? String(row.original_filename) : fileId;
        const status = row.status != null ? String(row.status) : undefined;
        let url: string | null = null;
        try {
          const filesPage = await call<RowPage>("list_filer_files", { q: filename, limit: 5 }, { method: "GET" });
          const files = filesPage.rows as unknown as FilerFileRow[];
          url = files.find((f) => f.file_id === fileId)?.url ?? null;
        } catch {
          /* best-effort — the raw filerfile row is still enough to show a name */
        }
        return { filename, url, status };
      })
      .catch(() => null);
    filerCache.set(fileId, p);
  }
  return p;
}
