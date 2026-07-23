import type { FieldMeta } from "../../api/types";

/* Client-side validation that mirrors what the server would reject anyway
   (psqldb.validation for EMAIL/PHONE/SELECT, the column's own type/length
   for the rest) — so a mistake is caught at the field, before a round trip,
   instead of coming back as a whole-form error.

   The server stays authoritative: this never replaces its checks, it just
   surfaces them earlier and per-field. */

// Same expressions psqldb.validation uses.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{6,20}$/;

export type Errors = Record<string, string>;

export function validateField(field: FieldMeta, raw: string | boolean): string | null {
  const isBool = typeof raw === "boolean";
  const value = isBool ? "" : String(raw ?? "").trim();

  if (field.required && !isBool && value === "") {
    return "Required.";
  }
  if (value === "" || isBool) return null; // empty clears the column (-> NULL)

  switch (field.type) {
    case "INT":
      if (!/^-?\d+$/.test(value)) return "Must be a whole number.";
      break;
    case "FLOAT":
    case "DECIMAL":
      if (!Number.isFinite(Number(value))) return "Must be a number.";
      if (field.type === "DECIMAL" && field.scale != null) {
        const dot = value.indexOf(".");
        if (dot >= 0 && value.length - dot - 1 > field.scale) {
          return `At most ${field.scale} decimal place${field.scale === 1 ? "" : "s"}.`;
        }
      }
      if (field.type === "DECIMAL" && field.precision != null) {
        const digits = value.replace(/[-.]/g, "").length;
        if (digits > field.precision) return `At most ${field.precision} digits.`;
      }
      break;
    case "EMAIL":
      if (!EMAIL_RE.test(value)) return "Not a valid email address.";
      break;
    case "PHONE":
      if (!PHONE_RE.test(value)) return "Not a valid phone number.";
      break;
    case "SELECT":
      if (field.options && !field.options.includes(value)) {
        return `Must be one of: ${field.options.join(", ")}.`;
      }
      break;
    case "DATE":
    case "DATETIME":
      if (Number.isNaN(new Date(value).getTime())) return "Not a valid date.";
      break;
    case "JSON":
      try {
        JSON.parse(value);
      } catch {
        return "Not valid JSON.";
      }
      break;
    case "MULTIFILE": {
      // Same JSONB column shape as JSON (psqldb/fields.py's own note),
      // but filer's own contract is specifically an ARRAY of
      // {label, fileid} objects — checked here too since a bare object
      // or a JSON string would parse fine but never work as a MULTIFILE
      // value (docs/filer-attachment-storage-proposal.md §4).
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return "Not valid JSON.";
      }
      if (!Array.isArray(parsed)) return 'Must be a JSON array, e.g. [{"label": "...", "fileid": "..."}].';
      break;
    }
    case "FILE":
      // Always VARCHAR(32) — fixed by psqldb's own column mapping for
      // this type, independent of whatever "length" (if any) the schema
      // itself declares, so this doesn't go through the field.length
      // branch below at all.
      if (value.length > 32) return "A file_id is at most 32 characters — this doesn't look like one filer issued.";
      break;
  }

  // length applies to the character types psqldb renders as VARCHAR(n).
  if (field.length != null && ["STRING", "EMAIL", "PHONE", "SELECT"].includes(field.type)) {
    if (value.length > field.length) {
      return `At most ${field.length} characters (currently ${value.length}).`;
    }
  }

  return null;
}

export function validateValues(
  fields: FieldMeta[],
  values: Record<string, string | boolean>
): Errors {
  const errors: Errors = {};
  for (const f of fields) {
    const err = validateField(f, values[f.name] ?? "");
    if (err) errors[f.name] = err;
  }
  return errors;
}
