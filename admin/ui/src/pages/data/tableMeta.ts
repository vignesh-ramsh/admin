import { call } from "../../api/client";
import type { TableMeta } from "../../api/types";

/* A field's `target` is a schema FILE STEM ("Department"), while every data
   endpoint takes the PHYSICAL table name ("department") — so the stem has
   to be resolved before it can be queried. One shared, module-level cache
   (not per-component) since ReferencePicker, FieldPreview, and
   ChildTablePreview/MultiFilePreview all need the exact same lookup —
   schemas don't change under a running process anyway. */
let metaPromise: Promise<TableMeta[]> | null = null;

export function loadTableMeta(): Promise<TableMeta[]> {
  if (!metaPromise) {
    metaPromise = call<TableMeta[]>("list_table_meta", {}, { method: "GET" }).catch(() => [] as TableMeta[]);
  }
  return metaPromise;
}
