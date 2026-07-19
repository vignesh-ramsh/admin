// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Checkbox.d.ts) ── */
export interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
/** Controlled checkbox with optional label + indeterminate state. */


/**
 * AgniUI · Checkbox
 * Controlled checkbox with label. Supports indeterminate + disabled.
 */
export function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  label = null,
  disabled = false,
  size = "md",       // sm | md
  style = {},
  ...rest
}: CheckboxProps) {
  const d = size === "sm" ? 16 : 18;
  const on = checked || indeterminate;
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1,
        userSelect: "none", ...style,
      }}
      {...rest}
    >
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          width: d, height: d, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: "var(--radius-xs)",
          border: `1.5px solid ${on ? "var(--action-brand)" : "var(--border-strong)"}`,
          background: on ? "var(--action-brand)" : "var(--surface-card)",
          color: "var(--text-on-brand)", fontSize: d - 5,
          transition: "background var(--dur-fast), border-color var(--dur-fast)",
        }}
      >
        {indeterminate ? <i className="ph-bold ph-minus" /> : checked ? <i className="ph-bold ph-check" /> : null}
      </span>
      {label && <span style={{ fontSize: "var(--text-base)", color: "var(--text-primary)" }}>{label}</span>}
    </label>
  );
}
