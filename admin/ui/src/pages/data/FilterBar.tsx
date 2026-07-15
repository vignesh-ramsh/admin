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
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "is_null", label: "is empty" },
];

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

  const apply = () => {
    if (!field) return;
    if (op === "is_null") {
      onApply({ [field]: { is_null: true } });
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
      <select className="select" style={{ width: 140 }} value={op} onChange={(e) => setOp(e.target.value)}>
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        className="input"
        style={{ flex: 1, minWidth: 120 }}
        placeholder={op === "is_null" ? "—" : "value"}
        value={value}
        disabled={op === "is_null"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
      />
      <Button variant="secondary" size="sm" onClick={apply}>
        <IconSearch /> Apply
      </Button>
      <Button variant="ghost" size="sm" onClick={clear}>
        Clear
      </Button>
    </div>
  );
}
