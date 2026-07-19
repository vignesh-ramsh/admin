// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Radio.d.ts) ── */
export interface RadioProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  /** Control scale — 18px / 16px dot (matches Checkbox/Switch sm·md). @default "md" */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
export interface RadioGroupProps {
  value?: string;
  onChange?: (value: string) => void;
  options?: ({ value: string; label: string; disabled?: boolean } | string)[];
  direction?: "row" | "column";
  gap?: number;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
/** Single radio control. */
/** Managed group of radios. */


/**
 * AgniUI · Radio / RadioGroup
 * RadioGroup manages selection; pass options [{value,label}] or render <Radio>.
 */
export function Radio({ checked = false, onChange, label = null, disabled = false, size = "md", style = {}, ...rest }: RadioProps) {
  const d = size === "sm" ? 16 : 18;
  const dot = size === "sm" ? 8 : 9;
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1, userSelect: "none", ...style,
      }}
      {...rest}
    >
      <span
        onClick={() => !disabled && onChange && onChange(true)}
        style={{
          width: d, height: d, flexShrink: 0, borderRadius: "50%",
          border: `1.5px solid ${checked ? "var(--action-brand)" : "var(--border-strong)"}`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "border-color var(--dur-fast)",
        }}
      >
        {checked && <span style={{ width: dot, height: dot, borderRadius: "50%", background: "var(--action-brand)" }} />}
      </span>
      {label && <span style={{ fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)", color: "var(--text-primary)" }}>{label}</span>}
    </label>
  );
}

export function RadioGroup({ value, onChange, options = [], direction = "column", gap = 10, size = "md", style = {} }: RadioGroupProps) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div style={{ display: "flex", flexDirection: direction, gap, ...style }}>
      {opts.map((o) => (
        <Radio key={o.value} checked={value === o.value} onChange={() => onChange && onChange(o.value)} label={o.label} disabled={o.disabled} size={size} />
      ))}
    </div>
  );
}
