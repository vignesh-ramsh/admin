import { useEffect, useState } from "react";
import { call, ApiError } from "../api/client";
import type { SchemaFileContent, SchemaFileList } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Select } from "../components/Field";
import { Loading, EmptyState } from "../components/States";
import { IconPlus, IconSchema } from "../layout/icons";
import { SchemaEditor, type EditorTarget } from "./schema/SchemaEditor";
import { MigrationPreviewModal } from "./schema/MigrationPreviewModal";
import "./schema.css";

export function SchemaBuilderPage() {
  const { onUnauthorized } = useAuth();
  const [plugins, setPlugins] = useState<string[]>([]);
  const [plugin, setPlugin] = useState<string>("");
  const [files, setFiles] = useState<SchemaFileList>({ schemas: [], patches: [] });
  const [tables, setTables] = useState<string[]>([]);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [preview, setPreview] = useState(false);

  const handleErr = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) onUnauthorized();
  };

  // Load the plugin list once.
  useEffect(() => {
    call<string[]>("list_plugins")
      .then((list) => {
        setPlugins(list);
        if (list.length && !plugin) setPlugin(list[0]);
      })
      .catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh a plugin's file list + tables. Does NOT touch the open editor,
  // so it's safe to call after a save (which just added/renamed a file).
  const refreshFiles = (name: string) => {
    setLoadingFiles(true);
    Promise.all([
      call<SchemaFileList>("list_schema_files", { plugin: name }),
      call<string[]>("list_tables", { plugin: name }).catch(() => [] as string[]),
    ])
      .then(([f, t]) => {
        setFiles(f);
        setTables(t);
      })
      .catch(handleErr)
      .finally(() => setLoadingFiles(false));
  };

  // Switching plugins clears the editor, then loads the new plugin's files.
  const loadPlugin = (name: string) => {
    setTarget(null);
    refreshFiles(name);
  };

  useEffect(() => {
    if (plugin) loadPlugin(plugin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin]);

  const nextOpenId = () => Date.now();

  const openFile = async (kind: "schema" | "patch", name: string) => {
    try {
      const fn = kind === "schema" ? "get_schema_file" : "get_patch_file";
      const content = await call<SchemaFileContent>(fn, { plugin, name });
      setTarget({ openId: nextOpenId(), kind, name, isNew: false, content: normalize(content) });
    } catch (err) {
      handleErr(err);
    }
  };

  const newFile = (kind: "schema" | "patch") => {
    setTarget({
      openId: nextOpenId(),
      kind,
      name: "",
      isNew: true,
      content: { system: false, audit: false, child: false, fields: [], index: [] },
    });
  };

  const onSaved = (_kind: "schema" | "patch", name: string) => {
    refreshFiles(plugin);
    // Keep the editor open on the just-saved file, now an existing file.
    setTarget((t) => (t ? { ...t, name, isNew: false } : t));
  };
  const onDeleted = () => {
    setTarget(null);
    refreshFiles(plugin);
  };

  return (
    <>
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

      <div className="schema-toolbar">
        <label className="schema-toolbar__label">Plugin</label>
        <Select value={plugin} onChange={(e) => setPlugin(e.target.value)} style={{ width: 220 }}>
          {plugins.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      <div className="schema-layout">
        <aside className="schema-files card">
          <FileGroup
            title="Schemas"
            names={files.schemas}
            activeName={target?.kind === "schema" ? target.name : null}
            onOpen={(n) => openFile("schema", n)}
            onNew={() => newFile("schema")}
            loading={loadingFiles}
          />
          <FileGroup
            title="Patches"
            names={files.patches}
            activeName={target?.kind === "patch" ? target.name : null}
            onOpen={(n) => openFile("patch", n)}
            onNew={() => newFile("patch")}
            loading={loadingFiles}
          />
        </aside>

        <section className="schema-main">
          {target ? (
            <SchemaEditor
              key={target.openId}
              plugin={plugin}
              target={target}
              tables={tables}
              onSaved={onSaved}
              onDeleted={onDeleted}
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
        </section>
      </div>

      {preview && <MigrationPreviewModal plugin={plugin} onClose={() => setPreview(false)} />}
    </>
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
