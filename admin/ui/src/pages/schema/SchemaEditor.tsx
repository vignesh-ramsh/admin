import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { SchemaField, SchemaFileContent, SchemaIndex, TableMeta } from "../../api/types";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Input } from "../../components/Field";
import { Switch } from "../../components/agni/forms/Switch";
import { FieldEditor } from "./FieldEditor";
import { ApplyNowModal } from "./ApplyNowModal";
import { ConfirmModal } from "../shared/ConfirmModal";
import { useToast } from "../../components/Toast";
import { IconPlus } from "../../layout/icons";

export interface EditorTarget {
  openId: number; // stable across a save (unlike name/isNew) — used as the
  // React key so saving a new file doesn't remount and reset the editor.
  kind: "schema" | "patch";
  name: string;
  isNew: boolean;
  content: SchemaFileContent;
}

interface Props {
  plugin: string;
  target: EditorTarget;
  tableMeta: TableMeta[];
  onSaved: (kind: "schema" | "patch", name: string) => void;
  onDeleted: (kind: "schema" | "patch", name: string) => void;
  onApplied: () => void;
}

export function SchemaEditor({ plugin, target, tableMeta, onSaved, onDeleted, onApplied }: Props) {
  const toast = useToast();
  const [name, setName] = useState(target.name);
  const [content, setContent] = useState<SchemaFileContent>(target.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isPatch = target.kind === "patch";
  const flag = (k: "system" | "audit" | "child") => !!content[k];
  const setFlag = (k: "system" | "audit" | "child", v: boolean) =>
    setContent((c) => ({ ...c, [k]: v }));
  const setFields = (fields: SchemaField[]) => setContent((c) => ({ ...c, fields }));
  const setIndexes = (index: SchemaIndex[]) => setContent((c) => ({ ...c, index }));

  const save = async () => {
    if (!name.trim()) {
      toast.error("A file name is required.");
      return;
    }
    if (content.fields.length === 0 || content.fields.some((f) => !f.name.trim())) {
      toast.error("Every field needs a name, and there must be at least one field.");
      return;
    }
    setSaving(true);
    try {
      // Strip empty/undefined props so the on-disk JSON stays clean.
      const payload: SchemaFileContent = {
        ...(isPatch ? {} : { system: flag("system"), audit: flag("audit"), child: flag("child") }),
        fields: content.fields,
        ...(content.index && content.index.length ? { index: content.index } : {}),
      };
      const fn = isPatch ? "save_patch_file" : "save_schema_file";
      const res = await call<{ table: string }>(fn, { plugin, name: name.trim(), content: payload });
      toast.success(`Saved — table “${res.table}”.`, "Written to disk");
      onSaved(target.kind, name.trim());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save.", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const fn = isPatch ? "delete_patch_file" : "delete_schema_file";
      await call(fn, { plugin, name });
      toast.success(`Deleted ${target.kind} file “${name}”.`);
      onDeleted(target.kind, name);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  const addIndex = () =>
    setIndexes([...(content.index ?? []), { key: "", fields: [] }]);
  const updateIndex = (i: number, patch: Partial<SchemaIndex>) =>
    setIndexes((content.index ?? []).map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeIndex = (i: number) =>
    setIndexes((content.index ?? []).filter((_, idx) => idx !== i));

  return (
    <div className="card editor">
      <div className="card__header">
        <div className="inline">
          {target.isNew ? (
            <Input
              placeholder={isPatch ? "Table name to patch" : "Table Name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: 240 }}
              autoFocus
            />
          ) : (
            <span className="card__title">{name}</span>
          )}
          <Badge tone={isPatch ? "accent" : "neutral"}>{target.kind}</Badge>
        </div>
        <div className="inline">
          {!target.isNew && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} loading={deleting}>
                Delete
              </Button>
              {/* Reads the FILE on disk, so only meaningful once one exists
                  — a brand-new, unsaved file has nothing to apply yet. */}
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

      {showApply && (
        <ApplyNowModal
          plugin={plugin}
          kind={target.kind}
          name={name}
          onClose={() => setShowApply(false)}
          onApplied={onApplied}
        />
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Delete file"
          message={`Delete ${target.kind} file "${name}"? This removes the JSON file from disk.`}
          onConfirm={del}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      <div className="card__body row-gap">
        {!isPatch && (
          <div className="flags">
            <FlagToggle label="Audit" hint="Track every change in _audit_*" checked={flag("audit")} onChange={(v) => setFlag("audit", v)} />
            <FlagToggle label="System" hint="Self-declares all fields; advanced" checked={flag("system")} onChange={(v) => setFlag("system", v)} />
            <FlagToggle label="Child" hint="Child table of a TABLE field" checked={flag("child")} onChange={(v) => setFlag("child", v)} />
          </div>
        )}

        <div>
          <div className="section-label">Fields</div>
          <FieldEditor fields={content.fields} system={flag("system")} tableMeta={tableMeta} onChange={setFields} />
        </div>

        {!isPatch && (
          <div>
            <div className="spread">
              <div className="section-label" style={{ margin: 0 }}>Indexes</div>
              <Button variant="ghost" size="sm" onClick={addIndex}>
                <IconPlus /> Add index
              </Button>
            </div>
            {(content.index ?? []).length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: "6px 0" }}>No indexes defined.</div>
            ) : (
              <div className="row-gap" style={{ gap: 8, marginTop: 8 }}>
                {(content.index ?? []).map((ix, i) => (
                  <div className="index-row" key={i}>
                    <input
                      className="input"
                      placeholder="idx_name"
                      value={ix.key}
                      onChange={(e) => updateIndex(i, { key: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="field1, field2"
                      value={ix.fields.join(", ")}
                      onChange={(e) =>
                        updateIndex(i, {
                          fields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                    />
                    <button className="fields__remove" onClick={() => removeIndex(i)} aria-label="Remove index">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FlagToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flag ${checked ? "flag--on" : ""}`} style={{ cursor: "pointer" }}>
      <Switch checked={checked} onChange={onChange} />
      <span className="flag__body">
        <span className="flag__label">{label}</span>
        <span className="flag__hint">{hint}</span>
      </span>
    </label>
  );
}
