// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Pagination.d.ts) ── */
export interface PaginationProps {
  /** 1-based current page. */
  page?: number;
  pageCount?: number;
  onChange?: (page: number) => void;
  /** e.g. "1–25 of 312". */
  totalLabel?: React.ReactNode;
  style?: React.CSSProperties;
}
/** Windowed pager with prev/next. */


/**
 * AgniUI · Pagination
 * page (1-based), pageCount, onChange. Shows windowed page buttons + prev/next.
 */
export function Pagination({ page = 1, pageCount = 1, onChange, totalLabel = null, style = {} }: PaginationProps) {
  const go = (p) => { if (p >= 1 && p <= pageCount && p !== page) onChange && onChange(p); };
  const pages = [];
  const win = 1;
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - win && i <= page + win)) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  const btn = (active) => ({
    minWidth: 32, height: 32, padding: "0 8px", border: "1px solid " + (active ? "var(--border-brand)" : "var(--border-default)"),
    borderRadius: "var(--radius-md)", background: active ? "var(--surface-brand-soft)" : "var(--surface-card)",
    color: active ? "var(--text-brand)" : "var(--text-secondary)", fontFamily: "var(--font-data)", fontSize: "var(--text-sm)",
    fontWeight: active ? "var(--fw-semibold)" : "var(--fw-regular)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, ...style }}>
      {totalLabel && <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>{totalLabel}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} style={{ ...btn(false), opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}><i className="ph ph-caret-left" /></button>
        {pages.map((p, i) => p === "…"
          ? <span key={"e" + i} style={{ color: "var(--text-tertiary)", padding: "0 2px" }}>…</span>
          : <button key={p} type="button" onClick={() => go(p)} style={btn(p === page)}>{p}</button>)}
        <button type="button" onClick={() => go(page + 1)} disabled={page >= pageCount} style={{ ...btn(false), opacity: page >= pageCount ? 0.4 : 1, cursor: page >= pageCount ? "not-allowed" : "pointer" }}><i className="ph ph-caret-right" /></button>
      </div>
    </div>
  );
}
