import { useEffect, useMemo, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router-dom";
import { Database, Search } from "lucide-react";
import clsx from "clsx";
import { call } from "../../api/client";
import type { TableMeta } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/States";
import { PluginGroupedPicker, type GroupedItem } from "../../components/PluginGroupedPicker";

const SURFACE = "data_browser";

type ScopeTab = "all" | "parent" | "child";

export function DataBrowserPage() {
  const navigate = useNavigate();
  const { table: activeTable } = useParams<{ table?: string }>();
  const hasTable = !!useMatch("/data/:table/*");
  const searchRef = usePageSearchFocus();
  const [tab, setTab] = useState<ScopeTab>("all");

  const { data: tableMeta, loading, error, reload } = useAsync(
    () => call<TableMeta[]>("list_table_meta", { surface: SURFACE }, { method: "GET" }),
    [],
  );

  // "Parent" means "not a child table" — every regular, top-level table —
  // not "has children of its own" (a table can be both a REFERENCE target
  // and a child table at once, so that reading would double-count).
  const scoped = useMemo(() => {
    const all = tableMeta ?? [];
    if (tab === "parent") return all.filter((t) => !t.child);
    if (tab === "child") return all.filter((t) => t.child);
    return all;
  }, [tableMeta, tab]);

  const items: GroupedItem[] = useMemo(
    () =>
      scoped.map((t) => ({
        key: t.table,
        label: t.table,
        sublabel: [t.child ? "child" : t.system ? "system" : null].filter(Boolean).join(" · ") || undefined,
        plugin: t.plugin,
      })),
    [scoped],
  );
  const plugins = useMemo(() => [...new Set(scoped.map((t) => t.plugin))].sort(), [scoped]);

  // Same ordering PluginGroupedPicker itself renders in (plugin, then
  // label, both alphabetical) — so "the first table" here is genuinely
  // the first one the user would see in the list, not an arbitrary API
  // response order.
  const firstTable = useMemo(
    () => [...scoped].sort((a, b) => a.plugin.localeCompare(b.plugin) || a.table.localeCompare(b.table))[0]?.table,
    [scoped],
  );

  // Land on a table automatically instead of an empty "pick one" state —
  // only when nothing is already selected, and only once the list has
  // actually loaded (so this can't race a deep link that's still
  // resolving). replace: true so this doesn't leave a phantom back-button
  // stop between "/data" and the table it immediately redirects to.
  useEffect(() => {
    if (hasTable || loading || !firstTable) return;
    navigate(`/data/${firstTable}`, { replace: true });
  }, [hasTable, loading, firstTable, navigate]);

  const counts = useMemo(() => {
    const all = tableMeta ?? [];
    return { all: all.length, parent: all.filter((t) => !t.child).length, child: all.filter((t) => t.child).length };
  }, [tableMeta]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Data Browser" description="Browse and edit rows on any table, driven by its own schema." />

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface">
          <PluginGroupedPicker
            items={items}
            plugins={plugins}
            activeKey={activeTable ?? null}
            onSelect={(item) => navigate(`/data/${item.key}`)}
            loading={loading}
            error={error}
            onRetry={reload}
            searchPlaceholder="Search tables…"
            emptyLabel="No matching tables."
            searchRef={searchRef}
            extraHeader={
              // Same visual contract as Schema Builder's Schemas/Patches
              // tabs (SchemaBuilderPage.tsx) — a filter over which tables
              // the list below shows, not a separate page/route.
              <div className="flex items-center gap-1 border-b border-border px-2 pt-1.5">
                {(
                  [
                    ["all", "All"],
                    ["parent", "Parent"],
                    ["child", "Child"],
                  ] as const
                ).map(([k, label]) => {
                  const active = tab === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTab(k)}
                      className={clsx(
                        "relative -mb-px cursor-pointer px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                        active ? "text-accent-700 dark:text-accent-300" : "text-text-muted hover:text-text",
                      )}
                    >
                      {label} <span className="text-text-faint">({counts[k]})</span>
                      {active && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent-600" />}
                    </button>
                  );
                })}
              </div>
            }
          />
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
