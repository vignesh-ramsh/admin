// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in AuditTrail.d.ts) ── */
export interface AuditEntry {
  actor: string;
  action: React.ReactNode;
  ts: string;
  detail?: React.ReactNode;
  icon?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
}
export interface AuditTrailProps {
  entries?: AuditEntry[];
  style?: React.CSSProperties;
}
/** Read-only chronological activity / audit log. */


/**
 * AgniUI · AuditTrail
 * Chronological activity log. entries: [{actor, action, ts, detail?, icon?, tone?}].
 * Read-only timeline for record history / compliance.
 */
const TONE = { default: "var(--text-tertiary)", success: "var(--status-success)", warning: "var(--status-warning)", error: "var(--status-error)", info: "var(--status-info)" };

export function AuditTrail({ entries = [], style = {} }: AuditTrailProps) {
  return (
    <div style={{ ...style }}>
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        const c = TONE[e.tone] || TONE.default;
        return (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface-soft)", border: "1px solid var(--border-subtle)", color: c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                <i className={"ph " + (e.icon || "ph-circle")} />
              </span>
              {!last && <span style={{ width: 2, flex: 1, minHeight: 18, background: "var(--border-subtle)", margin: "2px 0" }} />}
            </div>
            <div style={{ paddingBottom: last ? 0 : 16, minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                <strong style={{ fontWeight: "var(--fw-semibold)" }}>{e.actor}</strong>{" "}
                <span style={{ color: "var(--text-secondary)" }}>{e.action}</span>
              </div>
              {e.detail && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", marginTop: 2 }}>{e.detail}</div>}
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-data)", marginTop: 3 }}>{e.ts}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
