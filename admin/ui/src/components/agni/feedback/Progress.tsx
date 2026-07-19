// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Progress.d.ts) ── */
export interface ProgressProps {
  /** 0–100 */
  value?: number;
  indeterminate?: boolean;
  tone?: "brand" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md" | "lg";
  label?: React.ReactNode;
  showValue?: boolean;
  style?: React.CSSProperties;
}
/** Linear progress / loading bar. */


/**
 * AgniUI · Progress
 * Linear determinate/indeterminate bar. value 0–100. tone matches status set.
 */
const C = { brand: "var(--action-brand)", success: "var(--status-success)", warning: "var(--status-warning)", error: "var(--status-error)", info: "var(--status-info)" };

export function Progress({ value = 0, indeterminate = false, tone = "brand", size = "md", label = null, showValue = false, style = {} }: ProgressProps) {
  const h = size === "sm" ? 4 : size === "lg" ? 10 : 6;
  const color = C[tone] || C.brand;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ width: "100%", ...style }}>
      {(label || showValue) && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "var(--text-xs)" }}>
          {label && <span style={{ color: "var(--text-secondary)", fontWeight: "var(--fw-medium)" }}>{label}</span>}
          {showValue && <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-data)" }}>{pct}%</span>}
        </div>
      )}
      <div style={{ height: h, width: "100%", background: "var(--surface-sunken)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
        {indeterminate
          ? <div style={{ height: "100%", width: "40%", background: color, borderRadius: "var(--radius-full)", animation: "agni-prog 1.3s var(--ease-standard) infinite" }} />
          : <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: "var(--radius-full)", transition: "width var(--dur-normal) var(--ease-standard)" }} />}
      </div>
      <style>{`@keyframes agni-prog{0%{margin-left:-40%}100%{margin-left:100%}}`}</style>
    </div>
  );
}
