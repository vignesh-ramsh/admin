// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState, useRef, useEffect } from "react";

/* ── Types (mirrored in Select.d.ts) ── */
export interface SelectOption { value: string; label: string; }
export interface SelectProps {
  value?: string;
  onChange?: (value: string) => void;
  /** [{value,label}] or string[] */
  options?: (SelectOption | string)[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Error state — red border + error focus ring (matches Input/SearchSelect). */
  error?: boolean;
  style?: React.CSSProperties;
}
/** Custom dropdown select with themed menu. */


/**
 * AgniUI · Select
 * Lightweight custom dropdown. options: [{value,label}] or string[].
 * onChange receives the value.
 */
export function Select({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  size = "md",
  disabled = false,
  error = false,
  style = {},
  ...rest
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const current = opts.find((o) => o.value === value);

  const sizes = { sm: { h: 32, fs: "var(--text-sm)", px: 10 }, md: { h: 38, fs: "var(--text-base)", px: 12 }, lg: { h: 44, fs: "var(--text-md)", px: 14 } };
  const s = sizes[size] || sizes.md;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", ...style }} {...rest}>
      <button
        type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", height: s.h, padding: `0 ${s.px}px`,
          background: disabled ? "var(--surface-soft)" : "var(--surface-card)",
          border: `1px solid ${error ? "var(--status-error)" : open ? "var(--border-brand)" : "var(--border-default)"}`,
          borderRadius: "var(--radius-md)", cursor: disabled ? "not-allowed" : "pointer",
          boxShadow: open ? (error ? "var(--focus-ring-error)" : "var(--focus-ring)") : "none",
          opacity: disabled ? "var(--state-disabled-opacity)" : 1,
          fontFamily: "var(--font-sans)", fontSize: s.fs,
          color: current ? "var(--text-primary)" : "var(--text-tertiary)",
          transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? current.label : placeholder}</span>
        <i className={open ? "ph ph-caret-up" : "ph ph-caret-down"} style={{ fontSize: 14, color: "var(--text-tertiary)", flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
          background: "var(--surface-card)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 4,
          maxHeight: 260, overflowY: "auto",
        }}>
          {opts.map((o) => {
            const sel = o.value === value;
            return (
              <button
                key={o.value} type="button"
                onClick={() => { onChange && onChange(o.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  width: "100%", padding: "8px 10px", border: "none", cursor: "pointer",
                  borderRadius: "var(--radius-sm)", textAlign: "left",
                  background: sel ? "var(--surface-brand-soft)" : "transparent",
                  color: sel ? "var(--text-brand)" : "var(--text-primary)",
                  fontFamily: "var(--font-sans)", fontSize: s.fs, fontWeight: sel ? "var(--fw-medium)" : "var(--fw-regular)",
                }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "var(--surface-soft)"; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}
              >
                {o.label}
                {sel && <i className="ph ph-check" style={{ fontSize: 14 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
