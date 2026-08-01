import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { FieldMeta, TableSchema } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { Select, TextInput } from "../../components/Field";
import { useDebounce } from "../../hooks/useDebounce";

/* Multiple simultaneous (field, operator, value) conditions, ANDed
   together — arc.relay.list's `filters` dict already supports this
   server-side (one entry per column, each an {op: operand} clause), so
   there's no reason to limit the UI to a single condition the way the
   old app did. Vocabulary matches the bounded Query Engine exactly
   (docs/arc.MD §3.11): flat operators, implicit AND, no OR/NOT grouping. */

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "ne", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "startswith", label: "starts with" },
  { value: "endswith", label: "ends with" },
  { value: "like", label: "like (% _ wildcards)" },
  { value: "ilike", label: "ilike (case-insensitive)" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "in", label: "in (comma-separated)" },
  { value: "not_in", label: "not in (comma-separated)" },
  { value: "range", label: "range (between)" },
  { value: "is_null", label: "is empty" },
] as const;

const LIST_OPS = new Set(["in", "not_in"]);

let seq = 0;
interface Condition {
  key: number;
  field: string;
  op: string;
  value: string;
  rangeMax: string;
}

function blankCondition(field: string): Condition {
  return { key: ++seq, field, op: "eq", value: "", rangeMax: "" };
}

function toFilters(conditions: Condition[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const c of conditions) {
    if (!c.field) continue;
    if (c.op === "is_null") {
      out[c.field] = { is_null: true };
      continue;
    }
    if (c.op === "range") {
      if (c.value === "" || c.rangeMax === "") continue;
      out[c.field] = { range: [c.value, c.rangeMax] };
      continue;
    }
    if (LIST_OPS.has(c.op)) {
      const list = c.value.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) continue;
      out[c.field] = { [c.op]: list };
      continue;
    }
    if (c.value === "") continue;
    out[c.field] = { [c.op]: c.value };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function FilterBar({ schema, onChange }: { schema: TableSchema; onChange: (filters: Record<string, unknown> | null) => void }) {
  const columns: FieldMeta[] = [...schema.fields.filter((f) => f.is_column), ...schema.system_fields.filter((f) => f.is_column)];
  const [conditions, setConditions] = useState<Condition[]>([]);
  const debounced = useDebounce(conditions, 350);

  useEffect(() => {
    onChange(toFilters(debounced));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const update = (key: number, patch: Partial<Condition>) =>
    setConditions((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const remove = (key: number) => setConditions((cur) => cur.filter((c) => c.key !== key));
  const add = () => setConditions((cur) => [...cur, blankCondition(columns[0]?.name ?? "")]);
  const clearAll = () => setConditions([]);

  if (columns.length === 0) return null;

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2.5">
      {conditions.length === 0 ? (
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[13px] text-text-faint">
            <Search size={13} /> No filters applied.
          </p>
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={add}>
            Add filter
          </Button>
        </div>
      ) : (
        <>
          {conditions.map((c) => (
            <div key={c.key} className="flex flex-wrap items-center gap-2">
              <Select className="!h-8 w-40" value={c.field} onChange={(e) => update(c.key, { field: e.target.value })}>
                {columns.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </Select>
              <Select className="!h-8 w-48" value={c.op} onChange={(e) => update(c.key, { op: e.target.value })}>
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {c.op === "range" ? (
                <>
                  <TextInput className="!h-8 w-28" placeholder="min" value={c.value} onChange={(e) => update(c.key, { value: e.target.value })} />
                  <TextInput className="!h-8 w-28" placeholder="max" value={c.rangeMax} onChange={(e) => update(c.key, { rangeMax: e.target.value })} />
                </>
              ) : (
                <TextInput
                  className="!h-8 min-w-[140px] flex-1"
                  placeholder={c.op === "is_null" ? "—" : LIST_OPS.has(c.op) ? "value1, value2, …" : "value"}
                  value={c.value}
                  disabled={c.op === "is_null"}
                  onChange={(e) => update(c.key, { value: e.target.value })}
                />
              )}
              <IconButton label="Remove filter" icon={<X size={14} />} onClick={() => remove(c.key)} />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-0.5">
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={add}>
              Add condition
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
