import { useState } from "react";
import type { SchemaField, TableMeta } from "../../api/types";
import { Button } from "../../components/Button";
import { Combobox, type ComboOption } from "../../components/Combobox";
import { IconPlus } from "../../layout/icons";
import { useTargetFieldOptions } from "./useTargetFields";
import {
  typesFor,
  usesLength,
  usesOptions,
  usesReference,
  usesDecimal,
  nextFieldId,
  blankField,
} from "./fieldTypes";

interface Props {
  fields: SchemaField[];
  system: boolean;
  tableMeta: TableMeta[];
  onChange: (fields: SchemaField[]) => void;
}

export function FieldEditor({ fields, system, tableMeta, onChange }: Props) {
  const update = (i: number, patch: Partial<SchemaField>) => {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => onChange([...fields, blankField(nextFieldId(fields))]);

  return (
    <div className="fields">
      <div className="fields__head">
        <span style={{ width: 52 }}>ID</span>
        <span style={{ flex: 1 }}>Name</span>
        <span style={{ width: 130 }}>Type</span>
        <span style={{ flex: 1.5 }}>Configuration</span>
        <span style={{ width: 56, textAlign: "center" }}>Req</span>
        <span style={{ width: 56, textAlign: "center" }}>Uniq</span>
        <span style={{ width: 34 }} />
      </div>

      {fields.length === 0 && (
        <div className="fields__empty">No fields yet — add the table’s first field below.</div>
      )}

      {fields.map((f, i) => (
        <div className="fields__row" key={f.id || i}>
          <span className="fields__id mono">{f.id}</span>

          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="field_name"
            value={f.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />

          <select
            className="select"
            style={{ width: 130 }}
            value={f.type}
            onChange={(e) =>
              // Changing type invalidates any type-specific config that was
              // set for the previous type.
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
          </select>

          <div className="fields__config">
            <FieldConfig field={f} tableMeta={tableMeta} onChange={(patch) => update(i, patch)} />
          </div>

          <label className="fields__check" style={{ width: 56 }}>
            <input
              type="checkbox"
              checked={!!f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
          </label>
          <label className="fields__check" style={{ width: 56 }}>
            <input
              type="checkbox"
              checked={!!f.unique}
              onChange={(e) => update(i, { unique: e.target.checked })}
            />
          </label>

          <button className="fields__remove" onClick={() => remove(i)} title="Remove field" aria-label="Remove field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
      ))}

      <div className="fields__add">
        <Button variant="secondary" size="sm" onClick={add}>
          <IconPlus /> Add field
        </Button>
      </div>
    </div>
  );
}

function FieldConfig({
  field,
  tableMeta,
  onChange,
}: {
  field: SchemaField;
  tableMeta: TableMeta[];
  onChange: (patch: Partial<SchemaField>) => void;
}) {
  const t = field.type;

  if (usesReference(t)) {
    const isTableType = t === "TABLE";
    // A TABLE field generates/points at a CHILD table — psqldb requires the
    // target to be a "child": true schema, so only those are offered.
    const candidates = isTableType ? tableMeta.filter((m) => m.child) : tableMeta;
    // The VALUE is the schema file stem, never the physical table name:
    // resolve_ref_targets looks targets up by stem, so storing "department"
    // instead of "Department" is unresolvable and breaks every query.
    const tableOptions: ComboOption[] = candidates.map((m) => ({
      value: m.name,
      label: m.name,
      // Plugin (plus any table trait) as the small eyebrow under the name.
      sublabel: [m.plugin, m.child ? "child" : m.system ? "system" : null]
        .filter(Boolean)
        .join(" · "),
    }));

    return (
      <div className="config-inline">
        <Combobox
          value={field.target ?? ""}
          // Changing the target invalidates target_field — it named a
          // column on the previous table.
          onChange={(v) => onChange({ target: v, target_field: undefined })}
          options={tableOptions}
          placeholder={isTableType ? "child table…" : "target table…"}
          emptyText={isTableType ? "No child tables defined" : "No tables"}
        />
        {t === "REFERENCE" && (
          <TargetFieldPicker field={field} tableMeta={tableMeta} onChange={onChange} />
        )}
      </div>
    );
  }

  if (usesOptions(t)) {
    return <OptionsInput field={field} onChange={onChange} />;
  }

  if (usesDecimal(t)) {
    return (
      <div className="config-inline">
        <input
          className="input"
          type="number"
          placeholder="precision"
          value={field.precision ?? ""}
          onChange={(e) => onChange({ precision: e.target.value ? Number(e.target.value) : undefined })}
        />
        <input
          className="input"
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
      <div className="config-inline">
        <input
          className="input"
          type="number"
          placeholder="length"
          value={field.length ?? ""}
          onChange={(e) => onChange({ length: e.target.value ? Number(e.target.value) : undefined })}
        />
        <input
          className="input"
          placeholder="default"
          value={field.default != null ? String(field.default) : ""}
          onChange={(e) => onChange({ default: e.target.value || undefined })}
        />
      </div>
    );
  }

  return (
    <input
      className="input"
      placeholder="default (optional)"
      value={field.default != null ? String(field.default) : ""}
      onChange={(e) => onChange({ default: e.target.value || undefined })}
    />
  );
}

/* A SELECT/etc. field's `options` array, edited as one comma-separated
   text input. The input's own displayed value must be its OWN local
   typed text, never re-derived from the parsed-then-rejoined `options`
   array — binding value={(field.options ?? []).join(", ")} meant every
   keystroke immediately round-tripped through split(",") -> filter
   (Boolean) -> join(", "), which silently drops a just-typed trailing
   comma (it parses to a trailing empty segment, filtered out) and snaps
   the input back to its pre-comma text on the very next render. Visibly:
   typing "," appeared to do nothing at all. Local state breaks that
   loop — the field only ever sees the fully-parsed array via onChange,
   never bounces back into what's on screen. */
function OptionsInput({
  field,
  onChange,
}: {
  field: SchemaField;
  onChange: (patch: Partial<SchemaField>) => void;
}) {
  const [text, setText] = useState((field.options ?? []).join(", "));

  return (
    <input
      className="input"
      placeholder="option1, option2, …"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange({
          options: e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
    />
  );
}

function TargetFieldPicker({
  field,
  tableMeta,
  onChange,
}: {
  field: SchemaField;
  tableMeta: TableMeta[];
  onChange: (patch: Partial<SchemaField>) => void;
}) {
  // field.target is a schema file stem; get_table_schema takes the PHYSICAL
  // table name — so resolve one to the other before looking up its fields.
  const physical = tableMeta.find((m) => m.name === field.target)?.table;
  const { options, loading } = useTargetFieldOptions(physical);
  return (
    <Combobox
      value={field.target_field ?? ""}
      onChange={(v) => onChange({ target_field: v || undefined })}
      options={options}
      disabled={!field.target}
      placeholder={
        !field.target ? "pick a table first" : loading ? "loading…" : "target field (default: id)"
      }
      emptyText="No unique fields on that table"
    />
  );
}
