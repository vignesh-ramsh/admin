import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { call, ApiError } from "../api/client";
import type { SchemaFileContent, SchemaFileList, TableMeta } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Select } from "../components/Field";
import { Loading, EmptyState } from "../components/States";
import { IconPlus, IconSchema } from "../layout/icons";
import { SchemaEditor, type EditorTarget } from "./schema/SchemaEditor";
import { MigrationPreviewModal } from "./schema/MigrationPreviewModal";
import { clearSchemaCache } from "./schema/useTargetFields";
import "./shared/shared.css";
import "./schema.css";

const SURFACE = "schema_builder";

/* Selection lives in the URL (?plugin=&kind=&file=) so a refresh — or a
   shared/bookmarked link — lands back on the same file instead of resetting
   to the first plugin. The URL is the source of truth for plugin + open
   file; only an unsaved NEW file is local (it has nothing to address yet). */

export function SchemaBuilderPage() {
  const { onUnauthorized } = useAuth();
  const [params, setParams] = useSearchParams();
  const plugin = params.get("plugin") ?? "";
  const fileKind = (params.get("kind") as "schema" | "patch" | null) ?? null;
  const fileName = params.get("file");

  const [plugins, setPlugins] = useState<string[]>([]);
  const [files, setFiles] = useState<SchemaFileList>({ schemas: [], patches: [] });
  const [tableMeta, setTableMeta] = useState<TableMeta[]>([]);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [preview, setPreview] = useState(false);

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
    },
    [onUnauthorized]
  );

  const selectPlugin = (name: string) => setParams({ plugin: name }, { replace: true });
  const selectFile = (kind: "schema" | "patch", name: string) =>
    setParams({ plugin, kind, file: name });

  // Plugin list; default the URL to the first plugin if it names none.
  useEffect(() => {
    call<string[]>("list_plugins", { surface: SURFACE })
      .then((list) => {
        setPlugins(list);
        if (list.length && !plugin) setParams({ plugin: list[0] }, { replace: true });
      })
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshFiles = useCallback(
    (name: string) => {
      setLoadingFiles(true);
      Promise.all([
        call<SchemaFileList>("list_schema_files", { plugin: name }),
        // Every table, not just this plugin's — a REFERENCE may legitimately
        // point across plugins, and TABLE targets are filtered to child
        // tables from this same list.
        call<TableMeta[]>("list_table_meta", { surface: SURFACE }).catch(() => [] as TableMeta[]),
      ])
        .then(([f, meta]) => {
          setFiles(f);
          setTableMeta(meta);
        })
        .catch(handleErr)
        .finally(() => setLoadingFiles(false));
    },
    [handleErr]
  );

  useEffect(() => {
    if (plugin) refreshFiles(plugin);
  }, [plugin, refreshFiles]);

  // Open whatever file the URL names (also on a cold load / refresh).
  useEffect(() => {
    if (!plugin || !fileKind || !fileName) return;
    if (target && !target.isNew && target.kind === fileKind && target.name === fileName) return;
    const fn = fileKind === "schema" ? "get_schema_file" : "get_patch_file";
    call<SchemaFileContent>(fn, { plugin, name: fileName })
      .then((content) =>
        setTarget({
          openId: Date.now(),
          kind: fileKind,
          name: fileName,
          isNew: false,
          content: normalize(content),
        })
      )
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, fileKind, fileName]);

  // Switching plugin clears any open editor (its file belongs elsewhere).
  useEffect(() => {
    if (!fileKind || !fileName) setTarget((t) => (t && !t.isNew ? null : t));
  }, [fileKind, fileName]);

  const newFile = (kind: "schema" | "patch") => {
    setParams({ plugin }, { replace: true }); // an unsaved file isn't addressable
    setTarget({
      openId: Date.now(),
      kind,
      name: "",
      isNew: true,
      content: { system: false, audit: false, child: false, fields: [], index: [] },
    });
  };

  const onSaved = (kind: "schema" | "patch", name: string) => {
    // A save can change a table's unique fields, which the target_field
    // picker caches — drop it so the next pick sees the new shape.
    clearSchemaCache();
    refreshFiles(plugin);
    setTarget((t) => (t ? { ...t, name, isNew: false } : t));
    selectFile(kind, name); // a saved file is addressable — put it in the URL
  };

  const onDeleted = () => {
    setTarget(null);
    setParams({ plugin }, { replace: true });
    refreshFiles(plugin);
  };

  // A live Apply Now can change a table's columns (including its unique
  // fields, which the target_field picker caches) without the file itself
  // changing name — same cache-drop + table-meta refresh onSaved already
  // does, minus the "select this file" part (nothing was renamed/created).
  const onApplied = () => {
    clearSchemaCache();
    refreshFiles(plugin);
  };

  return (
    <div className="schema-shell">
      <aside className="schema-files">
        <div className="schema-files__plugin">
          <label className="schema-files__label">Plugin</label>
          <Select value={plugin} onChange={(e) => selectPlugin(e.target.value)}>
            {plugins.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="schema-files__lists">
          <FileGroup
            title="Schemas"
            names={files.schemas}
            activeName={target?.kind === "schema" && !target.isNew ? target.name : null}
            onOpen={(n) => selectFile("schema", n)}
            onNew={() => newFile("schema")}
            loading={loadingFiles}
          />
          <FileGroup
            title="Patches"
            names={files.patches}
            activeName={target?.kind === "patch" && !target.isNew ? target.name : null}
            onOpen={(n) => selectFile("patch", n)}
            onNew={() => newFile("patch")}
            loading={loadingFiles}
          />
        </div>
      </aside>

      <section className="schema-work">
        <div className="schema-work__inner">
          <PageHeader
            title="Schema Builder"
            subtitle="Author tables and patches, then apply them with a migration."
            actions={
              plugin ? (
                <Button variant="secondary" onClick={() => setPreview(true)}>
                  Preview migration
                </Button>
              ) : null
            }
          />

          {target ? (
            <SchemaEditor
              key={target.openId}
              plugin={plugin}
              target={target}
              tableMeta={tableMeta}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onApplied={onApplied}
            />
          ) : (
            <div className="card">
              <EmptyState
                title="Select a file to edit"
                message="Pick a schema or patch on the left, or create a new one to define a table."
                action={
                  <div className="inline" style={{ marginTop: 4 }}>
                    <Button variant="primary" size="sm" onClick={() => newFile("schema")}>
                      <IconSchema size={15} /> New schema
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => newFile("patch")}>
                      <IconPlus /> New patch
                    </Button>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </section>

      {preview && <MigrationPreviewModal plugin={plugin} onClose={() => setPreview(false)} />}
    </div>
  );
}

function FileGroup({
  title,
  names,
  activeName,
  onOpen,
  onNew,
  loading,
}: {
  title: string;
  names: string[];
  activeName: string | null;
  onOpen: (name: string) => void;
  onNew: () => void;
  loading: boolean;
}) {
  return (
    <div className="file-group">
      <div className="file-group__head">
        <span className="file-group__title">{title}</span>
        <button className="file-group__add" onClick={onNew} title={`New ${title.slice(0, -1).toLowerCase()}`}>
          <IconPlus size={15} />
        </button>
      </div>
      {loading ? (
        <div className="file-group__loading">
          <Loading message="" />
        </div>
      ) : names.length === 0 ? (
        <div className="file-group__empty">None</div>
      ) : (
        <ul className="file-list">
          {names.map((n) => (
            <li key={n}>
              <button
                className={`file-item ${activeName === n ? "file-item--active" : ""}`}
                onClick={() => onOpen(n)}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ensure optional arrays exist so the editor's controlled inputs are safe. */
function normalize(content: SchemaFileContent): SchemaFileContent {
  return {
    system: !!content.system,
    audit: !!content.audit,
    child: !!content.child,
    fields: (content.fields ?? []).map((f) => ({ ...f })),
    index: content.index ?? [],
  };
}
