// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Tabs.d.ts) ── */
export interface TabItem { key: string; label: string; icon?: string; badge?: number; }
export interface TabsProps {
  tabs?: TabItem[];
  value?: string;
  onChange?: (key: string) => void;
  /** @default "underline" */
  variant?: "underline" | "segmented";
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
/** Controlled tab strip — underline (page) or segmented (filter). */


/**
 * AgniUI · Tabs
 * Controlled tab strip. tabs: [{key,label,icon?,badge?}]. Two looks:
 * variant="underline" (page tabs) | "segmented" (filter toggle).
 */
export function Tabs({
  tabs = [],
  value,
  onChange,
  variant = "underline",   // underline | segmented
  size = "md",
  style = {},
}: TabsProps) {
  const fs = size === "sm" ? "var(--text-sm)" : "var(--text-base)";

  if (variant === "segmented") {
    return (
      <div style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", ...style }}>
        {tabs.map((t) => {
          const on = value === t.key;
          return (
            <button key={t.key} type="button" onClick={() => onChange && onChange(t.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer",
                padding: "6px 14px", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: fs,
                fontWeight: "var(--fw-medium)", whiteSpace: "nowrap",
                background: on ? "var(--action-brand)" : "transparent", color: on ? "var(--text-on-brand)" : "var(--text-tertiary)",
                boxShadow: on ? "var(--shadow-xs)" : "none", transition: "background var(--dur-fast), color var(--dur-fast)",
              }}>
              {t.icon && <i className={"ph " + t.icon} style={{ fontSize: 16 }} />}
              {t.label}
              {t.badge != null && (
                <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-data)", fontWeight: "var(--fw-semibold)", lineHeight: 1, padding: "2px 6px", borderRadius: "var(--radius-full)", background: on ? "rgba(255,255,255,0.22)" : "var(--surface-page)", color: on ? "var(--text-on-brand)" : "var(--text-tertiary)" }}>{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-subtle)", ...style }}>
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <button key={t.key} type="button" onClick={() => onChange && onChange(t.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, border: "none", cursor: "pointer",
              background: "transparent", padding: "10px 12px", marginBottom: -1,
              borderBottom: `2px solid ${on ? "var(--action-brand)" : "transparent"}`,
              fontFamily: "var(--font-sans)", fontSize: fs, fontWeight: on ? "var(--fw-semibold)" : "var(--fw-medium)",
              color: on ? "var(--text-brand)" : "var(--text-tertiary)", whiteSpace: "nowrap",
              transition: "color var(--dur-fast), border-color var(--dur-fast)",
            }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = "var(--text-tertiary)"; }}>
            {t.icon && <i className={"ph " + t.icon} style={{ fontSize: 16 }} />}
            {t.label}
            {t.badge != null && (
              <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-data)", fontWeight: "var(--fw-semibold)", padding: "1px 6px", borderRadius: "var(--radius-full)", background: on ? "var(--surface-brand-soft)" : "var(--surface-sunken)", color: on ? "var(--text-brand)" : "var(--text-tertiary)" }}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
