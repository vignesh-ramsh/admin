// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Banner.d.ts) ── */
export interface BannerProps {
  tone?: "info" | "success" | "warning" | "error" | "brand";
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: (() => void) | null;
  /** Override the phosphor icon class. */
  icon?: string;
  style?: React.CSSProperties;
}
/** Full-width inline alert banner. */


/**
 * AgniUI · Banner
 * Full-width inline alert for page/section context. tone: info|success|warning|error|brand.
 */
const TONES = {
  info:    { icon: "ph-info",         fg: "var(--status-info)",    bg: "var(--status-info-soft)" },
  success: { icon: "ph-check-circle", fg: "var(--status-success)", bg: "var(--status-success-soft)" },
  warning: { icon: "ph-warning",      fg: "var(--status-warning)", bg: "var(--status-warning-soft)" },
  error:   { icon: "ph-x-circle",     fg: "var(--status-error)",   bg: "var(--status-error-soft)" },
  brand:   { icon: "ph-rocket",       fg: "var(--text-brand)",     bg: "var(--surface-brand-soft)" },
};

export function Banner({ tone = "info", title, children, action = null, onDismiss = null, icon, style = {} }: BannerProps) {
  const t = TONES[tone] || TONES.info;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
      background: t.bg, border: `1px solid ${t.fg}`, borderRadius: "var(--radius-md)",
      ...style,
    }}>
      <i className={"ph-fill " + (icon || t.icon)} style={{ fontSize: 19, color: t.fg, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text-primary)" }}>{title}</div>}
        {children && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: title ? 2 : 0 }}>{children}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      {onDismiss && <button type="button" onClick={onDismiss} style={{ width: 24, height: 24, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 15, flexShrink: 0 }}><i className="ph ph-x" /></button>}
    </div>
  );
}
