import { useMemo } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router-dom";
import { Database, Search } from "lucide-react";
import { call } from "../../api/client";
import type { TableMeta } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/States";
import { PluginGroupedPicker, type GroupedItem } from "../../components/PluginGroupedPicker";

const SURFACE = "data_browser";

export function DataBrowserPage() {
  const navigate = useNavigate();
  const { table: activeTable } = useParams<{ table?: string }>();
  const hasTable = !!useMatch("/data/:table/*");
  const searchRef = usePageSearchFocus();

  const { data: tableMeta, loading, error, reload } = useAsync(
    () => call<TableMeta[]>("list_table_meta", { surface: SURFACE }, { method: "GET" }),
    [],
  );

  const items: GroupedItem[] = useMemo(
    () =>
      (tableMeta ?? []).map((t) => ({
        key: t.table,
        label: t.table,
        sublabel: [t.child ? "child" : t.system ? "system" : null].filter(Boolean).join(" · ") || undefined,
        plugin: t.plugin,
      })),
    [tableMeta],
  );
  const plugins = useMemo(() => [...new Set((tableMeta ?? []).map((t) => t.plugin))].sort(), [tableMeta]);

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
