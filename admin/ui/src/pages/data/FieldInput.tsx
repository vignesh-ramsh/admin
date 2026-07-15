import type { FieldMeta } from "../../api/types";
import { ReferencePicker } from "./ReferencePicker";

/* One input per canonical field type (docs/arc.MD §3.9). Values are held
   as strings (or boolean) and sent as-is — admin's own _coerce.py turns
   them into the real Python/DB types, so the form never has to guess.

   DATETIME note: values are displayed and submitted as UTC wall time
   (the stored value sliced to YYYY-MM-DDTHH:mm); the server treats a naive
   datetime as UTC, so the round-trip doesn't drift. */

interface Props {
  field: FieldMeta;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  disabled?: boolean;
}

export function FieldInput({ field, value, onChange, disabled }: Props) {
  const t = field.type;
  const common = { disabled, className: "input" as const };

  if (t === "REFERENCE") {
    return (
      <ReferencePicker
        field={field}
        value={String(value ?? "")}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (t === "BOOLEAN") {
    return (
      <label className="bool-input">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="muted">{value === true || value === "true" ? "True" : "False"}</span>
      </label>
    );
  }

  if (t === "SELECT") {
    return (
      <select
        className="select"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">— none —</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (t === "TEXT" || t === "JSON") {
    return (
      <textarea
        className="textarea mono"
        rows={t === "JSON" ? 5 : 3}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={t === "JSON" ? '{ "key": "value" }' : undefined}
      />
    );
  }

  const typeAttr =
    t === "INT" || t === "FLOAT" || t === "DECIMAL"
      ? "number"
      : t === "DATE"
        ? "date"
        : t === "TIME"
          ? "time"
          : t === "DATETIME"
            ? "datetime-local"
            : t === "EMAIL"
              ? "email"
              : "text";

  return (
    <input
      {...common}
      type={typeAttr}
      step={t === "FLOAT" || t === "DECIMAL" ? "any" : undefined}
      maxLength={field.length ?? undefined}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholderFor(field)}
    />
  );
}

function placeholderFor(field: FieldMeta): string | undefined {
  if (field.type === "REFERENCE") {
    return field.target_field
      ? `${field.target}.${field.target_field}`
      : `${field.target} id (uuid)`;
  }
  if (field.type === "PHONE") return "+1 555 123 4567";
  return undefined;
}
