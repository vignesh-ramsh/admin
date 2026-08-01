import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import type { SchemaFileContent } from "../../api/types";
import { ErrorBlock, LoadingBlock } from "../../components/States";
import type { SchemaBuilderOutletContext } from "./SchemaBuilderPage";
import { SchemaFileEditor } from "./SchemaFileEditor";

function normalize(content: SchemaFileContent): SchemaFileContent {
  return {
    system: !!content.system,
    audit: !!content.audit,
    child: !!content.child,
    fields: (content.fields ?? []).map((f) => ({ ...f })),
    index: content.index ?? [],
  };
}

export function SchemaFileEditorRoute() {
  const { kind, name } = useParams<{ kind: "schemas" | "patches"; name: string }>();
  const navigate = useNavigate();
  const { plugins, entries, tableMeta, refresh } = useOutletContext<SchemaBuilderOutletContext>();

  const [content, setContent] = useState<SchemaFileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The file's owning plugin isn't in the URL (the routing contract only
  // has :kind/:name) — resolved from the merged file listing the parent
  // page already fetched across every installed plugin.
  const plugin = entries.find((e) => e.kind === kind && e.name === name)?.plugin ?? plugins[0] ?? "";

  useEffect(() => {
    if (!kind || !name || !plugin) return;
    setLoading(true);
    setError(null);
    const fn = kind === "patches" ? "get_patch_file" : "get_schema_file";
    call<SchemaFileContent>(fn, { plugin, name }, { method: "GET" })
      .then((c) => setContent(normalize(c)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load file"))
      .finally(() => setLoading(false));
  }, [kind, name, plugin]);

  if (!kind || !name) return null;
  if (loading) return <LoadingBlock label="Loading file…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!content) return null;

  return (
    <SchemaFileEditor
      key={`${plugin}/${kind}/${name}`}
      plugin={plugin}
      kind={kind}
      name={name}
      isNew={false}
      content={content}
      plugins={plugins}
      tableMeta={tableMeta}
      onSaved={(savedKind, savedName) => {
        refresh();
        navigate(`/schema/${savedKind}/${savedName}`);
      }}
      onDeleted={() => {
        refresh();
        navigate("/schema");
      }}
    />
  );
}
