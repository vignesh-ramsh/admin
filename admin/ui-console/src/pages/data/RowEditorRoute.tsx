import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import clsx from "clsx";
import { call, ApiError } from "../../api/client";
import type { Row } from "../../api/types";
import { Modal, ConfirmModal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { LoadingBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import type { DataTableOutletContext } from "./DataTableView";
import { FieldInput } from "./FieldInput";
import { editableFields, formatCell, toInputValue } from "./format";
import { validateField, validateValues, type Errors } from "./validate";
import { AuditHistoryPanel } from "./AuditHistoryPanel";

type Values = Record<string, string | boolean>;

export function RowEditorRoute({ mode }: { mode: "create" | "edit" }) {
  const { table, schema, readOnly, reloadRows } = useOutletContext<DataTableOutletContext>();
  const { rowId } = useParams<{ rowId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = editableFields(schema);

  const isCreate = mode === "create";
  const showAudit = !isCreate && !!schema.audit;

  const [values, setValues] = useState<Values>({});
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const close = () => navigate(`/data/${table}`);

  useEffect(() => {
    if (isCreate) {
      const seed: Values = {};
      for (const f of fields) {
        seed[f.name] = f.type === "BOOLEAN" ? f.default === true : f.default != null ? String(f.default) : "";
      }
      setValues(seed);
      return;
    }
    if (!rowId) return;
    setLoading(true);
    call<Row>("get_row", { table, id: rowId }, { method: "GET" })
      .then((r) => {
        setRow(r);
        const next: Values = {};
        for (const f of fields) {
          next[f.name] = f.type === "BOOLEAN" ? r[f.name] === true : toInputValue(f, r[f.name]);
        }
        setValues(next);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load row"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, rowId, isCreate]);

  const save = async () => {
    const found = validateValues(fields, values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...values };
      if (!isCreate && rowId) data.id = rowId;
      await call("save_row", { table, data });
      toast.success(isCreate ? "Row created." : "Row updated.");
      reloadRows();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save row");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!rowId) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      await call("delete_row", { table, id: rowId });
      toast.success("Row deleted (recoverable from _trash).");
      reloadRows();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete row");
    } finally {
      setDeleting(false);
    }
  };

  const viewOnly = readOnly || (!isCreate && loading);

  useSaveShortcut(save, !viewOnly && !saving);

  return (
    <>
      <Modal
        title={isCreate ? `New row — ${table}` : `${readOnly ? "View" : "Edit"} row — ${table}`}
        onClose={close}
        size="xl"
        scrollBody={false}
        footer={
          <>
            {!isCreate && !readOnly && (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)} loading={deleting} className="mr-auto">
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={close}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button variant="primary" onClick={save} loading={saving}>
                Save
              </Button>
            )}
          </>
        }
      >
        <div className={clsx("grid min-h-0 flex-1 grid-cols-1 gap-6", showAudit && "lg:grid-cols-[1fr_280px]")}>
          <div className="scrollbar-thin min-h-0 overflow-y-auto pr-1">
            {loading ? (
              <LoadingBlock label="Loading row…" />
            ) : (
              <div className="flex flex-col gap-5">
                {readOnly && (
                  <p className="rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
                    <strong>{table}</strong> is managed through its own dedicated screen — this view is read-only here to avoid bypassing its
                    validation.
                  </p>
                )}

                {row && (
                  <div className="rounded-md border border-border bg-neutral-50 p-3 dark:bg-neutral-900/40">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">Record metadata</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      <MetaItem label="id" value={String(row.id ?? "—")} mono />
                      <MetaItem label="created" value={formatCell(row.created_at)} />
                      <MetaItem label="updated" value={formatCell(row.updated_at)} />
                      <MetaItem label="state" value={String(row._state ?? "0")} />
                      {row.created_by != null && <MetaItem label="created by" value={String(row.created_by)} />}
                      {row.updated_by != null && <MetaItem label="updated by" value={String(row.updated_by)} />}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {fields.map((f) => (
                    <div key={f.id || f.name} className={f.type === "TEXT" || f.type === "JSON" || f.type === "MULTIFILE" ? "sm:col-span-2" : undefined}>
                      <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                        {f.name}
                        {f.required && <span className="ml-0.5 text-danger">*</span>}
                        <span className="ml-1.5 font-normal text-text-faint">{f.unique ? `${f.type} · unique` : f.type}</span>
                      </label>
                      <FieldInput
                        field={f}
                        value={values[f.name] ?? ""}
                        parentTable={schema.parent_table}
                        error={errors[f.name]}
                        disabled={viewOnly}
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
                </div>
              </div>
            )}
          </div>

          {showAudit && rowId && (
            <div className="flex min-h-0 flex-col overflow-hidden border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <AuditHistoryPanel plugin={schema.plugin} table={table} rowId={rowId} />
            </div>
          )}
        </div>
      </Modal>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete row"
          message="Delete this row? It is soft-deleted and recoverable from _trash."
          confirmLabel="Delete"
          danger
          onConfirm={del}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-text-faint">{label}</span>
      <span className={mono ? "truncate font-mono text-[11px] text-text" : "truncate text-text"}>{value}</span>
    </div>
  );
}
