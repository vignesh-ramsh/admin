// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Switch.d.ts) ── */
export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
/** Boolean toggle switch. */


/**
 * AgniUI · Switch
 * Toggle control. onChange receives the next boolean.
 */
export function Switch({
  checked = false,
  onChange,
  label = null,
  disabled = false,
  size = "md",     // sm | md
  style = {},
  ...rest
}: SwitchProps) {
  const dims = size === "sm" ? { w: 32, h: 18, knob: 14 } : { w: 40, h: 22, knob: 18 };
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1,
        userSelect: "none", ...style,
      }}
      {...rest}
    >
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          position: "relative", width: dims.w, height: dims.h, flexShrink: 0,
          borderRadius: "var(--radius-full)",
          background: checked ? "var(--action-brand)" : "var(--border-strong)",
          transition: "background var(--dur-normal) var(--ease-standard)",
        }}
      >
        <span style={{
          position: "absolute", top: (dims.h - dims.knob) / 2,
          left: checked ? dims.w - dims.knob - 2 : 2,
          width: dims.knob, height: dims.knob, borderRadius: "50%",
          background: "#fff", boxShadow: "var(--shadow-sm)",
          transition: "left var(--dur-normal) var(--ease-standard)",
        }} />
      </span>
      {label && <span style={{ fontSize: "var(--text-base)", color: "var(--text-primary)" }}>{label}</span>}
    </label>
  );
}
