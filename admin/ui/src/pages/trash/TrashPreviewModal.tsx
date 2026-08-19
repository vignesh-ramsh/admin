import { useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { FieldMeta, TableSchema, TrashRowDetail } from "../../api/types";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { LoadingBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { FieldGrid } from "../data/RowEditorRoute";
import { FieldPreview } from "../data/FieldPreview";
import { MultiFilePreview } from "../data/MultiFilePreview";
import { formatDateTime } from "../shared/datetime";

/** Every readable column, not just editableFields() — same reasoning as
 *  ExportModal's own allExportableFields(): this is a read-only preview of
 *  what's about to be restored, so id/created_at/etc. are exactly what's
 *  worth seeing, not noise to filter out. TABLE fields are skipped (no
 *  `is_column` field ever needs excluding for that reason elsewhere, but
 *  here it matters doubly: a deleted row's child rows were cascaded into
 *  their OWN separate trash entries, not carried in this snapshot, so
 *  there's nothing live to show under a child-table section anyway). */
function previewableFields(schema: TableSchema): FieldMeta[] {
  return [...schema.system_fields.filter((f) => f.is_column), ...schema.fields.filter((f) => f.is_column)];
}

export function TrashPreviewModal({
  trashId,
  onClose,
  onRestored,
}: {
  trashId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const toast = useToast();
  const [entry, setEntry] = useState<TrashRowDetail | null>(null);
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [schemaFailed, setSchemaFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEntry(null);
    setSchema(null);
    setSchemaFailed(false);
    call<TrashRowDetail>("get_trash_row", { trash_id: trashId }, { method: "GET" })
      .then(async (row) => {
        if (cancelled) return;
        setEntry(row);
        try {
          const s = await call<TableSchema>("get_table_schema", { table: row.table }, { method: "GET" });
          if (!cancelled) setSchema(s);
        } catch {
          // The original table was dropped since this row was deleted —
          // fall back to a raw JSON view rather than a dead end.
          if (!cancelled) setSchemaFailed(true);
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : "Failed to load trash entry");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashId]);

  const restore = async () => {
    setRestoring(true);
    try {
      await call("restore_trash_row", { trash_id: trashId });
      toast.success(`Restored into ${entry?.table}.`);
      onRestored();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to restore");
    } finally {
      setRestoring(false);
    }
  };

  const fields = schema ? previewableFields(schema) : [];

  return (
    <Modal
      title={entry ? `Deleted row — ${entry.table}` : "Deleted row"}
      subtitle={entry ? `Deleted by ${entry.deleted_by ?? "unknown"} · ${formatDateTime(entry.deleted_at)}` : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={restoring}>
            Close
          </Button>
          {entry && !schemaFailed && (
            <Button variant="primary" onClick={restore} loading={restoring}>
              Restore
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <LoadingBlock label="Loading…" />
      ) : !entry ? (
        <p className="text-sm text-text-muted">Not found.</p>
      ) : schemaFailed ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
            <strong>{entry.table}</strong> no longer exists, so this can't be restored — showing the raw saved data
            instead.
          </p>
          <pre className="scrollbar-thin max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 font-mono text-[12px] text-text dark:bg-neutral-900/40">
            {JSON.stringify(entry.snapshot, null, 2)}
          </pre>
        </div>
      ) : (
        schema && (
          <FieldGrid
            fields={fields}
            isEmpty={(f) => entry.snapshot[f.name] == null || entry.snapshot[f.name] === ""}
            emptyMessage="No information available."
            renderField={(f) => (
              <div key={f.id || f.name} className={f.type === "TEXT" || f.type === "JSON" || f.type === "MULTIFILE" ? "sm:col-span-2" : undefined}>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  {f.name}
                  <span className="ml-1.5 text-[10px] font-normal text-text-faint">{f.type}</span>
                </label>
                {f.type === "MULTIFILE" ? (
                  <MultiFilePreview value={entry.snapshot[f.name]} onOpenFile={() => {}} />
                ) : (
                  <FieldPreview field={f} value={entry.snapshot[f.name]} parentTable={schema.parent_table} />
                )}
              </div>
            )}
          />
        )
      )}
    </Modal>
  );
}
