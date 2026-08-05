import { useEffect, useState } from "react";
import { Paperclip, ExternalLink } from "lucide-react";
import { call } from "../../api/client";
import type { FieldMeta, TableSchema } from "../../api/types";
import { Badge } from "../../components/Badge";
import { loadTableMeta } from "./tableMeta";
import { resolveFilerFile, type FilerLookup } from "./format";
import { formatDateTime } from "../shared/datetime";

/* The read-only counterpart to FieldInput — renders a field's VALUE, typed
   by its schema type, instead of an editable control. This is what the Row
   Preview modal shows by default; MULTIFILE and TABLE fields are
   deliberately NOT handled here (they get their own compact-table
   components, MultiFilePreview/ChildTablePreview) since a single value
   cell can't represent "many rows" the way this component's every other
   branch represents "one value." */

const EMPTY = <span className="text-text-faint">—</span>;

interface Props {
  field: FieldMeta;
  value: unknown;
  /** Same REFERENCE_UUID special case FieldInput/ReferencePicker already
   *  have — a child row's own `parent` field resolves against the PARENT
   *  table, which field.target never names (psqldb fills that FK in at
   *  migration time, not on the Field itself). */
  parentTable?: string | null;
  /** FILE only — lets the caller (RowEditorRoute) open this file's full
   *  detail in the expanded side panel on click. Renders as plain
   *  (non-interactive) text when omitted. */
  onOpenFile?: (fileId: string) => void;
}

export function FieldPreview({ field, value, parentTable, onOpenFile }: Props) {
  const t = field.type;

  if (value === null || value === undefined || value === "") return EMPTY;

  if (t === "REFERENCE" || t === "REFERENCE_UUID") {
    return <ResolvedReferenceValue field={field} value={String(value)} parentTable={parentTable} />;
  }

  if (t === "BOOLEAN") {
    const truthy = value === true || value === "true";
    return <Badge tone={truthy ? "success" : "neutral"}>{truthy ? "Yes" : "No"}</Badge>;
  }

  if (t === "SELECT") {
    return <Badge tone="accent">{String(value)}</Badge>;
  }

  if (t === "FILE") {
    return <FilePreviewChip fileId={String(value)} onOpen={onOpenFile} />;
  }

  if (t === "JSON") {
    return (
      <pre className="scrollbar-thin max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-2 font-mono text-[12px] text-text dark:bg-neutral-900/40">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (t === "DATETIME") {
    return <span className="text-text">{formatDateTime(String(value))}</span>;
  }

  if (t === "DATE") {
    const d = new Date(String(value));
    return <span className="text-text">{Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })}</span>;
  }

  if (t === "INT" || t === "FLOAT" || t === "DECIMAL") {
    return <span className="font-mono text-[13px] tabular-nums text-text">{String(value)}</span>;
  }

  if (t === "TEXT") {
    return <p className="whitespace-pre-wrap break-words text-text">{String(value)}</p>;
  }

  return <span className="break-words text-text">{String(value)}</span>;
}

export function FilePreviewChip({ fileId, onOpen }: { fileId: string; onOpen?: (fileId: string) => void }) {
  const [lookup, setLookup] = useState<FilerLookup | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    resolveFilerFile(fileId).then((r) => !cancelled && setLookup(r));
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const label = lookup === undefined ? "Resolving…" : lookup === null ? fileId : lookup.filename;

  if (!onOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 text-text">
        <Paperclip size={13} className="shrink-0 text-text-faint" />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(fileId)}
      className="inline-flex cursor-pointer items-center gap-1.5 text-accent-600 hover:underline dark:text-accent-400"
    >
      <Paperclip size={13} className="shrink-0" />
      <span className="truncate">{label}</span>
      <ExternalLink size={11} className="shrink-0 opacity-60" />
    </button>
  );
}

/** Same "what's stored vs. what's shown" split ReferencePicker's own
 *  module docstring documents: target_field set -> the stored value
 *  already IS the natural key, no lookup needed; otherwise the stored
 *  value is the target row's UUID and its own natural-key field has to be
 *  resolved with one single-row fetch. */
function ResolvedReferenceValue({ field, value, parentTable }: { field: FieldMeta; value: string; parentTable?: string | null }) {
  // target_field set -> the stored value already IS the natural key, no
  // lookup needed — but the hook below still has to run every render
  // (Rules of Hooks), so it's the effect itself that no-ops in this case,
  // not an early return before the hook.
  const hasNaturalKey = !!field.target_field;
  const [label, setLabel] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (hasNaturalKey) return;
    let cancelled = false;
    setLabel(undefined);
    const stem = field.target;
    const resolveTarget = parentTable ? Promise.resolve(parentTable) : stem ? loadTableMeta().then((meta) => meta.find((m) => m.name === stem)?.table ?? stem) : null;
    if (!resolveTarget) {
      setLabel(null);
      return;
    }
    resolveTarget
      .then(async (physical) => {
        if (cancelled) return null;
        const targetSchema = await call<TableSchema>("get_table_schema", { table: physical }, { method: "GET" }).catch(() => null);
        const labelField = targetSchema?.fields.find((f) => f.unique && f.is_column)?.name ?? "id";
        const row = await call<Record<string, unknown>>("get_row", { table: physical, id: value }, { method: "GET" }).catch(() => null);
        return row ? (row[labelField] ?? row.id) : null;
      })
      .then((v) => !cancelled && setLabel(v != null ? String(v) : null))
      .catch(() => !cancelled && setLabel(null));
    return () => {
      cancelled = true;
    };
  }, [hasNaturalKey, field.target, parentTable, value]);

  if (hasNaturalKey) return <span className="text-text">{value}</span>;
  if (label === undefined) return <span className="text-text-faint">Resolving…</span>;
  return <span className="text-text">{label ?? value}</span>;
}
