import { useCallback, useEffect, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router-dom";
import { FileCode2, Plus } from "lucide-react";
import clsx from "clsx";
import { call } from "../../api/client";
import type { SchemaFileList, TableMeta } from "../../api/types";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { PluginGroupedPicker, type GroupedItem } from "../../components/PluginGroupedPicker";
import { EmptyState } from "../../components/States";
import { useAsync } from "../../hooks/useAsync";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { clearSchemaCache } from "./useTargetFields";
import { SchemaFileEditor } from "./SchemaFileEditor";

const SURFACE = "schema_builder";

export interface FileEntry {
  plugin: string;
  kind: "schemas" | "patches";
  name: string;
}

export interface SchemaBuilderOutletContext {
  plugins: string[];
  entries: FileEntry[];
  tableMeta: TableMeta[];
  refresh: () => void;
}

/* Selection lives in the URL (/schema/:kind/:name), matching the routing
   contract exactly — there's no room in that URL for a plugin segment, so
   which plugin owns a given file is resolved from the merged file listing
   fetched here (list_schema_files/list_patch_files take a mandatory
   `plugin`, so every installed plugin has to be asked) and handed down to
   the editor route via Outlet context. */
export function SchemaBuilderPage() {
  const navigate = useNavigate();
  const { kind: activeKind, name: activeName } = useParams<{ kind?: string; name?: string }>();
  const isEditingRoute = !!useMatch("/schema/:kind/:name");
  const searchRef = usePageSearchFocus();
  const [tab, setTab] = useState<"schemas" | "patches">("schemas");
  const [creating, setCreating] = useState<{ kind: "schemas" | "patches" } | null>(null);

  const {
    data: plugins,
    loading: loadingPlugins,
    error: pluginsError,
  } = useAsync(() => call<string[]>("list_plugins", { surface: SURFACE }, { method: "GET" }), []);

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [tableMeta, setTableMeta] = useState<TableMeta[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const loadAll = useCallback((pluginList: string[]) => {
    setLoadingFiles(true);
    setFilesError(null);
    Promise.all([
      Promise.all(
        pluginList.map((p) =>
          call<SchemaFileList>("list_schema_files", { plugin: p }, { method: "GET" }).then((f) => ({ plugin: p, files: f })),
        ),
      ),
      call<TableMeta[]>("list_table_meta", { surface: SURFACE }, { method: "GET" }).catch(() => [] as TableMeta[]),
    ])
      .then(([perPlugin, meta]) => {
        const flat: FileEntry[] = [];
        for (const { plugin, files } of perPlugin) {
          for (const name of files.schemas) flat.push({ plugin, kind: "schemas", name });
          for (const name of files.patches) flat.push({ plugin, kind: "patches", name });
        }
        setEntries(flat);
        setTableMeta(meta);
      })
      .catch((err) => setFilesError(err instanceof Error ? err.message : "Failed to load schema files"))
      .finally(() => setLoadingFiles(false));
  }, []);

  useEffect(() => {
    if (plugins) loadAll(plugins);
  }, [plugins, loadAll]);

  const refresh = useCallback(() => {
    clearSchemaCache();
    if (plugins) loadAll(plugins);
  }, [plugins, loadAll]);

  // Keep the active tab in sync with the file open in the URL, so a
  // deep-link to a patch lands on the Patches tab.
  useEffect(() => {
    if (activeKind === "schemas" || activeKind === "patches") setTab(activeKind);
  }, [activeKind]);

  const schemaEntries = entries.filter((e) => e.kind === "schemas");
  const patchEntries = entries.filter((e) => e.kind === "patches");
  const activeTabEntries = tab === "schemas" ? schemaEntries : patchEntries;
  const activeEntry = activeKind === tab && !creating ? entries.find((e) => e.kind === tab && e.name === activeName) : null;

  const openFile = (e: FileEntry) => {
    setCreating(null);
    navigate(`/schema/${e.kind}/${e.name}`);
  };

  const startNew = (kind: "schemas" | "patches") => {
    navigate("/schema");
    setCreating({ kind });
  };

  const outletContext: SchemaBuilderOutletContext = { plugins: plugins ?? [], entries, tableMeta, refresh };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Schema Builder" description="Author tables and patches, then apply them with a migration." />

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface">
          <PluginGroupedPicker
            items={activeTabEntries.map(
              (e): GroupedItem => ({ key: `${e.plugin}/${e.name}`, label: e.name, plugin: e.plugin }),
            )}
            plugins={plugins ?? []}
            activeKey={activeEntry ? `${activeEntry.plugin}/${activeEntry.name}` : null}
            onSelect={(item) => openFile({ kind: tab, name: item.label, plugin: item.plugin })}
            loading={loadingPlugins || loadingFiles}
            error={pluginsError ?? filesError}
            searchPlaceholder="Search files…"
            emptyLabel={tab === "schemas" ? "No schemas." : "No patches."}
            searchRef={searchRef}
            extraHeader={
              // Schemas / Patches tabs, same row as the New-file button —
              // same fixed h-8 w-8 box and right-edge inset as the plugin-
              // filter button above (PluginGroupedPicker's own row), so the
              // two icons land in exactly the same column.
              <div className="flex items-center gap-1 border-b border-border px-2 pt-1.5">
                {(["schemas", "patches"] as const).map((k) => {
                  const count = k === "schemas" ? schemaEntries.length : patchEntries.length;
                  const active = tab === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTab(k)}
                      className={clsx(
                        "relative -mb-px cursor-pointer px-2.5 py-1.5 text-[13px] font-medium capitalize transition-colors",
                        active ? "text-accent-700 dark:text-accent-300" : "text-text-muted hover:text-text",
                      )}
                    >
                      {k} <span className="text-text-faint">({count})</span>
                      {active && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent-600" />}
                    </button>
                  );
                })}
                <IconButton
                  className="ml-auto"
                  label={`New ${tab === "schemas" ? "schema" : "patch"}`}
                  icon={<Plus size={15} />}
                  onClick={() => startNew(tab)}
                />
              </div>
            }
          />
        </aside>

        <section className="min-w-0 flex-1">
          {creating ? (
            <SchemaFileEditor
              key="new"
              isNew
              kind={creating.kind}
              name=""
              plugin={plugins?.[0] ?? ""}
              plugins={plugins ?? []}
              tableMeta={tableMeta}
              onSaved={(kind, name, plugin) => {
                setCreating(null);
                refresh();
                navigate(`/schema/${kind}/${name}`);
                void plugin;
              }}
              onDeleted={() => setCreating(null)}
              onCancel={() => setCreating(null)}
            />
          ) : isEditingRoute ? (
            <Outlet context={outletContext} />
          ) : (
            <EmptyState
              icon={<FileCode2 size={26} />}
              title="Select a file to edit"
              description="Pick a schema or patch on the left, or create a new one to define a table."
              action={
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => startNew("schemas")}>
                    New schema
                  </Button>
                  <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => startNew("patches")}>
                    New patch
                  </Button>
                </div>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
