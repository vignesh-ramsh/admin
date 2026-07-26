import { useMemo, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router-dom";
import { Database, Search } from "lucide-react";
import { call } from "../../api/client";
import type { TableMeta } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { PageHeader } from "../../components/PageHeader";
import { TextInput } from "../../components/Field";
import { EmptyState, ErrorBlock, LoadingBlock } from "../../components/States";
import clsx from "clsx";

const SURFACE = "data_browser";

export function DataBrowserPage() {
  const navigate = useNavigate();
  const { table: activeTable } = useParams<{ table?: string }>();
  const hasTable = !!useMatch("/data/:table/*");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 250);
  const searchRef = usePageSearchFocus();

  const { data: tableMeta, loading, error, reload } = useAsync(
    () => call<TableMeta[]>("list_table_meta", { surface: SURFACE }, { method: "GET" }),
    [],
  );

  const grouped = useMemo(() => {
    const list = tableMeta ?? [];
    const needle = debouncedQ.trim().toLowerCase();
    const filtered = needle ? list.filter((m) => m.table.toLowerCase().includes(needle) || m.plugin.toLowerCase().includes(needle)) : list;
    const byPlugin = new Map<string, TableMeta[]>();
    for (const m of filtered) {
      const arr = byPlugin.get(m.plugin) ?? [];
      arr.push(m);
      byPlugin.set(m.plugin, arr);
    }
    for (const arr of byPlugin.values()) arr.sort((a, b) => a.table.localeCompare(b.table));
    return [...byPlugin.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tableMeta, debouncedQ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Data Browser" description="Browse and edit rows on any table, driven by its own schema." />

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-2.5">
            <TextInput
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tables…"
              className="!h-8"
            />
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
            {loading && <LoadingBlock label="Loading tables…" />}
            {error && <ErrorBlock message={error} onRetry={reload} />}
            {!loading && !error && grouped.length === 0 && <p className="px-2 py-4 text-center text-[13px] text-text-faint">No matching tables.</p>}
            {grouped.map(([plugin, tables]) => (
              <div key={plugin} className="mb-3">
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">{plugin}</p>
                <ul>
                  {tables.map((t) => (
                    <li key={t.table}>
                      <button
                        type="button"
                        onClick={() => navigate(`/data/${t.table}`)}
                        className={clsx(
                          "flex w-full cursor-pointer flex-col items-start gap-0 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                          activeTable === t.table
                            ? "bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
                            : "text-text hover:bg-neutral-100 dark:hover:bg-neutral-900/50",
                        )}
                      >
                        <span className="truncate font-medium">{t.table}</span>
                        <span className="text-[11px] text-text-faint">
                          {[t.child ? "child" : t.system ? "system" : null].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          {hasTable ? (
            <Outlet />
          ) : (
            <EmptyState
              icon={<Database size={26} />}
              title="No table selected"
              description="Pick a table on the left — search by name, or scan the list grouped by plugin."
              action={
                <p className="flex items-center gap-1.5 text-xs text-text-faint">
                  <Search size={13} /> Try typing part of a table name above.
                </p>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
