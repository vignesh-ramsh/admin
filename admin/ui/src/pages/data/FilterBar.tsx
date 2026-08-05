import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Plus, X } from "lucide-react";
import type { FieldMeta, TableSchema } from "../../api/types";
import { IconButton } from "../../components/Button";
import { Select, TextInput } from "../../components/Field";
import { useDebounce } from "../../hooks/useDebounce";

/* Multiple simultaneous (field, operator, value) conditions, ANDed
   together — arc.relay.list's `filters` dict already supports this
   server-side (one entry per column, each an {op: operand} clause), so
   there's no reason to limit the UI to a single condition the way the
   old app did. Vocabulary matches the bounded Query Engine exactly
   (docs/arc.MD §3.11): flat operators, implicit AND, no OR/NOT grouping.
   Labels are bare keywords on purpose — no parenthetical helper text
   (an operator dropdown is read by the same person every time; it isn't
   documentation). */

const OPERATORS = [
  { value: "eq", label: "Equals" },
  { value: "ne", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "startswith", label: "Starts With" },
  { value: "endswith", label: "Ends With" },
  { value: "like", label: "Like" },
  { value: "ilike", label: "Ilike" },
  { value: "gt", label: "Greater Than" },
  { value: "gte", label: "Greater Or Equal" },
  { value: "lt", label: "Less Than" },
  { value: "lte", label: "Less Or Equal" },
  { value: "in", label: "In" },
  { value: "not_in", label: "Not In" },
  { value: "range", label: "Range" },
  { value: "is_null", label: "Is Empty" },
] as const;

const LIST_OPS = new Set(["in", "not_in"]);

let seq = 0;
interface Condition {
  key: number;
  field: string;
  op: string;
  value: string;
}

function blankCondition(field: string): Condition {
  return { key: ++seq, field, op: "eq", value: "" };
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
      const parts = c.value.split(",").map((s) => s.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
      out[c.field] = { range: parts };
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

export interface FilterBarHandle {
  /** Instant (not debounced) — the toolbar's own "clear filters" control
   *  (visible outside this card, next to the Filters button) calls this
   *  directly so clearing feels immediate rather than waiting out the
   *  350ms typing-debounce every keystroke otherwise goes through. */
  clearAll: () => void;
}

/** `open` drives one thing on top of visibility (the parent still owns
 *  show/hide via CSS): the FIRST time this card opens with zero
 *  conditions, one is added automatically (field defaults to the first
 *  column, operator to Equals) — no "Add filter" click required before
 *  you can actually pick a field. Stays mounted (not conditionally
 *  rendered) across opens/closes so in-progress typing survives a close,
 *  same as before. */
export const FilterBar = forwardRef<FilterBarHandle, { schema: TableSchema; open: boolean; onChange: (filters: Record<string, unknown> | null) => void }>(
  function FilterBar({ schema, open, onChange }, ref) {
    const columns: FieldMeta[] = [...schema.fields.filter((f) => f.is_column), ...schema.system_fields.filter((f) => f.is_column)];
    const [conditions, setConditions] = useState<Condition[]>([]);
    const debounced = useDebounce(conditions, 350);

    useEffect(() => {
      onChange(toFilters(debounced));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debounced]);

    useEffect(() => {
      if (open && conditions.length === 0 && columns.length > 0) {
        setConditions([blankCondition(columns[0].name)]);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useImperativeHandle(ref, () => ({
      clearAll: () => {
        setConditions([]);
        onChange(null);
      },
    }));

    const update = (key: number, patch: Partial<Condition>) =>
      setConditions((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    const remove = (key: number) => setConditions((cur) => cur.filter((c) => c.key !== key));
    const add = () => setConditions((cur) => [...cur, blankCondition(columns[0]?.name ?? "")]);

    if (columns.length === 0) return null;

    return (
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2.5">
        {conditions.map((c) => (
          <div key={c.key} className="flex flex-col gap-2 border-b border-border pb-2.5 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:gap-2 sm:border-0 sm:pb-0">
            <Select className="w-full sm:w-40" value={c.field} onChange={(e) => update(c.key, { field: e.target.value })}>
              {columns.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </Select>
            <Select className="w-full sm:w-40" value={c.op} onChange={(e) => update(c.key, { op: e.target.value })}>
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <div className="flex flex-1 items-center gap-2">
              <TextInput
                className="w-full min-w-0 flex-1"
                placeholder={
                  c.op === "is_null" ? "—" : c.op === "range" ? "min, max" : LIST_OPS.has(c.op) ? "value1, value2, …" : "value"
                }
                value={c.value}
                disabled={c.op === "is_null"}
                onChange={(e) => update(c.key, { value: e.target.value })}
              />
              <IconButton label="Remove filter" icon={<X size={14} />} onClick={() => remove(c.key)} className="shrink-0" />
            </div>
          </div>
        ))}
        <div>
          <IconButton label="Add filter condition" icon={<Plus size={15} />} onClick={add} />
        </div>
      </div>
    );
  },
);
