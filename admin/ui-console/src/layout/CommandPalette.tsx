import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { ALL_NAV_ITEMS } from "./nav";
import { call } from "../api/client";
import type { TableMeta } from "../api/types";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    call<TableMeta[]>("list_table_meta", {}, { method: "GET" })
      .then(setTables)
      .catch(() => {});
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = ALL_NAV_ITEMS.map((item) => ({
      kind: "page" as const,
      key: item.to,
      label: item.label,
      to: item.to,
    }));
    const tablePages = tables.map((t) => ({
      kind: "table" as const,
      key: `table:${t.table}`,
      label: t.name,
      sublabel: `${t.plugin} · ${t.table}`,
      to: `/data/${t.table}`,
    }));
    const all = [...pages, ...tablePages];
    if (!q) return all.slice(0, 8);
    return all.filter((r) => r.label.toLowerCase().includes(q) || ("sublabel" in r && r.sublabel?.toLowerCase().includes(q))).slice(0, 20);
  }, [query, tables]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        const r = results[activeIdx];
        if (r) {
          navigate(r.to);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, navigate, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center p-4 pt-[12vh]">
      <div className="modal-backdrop-in fixed inset-0 bg-neutral-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="modal-panel-in relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl shadow-black/10">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={16} className="text-text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Jump to a page or table…"
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-faint">Esc</kbd>
        </div>
        <div className="scrollbar-thin max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-faint">No matches.</p>}
          {results.map((r, idx) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                navigate(r.to);
                onClose();
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2 text-left text-sm ${
                idx === activeIdx ? "bg-accent-50 dark:bg-accent-950/40" : ""
              }`}
            >
              <span>
                <span className="text-text">{r.label}</span>
                {"sublabel" in r && r.sublabel && <span className="ml-2 text-xs text-text-faint">{r.sublabel}</span>}
              </span>
              <ArrowRight size={13} className="shrink-0 text-text-faint" />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
