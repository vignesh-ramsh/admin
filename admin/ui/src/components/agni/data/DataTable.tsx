// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState, useMemo } from "react";

/* ── Types (mirrored in DataTable.d.ts) ── */
export interface DataColumn {
  key: string;
  label: React.ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  /** Custom cell renderer: (value, row) => node. */
  render?: (value: any, row: any) => React.ReactNode;
  /** Set false to disable sorting on this column. */
  sortable?: boolean;
}
export interface DataTableProps {
  columns?: DataColumn[];
  rows?: any[];
  /** Field used as the unique row id. @default "id" */
  rowKey?: string;
  selectable?: boolean;
  /** Controlled selection set of rowKey values. */
  selected?: Set<any>;
  onSelect?: (next: Set<any>) => void;
  onRowClick?: (row: any) => void;
  density?: "compact" | "comfortable" | "spacious";
  emptyText?: string;
  style?: React.CSSProperties;
}
/**
 * Sortable, selectable data table with sticky header.
 * @startingPoint section="Data" subtitle="Sortable, selectable data table" viewport="760x420"
 */


/**
 * AgniUI · DataTable
 * Sortable, selectable table. columns: [{key,label,width,align,render?,sortable?}].
 * rows: object[] keyed by `rowKey`. Selection is controlled-optional (selected
 * Set + onSelect). Click a sortable header to sort. Sticky header.
 */
export function DataTable({
  columns = [],
  rows = [],
  rowKey = "id",
  selectable = false,
  selected,
  onSelect,
  onRowClick,
  density = "compact",
  emptyText = "No rows",
  style = {},
}: DataTableProps) {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [internalSel, setInternalSel] = useState(new Set());
  const sel = selected != null ? selected : internalSel;
  const setSel = onSelect || setInternalSel;

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const c = columns.find((c) => c.key === sort.key);
    if (!c) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
  }, [rows, sort, columns]);

  const allOn = sorted.length > 0 && sorted.every((r) => sel.has(r[rowKey]));
  const toggleAll = () => { const n = allOn ? new Set() : new Set(sorted.map((r) => r[rowKey])); setSel(n); };
  const toggleRow = (k) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); setSel(n); };
  const clickSort = (c) => { if (c.sortable === false) return; setSort((s) => s.key === c.key ? { key: c.key, dir: -s.dir } : { key: c.key, dir: 1 }); };
  const pad = density === "spacious" ? "14px" : density === "comfortable" ? "12px" : "var(--density-cell-pad)";

  const th = { textAlign: "left", padding: `${pad} 14px`, background: "var(--table-header-bg)", color: "var(--table-header-fg)", fontWeight: "var(--fw-semibold)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: "1px solid var(--table-cell-bdr)", position: "sticky", top: 0, zIndex: 1 };

  return (
    <div style={{ border: "1px solid var(--card-bdr)", borderRadius: "var(--radius-lg)", overflow: "auto", background: "var(--card-bg)", ...style }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
        <thead>
          <tr>
            {selectable && <th style={{ ...th, width: 44, textAlign: "center" }}><input type="checkbox" checked={allOn} onChange={toggleAll} style={{ cursor: "pointer", width: 15, height: 15, accentColor: "var(--action-brand)" }} /></th>}
            {columns.map((c) => (
              <th key={c.key} onClick={() => clickSort(c)} style={{ ...th, width: c.width, textAlign: c.align || "left", cursor: c.sortable === false ? "default" : "pointer" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {c.label}
                  {sort.key === c.key && <i className={sort.dir === 1 ? "ph-bold ph-arrow-up" : "ph-bold ph-arrow-down"} style={{ fontSize: 11 }} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>{emptyText}</td></tr>
          )}
          {sorted.map((r) => {
            const k = r[rowKey], on = sel.has(k);
            return (
              <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ background: on ? "var(--table-row-selected)" : "transparent", cursor: onRowClick ? "pointer" : "default", transition: "background var(--dur-fast)" }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "var(--table-row-hover)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                {selectable && <td style={{ padding: `${pad} 14px`, textAlign: "center", borderBottom: "1px solid var(--table-cell-bdr)" }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={on} onChange={() => toggleRow(k)} style={{ cursor: "pointer", width: 15, height: 15, accentColor: "var(--action-brand)" }} /></td>}
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: `${pad} 14px`, textAlign: c.align || "left", fontSize: "var(--text-sm)", color: "var(--text-primary)", borderBottom: "1px solid var(--table-cell-bdr)", whiteSpace: "nowrap" }}>
                    {c.render ? c.render(r[c.key], r) : r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
