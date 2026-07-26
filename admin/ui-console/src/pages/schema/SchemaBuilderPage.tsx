import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router-dom";
import { FileCode2, Plus, SlidersHorizontal, Check } from "lucide-react";
import clsx from "clsx";
import { call } from "../../api/client";
import type { SchemaFileList, TableMeta } from "../../api/types";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { EmptyState, ErrorBlock, LoadingBlock } from "../../components/States";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
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
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 250);
  const searchRef = usePageSearchFocus();
  const [pluginFilter, setPluginFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!filterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [filterOpen]);

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    return entries.filter((e) => (!pluginFilter || e.plugin === pluginFilter) && (!needle || e.name.toLowerCase().includes(needle)));
  }, [entries, pluginFilter, debouncedQ]);

  const schemaEntries = filtered.filter((e) => e.kind === "schemas");
  const patchEntries = filtered.filter((e) => e.kind === "patches");

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
          <div className="flex items-center gap-1.5 border-b border-border py-2.5 pl-2.5 pr-2">
            {/* min-w-0 lets this wrapper actually shrink/grow with the row
                instead of sizing to the input's own content — the wrapper,
                not the input, is the real flex item here since TextInput's
                className lands on the <input>, one flex context too deep
                to affect this row's horizontal layout. */}
            <div className="min-w-0 flex-1">
              <TextInput ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="!h-8 w-full" />
            </div>
            {/* Plugin filter — moved out of always-visible chips (which don't
                scale as business plugins grow) into a compact filter menu.
                Defaults to every plugin. */}
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
                  {(plugins ?? []).map((p) => (
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

          {/* Schemas / Patches tabs inside the panel. */}
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
            {/* Same fixed h-8 w-8 box as the filter button above, and the
                same right-edge inset (pr-2 on both rows) — so the two
                icons land in exactly the same column instead of the
                filter sitting ~6.5px left of this one, as it did when this
                button sized itself to its own content instead. */}
            <IconButton
              className="ml-auto"
              label={`New ${tab === "schemas" ? "schema" : "patch"}`}
              icon={<Plus size={15} />}
              onClick={() => startNew(tab)}
            />
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
            {(loadingPlugins || loadingFiles) && <LoadingBlock label="Loading files…" />}
            {(pluginsError || filesError) && <ErrorBlock message={pluginsError ?? filesError ?? "Failed to load"} />}
            {!loadingPlugins && !loadingFiles && !pluginsError && !filesError && (
              <FileList
                entries={tab === "schemas" ? schemaEntries : patchEntries}
                emptyLabel={tab === "schemas" ? "No schemas." : "No patches."}
                activeName={activeKind === tab && !creating ? activeName ?? null : null}
                onOpen={openFile}
              />
            )}
          </div>
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

function FileList({
  entries,
  emptyLabel,
  activeName,
  onOpen,
}: {
  entries: FileEntry[];
  emptyLabel: string;
  activeName: string | null;
  onOpen: (e: FileEntry) => void;
}) {
  if (entries.length === 0) {
    return <p className="px-2 py-6 text-center text-[13px] text-text-faint">{emptyLabel}</p>;
  }
  return (
    <ul>
      {entries.map((e) => (
        <li key={`${e.plugin}/${e.name}`}>
          <button
            type="button"
            onClick={() => onOpen(e)}
            className={clsx(
              "flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
              activeName === e.name
                ? "bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
                : "text-text hover:bg-neutral-100 dark:hover:bg-neutral-900/50",
            )}
          >
            <span className="truncate font-medium">{e.name}</span>
            <span className="text-[11px] text-text-faint">{e.plugin}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
