import type { SchemaField } from "../../api/types";
import { Button } from "../../components/Button";
import { IconPlus } from "../../layout/icons";
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
  tables: string[];
  onChange: (fields: SchemaField[]) => void;
}

export function FieldEditor({ fields, system, tables, onChange }: Props) {
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
        <span style={{ flex: 1.3 }}>Configuration</span>
        <span style={{ width: 64, textAlign: "center" }}>Req</span>
        <span style={{ width: 64, textAlign: "center" }}>Uniq</span>
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
            onChange={(e) => update(i, { type: e.target.value })}
          >
            {typesFor(system).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="fields__config">
            <FieldConfig field={f} tables={tables} onChange={(patch) => update(i, patch)} />
          </div>

          <label className="fields__check" style={{ width: 64 }}>
            <input
              type="checkbox"
              checked={!!f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
          </label>
          <label className="fields__check" style={{ width: 64 }}>
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
  tables,
  onChange,
}: {
  field: SchemaField;
  tables: string[];
  onChange: (patch: Partial<SchemaField>) => void;
}) {
  const t = field.type;

  if (usesReference(t)) {
    return (
      <div className="config-inline">
        <input
          className="input"
          list="admin-table-list"
          placeholder="target table"
          value={field.target ?? ""}
          onChange={(e) => onChange({ target: e.target.value })}
        />
        {t === "REFERENCE" && (
          <input
            className="input"
            placeholder="target_field (default id)"
            value={field.target_field ?? ""}
            onChange={(e) => onChange({ target_field: e.target.value || undefined })}
          />
        )}
        <datalist id="admin-table-list">
          {tables.map((tbl) => (
            <option key={tbl} value={tbl} />
          ))}
        </datalist>
      </div>
    );
  }

  if (usesOptions(t)) {
    return (
      <input
        className="input"
        placeholder="option1, option2, …"
        value={(field.options ?? []).join(", ")}
        onChange={(e) =>
          onChange({
            options: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      />
    );
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
