// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in EmptyState.d.ts) ── */
export interface EmptyStateProps {
  /** Phosphor icon class. @default "ph-tray" */
  icon?: string;
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** Primary action (what creates the first item). */
  action?: React.ReactNode;
  compact?: boolean;
  style?: React.CSSProperties;
}
/** Empty-state block — text + action, never a bare illustration. */


/**
 * AgniUI · EmptyState
 * Explains why a region is empty and what creates the first item (Section 8).
 * Never a bare illustration — always carries text + a primary action.
 */
export function EmptyState({ icon = "ph-tray", title = "Nothing here yet", message, action = null, compact = false, style = {} }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", gap: 14, padding: compact ? "36px 24px" : "64px 40px",
      border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)",
      background: "var(--surface-card)", ...style,
    }}>
      <div style={{ width: compact ? 48 : 60, height: compact ? 48 : 60, borderRadius: "50%", background: "var(--surface-brand-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <i className={"ph " + icon} style={{ fontSize: compact ? 24 : 30, color: "var(--text-brand)" }} />
      </div>
      <div>
        <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--fw-semibold)", color: "var(--text-primary)" }}>{title}</div>
        {message && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", marginTop: 4, maxWidth: 360 }}>{message}</div>}
      </div>
      {action}
    </div>
  );
}
