import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { call } from "../api/client";
import type { TableMeta } from "../api/types";
import {
  IconHealth,
  IconData,
  IconUsers,
  IconRoles,
  IconSessions,
  IconKeys,
  IconSchema,
  IconSettings,
  IconJobs,
  IconFiles,
  IconSearch,
} from "./icons";

/* Ctrl/Cmd+K jump-to-anything (docs/admin-ui-ux-review.md #1.4 — every
   list-heavy screen had its own LOCAL search with no way to jump straight
   to a table or page without first knowing which screen it lives on).
   Two result kinds: static nav pages, and every registered table (fetched
   once, lazily — only on first open, not on every page load). Deliberately
   NOT a Modal (no header/footer chrome needed for a command palette) —
   a smaller, purpose-built overlay instead. */

interface PageEntry {
  kind: "page";
  to: string;
  label: string;
  icon: (props: { size?: number }) => JSX.Element;
}
interface TableEntry {
  kind: "table";
  to: string;
  label: string;
  sublabel: string;
}
type Entry = PageEntry | TableEntry;

const PAGES: PageEntry[] = [
  { kind: "page", to: "/health", label: "Health", icon: IconHealth },
  { kind: "page", to: "/data", label: "Data Browser", icon: IconData },
  { kind: "page", to: "/schema", label: "Schema Builder", icon: IconSchema },
  { kind: "page", to: "/users", label: "Users", icon: IconUsers },
  { kind: "page", to: "/roles", label: "Roles", icon: IconRoles },
  { kind: "page", to: "/sessions", label: "Sessions", icon: IconSessions },
  { kind: "page", to: "/access-keys", label: "Access Keys", icon: IconKeys },
  { kind: "page", to: "/files", label: "File Manager", icon: IconFiles },
  { kind: "page", to: "/jobs", label: "Jobs", icon: IconJobs },
  { kind: "page", to: "/settings", label: "Settings & Secrets", icon: IconSettings },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tables, setTables] = useState<TableMeta[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
      // Fetched lazily, once — tables rarely change mid-session, and most
      // sessions never open this at all.
      if (tables === null) {
        call<TableMeta[]>("list_table_meta", {}, { method: "GET" })
          .then(setTables)
          .catch(() => setTables([]));
      }
    }
  }, [open, tables]);

  const results = useMemo<Entry[]>(() => {
    const needle = q.trim().toLowerCase();
    // Data Browser's own table list (and get_table_schema) address a
    // table by its PHYSICAL name (t.table, e.g. "employee") — t.name is
    // the schema FILE STEM ("Employee"), which is what REFERENCE/TABLE
    // targets use instead (§3.9's own stem-vs-physical-name distinction,
    // the exact class of bug Schema Builder's target picker hit before).
    const tableEntries: TableEntry[] = (tables ?? []).map((t) => ({
      kind: "table",
      to: `/data?plugin=${encodeURIComponent(t.plugin)}&table=${encodeURIComponent(t.table)}`,
      label: t.table,
      sublabel: t.plugin,
    }));
    const all: Entry[] = [...PAGES, ...tableEntries];
    if (!needle) return PAGES;
    return all.filter(
      (e) => e.label.toLowerCase().includes(needle) || (e.kind === "table" && e.sublabel.toLowerCase().includes(needle))
    );
  }, [q, tables]);

  const go = (entry: Entry) => {
    navigate(entry.to);
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="global-search-trigger" onClick={() => setOpen(true)}>
        <IconSearch size={14} />
        <span>Jump to…</span>
        <kbd>Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div className="global-search-scrim" onClick={() => setOpen(false)}>
      <div className="global-search-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Jump to a page or table">
        <div className="global-search-input">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            placeholder="Jump to a page or table…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                go(results[active]);
              }
            }}
          />
        </div>
        <div className="global-search-results">
          {results.length === 0 ? (
            <div className="global-search-empty">No pages or tables match “{q}”.</div>
          ) : (
            results.map((entry, i) => (
              <button
                key={entry.kind === "page" ? entry.to : `${entry.to}`}
                type="button"
                className={`global-search-item ${i === active ? "global-search-item--active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(entry)}
              >
                {entry.kind === "page" ? <entry.icon size={16} /> : <IconData size={16} />}
                <span className="global-search-item__label">{entry.label}</span>
                {entry.kind === "table" && <span className="global-search-item__sub">{entry.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
