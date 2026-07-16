import { useState } from "react";
import type { FieldMeta, TableSchema } from "../../api/types";
import { Button } from "../../components/Button";
import { IconSearch } from "../../layout/icons";

/* A single-condition filter, deliberately matching the bounded Query
   Engine's own vocabulary (docs/arc.MD §3.11): flat operators, implicit
   AND, no OR/NOT grouping. */

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
];

const LIST_OPS = new Set(["in", "not_in"]);

export type Filters = Record<string, unknown> | null;

export function FilterBar({
  schema,
  onApply,
}: {
  schema: TableSchema;
  onApply: (filters: Filters) => void;
}) {
  const columns: FieldMeta[] = [
    ...schema.fields.filter((f) => f.is_column),
    ...schema.system_fields.filter((f) => f.is_column),
  ];
  const [field, setField] = useState(columns[0]?.name ?? "");
  const [op, setOp] = useState("eq");
  const [value, setValue] = useState("");
  const [rangeMax, setRangeMax] = useState("");

  const apply = () => {
    if (!field) return;
    if (op === "is_null") {
      onApply({ [field]: { is_null: true } });
      return;
    }
    if (op === "range") {
      if (value === "" || rangeMax === "") {
        onApply(null);
        return;
      }
      onApply({ [field]: { range: [value, rangeMax] } });
      return;
    }
    if (LIST_OPS.has(op)) {
      const list = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) {
        onApply(null);
        return;
      }
      onApply({ [field]: { [op]: list } });
      return;
    }
    if (value === "") {
      onApply(null);
      return;
    }
    onApply({ [field]: { [op]: value } });
  };

  const clear = () => {
    setValue("");
    setRangeMax("");
    onApply(null);
  };

  return (
    <div className="filterbar">
      <select className="select" style={{ width: 170 }} value={field} onChange={(e) => setField(e.target.value)}>
        {columns.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <select className="select" style={{ width: 190 }} value={op} onChange={(e) => setOp(e.target.value)}>
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {op === "range" ? (
        <>
          <input
            className="input"
            style={{ width: 110 }}
            placeholder="min"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
          <input
            className="input"
            style={{ width: 110 }}
            placeholder="max"
            value={rangeMax}
            onChange={(e) => setRangeMax(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
        </>
      ) : (
        <input
          className="input"
          style={{ flex: 1, minWidth: 120 }}
          placeholder={op === "is_null" ? "—" : LIST_OPS.has(op) ? "value1, value2, …" : "value"}
          value={value}
          disabled={op === "is_null"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
      )}
      <Button variant="secondary" size="sm" onClick={apply}>
        <IconSearch /> Apply
      </Button>
      <Button variant="ghost" size="sm" onClick={clear}>
        Clear
      </Button>
    </div>
  );
}
