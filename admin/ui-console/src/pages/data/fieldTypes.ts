import type { SchemaField } from "../../api/types";

/* Canonical field types (docs/arc.MD §3.9). UUID + primary_key are only
   meaningful on a "system": true schema, so UUID is offered only then. */
export const BASE_TYPES = [
  "STRING",
  "TEXT",
  "INT",
  "FLOAT",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "TIME",
  "DATETIME",
  "JSON",
  "EMAIL",
  "PHONE",
  "SELECT",
  "REFERENCE",
  "TABLE",
  "FILE",
  "MULTIFILE",
] as const;

export const SYSTEM_ONLY_TYPES = ["UUID"] as const;

export function typesFor(system: boolean): string[] {
  return system ? [...SYSTEM_ONLY_TYPES, ...BASE_TYPES] : [...BASE_TYPES];
}

export function usesLength(type: string): boolean {
  return type === "STRING" || type === "EMAIL" || type === "PHONE" || type === "SELECT";
}
export function usesOptions(type: string): boolean {
  return type === "SELECT";
}
export function usesReference(type: string): boolean {
  return type === "REFERENCE" || type === "TABLE";
}
export function usesDecimal(type: string): boolean {
  return type === "DECIMAL";
}

/** Next unused stable field id (AA01, AA02, …) for a new field. */
export function nextFieldId(fields: SchemaField[]): string {
  let max = 0;
  for (const f of fields) {
    const m = /(\d+)\s*$/.exec(f.id || "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return "AA" + String(max + 1).padStart(2, "0");
}

export function blankField(id: string): SchemaField {
  return { id, name: "", type: "STRING", required: false, unique: false, list: true };
}
