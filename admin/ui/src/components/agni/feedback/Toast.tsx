// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Toast.d.ts) ── */
export interface ToastProps {
  tone?: "info" | "success" | "warning" | "error";
  title?: React.ReactNode;
  message?: React.ReactNode;
  onClose?: () => void;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
/** Inline notification toast. */


/**
 * AgniUI · Toast
 * Inline notification surface. tone: info | success | warning | error.
 * Stateless presentational unit — drive visibility from your own store.
 */
const TONES = {
  info:    { icon: "ph-info",          fg: "var(--status-info)",    bg: "var(--status-info-soft)",    bdr: "var(--status-info)" },
  success: { icon: "ph-check-circle",  fg: "var(--status-success)", bg: "var(--status-success-soft)", bdr: "var(--status-success)" },
  warning: { icon: "ph-warning",       fg: "var(--status-warning)", bg: "var(--status-warning-soft)", bdr: "var(--status-warning)" },
  error:   { icon: "ph-x-circle",      fg: "var(--status-error)",   bg: "var(--status-error-soft)",   bdr: "var(--status-error)" },
};

export function Toast({ tone = "info", title, message, onClose, action = null, style = {} }: ToastProps) {
  const t = TONES[tone] || TONES.info;
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, width: 360, maxWidth: "100%",
        padding: "12px 14px", background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)", borderLeft: `3px solid ${t.bdr}`,
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
        animation: "agni-toast-in var(--dur-normal) var(--ease-spring)", ...style,
      }}
    >
      <span style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", flexShrink: 0, background: t.bg, color: t.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>
        <i className={"ph-fill " + t.icon} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text-primary)" }}>{title}</div>}
        {message && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 2 }}>{message}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} style={{ width: 24, height: 24, flexShrink: 0, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 15, borderRadius: "var(--radius-xs)" }}>
          <i className="ph ph-x" />
        </button>
      )}
      <style>{`@keyframes agni-toast-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }`}</style>
    </div>
  );
}
