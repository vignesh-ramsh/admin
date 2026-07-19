// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState } from "react";

/* ── Types (mirrored in Input.d.ts) ── */
export interface InputProps {
  value?: string;
  /** Receives the raw value string (and the event as 2nd arg). */
  onChange?: (value: string, e?: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  error?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}
/** Text field with prefix/suffix icons + focus ring. */


/**
 * AgniUI · Input
 * Text field with optional prefix/suffix icon, sizes, error + disabled states.
 * NOTE: onChange receives the raw VALUE (string), not the event.
 */
export function Input({
  value,
  onChange,
  placeholder = "",
  type = "text",
  size = "md",          // sm | md | lg
  prefixIcon = null,
  suffixIcon = null,
  error = false,
  disabled = false,
  style = {},
  inputStyle = {},
  ...rest
}: InputProps) {
  const [focus, setFocus] = useState(false);
  const sizes = { sm: { h: 32, fs: "var(--text-sm)", px: 10 }, md: { h: 38, fs: "var(--text-base)", px: 12 }, lg: { h: 44, fs: "var(--text-md)", px: 14 } };
  const s = sizes[size] || sizes.md;

  const borderColor = error
    ? "var(--status-error)"
    : focus ? "var(--border-brand)" : "var(--border-default)";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        height: s.h, padding: `0 ${s.px}px`,
        background: disabled ? "var(--surface-soft)" : "var(--surface-card)",
        border: `1px solid ${borderColor}`, borderRadius: "var(--radius-md)",
        boxShadow: focus ? (error ? "var(--focus-ring-error)" : "var(--focus-ring)") : "none",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1,
        transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
        ...style,
      }}
    >
      {prefixIcon && <span style={{ color: "var(--text-tertiary)", fontSize: 17, display: "inline-flex", flexShrink: 0 }}>{prefixIcon}</span>}
      <input
        type={type} value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value, e)}
        data-agni-input=""
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none",
          background: "transparent", fontFamily: "var(--font-sans)", fontSize: s.fs,
          color: "var(--text-primary)", ...inputStyle,
        }}
        {...rest}
      />
      {suffixIcon && <span style={{ color: "var(--text-tertiary)", fontSize: 17, display: "inline-flex", flexShrink: 0 }}>{suffixIcon}</span>}
    </div>
  );
}
