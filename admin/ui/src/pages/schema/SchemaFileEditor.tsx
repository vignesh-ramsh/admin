import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { SchemaField, SchemaFileContent, SchemaIndex, TableMeta } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select, Switch, TextInput } from "../../components/Field";
import { ConfirmModal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { Plus, Trash2 } from "lucide-react";
import { FieldEditor } from "./FieldEditor";
import { ApplyNowModal } from "./ApplyNowModal";
import { MigrationPreviewModal } from "./MigrationPreviewModal";

export interface SchemaFileEditorProps {
  plugin: string;
  kind: "schemas" | "patches";
  name: string;
  isNew: boolean;
  content?: SchemaFileContent;
  plugins: string[];
  tableMeta: TableMeta[];
  onSaved: (kind: "schemas" | "patches", name: string, plugin: string) => void;
  onDeleted: () => void;
  onCancel?: () => void;
}

function blankContent(): SchemaFileContent {
  return { system: false, audit: false, child: false, fields: [], index: [] };
}

export function SchemaFileEditor({ plugin, kind, name, isNew, content, plugins, tableMeta, onSaved, onDeleted, onCancel }: SchemaFileEditorProps) {
  const toast = useToast();
  const isPatch = kind === "patches";

  const [selectedPlugin, setSelectedPlugin] = useState(plugin);
  const [fileName, setFileName] = useState(name);
  const [form, setForm] = useState<SchemaFileContent>(content ?? blankContent());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showApply, setShowApply] = useState(false);

  const flag = (k: "system" | "audit" | "child") => !!form[k];
  const setFlag = (k: "system" | "audit" | "child", v: boolean) => setForm((c) => ({ ...c, [k]: v }));
  const setFields = (fields: SchemaField[]) => setForm((c) => ({ ...c, fields }));
  const setIndexes = (index: SchemaIndex[]) => setForm((c) => ({ ...c, index }));

  const save = async () => {
    if (!fileName.trim()) {
      toast.error("A file name is required.");
      return;
    }
    if (!selectedPlugin) {
      toast.error("A plugin is required.");
      return;
    }
    if (form.fields.length === 0 || form.fields.some((f) => !f.name.trim())) {
      toast.error("Every field needs a name, and there must be at least one field.");
      return;
    }
    setSaving(true);
    try {
      const payload: SchemaFileContent = {
        ...(isPatch ? {} : { system: flag("system"), audit: flag("audit"), child: flag("child") }),
        fields: form.fields,
        ...(form.index && form.index.length ? { index: form.index } : {}),
      };
      const fn = isPatch ? "save_patch_file" : "save_schema_file";
      const res = await call<{ table: string }>(fn, { plugin: selectedPlugin, name: fileName.trim(), content: payload });
      toast.success(`Saved — table "${res.table}".`);
      onSaved(kind, fileName.trim(), selectedPlugin);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(save, !saving);

  const del = async () => {
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const fn = isPatch ? "delete_patch_file" : "delete_schema_file";
      await call(fn, { plugin: selectedPlugin, name: fileName });
      toast.success(`Deleted ${isPatch ? "patch" : "schema"} file "${fileName}".`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  const addIndex = () => setIndexes([...(form.index ?? []), { key: "", fields: [] }]);
  const updateIndex = (i: number, patch: Partial<SchemaIndex>) => setIndexes((form.index ?? []).map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeIndex = (i: number) => setIndexes((form.index ?? []).filter((_, idx) => idx !== i));

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2.5">
          {isNew ? (
            <TextInput placeholder={isPatch ? "Table name to patch" : "TableName"} value={fileName} onChange={(e) => setFileName(e.target.value)} className="!h-8 w-56" autoFocus />
          ) : (
            <span className="text-[15px] font-semibold text-text">{fileName}</span>
          )}
          {isNew ? (
            <Select value={selectedPlugin} onChange={(e) => setSelectedPlugin(e.target.value)} className="!h-8 w-40">
              <option value="">plugin…</option>
              {plugins.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : (
            <Badge tone="neutral">{selectedPlugin}</Badge>
          )}
          <Badge tone={isPatch ? "accent" : "neutral"}>{isPatch ? "patch" : "schema"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {isNew && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {!isNew && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} loading={deleting}>
                Delete
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowPreview(true)}>
                Preview migration
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowApply(true)}>
                Apply Now
              </Button>
            </>
          )}
          <Button variant="primary" size="sm" onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </div>

      {showPreview && <MigrationPreviewModal plugin={selectedPlugin} table={fileName || undefined} onClose={() => setShowPreview(false)} />}
      {showApply && <ApplyNowModal plugin={selectedPlugin} kind={isPatch ? "patch" : "schema"} name={fileName} onClose={() => setShowApply(false)} onApplied={() => {}} />}
      {confirmingDelete && (
        <ConfirmModal
          title="Delete file"
          message={`Delete ${isPatch ? "patch" : "schema"} file "${fileName}"? This removes the JSON file from disk.`}
          confirmLabel="Delete"
          danger
          onConfirm={del}
          onClose={() => setConfirmingDelete(false)}
        />
      )}

      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-5">
          {!isPatch && (
            <div className="flex flex-wrap gap-4">
              <FlagToggle label="Audit" hint="Track every change in _audit_*" checked={flag("audit")} onChange={(v) => setFlag("audit", v)} />
              <FlagToggle label="System" hint="Self-declares all fields; advanced" checked={flag("system")} onChange={(v) => setFlag("system", v)} />
              <FlagToggle label="Child" hint="Child table of a TABLE field" checked={flag("child")} onChange={(v) => setFlag("child", v)} />
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">Fields ({form.fields.length})</p>
            <FieldEditor fields={form.fields} system={flag("system")} tableMeta={tableMeta} onChange={setFields} />
          </div>

          {!isPatch && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">Indexes</p>
                <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={addIndex}>
                  Add index
                </Button>
              </div>
              {(form.index ?? []).length === 0 ? (
                <p className="text-[13px] text-text-faint">No indexes defined.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(form.index ?? []).map((ix, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TextInput className="!h-8 w-48" placeholder="idx_name" value={ix.key} onChange={(e) => updateIndex(i, { key: e.target.value })} />
                      <TextInput
                        className="!h-8 flex-1"
                        placeholder="field1, field2"
                        value={ix.fields.join(", ")}
                        onChange={(e) => updateIndex(i, { fields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      />
                      <IconButton label="Remove index" icon={<Trash2 size={15} />} onClick={() => removeIndex(i)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FlagToggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2">
      <Switch checked={checked} onChange={onChange} />
      <span className="flex flex-col">
        <span className="text-[13px] font-medium text-text">{label}</span>
        <span className="text-xs text-text-faint">{hint}</span>
      </span>
    </label>
  );
}
