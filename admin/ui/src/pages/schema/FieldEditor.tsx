import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
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
        <Combobox value={value || null} onChange={() => {}} options={[]} query="" onQueryChange={() => {}} placeholder={placeholder} clearable />
      </div>
    );
  }
  return <Combobox value={value || null} onChange={onChange} options={filtered} query={query} onQueryChange={setQuery} placeholder={placeholder} clearable />;
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
  // the filtered list's position. IMPROVEMENT over the old app: group
  // system vs custom fields and show a count, since UUID-prefixed system
  // fields (AA00-AA14 style) used to be an undifferentiated flat list.
  const [filterQuery, setFilterQuery] = useState("");
  const q = filterQuery.trim().toLowerCase();

  const isSystemField = (f: SchemaField) => f.type === "UUID" || f.primary_key;
  const systemFields = fields.filter(isSystemField);
  const customFields = fields.filter((f) => !isSystemField(f));
  const [showSystem, setShowSystem] = useState(false);

  const matches = (f: SchemaField) => !q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q);
  const visibleCustom = customFields.filter(matches);
  const visibleSystem = systemFields.filter(matches);

  const row = (f: SchemaField) => {
    const i = fields.indexOf(f);
    return (
      <div className="grid grid-cols-[52px_0.75fr_128px_1.25fr_44px_44px_44px_32px] items-center gap-2 border-b border-border px-2 py-2 last:border-0" key={f.id || i}>
        <span className="truncate font-mono text-[11px] text-text-faint">{f.id}</span>
        <div className="min-w-0">
          <TextInput className="!h-8" placeholder="field_name" value={f.name} onChange={(e) => update(i, { name: e.target.value })} />
        </div>
        <div className="min-w-0">
          <Select
            className="!h-8"
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
        </div>
        {/* min-w-0 is load-bearing: without it, a grid item's default
            min-width is its content's min-content size. REFERENCE's two
            side-by-side comboboxes need more min-content width than every
            other field type's single input, so this cell's 1fr track (and
            every other track sharing this row's grid) would recompute —
            and only THIS row's — the instant you picked Reference, visibly
            shifting the Name/Type columns relative to every other row. */}
        <div className="min-w-0">
          <FieldConfig field={f} tableMeta={tableMeta} onChange={(patch) => update(i, patch)} />
        </div>
        <Checkbox
          label=""
          className="mx-auto"
          checked={!!f.required}
          onChange={(e) => update(i, { required: e.target.checked })}
          aria-label="Required"
        />
        <Checkbox label="" className="mx-auto" checked={!!f.unique} onChange={(e) => update(i, { unique: e.target.checked })} aria-label="Unique" />
        <Checkbox
          label=""
          className="mx-auto"
          checked={f.list !== false}
          onChange={(e) => update(i, { list: e.target.checked })}
          aria-label="Show in list view"
          title="Show this column in Data Browser's table/list view — always still editable in the row editor either way"
        />
        <IconButton label="Remove field" icon={<Trash2 size={15} />} onClick={() => remove(i)} />
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border">
      {fields.length > 8 && (
        <div className="flex items-center gap-2 border-b border-border bg-neutral-50 px-3 py-2 dark:bg-neutral-900/40">
          <Search size={14} className="text-text-faint" />
          <input
            className="flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-faint"
            placeholder={`Filter ${fields.length} fields by name or id…`}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-[52px_0.75fr_128px_1.25fr_44px_44px_44px_32px] gap-2 border-b border-border bg-neutral-50 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint dark:bg-neutral-900/40">
        <span>ID</span>
        <span>Name</span>
        <span>Type</span>
        <span>Configuration</span>
        <span className="text-center">Req</span>
        <span className="text-center">Uniq</span>
        <span className="text-center" title="Show this column in Data Browser's table/list view">
          List
        </span>
        <span />
      </div>

      {fields.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-text-faint">No fields yet — add the table's first field below.</p>}
      {fields.length > 0 && visibleCustom.length === 0 && visibleSystem.length === 0 && (
        <p className="px-3 py-6 text-center text-[13px] text-text-faint">No fields match "{filterQuery}".</p>
      )}

      {visibleCustom.map(row)}

      {visibleSystem.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowSystem((s) => !s)}
            className="flex w-full cursor-pointer items-center gap-1.5 border-t border-border bg-neutral-50 px-3 py-2 text-left text-[12px] font-medium text-text-muted dark:bg-neutral-900/40"
          >
            {showSystem ? "▾" : "▸"} System fields ({visibleSystem.length})
          </button>
          {showSystem && visibleSystem.map(row)}
        </div>
      )}

      <div className="border-t border-border p-2.5">
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add}>
          Add field
        </Button>
      </div>
    </div>
  );
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
      <div className="flex items-center gap-1.5">
        {/* min-w-0 on each combobox is load-bearing, not decorative: a
            Combobox's own min-width is "auto", and its automatic-minimum-
            size never bottoms out at the inner input's min-w-0 the way a
            plain flex item would — measured at ~267px even when its flex
            parent was forced down to 80px. Without this, REFERENCE's two
            side-by-side comboboxes refuse to shrink, overflow this cell,
            and — since Combobox's root is `position: relative` — visually
            and functionally sit on TOP of the Req/Uniq/List checkboxes to
            its right (position:relative paints above static siblings
            regardless of DOM order), making them unclickable. */}
        <div className="min-w-0 flex-1">
          <LocalCombobox
            value={field.target ?? ""}
            onChange={(v) => onChange({ target: v ?? undefined, target_field: undefined })}
            options={tableOptions}
            placeholder={isTableType ? "child table…" : "target table…"}
          />
        </div>
        {t === "REFERENCE" && (
          <div className="min-w-0 flex-1">
            <TargetFieldPicker field={field} tableMeta={tableMeta} onChange={onChange} />
          </div>
        )}
      </div>
    );
  }

  if (usesOptions(t)) {
    return <OptionsInput field={field} onChange={onChange} />;
  }

  if (usesDecimal(t)) {
    return (
      <div className="flex items-center gap-1.5">
        <TextInput
          className="!h-8"
          type="number"
          placeholder="precision"
          value={field.precision ?? ""}
          onChange={(e) => onChange({ precision: e.target.value ? Number(e.target.value) : undefined })}
        />
        <TextInput
          className="!h-8"
          type="number"
          placeholder="scale"
          value={field.scale ?? ""}
          onChange={(e) => onChange({ scale: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
    );
  }

  if (usesLength(t)) {
    return (
      <div className="flex items-center gap-1.5">
        <TextInput
          className="!h-8"
          type="number"
          placeholder="length"
          value={field.length ?? ""}
          onChange={(e) => onChange({ length: e.target.value ? Number(e.target.value) : undefined })}
        />
        <TextInput
          className="!h-8"
          placeholder="default"
          value={field.default != null ? String(field.default) : ""}
          onChange={(e) => onChange({ default: e.target.value || undefined })}
        />
      </div>
    );
  }

  return (
    <TextInput
      className="!h-8"
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
      className="!h-8"
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
