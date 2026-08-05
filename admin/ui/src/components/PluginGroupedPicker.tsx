import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { TextInput } from "./Field";
import { LoadingBlock, ErrorBlock } from "./States";
import { useDebounce } from "../hooks/useDebounce";

export interface GroupedItem {
  key: string;
  label: string;
  sublabel?: string;
  plugin: string;
}

/** Search box + plugin-filter dropdown + a list grouped under a per-plugin
 *  header — the one sidebar pattern Data Browser and Schema Builder now
 *  share (point 2: each used to have half of this). Returns fragments
 *  meant to sit inside the caller's own `<aside>` — `extraHeader` is where
 *  a caller drops anything else that belongs between the search row and
 *  the list itself (Schema Builder's Schemas/Patches tabs + New button). */
export function PluginGroupedPicker({
  items,
  plugins,
  activeKey,
  onSelect,
  loading,
  error,
  onRetry,
  searchPlaceholder = "Search…",
  emptyLabel = "No matches.",
  searchRef,
  extraHeader,
}: {
  items: GroupedItem[];
  plugins: string[];
  activeKey: string | null;
  onSelect: (item: GroupedItem) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
  searchRef?: Ref<HTMLInputElement>;
  extraHeader?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 250);
  const [pluginFilter, setPluginFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [filterOpen]);

  const grouped = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    const filtered = items.filter(
      (i) =>
        (!pluginFilter || i.plugin === pluginFilter) &&
        (!needle || i.label.toLowerCase().includes(needle) || i.plugin.toLowerCase().includes(needle)),
    );
    const byPlugin = new Map<string, GroupedItem[]>();
    for (const i of filtered) {
      const arr = byPlugin.get(i.plugin) ?? [];
      arr.push(i);
      byPlugin.set(i.plugin, arr);
    }
    for (const arr of byPlugin.values()) arr.sort((a, b) => a.label.localeCompare(b.label));
    return [...byPlugin.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, pluginFilter, debouncedQ]);

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-border p-2.5">
        <div className="min-w-0 flex-1">
          <TextInput ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} size="sm" className="w-full" />
        </div>
        <div ref={filterRef} className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-label="Filter by plugin"
            title="Filter by plugin"
            className={clsx(
              "relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-colors",
              pluginFilter
                ? "border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
                : "border-border-strong text-text-muted hover:bg-neutral-100 dark:hover:bg-neutral-800",
            )}
          >
            <SlidersHorizontal size={15} />
            {pluginFilter && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-500" />}
          </button>
          {filterOpen && (
            <div className="scrollbar-thin absolute right-0 z-30 mt-1 max-h-72 w-48 overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/20">
              <button
                type="button"
                onClick={() => {
                  setPluginFilter(null);
                  setFilterOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-[13px] text-text hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                All plugins
                {pluginFilter === null && <Check size={14} className="text-accent-600" />}
              </button>
              {plugins.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPluginFilter(p);
                    setFilterOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-[13px] text-text hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {p}
                  {pluginFilter === p && <Check size={14} className="text-accent-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {extraHeader}

      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {loading && <LoadingBlock label="Loading…" />}
        {error && <ErrorBlock message={error} onRetry={onRetry} />}
        {!loading && !error && grouped.length === 0 && <p className="px-2 py-4 text-center text-[13px] text-text-faint">{emptyLabel}</p>}
        {grouped.map(([plugin, groupItems]) => (
          <div key={plugin} className="mb-3">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">{plugin}</p>
            <ul>
              {groupItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className={clsx(
                      "flex w-full cursor-pointer flex-col items-start gap-0 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                      activeKey === item.key
                        ? "bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
                        : "text-text hover:bg-neutral-100 dark:hover:bg-neutral-900/50",
                    )}
                  >
                    <span className="truncate font-medium">{item.label}</span>
                    {item.sublabel && <span className="text-[11px] text-text-faint">{item.sublabel}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
