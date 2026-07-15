import { useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { Row, TableSchema } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Badge } from "../../components/Badge";
import { Loading } from "../../components/States";
import { useToast } from "../../components/Toast";
import { FieldInput } from "./FieldInput";
import { editableFields, formatCell, toInputValue } from "./format";
import { useUserDirectory } from "../shared/useUserDirectory";
import { validateField, validateValues, type Errors } from "./validate";
import { AuditHistoryPanel } from "./AuditHistoryPanel";

type Values = Record<string, string | boolean>;

interface Props {
  table: string;
  schema: TableSchema;
  rowId: string | null; // null = create
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function RowEditorModal({ table, schema, rowId, readOnly, onClose, onSaved }: Props) {
  const toast = useToast();
  const fields = editableFields(schema);
  const dir = useUserDirectory();
  const [values, setValues] = useState<Values>({});
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(!!rowId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [auditCollapsed, setAuditCollapsed] = useState(false);
  const showAuditPanel = !!rowId && !!schema.audit;

  useEffect(() => {
    if (!rowId) {
      // Create: seed from each field's declared default.
      const seed: Values = {};
      for (const f of fields) {
        seed[f.name] = f.type === "BOOLEAN" ? f.default === true : f.default != null ? String(f.default) : "";
      }
      setValues(seed);
      return;
    }
    setLoading(true);
    call<Row>("get_row", { table, id: rowId })
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
  }, [table, rowId]);

  const save = async () => {
    // Catch what the server would reject anyway, per-field, before the
    // round trip. The server still validates — this is just earlier.
    const found = validateValues(fields, values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    setSaving(true);
    try {
      // Send raw form values — admin._coerce converts them server-side.
      const data: Record<string, unknown> = { ...values };
      if (rowId) data.id = rowId;
      await call("save_row", { table, data });
      toast.success(rowId ? "Row updated." : "Row created.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save row", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!rowId) return;
    if (!confirm("Delete this row? It is soft-deleted and recoverable from _trash.")) return;
    setDeleting(true);
    try {
      await call("delete_row", { table, id: rowId });
      toast.success("Row deleted (recoverable from _trash).");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete row");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={!rowId ? `New row — ${table}` : `${readOnly ? "View" : "Edit"} row — ${table}`}
      onClose={onClose}
      wide
      className={showAuditPanel ? "modal--with-audit" : undefined}
      footer={
        <>
          {rowId && !readOnly && (
            <Button variant="ghost" onClick={del} loading={deleting} style={{ marginRight: "auto" }}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
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
      {(() => {
        const body = loading ? (
          <Loading message="Loading row…" />
        ) : (
          <div className="row-gap">
            {readOnly && (
              <div className="notice">
                <strong>{table}</strong> is managed through its own dedicated screen — this view is
                read-only here to avoid bypassing its validation.
              </div>
            )}

            <div className="form-grid">
              {fields.map((f) => (
                <Field
                  key={f.id || f.name}
                  label={`${f.name}${f.required ? " *" : ""}`}
                  hint={hintFor(f.type, f.unique)}
                >
                  <FieldInput
                    field={f}
                    value={values[f.name] ?? ""}
                    onChange={(v) => {
                      setValues((prev) => ({ ...prev, [f.name]: v }));
                      setErrors((prev) => {
                        if (!prev[f.name]) return prev;
                        const next = { ...prev };
                        if (!validateField(f, v)) delete next[f.name];
                        return next;
                      });
                    }}
                    disabled={readOnly}
                  />
                  {errors[f.name] && <span className="field-error">{errors[f.name]}</span>}
                </Field>
              ))}
            </div>

            {row && (
              <div className="meta">
                <div className="meta__title">Record metadata</div>
                <div className="meta__grid">
                  <MetaItem label="id" value={String(row.id ?? "—")} mono />
                  <MetaItem label="created" value={formatCell(row.created_at)} />
                  <MetaItem label="updated" value={formatCell(row.updated_at)} />
                  <MetaItem label="state" value={String(row._state ?? "0")} />
                  {row.created_by != null && (
                    <MetaItem label="created by" value={dir.emailFor(String(row.created_by))} />
                  )}
                  {row.updated_by != null && (
                    <MetaItem label="updated by" value={dir.emailFor(String(row.updated_by))} />
                  )}
                </div>
              </div>
            )}
          </div>
        );

        if (!showAuditPanel) return body;

        return (
          <div className="row-editor__split">
            <div className="row-editor__main">{body}</div>
            <AuditHistoryPanel
              plugin={schema.plugin}
              table={table}
              rowId={rowId as string}
              collapsed={auditCollapsed}
              onToggleCollapsed={() => setAuditCollapsed((c) => !c)}
            />
          </div>
        );
      })()}
    </Modal>
  );
}

function hintFor(type: string, unique: boolean): string {
  return unique ? `${type} · unique` : type;
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="meta__item">
      <span className="meta__label">{label}</span>
      <span className={`meta__value ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

export function TableFlags({ schema }: { schema: TableSchema }) {
  return (
    <div className="inline">
      {schema.system && <Badge tone="warning">system</Badge>}
      {schema.child && <Badge tone="accent">child</Badge>}
      {schema.audit && <Badge tone="neutral">audited</Badge>}
    </div>
  );
}
