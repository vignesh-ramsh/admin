import { useEffect, useState } from "react";
import { call } from "../../api/client";
import type { FieldMeta, Row, TableMeta, TableSchema } from "../../api/types";
import { Combobox, type ComboOption } from "../../components/Combobox";
import { useDebounce } from "../../hooks/useDebounce";

/* A field's `target` is a schema FILE STEM ("Department"), while every data
   endpoint takes the PHYSICAL table name ("department") — so the stem has
   to be resolved before it can be queried. Cached once per page load;
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
  label?: string;
  /** Overrides field.target's stem->physical resolution with an already-
   *  known physical table name. Used for a child table's `parent` field
   *  (REFERENCE_UUID): psqldb fills that field's FK target in at
   *  migration/DDL time and never writes it back to the client-visible
   *  Field, so field.target is always null there — the caller resolves it
   *  instead via TableSchema.parent_table and passes it in. */
  targetTable?: string | null;
}

export function ReferencePicker({ field, value, onChange, disabled, label, targetTable }: Props) {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const stem = field.target;

  useEffect(() => {
    let cancelled = false;
    const resolve = targetTable
      ? Promise.resolve(targetTable)
      : stem
        ? loadTableMeta().then((meta) => meta.find((m) => m.name === stem)?.table ?? stem)
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

  const labelField = field.target_field || schema?.fields.find((f) => f.unique && f.is_column)?.name || "id";

  // The current value's own label, resolved once so a closed picker never
  // just shows a bare UUID — same "resolve the one selected row" gap the
  // old app's version fixed.
  const [resolvedOption, setResolvedOption] = useState<ComboOption | null>(null);
  useEffect(() => {
    if (!value || !target) {
      setResolvedOption(null);
      return;
    }
    if (field.target_field) {
      // The stored value IS the natural key already — nothing to resolve.
      setResolvedOption({ value, label: value });
      return;
    }
    let cancelled = false;
    call<Row[]>("list_rows", { table: target, filters: { id: { eq: value } }, limit: 1 }, { method: "QUERY" })
      .then((rows) => {
        if (cancelled) return;
        const row = rows[0];
        const lbl = row ? row[labelField] : null;
        setResolvedOption({ value, label: lbl != null ? String(lbl) : value });
      })
      .catch(() => {
        if (!cancelled) setResolvedOption({ value, label: value });
      });
    return () => {
      cancelled = true;
    };
  }, [value, target, labelField, field.target_field]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!target) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const labelMeta = schema?.fields.find((f) => f.name === labelField);
    const textual = !labelMeta || ["STRING", "TEXT", "EMAIL", "PHONE", "SELECT"].includes(labelMeta.type);
    const filters = debouncedQuery.trim() && textual ? { [labelField]: { contains: debouncedQuery.trim() } } : null;
    call<Row[]>("list_rows", { table: target, filters, limit: 20 }, { method: "QUERY" })
      .then((rows) => {
        if (cancelled) return;
        const contextField = schema?.fields.find((f) => f.is_column && !f.unique && ["STRING", "TEXT"].includes(f.type))?.name;
        setSearchResults(
          rows.map((r) => {
            const stored = field.target_field ? r[field.target_field] : r.id;
            const lbl = r[labelField];
            const context = contextField ? r[contextField] : null;
            const storedStr = String(stored ?? "");
            const labelStr = String(lbl ?? r.id ?? "");
            const contextStr = context != null ? String(context) : "";
            const sublabel =
              contextStr && contextStr !== labelStr
                ? contextStr
                : storedStr !== labelStr
                  ? `${storedStr.slice(0, 8)}…`
                  : undefined;
            return { value: storedStr, label: labelStr, sublabel };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, debouncedQuery, labelField, field.target_field, schema]);

  const options: ComboOption[] =
    resolvedOption && !searchResults.some((o) => o.value === resolvedOption.value) ? [resolvedOption, ...searchResults] : searchResults;

  const targetLabel = stem ?? target ?? "target";
  const picker = (
    <Combobox
      label={label}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      query={query}
      onQueryChange={setQuery}
      loading={loading}
      placeholder={stem || targetTable ? `Search ${targetLabel}…` : "no target table"}
      clearable
    />
  );

  if (!disabled) return picker;
  return <div className="pointer-events-none opacity-60">{picker}</div>;
}
