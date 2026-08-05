import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FieldMeta, TableSchema } from "../api/types";
import { Button, IconButton } from "./Button";
import { Checkbox, Select } from "./Field";
import { Modal } from "./Modal";
import { FieldInput } from "../pages/data/FieldInput";
import { editableFields } from "../pages/data/format";

let seq = 0;
interface EditRow {
  key: number;
  field: string;
  value: string | boolean;
}

/** Bulk field+value editor — the user picks one or more (field, value)
 *  pairs and Apply writes every one of them at once (admin.save_rows_bulk).
 *
 *  Two modes, chosen by whether `filterScope` is passed:
 *   - omitted (the existing selection-based flow): scoped only to the rows
 *     the caller actually checkbox-selected — never a blanket "every row
 *     matching the current filter" write. No scope checkbox shown.
 *   - provided (a filter/search is active, nothing individually selected):
 *     shows a default-CHECKED "apply to all {total} matching records"
 *     checkbox; unchecking it narrows the write to just the
 *     {loadedCount} rows already fetched. `onApply`'s second argument
 *     tells the caller which of the two the user actually confirmed. */
export function BulkEditModal({
  schema,
  selectedCount,
  filterScope,
  applying,
  onApply,
  onClose,
}: {
  schema: TableSchema;
  selectedCount: number;
  filterScope?: { total: number; loadedCount: number };
  applying: boolean;
  onApply: (patch: Record<string, unknown>, scope: "all" | "loaded") => void;
  onClose: () => void;
}) {
  const fields = editableFields(schema);
  const [rows, setRows] = useState<EditRow[]>([{ key: ++seq, field: fields[0]?.name ?? "", value: "" }]);
  const [scopeAll, setScopeAll] = useState(true);

  const usedNames = new Set(rows.map((r) => r.field));
  const fieldMeta = (name: string): FieldMeta | undefined => fields.find((f) => f.name === name);

  const update = (key: number, patch: Partial<EditRow>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((cur) => cur.filter((r) => r.key !== key));
  const add = () => {
    const next = fields.find((f) => !usedNames.has(f.name));
    setRows((cur) => [...cur, { key: ++seq, field: next?.name ?? "", value: "" }]);
  };

  const valid = rows.length > 0 && rows.every((r) => r.field);
  const scope: "all" | "loaded" = filterScope && scopeAll ? "all" : "loaded";
  const targetCount = filterScope ? (scope === "all" ? filterScope.total : filterScope.loadedCount) : selectedCount;

  const apply = () => {
    if (!valid) return;
    const patch: Record<string, unknown> = {};
    for (const r of rows) patch[r.field] = r.value;
    onApply(patch, scope);
  };

  return (
    <Modal
      title={`Edit ${targetCount} row${targetCount === 1 ? "" : "s"}`}
      subtitle="Every field below is applied to every targeted row — leave a field out to keep its current value."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} loading={applying} disabled={!valid || targetCount === 0}>
            Apply to {targetCount} row{targetCount === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {filterScope && (
          <div className="rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2.5">
            <Checkbox
              label={`Apply to all ${filterScope.total} matching record${filterScope.total === 1 ? "" : "s"}`}
              checked={scopeAll}
              onChange={(e) => setScopeAll(e.target.checked)}
            />
            <p className="mt-1 pl-6 text-xs text-text-faint">
              {scopeAll
                ? "Every row matching the current filter/search — not just what's loaded on screen."
                : `Unchecked — only applies to the ${filterScope.loadedCount} row${filterScope.loadedCount === 1 ? "" : "s"} currently loaded.`}
            </p>
          </div>
        )}
        {rows.map((r) => {
          const meta = fieldMeta(r.field);
          const options = fields.filter((f) => f.name === r.field || !usedNames.has(f.name));
          return (
            <div key={r.key} className="flex items-start gap-2">
              <Select
                className="!h-9 w-48 shrink-0"
                value={r.field}
                onChange={(e) => update(r.key, { field: e.target.value, value: "" })}
              >
                {options.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </Select>
              <div className="min-w-0 flex-1">
                {meta ? (
                  <FieldInput field={meta} value={r.value} onChange={(v) => update(r.key, { value: v })} />
                ) : (
                  <p className="pt-2 text-[13px] text-text-faint">No more fields to add.</p>
                )}
              </div>
              <IconButton
                label="Remove field"
                icon={<Trash2 size={15} />}
                onClick={() => remove(r.key)}
                className="mt-0.5 shrink-0"
              />
            </div>
          );
        })}
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={add}
            disabled={usedNames.size >= fields.length}
          >
            Add field
          </Button>
        </div>
      </div>
    </Modal>
  );
}
