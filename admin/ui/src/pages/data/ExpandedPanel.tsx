import { useEffect, useState } from "react";
import { Download, File as FileIcon, X } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { FilerFileRow, Row, RowPage, TableSchema } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { ConfirmModal } from "../../components/Modal";
import { LoadingBlock, ErrorBlock, EmptyState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { AuditHistoryPanel } from "./AuditHistoryPanel";
import { FieldInput } from "./FieldInput";
import { editableFields, toInputValue } from "./format";
import { validateField, validateValues, type Errors } from "./validate";
import { formatBytes, canPreviewInline, isImageType } from "../files/filerUtils";
import { formatDateTime } from "../shared/datetime";

/** One expanded-panel SLOT, not a stack — opening a child row or a file
 *  while the panel is already showing something else just swaps its
 *  content; the main preview column beside it never moves (point 4/5).
 *  `row: null` on the child variant means "create a new child row" —
 *  `nextIdx` is only meaningful in that case (the row's default `idx`,
 *  computed by the caller from the child list's own current total). */
export type ExpandedPanelState =
  | { kind: "audit" }
  | { kind: "child"; childTable: string; row: Row | null; nextIdx?: number }
  | { kind: "file"; fileId: string }
  | null;

export function ExpandedPanel({
  state,
  plugin,
  table,
  rowId,
  onClose,
  onChildRowSaved,
  onChildRowDeleted,
}: {
  state: ExpandedPanelState;
  plugin: string;
  table: string;
  rowId: string;
  onClose: () => void;
  /** Fires after a child row create/update succeeds — the caller bumps
   *  ChildTablePreview's refreshToken and closes the panel. */
  onChildRowSaved: () => void;
  /** Fires after a child row delete succeeds — same shape as onChildRowSaved. */
  onChildRowDeleted: () => void;
}) {
  if (!state) return null;

  const title =
    state.kind === "audit"
      ? "Audit history"
      : state.kind === "child"
        ? state.row
          ? `Row: ${state.childTable}`
          : `New row: ${state.childTable}`
        : "File";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-text">{title}</span>
        <IconButton label="Close panel" icon={<X size={15} />} onClick={onClose} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {state.kind === "audit" && <AuditHistoryPanel plugin={plugin} table={table} rowId={rowId} />}
        {state.kind === "child" && (
          <ChildRowDetail
            childTable={state.childTable}
            row={state.row}
            parentRowId={rowId}
            nextIdx={state.nextIdx}
            onSaved={onChildRowSaved}
            onDeleted={onChildRowDeleted}
          />
        )}
        {state.kind === "file" && <FileDetail fileId={state.fileId} />}
      </div>
    </div>
  );
}

/** Directly editable — no separate preview/edit toggle the way the parent
 *  row's own main view has one. This panel is already a second, deliberate
 *  "drill into detail" step; adding another click just to reach an editable
 *  form on top of that would fight the whole point of surfacing add/edit/
 *  delete for child rows "from the parent itself" at all. `parent` is
 *  fixed to the current parent row (never shown as its own field — it's
 *  implied by which row's panel you're in); `idx` stays a normal editable
 *  field so a row can be manually reordered. */
function ChildRowDetail({
  childTable,
  row,
  parentRowId,
  nextIdx,
  onSaved,
  onDeleted,
}: {
  childTable: string;
  row: Row | null;
  parentRowId: string;
  nextIdx?: number;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const isCreate = row === null;
  const [schema, setSchema] = useState<TableSchema | null | undefined>(undefined);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSchema(undefined);
    call<TableSchema>("get_table_schema", { table: childTable }, { method: "GET" })
      .then((s) => !cancelled && setSchema(s))
      .catch(() => !cancelled && setSchema(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childTable]);

  useEffect(() => {
    if (!schema) return;
    const fields = editableFields(schema).filter((f) => f.name !== "parent");
    const seed: Record<string, string | boolean> = {};
    for (const f of fields) {
      if (row) {
        seed[f.name] = f.type === "BOOLEAN" ? row[f.name] === true : toInputValue(f, row[f.name]);
      } else if (f.name === "idx") {
        seed[f.name] = String(nextIdx ?? 0);
      } else {
        seed[f.name] = f.type === "BOOLEAN" ? f.default === true : f.default != null ? String(f.default) : "";
      }
    }
    setValues(seed);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, row]);

  if (schema === undefined) return <LoadingBlock label="Loading row…" />;
  if (schema === null) return <ErrorBlock message="Could not load this row's schema." />;

  // Child schemas can never themselves declare a TABLE field (psqldb.
  // migrate rejects nested child tables at the schema level) — and
  // editableFields()'s own f.is_column filter already excludes TABLE
  // fields for every schema regardless, since a TABLE field renders no
  // column at all — so there's no TABLE case to special-case here.
  const fields = editableFields(schema).filter((f) => f.name !== "parent");

  const save = async () => {
    const found = validateValues(fields, values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...values, parent: parentRowId };
      if (!isCreate && row) data.id = row.id;
      await call("save_row", { table: childTable, data });
      toast.success(isCreate ? "Row created." : "Row updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save row");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!row) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      await call("delete_row", { table: childTable, id: row.id });
      toast.success("Row deleted (recoverable from _trash).");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete row");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.map((f) => (
        <div key={f.id || f.name}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-faint">{f.name}</label>
          <FieldInput
            field={f}
            value={values[f.name] ?? ""}
            error={errors[f.name]}
            onChange={(v) => {
              setValues((prev) => ({ ...prev, [f.name]: v }));
              setErrors((prev) => {
                if (!prev[f.name]) return prev;
                const next = { ...prev };
                if (!validateField(f, v)) delete next[f.name];
                return next;
              });
            }}
          />
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        {!isCreate && (
          <Button variant="ghost" size="sm" className="mr-auto text-danger" onClick={() => setConfirmingDelete(true)} loading={deleting}>
            Delete
          </Button>
        )}
        <Button variant="primary" size="sm" className={isCreate ? "ml-auto" : undefined} onClick={save} loading={saving}>
          {isCreate ? "Create" : "Save"}
        </Button>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete row"
          message="Delete this row? It is soft-deleted and recoverable from _trash."
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={del}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function FileDetail({ fileId }: { fileId: string }) {
  const [file, setFile] = useState<FilerFileRow | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setFile(undefined);
    (async () => {
      const rowPage = await call<RowPage>(
        "list_rows",
        { table: "filerfile", filters: { file_id: { eq: fileId } }, limit: 1 },
        { method: "QUERY" },
      );
      const raw = rowPage.rows[0];
      if (!raw) {
        if (!cancelled) setFile(null);
        return;
      }
      let url: string | null = null;
      try {
        const filesPage = await call<RowPage>(
          "list_filer_files",
          { q: String(raw.original_filename ?? ""), limit: 20 },
          { method: "GET" },
        );
        url = (filesPage.rows as unknown as FilerFileRow[]).find((f) => f.file_id === fileId)?.url ?? null;
      } catch {
        /* best-effort — the raw row is still enough to show identity/storage details */
      }
      if (!cancelled) setFile({ ...(raw as unknown as FilerFileRow), url });
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (file === undefined) return <LoadingBlock label="Loading file…" />;
  if (file === null) return <EmptyState title="File not found" description="It may have been deleted." bordered={false} />;

  const servable = file.url !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-border bg-neutral-50 p-3 dark:bg-neutral-900/40">
        {!servable ? (
          <div className="flex flex-col items-center gap-1.5 text-text-faint">
            <FileIcon size={28} />
            <span className="text-[12px]">No preview available</span>
          </div>
        ) : isImageType(file.content_type) ? (
          <img src={file.url!} alt={file.original_filename} className="max-h-[220px] max-w-full rounded object-contain" />
        ) : canPreviewInline(file.content_type) ? (
          <iframe src={file.url!} title={file.original_filename} className="h-[220px] w-full rounded border-0" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-center text-text-faint">
            <FileIcon size={28} />
            <span className="text-[12px]">No inline preview for {file.content_type}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[13px]">
        <DetailRow label="Name">{file.original_filename}</DetailRow>
        <DetailRow label="Size">{formatBytes(file.size_bytes)}</DetailRow>
        <DetailRow label="Type" mono>{file.content_type}</DetailRow>
        <DetailRow label="Storage">{file.storage}</DetailRow>
        <DetailRow label="Visibility">{file.private ? "Private" : "Public"}</DetailRow>
        <DetailRow label="Status">{file.status}</DetailRow>
        <DetailRow label="Uploaded by">{file.created_by || "—"}</DetailRow>
        <DetailRow label="Uploaded at">{formatDateTime(file.created_at)}</DetailRow>
      </div>

      {servable && (
        <a
          href={file.url!}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-text hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <Download size={14} /> Download
        </a>
      )}
    </div>
  );
}

function DetailRow({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-0">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className={mono ? "min-w-0 truncate font-mono text-[12px] text-text" : "min-w-0 truncate text-text"}>{children}</span>
    </div>
  );
}
