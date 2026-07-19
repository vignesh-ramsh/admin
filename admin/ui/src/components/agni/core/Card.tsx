// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Card.d.ts) ── */
export interface CardProps {
  children?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned header actions. */
  actions?: React.ReactNode;
  /** Pad the body. @default true */
  pad?: boolean;
  /** Hover elevation + pointer cursor. */
  interactive?: boolean;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}
/** Surface container with optional header + actions. */


/**
 * AgniUI · Card
 * Surface container. The fundamental pane unit across desks.
 * Optional header (title + actions) and padded/flush body.
 */
export function Card({
  children,
  title = null,
  subtitle = null,
  actions = null,
  pad = true,
  interactive = false,
  style = {},
  bodyStyle = {},
  ...rest
}: CardProps) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-xs)",
        overflow: "hidden",
        transition: interactive ? "box-shadow var(--dur-fast), border-color var(--dur-fast)" : undefined,
        ...(interactive ? { cursor: "pointer" } : {}),
        ...style,
      }}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.borderColor = "var(--border-default)"; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.boxShadow = "var(--shadow-xs)"; e.currentTarget.style.borderColor = "var(--border-subtle)"; } : undefined}
      {...rest}
    >
      {(title || actions) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)",
        }}>
          <div style={{ minWidth: 0 }}>
            {title && <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--fw-semibold)", color: "var(--text-primary)" }}>{title}</div>}
            {subtitle && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", marginTop: 2 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: pad ? 16 : 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}
