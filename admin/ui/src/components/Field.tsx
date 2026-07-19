import {
  Children,
  isValidElement,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { Input as AgniInput } from "./agni/forms/Input";
import { Select as AgniSelect } from "./agni/forms/Select";
import { Textarea as AgniTextarea } from "./agni/forms/Textarea";

/**
 * Thin adapters over the copied AgniUI form components (agni/forms/) —
 * every call site in this app still passes a native event-based onChange
 * and (for Select) plain <option> children, so nothing else needed to
 * change; the real rendering/interaction is AgniUI's own component.
 */

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label && <label className="field__label">{label}</label>}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

export function Input({
  value,
  onChange,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <AgniInput
      value={value as string}
      onChange={(_v, e) => onChange && e && onChange(e)}
      {...(rest as any)}
    />
  );
}

export function Textarea({
  value,
  onChange,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <AgniTextarea
      value={value as string}
      onChange={(_v, e) => onChange && e && onChange(e)}
      {...(rest as any)}
    />
  );
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  style,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child: any) => ({
      value: String(child.props.value ?? ""),
      label: String(child.props.children ?? child.props.value ?? ""),
    }));
  return (
    <AgniSelect
      value={value as string}
      options={options}
      disabled={disabled}
      style={style}
      onChange={(v) => {
        if (!onChange) return;
        // Native call sites read e.target.value — a plain object with that
        // shape is enough, nothing here reads any other event field.
        onChange({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>);
      }}
    />
  );
}
