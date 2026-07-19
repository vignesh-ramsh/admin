// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState } from "react";

/* ── Types (mirrored in Textarea.d.ts) ── */
export interface TextareaProps {
  value?: string;
  onChange?: (value: string, e?: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  error?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}
/** Multi-line text field. */


/** AgniUI · Textarea — multi-line text field. onChange receives the value. */
export function Textarea({ value, onChange, placeholder = "", rows = 4, error = false, disabled = false, style = {}, ...rest }: TextareaProps) {
  const [focus, setFocus] = useState(false);
  const bc = error ? "var(--input-bdr-error)" : focus ? "var(--input-bdr-focus)" : "var(--input-bdr)";
  return (
    <textarea
      value={value} placeholder={placeholder} rows={rows} disabled={disabled}
      onChange={(e) => onChange && onChange(e.target.value, e)}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: "100%", padding: "10px 12px", resize: "vertical",
        fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", lineHeight: "var(--leading-normal)",
        color: "var(--text-primary)", background: disabled ? "var(--input-bg-disabled)" : "var(--input-bg)",
        border: `1px solid ${bc}`, borderRadius: "var(--radius-md)", outline: "none",
        boxShadow: focus ? (error ? "var(--focus-ring-error)" : "var(--focus-ring)") : "none",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1,
        transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)", ...style,
      }}
      {...rest}
    />
  );
}
