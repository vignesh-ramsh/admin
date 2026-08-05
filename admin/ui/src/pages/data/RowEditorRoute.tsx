import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { History, Pencil } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Row } from "../../api/types";
import { Modal, ConfirmModal } from "../../components/Modal";
import { Button, IconButton } from "../../components/Button";
import { LoadingBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import type { DataTableOutletContext } from "./DataTableView";
import { FieldInput } from "./FieldInput";
import { FieldPreview } from "./FieldPreview";
import { ChildTablePreview } from "./ChildTablePreview";
import { MultiFilePreview } from "./MultiFilePreview";
import { ExpandedPanel, type ExpandedPanelState } from "./ExpandedPanel";
import { editableFields, formatCell, toInputValue } from "./format";
import { validateField, validateValues, type Errors } from "./validate";

type Values = Record<string, string | boolean>;
type ViewState = "preview" | "edit";

export function RowEditorRoute({ mode }: { mode: "create" | "edit" }) {
  const { table, schema, readOnly, reloadRows } = useOutletContext<DataTableOutletContext>();
  const { rowId } = useParams<{ rowId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const fields = editableFields(schema);
  // TABLE fields never appear in editableFields() (is_column is false for
  // TABLE — it renders no column of its own), so they're resolved
  // separately here for the child-table preview sections.
  const childFields = schema.fields.filter((f) => f.type === "TABLE");

  const isCreate = mode === "create";
  const [viewState, setViewState] = useState<ViewState>(isCreate ? "edit" : "preview");
  const [panel, setPanel] = useState<ExpandedPanelState>(null);
  // Bumped whenever a child row is added/edited/deleted via the expand
  // panel — ChildTablePreview has no other way to know its own list is
  // now stale (it owns its own cursor list, independently of this route).
  const [childRefreshToken, setChildRefreshToken] = useState(0);

  const [values, setValues] = useState<Values>({});
  const [original, setOriginal] = useState<Values>({});
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
        setOriginal(next);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load row"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, rowId, isCreate]);

  const startEdit = () => setViewState("edit");
  const cancelEdit = () => {
    setValues(original);
    setErrors({});
    setViewState("preview");
  };
  // Opening the SAME thing that's already showing toggles the panel
  // closed; opening a DIFFERENT thing (even the same kind — a different
  // child row, a different file) swaps its content in place, matching
  // "one slot, not a stack" (point 5). `row` is null for a "new child row"
  // panel — two such panels for the SAME child table compare equal (both
  // undefined ids), so opening "Add" twice in a row toggles it closed,
  // same as re-clicking any other already-open thing.
  const togglePanel = (next: ExpandedPanelState) =>
    setPanel((cur) => {
      if (!cur || !next || cur.kind !== next.kind) return next;
      if (cur.kind === "audit") return null;
      if (cur.kind === "file" && next.kind === "file") return cur.fileId === next.fileId ? null : next;
      if (cur.kind === "child" && next.kind === "child")
        return cur.childTable === next.childTable && cur.row?.id === next.row?.id ? null : next;
      return next;
    });

  const save = async () => {
    const found = validateValues(fields, values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    // Editing an existing row with nothing actually changed still isn't
    // worth a round trip: save_row always issues a real UPDATE, which
    // bumps updated_at and — on an audited table — writes a no-op
    // before===after row to _audit_*. Skip the call entirely rather than
    // let the backend write a change that never happened.
    if (!isCreate && fields.every((f) => values[f.name] === original[f.name])) {
      toast.show("No changes to save.");
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
  const isEditing = viewState === "edit";

  useSaveShortcut(save, isEditing && !viewOnly && !saving);

  const onChildRowSettled = () => {
    setChildRefreshToken((t) => t + 1);
    setPanel(null);
  };

  return (
    <>
      <Modal
        title={isCreate ? `New row — ${table}` : `${isEditing ? "Edit" : "View"} row — ${table}`}
        onClose={close}
        size={panel && !isCreate && rowId ? "panel-open" : "panel-closed"}
        scrollBody={false}
        footer={
          <>
            {!isCreate && !readOnly && (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)} loading={deleting} className="mr-auto">
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={isEditing && !isCreate ? cancelEdit : close}>
              {isEditing ? (isCreate ? "Cancel" : "Cancel edit") : "Close"}
            </Button>
            {isEditing && !readOnly && (
              <Button variant="primary" onClick={save} loading={saving}>
                Save
              </Button>
            )}
          </>
        }
      >
        {/* flex, not grid — the main column is a HARD fixed width at lg+
            (never `1fr`/proportional), so a sibling panel mounting/
            unmounting can only ever ADD or REMOVE its own space; it can
            never resize or rewrap anything already on screen. That's the
            actual fix for "the jump": a proportional column's rendered
            pixel width changes the instant the container's own width
            changes, which reflows every line of text inside it — a fixed
            column's doesn't, by construction, regardless of what its
            siblings do. */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
          <div
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1 lg:w-[52rem] lg:flex-none"
            // Empty-area double-click enters edit mode — e.target ===
            // e.currentTarget means the click landed on this wrapper
            // itself (the gap between sections), never on a field/button/
            // any actual content, since those are descendants and would
            // make e.target something else.
            onDoubleClick={(e) => {
              if (e.target === e.currentTarget && !isEditing && !isCreate && !readOnly) startEdit();
            }}
          >
            {loading ? (
              <LoadingBlock label="Loading row…" />
            ) : (
              <div
                className="flex flex-col gap-5"
                onDoubleClick={(e) => {
                  if (e.target === e.currentTarget && !isEditing && !isCreate && !readOnly) startEdit();
                }}
              >
                {readOnly && (
                  <p className="rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
                    <strong>{table}</strong> is managed through its own dedicated screen — this view is read-only here to avoid bypassing its
                    validation.
                  </p>
                )}

                <div className="flex items-center justify-end gap-2">
                  {!isEditing && !isCreate && !readOnly && (
                    <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={startEdit}>
                      Edit
                    </Button>
                  )}
                  {!isCreate && !!schema.audit && (
                    <IconButton
                      label="Audit history"
                      icon={<History size={15} />}
                      onClick={() => togglePanel({ kind: "audit" })}
                      className={panel?.kind === "audit" ? "bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300" : undefined}
                    />
                  )}
                </div>

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

                {isEditing ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {fields.map((f) => (
                      <div key={f.id || f.name} className={f.type === "TEXT" || f.type === "JSON" || f.type === "MULTIFILE" ? "sm:col-span-2" : undefined}>
                        <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                          {f.name}
                          {f.required && <span className="ml-0.5 text-danger">*</span>}
                          <span className="ml-1.5 text-[10px] font-normal text-text-faint">{f.type}</span>
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
                ) : (
                  row && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {fields.map((f) => (
                        <div key={f.id || f.name} className={f.type === "TEXT" || f.type === "JSON" || f.type === "MULTIFILE" ? "sm:col-span-2" : undefined}>
                          <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                            {f.name}
                            <span className="ml-1.5 text-[10px] font-normal text-text-faint">{f.type}</span>
                          </label>
                          {f.type === "MULTIFILE" ? (
                            <MultiFilePreview value={row[f.name]} onOpenFile={(fileId) => togglePanel({ kind: "file", fileId })} />
                          ) : (
                            <FieldPreview
                              field={f}
                              value={row[f.name]}
                              parentTable={schema.parent_table}
                              onOpenFile={f.type === "FILE" ? (fileId) => togglePanel({ kind: "file", fileId }) : undefined}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Child rows have their own independent lifecycle — a
                    separate row in a separate table, added/edited/deleted
                    via the expand panel — so this stays visible (and
                    interactive) regardless of whether the PARENT row
                    itself is being edited right now. */}
                {row &&
                  childFields.map((cf) => (
                    <div key={cf.id || cf.name}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">{cf.name}</p>
                      <ChildTablePreview
                        field={cf}
                        parentRowId={String(row.id)}
                        refreshToken={childRefreshToken}
                        onOpenChildRow={(childTable, childRow) => togglePanel({ kind: "child", childTable, row: childRow })}
                        onAddChildRow={(childTable, nextIdx) => togglePanel({ kind: "child", childTable, row: null, nextIdx })}
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>

          {panel && !isCreate && rowId && (
            <div className="flex min-h-0 flex-none flex-col overflow-hidden border-t border-border pt-4 lg:w-[21rem] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <ExpandedPanel
                state={panel}
                plugin={schema.plugin}
                table={table}
                rowId={rowId}
                onClose={() => setPanel(null)}
                onChildRowSaved={onChildRowSettled}
                onChildRowDeleted={onChildRowSettled}
              />
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
