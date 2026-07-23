import { useCallback, useEffect, useState } from "react";
import { call } from "../../api/client";
import type { FieldMeta, Row, TableMeta, TableSchema } from "../../api/types";
import { Combobox, type ComboOption } from "../../components/Combobox";

/* A field's `target` is a schema FILE STEM ("Department"), while every
   data endpoint takes the PHYSICAL table name ("department") — so the stem
   has to be resolved before it can be queried. Cached once per page load;
   schemas don't change under a running process anyway. */
let metaPromise: Promise<TableMeta[]> | null = null;
function loadTableMeta(): Promise<TableMeta[]> {
  if (!metaPromise) {
    metaPromise = call<TableMeta[]>("list_table_meta", {}, { method: "GET" }).catch(() => [] as TableMeta[]);
  }
  return metaPromise;
}

/* Picks a real row from the referenced table instead of asking someone to
   type a raw UUID / natural key by hand.

   What gets STORED depends on the field (docs/arc.MD §3.9):
     - target_field set -> the value of that field (the natural key itself)
     - otherwise        -> the target row's `id` (a UUID FK)
   What gets SHOWN is the target's natural key where there is one, since a
   UUID is meaningless to a human. */

interface Props {
  field: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Overrides field.target's stem->physical resolution with an already-
   *  known physical table name. Used for a child table's `parent` field
   *  (type REFERENCE_UUID): psqldb fills that field's FK target in at
   *  migration/DDL time and never writes it back to the client-visible
   *  Field, so field.target is always null there — the caller resolves it
   *  instead via TableMeta/TableSchema's `parent_table` and passes it in. */
  targetTable?: string | null;
}

export function ReferencePicker({ field, value, onChange, disabled, targetTable }: Props) {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  // The physical table this picker searches — null until resolved.
  const [target, setTarget] = useState<string | null>(null);
  const stem = field.target;

  useEffect(() => {
    let cancelled = false;
    const resolve = targetTable
      ? Promise.resolve(targetTable)
      : stem
        ? loadTableMeta().then(
            (meta) =>
              // Fall back to the stem itself: for a system table the stem
              // and the physical name are identical (e.g. "_users").
              meta.find((m) => m.name === stem)?.table ?? stem
          )
        : null;
    if (!resolve) return;
    resolve
      .then((physical) => {
        if (cancelled) return;
        setTarget(physical);
        return call<TableSchema>("get_table_schema", { table: physical }, { method: "GET" });
      })
      .then((s) => {
        if (!cancelled && s) setSchema(s);
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [stem, targetTable]);

  // The column to search and display against.
  const labelField =
    field.target_field ||
    schema?.fields.find((f) => f.unique && f.is_column)?.name ||
    "id";

  // When target_field is set, the stored value IS the natural key already
  // (human-readable) — nothing to resolve. Otherwise the stored value is
  // the target row's raw `id`, which is meaningless to show as-is; look up
  // that one row so the closed input can show its labelField instead of a
  // bare UUID. Without this, an already-set reference only ever showed its
  // real label once the dropdown was reopened and the row happened to
  // surface in the unfiltered/searched list.
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!value || !target || field.target_field) {
      setResolvedLabel(null);
      return;
    }
    let cancelled = false;
    call<Row[]>("list_rows", { table: target, filters: { id: { eq: value } }, limit: 1 }, { method: "QUERY" })
      .then((rows) => {
        if (cancelled) return;
        const label = rows[0]?.[labelField];
        setResolvedLabel(label != null ? String(label) : null);
      })
      .catch(() => {
        if (!cancelled) setResolvedLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, target, labelField, field.target_field]);

  const search = useCallback(
    async (query: string): Promise<ComboOption[]> => {
      if (!target) return [];
      // `contains` is only meaningful for text columns; for anything else
      // (or a UUID label) just list the first page unfiltered.
      const labelMeta = schema?.fields.find((f) => f.name === labelField);
      const textual =
        !labelMeta || ["STRING", "TEXT", "EMAIL", "PHONE", "SELECT"].includes(labelMeta.type);
      const filters =
        query.trim() && textual ? { [labelField]: { contains: query.trim() } } : null;

      const rows = await call<Row[]>("list_rows", { table: target, filters, limit: 20 }, { method: "QUERY" });
      return rows.map((r) => {
        const stored = field.target_field ? r[field.target_field] : r.id;
        const label = r[labelField];
        // A second, human-meaningful column (the first non-unique text
        // field) makes rows distinguishable when the key alone is cryptic.
        const contextField = schema?.fields.find(
          (f) => f.is_column && !f.unique && ["STRING", "TEXT"].includes(f.type)
        )?.name;
        const context = contextField ? r[contextField] : null;
        const storedStr = String(stored ?? "");
        const labelStr = String(label ?? r.id ?? "");
        // Eyebrow: extra context if it ADDS anything, else the raw value
        // actually stored when it differs from the label (e.g. a UUID).
        // Never repeat the label back — that's just noise.
        const contextStr = context != null ? String(context) : "";
        const sublabel =
          contextStr && contextStr !== labelStr
            ? contextStr
            : storedStr !== labelStr
              ? `${storedStr.slice(0, 8)}…`
              : undefined;
        return { value: storedStr, label: labelStr, sublabel };
      });
    },
    [target, labelField, field.target_field, schema]
  );

  const label = stem ?? target ?? "target";
  return (
    <Combobox
      value={value}
      displayValue={resolvedLabel ?? undefined}
      onChange={onChange}
      onSearch={search}
      disabled={disabled || (!stem && !targetTable)}
      placeholder={stem || targetTable ? `Search ${label}…` : "no target table"}
      emptyText={`No matching rows in ${label}`}
    />
  );
}
