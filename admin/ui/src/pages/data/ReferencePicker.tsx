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
    metaPromise = call<TableMeta[]>("list_table_meta", {}).catch(() => [] as TableMeta[]);
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
}

export function ReferencePicker({ field, value, onChange, disabled }: Props) {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  // The physical table behind field.target's stem — null until resolved.
  const [target, setTarget] = useState<string | null>(null);
  const stem = field.target;

  useEffect(() => {
    if (!stem) return;
    let cancelled = false;
    loadTableMeta()
      .then((meta) => {
        if (cancelled) return;
        // Fall back to the stem itself: for a system table the stem and the
        // physical name are identical (e.g. "_users").
        const physical = meta.find((m) => m.name === stem)?.table ?? stem;
        setTarget(physical);
        return call<TableSchema>("get_table_schema", { table: physical });
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
  }, [stem]);

  // The column to search and display against.
  const labelField =
    field.target_field ||
    schema?.fields.find((f) => f.unique && f.is_column)?.name ||
    "id";

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

      const rows = await call<Row[]>("list_rows", { table: target, filters, limit: 20 });
      return rows.map((r) => {
        const stored = field.target_field ? r[field.target_field] : r.id;
        const label = r[labelField];
        return {
          value: String(stored ?? ""),
          label: String(label ?? r.id ?? ""),
          // Show the stored value as a hint when it differs from the label,
          // so it's obvious what actually lands in the column.
          hint:
            String(stored ?? "") !== String(label ?? "")
              ? String(stored ?? "").slice(0, 8) + "…"
              : undefined,
        };
      });
    },
    [target, labelField, field.target_field, schema]
  );

  return (
    <Combobox
      value={value}
      onChange={onChange}
      onSearch={search}
      disabled={disabled || !stem}
      placeholder={stem ? `Search ${stem}…` : "no target table"}
      emptyText={`No matching rows in ${stem}`}
    />
  );
}
