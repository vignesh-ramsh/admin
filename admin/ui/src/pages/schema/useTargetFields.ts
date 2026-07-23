import { useEffect, useState } from "react";
import { call } from "../../api/client";
import type { TableSchema } from "../../api/types";
import type { ComboOption } from "../../components/Combobox";

/* A REFERENCE's target_field may only name a field that is UNIQUE on the
   target (psqldb.migrate.resolve_ref_columns raises a hard MigrationError
   otherwise — Postgres can only FK against a unique column), or the
   target's primary key. So the picker offers exactly those, rather than
   free text that fails later at migrate time. */

const cache = new Map<string, Promise<TableSchema | null>>();

function fetchSchema(table: string): Promise<TableSchema | null> {
  let p = cache.get(table);
  if (!p) {
    p = call<TableSchema>("get_table_schema", { table }, { method: "GET" }).catch(() => null);
    cache.set(table, p);
  }
  return p;
}

/** Invalidate cached schemas (after a save changes a table's shape). */
export function clearSchemaCache(): void {
  cache.clear();
}

export function useTargetFieldOptions(table: string | undefined | null): {
  options: ComboOption[];
  loading: boolean;
} {
  const [options, setOptions] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!table) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSchema(table)
      .then((schema) => {
        if (cancelled) return;
        if (!schema) {
          setOptions([]);
          return;
        }
        const opts: ComboOption[] = [];

        // The primary key: a system table declares its own (primary_key:
        // true); every other table gets `id` auto-injected.
        const declaredPk = schema.fields.find((f) => f.primary_key);
        opts.push(
          declaredPk
            ? { value: declaredPk.name, label: declaredPk.name, sublabel: "primary key" }
            : { value: "id", label: "id", sublabel: "primary key" }
        );

        for (const f of schema.fields) {
          if (f.unique && f.is_column && !f.primary_key) {
            opts.push({ value: f.name, label: f.name, sublabel: `${f.type} · unique` });
          }
        }
        setOptions(opts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [table]);

  return { options, loading };
}
