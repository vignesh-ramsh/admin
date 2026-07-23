import type { FieldMeta, TableSchema } from "../../api/types";

/* Columns psqldb always supplies itself and strips from any write payload
   (psqldb/__init__.py _SYSTEM_COLUMN_NAMES) — never editable. `parent`/
   `idx` are deliberately NOT in this set: a child row must set them. */
export const SYSTEM_STRIPPED = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "_state",
]);

/* Tables whose writes admin routes through dedicated endpoints instead
   (mirrors data_api._PROTECTED_WRITE_TABLES) — browsable, not editable. */
export const PROTECTED_TABLES = new Set(["_users", "_roles", "_sessions", "_access_keys"]);

/** Fields a user may actually set on a write. */
export function editableFields(schema: TableSchema): FieldMeta[] {
  const extras = schema.child
    ? schema.system_fields.filter((f) => f.name === "parent" || f.name === "idx")
    : [];
  const own = schema.fields.filter(
    (f) => f.is_column && !f.primary_key && !SYSTEM_STRIPPED.has(f.name)
  );
  return [...extras, ...own];
}

/** Columns worth showing in the list view — TABLE fields aren't columns at
 *  all, and a field can opt itself OUT of the table view entirely via its
 *  own schema-declared `list: false` (docs/admin-ui-ux-review.md #4;
 *  psqldb.fields.Field.list, default true — a verbose JSON/MULTIFILE blob
 *  is exactly the kind of field a schema author would turn this off for,
 *  while still leaving it fully editable in the row editor). */
export function listColumns(schema: TableSchema, max = 6): FieldMeta[] {
  return schema.fields.filter((f) => f.is_column && f.list).slice(0, max);
}

/** Human-readable cell text for the list view. `fieldType`, when given,
 *  is used ONLY to special-case MULTIFILE — checked by type, not by
 *  shape (Array.isArray alone would also mislabel a plain JSON column
 *  that happens to hold an array as "N files"). */
export function formatCell(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (fieldType === "MULTIFILE" && Array.isArray(value)) {
    return `${value.length} file${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  // ISO timestamp -> compact local-ish display
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
