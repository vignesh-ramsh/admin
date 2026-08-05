import { useMemo, useState, type ReactNode } from "react";
import { Info, Plus, Search, Trash2 } from "lucide-react";
import type { SchemaField, TableMeta } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { Checkbox, Select, TextInput } from "../../components/Field";
import { Combobox, type ComboOption } from "../../components/Combobox";
import { useTargetFieldOptions } from "./useTargetFields";
import { blankField, nextFieldId, typesFor, usesDecimal, usesLength, usesOptions, usesReference } from "../data/fieldTypes";

interface Props {
  fields: SchemaField[];
  system: boolean;
  tableMeta: TableMeta[];
  onChange: (fields: SchemaField[]) => void;
}

/** A Combobox whose options are already known client-side (not server-
 *  searched) — filters `options` locally against its own query state,
 *  matching the design system's Combobox contract (query/onQueryChange
 *  are always controlled by the caller). */
function LocalCombobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);
  if (disabled) {
    return (
      <div className="pointer-events-none opacity-60">
        <Combobox size="sm" value={value || null} onChange={() => {}} options={[]} query="" onQueryChange={() => {}} placeholder={placeholder} clearable />
      </div>
    );
  }
  return (
    <Combobox size="sm" value={value || null} onChange={onChange} options={filtered} query={query} onQueryChange={setQuery} placeholder={placeholder} clearable />
  );
}

/** lowercase, digits, and _ only — a schema field name is a physical
 *  Postgres column, and psqldb.fields.parse_field enforces the same
 *  ^[a-z][a-z0-9_]*$ rule server-side (defense in depth for a hand-edited
 *  schema JSON) — sanitizing live here means a user never even sees the
 *  rejection, the field just can't contain anything else in the first
 *  place. */
function sanitizeFieldName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function FieldEditor({ fields, system, tableMeta, onChange }: Props) {
  const update = (i: number, patch: Partial<SchemaField>) => {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => onChange([...fields, blankField(nextFieldId(fields))]);

  // A quick filter, not a real "group" — a wide system table can have 15+
  // fields, so finding one by scanning top to bottom stops scaling. Only
  // shown once there's enough fields for it to matter; index `i` used by
  // update/remove always refers to the REAL position in `fields`, never
  // the filtered list's position.
  const [filterQuery, setFilterQuery] = useState("");
  const q = filterQuery.trim().toLowerCase();

  // Field name AND data type both searchable — typing "reference" or "int"
  // filters down to every field of that type, not just a name substring.
  const matches = (f: SchemaField) =>
    !q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q) || f.type.toLowerCase().includes(q);
  const visibleFields = fields.filter(matches);

  // Every <td> shares the same padding, and a native <table> stretches
  // every cell in a <tr> to that row's tallest cell automatically — a
  // REFERENCE field's two side-by-side comboboxes or a DECIMAL's
  // precision/scale pair can't make just THEIR row taller than a plain
  // STRING field's row, and every row is guaranteed the same height as
  // every other row by the browser's table layout algorithm itself,
  // rather than by hand-matching an h-11 class on every branch.
  const th = "border-b border-r border-border px-2.5 py-2 text-left last:border-r-0";
  const td = "border-b border-r border-border px-2.5 py-2 align-middle last:border-r-0";
  const tdCenter = "border-b border-r border-border px-2.5 py-2 text-center align-middle last:border-r-0";

  const row = (f: SchemaField) => {
    const i = fields.indexOf(f);
    return (
      <tr key={f.id || i}>
        <td className={td}>
          <span className="truncate font-mono text-[11px] text-text-faint">{f.id}</span>
        </td>
        <td className={td}>
          <TextInput
            size="sm"
            placeholder="field_name"
            value={f.name}
            onChange={(e) => update(i, { name: sanitizeFieldName(e.target.value) })}
          />
        </td>
        <td className={td}>
          <Select
            size="sm"
            value={f.type}
            onChange={(e) =>
              update(i, {
                type: e.target.value,
                target: undefined,
                target_field: undefined,
                options: undefined,
                length: undefined,
                precision: undefined,
                scale: undefined,
              })
            }
          >
            {typesFor(system).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </td>
        <td className={td}>
          <FieldConfig field={f} tableMeta={tableMeta} onChange={(patch) => update(i, patch)} />
        </td>
        <td className={tdCenter}>
          <Checkbox label="" checked={!!f.required} onChange={(e) => update(i, { required: e.target.checked })} aria-label="Required" />
        </td>
        <td className={tdCenter}>
          <Checkbox label="" checked={!!f.unique} onChange={(e) => update(i, { unique: e.target.checked })} aria-label="Unique" />
        </td>
        <td className={tdCenter}>
          <Checkbox
            label=""
            checked={f.list !== false}
            onChange={(e) => update(i, { list: e.target.checked })}
            aria-label="Show in list view"
            title="Show this column in Data Browser's table/list view — always still editable in the row editor either way"
          />
        </td>
        <td className="px-2.5 py-2 text-center align-middle">
          <IconButton label="Remove field" icon={<Trash2 size={15} />} onClick={() => remove(i)} />
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-bg/50 px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-[11px] leading-relaxed text-warning">
          Every table needs at least one <strong>Unique</strong> field (or a Unique Together group below). Field names:
          lowercase letters, digits, and underscores only — no spaces, capitals, or symbols. Saving applies the change
          immediately, live — <strong>some type changes can cause data loss, so always take a backup before saving one.</strong>
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {fields.length > 8 && (
          <div className="flex items-center gap-2 border-b border-border bg-neutral-50 px-3 py-2 dark:bg-neutral-900/40">
            <Search size={14} className="text-text-faint" />
            <input
              className="flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-faint"
              placeholder={`Filter ${fields.length} fields by name or type…`}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>
        )}

        {fields.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-text-faint">No fields yet — add the table's first field below.</p>}
        {fields.length > 0 && visibleFields.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-text-faint">No fields match "{filterQuery}".</p>
        )}

        {(fields.length === 0 || visibleFields.length > 0) && (
          // table-layout: fixed makes every column's width a fixed
          // contract (the <colgroup> below), independent of any cell's
          // content — the same reason REFERENCE's two comboboxes or a
          // DECIMAL's precision/scale pair used to need a hand-written
          // min-w-0 escape hatch under CSS Grid. Under a table that
          // concern doesn't exist: no cell's content can ever widen its
          // own column relative to any other row's. border-collapse
          // merges every shared cell edge into one crisp 1px line instead
          // of doubling up wherever two bordered boxes used to touch.
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "52px" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "150px" }} />
              <col />
              <col style={{ width: "44px" }} />
              <col style={{ width: "44px" }} />
              <col style={{ width: "44px" }} />
              <col style={{ width: "32px" }} />
            </colgroup>
            <thead className="bg-neutral-50 text-[11px] font-semibold uppercase tracking-wide text-text-faint dark:bg-neutral-900/40">
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Name</th>
                <th className={th}>Type</th>
                <th className={th}>Configuration</th>
                <th className={`${th} text-center`}>Req</th>
                <th className={`${th} text-center`}>Uniq</th>
                <th className={`${th} text-center`} title="Show this column in Data Browser's table/list view">
                  List
                </th>
                <th className="border-b border-border px-2.5 py-2" />
              </tr>
            </thead>
            <tbody>{visibleFields.map(row)}</tbody>
          </table>
        )}

        <div className="border-t border-border p-2.5">
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add}>
            Add field
          </Button>
        </div>
      </div>
    </div>
  );
}

/** N sub-inputs sharing one Configuration cell, evenly split — flex-1
 *  divides available width by however many <ConfigSlot>s are actually
 *  rendered, so this is "evenly distribute by input count" for free: one
 *  slot gets 100%, two slots get 50/50, three would get a third each,
 *  with no per-branch width math to keep in sync. min-w-0 on each slot
 *  is load-bearing (see ConfigSlot). A lone control that skips this
 *  wrapper entirely (OptionsInput, the plain default branch) already
 *  gets the full cell width for free, since ControlBox itself has no
 *  width constraint of its own. */
function ConfigRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}

/** min-w-0 is load-bearing, not decorative: a flex item's default min-
 *  width is its content's min-content size, and a Combobox's own min-
 *  width is "auto" on top of that — neither bottoms out at the inner
 *  input's own min-w-0 the way a plain block child would. Without this,
 *  two side-by-side slots (REFERENCE's pair of comboboxes, DECIMAL's
 *  precision/scale) refuse to shrink below their content size, overflow
 *  the cell, and — since Combobox's root is `position: relative` —
 *  visually and functionally sit on TOP of the Req/Uniq/List checkboxes
 *  to the right (position:relative paints above static siblings
 *  regardless of DOM order), making them unclickable. flex-1 is what
 *  actually claims this slot's even share of ConfigRow's width — w-full
 *  alone on the child would only mean "100% of whatever space this slot
 *  already has," not "an equal share of the row." */
function ConfigSlot({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1">{children}</div>;
}

function FieldConfig({ field, tableMeta, onChange }: { field: SchemaField; tableMeta: TableMeta[]; onChange: (patch: Partial<SchemaField>) => void }) {
  const t = field.type;

  if (usesReference(t)) {
    const isTableType = t === "TABLE";
    // A TABLE field generates/points at a CHILD table — psqldb requires
    // the target to be a "child": true schema, so only those are offered.
    const candidates = isTableType ? tableMeta.filter((m) => m.child) : tableMeta;
    const tableOptions: ComboOption[] = candidates.map((m) => ({
      value: m.name,
      label: m.name,
      sublabel: [m.plugin, m.child ? "child" : m.system ? "system" : null].filter(Boolean).join(" · "),
    }));

    return (
      <ConfigRow>
        <ConfigSlot>
          <LocalCombobox
            value={field.target ?? ""}
            onChange={(v) => onChange({ target: v ?? undefined, target_field: undefined })}
            options={tableOptions}
            placeholder={isTableType ? "child table…" : "target table…"}
          />
        </ConfigSlot>
        {t === "REFERENCE" && (
          <ConfigSlot>
            <TargetFieldPicker field={field} tableMeta={tableMeta} onChange={onChange} />
          </ConfigSlot>
        )}
      </ConfigRow>
    );
  }

  if (usesOptions(t)) {
    return <OptionsInput field={field} onChange={onChange} />;
  }

  if (usesDecimal(t)) {
    return (
      <ConfigRow>
        <ConfigSlot>
          <TextInput
            size="sm"
            type="number"
            placeholder="precision"
            value={field.precision ?? ""}
            onChange={(e) => onChange({ precision: e.target.value ? Number(e.target.value) : undefined })}
          />
        </ConfigSlot>
        <ConfigSlot>
          <TextInput
            size="sm"
            type="number"
            placeholder="scale"
            value={field.scale ?? ""}
            onChange={(e) => onChange({ scale: e.target.value ? Number(e.target.value) : undefined })}
          />
        </ConfigSlot>
      </ConfigRow>
    );
  }

  if (usesLength(t)) {
    return (
      <ConfigRow>
        <ConfigSlot>
          <TextInput
            size="sm"
            type="number"
            placeholder="length"
            value={field.length ?? ""}
            onChange={(e) => onChange({ length: e.target.value ? Number(e.target.value) : undefined })}
          />
        </ConfigSlot>
        <ConfigSlot>
          <TextInput
            size="sm"
            placeholder="default"
            value={field.default != null ? String(field.default) : ""}
            onChange={(e) => onChange({ default: e.target.value || undefined })}
          />
        </ConfigSlot>
      </ConfigRow>
    );
  }

  return (
    <TextInput
      size="sm"
      placeholder="default (optional)"
      value={field.default != null ? String(field.default) : ""}
      onChange={(e) => onChange({ default: e.target.value || undefined })}
    />
  );
}

/* A SELECT/etc. field's `options` array, edited as one comma-separated
   text input. Local text state so a just-typed trailing comma isn't
   immediately dropped by split->filter->join re-deriving the input's own
   displayed value on every keystroke. */
function OptionsInput({ field, onChange }: { field: SchemaField; onChange: (patch: Partial<SchemaField>) => void }) {
  const [text, setText] = useState((field.options ?? []).join(", "));
  return (
    <TextInput
      size="sm"
      placeholder="option1, option2, …"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
      }}
    />
  );
}

function TargetFieldPicker({ field, tableMeta, onChange }: { field: SchemaField; tableMeta: TableMeta[]; onChange: (patch: Partial<SchemaField>) => void }) {
  const physical = tableMeta.find((m) => m.name === field.target)?.table;
  const { options, loading } = useTargetFieldOptions(physical);
  return (
    <LocalCombobox
      value={field.target_field ?? ""}
      onChange={(v) => onChange({ target_field: v || undefined })}
      options={options}
      disabled={!field.target}
      placeholder={!field.target ? "pick a table first" : loading ? "loading…" : "target field (default: id)"}
    />
  );
}
