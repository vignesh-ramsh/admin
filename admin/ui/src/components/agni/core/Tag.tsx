// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState } from "react";

/* ── Types (mirrored in Tag.d.ts) ── */
export interface TagProps {
  children?: React.ReactNode;
  /** Accent hex for the leading dot. */
  color?: string | null;
  dot?: boolean;
  /** When provided, renders a close button. */
  onRemove?: (() => void) | null;
  style?: React.CSSProperties;
}
/** Removable filter / input chip. */


/**
 * AgniUI · Tag
 * Removable input chip / filter token. Optional leading dot + close button.
 */
export function Tag({
  children,
  color = null,        // optional accent hex; defaults to neutral
  dot = false,
  onRemove = null,
  style = {},
  ...rest
}: TagProps) {
  const [hover, setHover] = useState(false);
  const accent = color || "var(--text-secondary)";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 6px 3px 9px",
        fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", fontWeight: "var(--fw-medium)",
        color: "var(--text-secondary)", background: "var(--surface-soft)",
        border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
        lineHeight: 1, whiteSpace: "nowrap",
        ...(onRemove ? {} : { paddingRight: 9 }),
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, flexShrink: 0 }} />}
      {children}
      {onRemove && (
        <button
          type="button" onClick={onRemove}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 16, height: 16, marginLeft: 1, padding: 0, border: "none", cursor: "pointer",
            borderRadius: "var(--radius-xs)", fontSize: 12,
            background: hover ? "var(--state-press-overlay)" : "transparent",
            color: hover ? "var(--text-primary)" : "var(--text-tertiary)",
            transition: "all var(--dur-fast)",
          }}
        >
          <i className="ph ph-x" />
        </button>
      )}
    </span>
  );
}
