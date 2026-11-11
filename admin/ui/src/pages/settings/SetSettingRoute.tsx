import { useCallback, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import type { SettingEntry } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { TextInput, TextArea, Select, Checkbox, Switch } from "../../components/Field";
import { LoadingBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { SETTING_TYPE_CHOICES, boolToSettingValue, settingValueToBool, validateSettingValue } from "./settingTypes";
import { MAX_DESCRIPTION_CHARS, SettingAbout } from "./SettingAbout";

const NEW_KEY_SENTINEL = "__new__";

export function SetSettingRoute() {
  const navigate = useNavigate();
  const { key: rawKey } = useParams<{ key: string }>();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const isCreating = rawKey === NEW_KEY_SENTINEL;

  const loader = useCallback(
    () => (isCreating ? Promise.resolve<SettingEntry[]>([]) : call<SettingEntry[]>("list_settings")),
    [isCreating],
  );
  const { data, loading } = useAsync(loader, [isCreating]);

  const existing = isCreating ? null : (data ?? []).find((r) => r.key === decodeURIComponent(rawKey ?? "")) ?? null;

  const close = () => navigate("/settings");

  if (loading) {
    return (
      <Modal title="Loading…" onClose={close}>
        <LoadingBlock label="Loading setting…" />
      </Modal>
    );
  }

  return <SetSettingForm existing={isCreating ? null : existing} defaultKey={isCreating ? "" : decodeURIComponent(rawKey ?? "")} onClose={close} onSaved={() => { reload(); close(); }} />;
}

function SetSettingForm({
  existing,
  defaultKey,
  onClose,
  onSaved,
}: {
  existing: SettingEntry | null;
  defaultKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [about, setAbout] = useState<SettingEntry | null>(existing);
  const [editingDescription, setEditingDescription] = useState(false);
  const isEditing = existing !== null;
  const [key, setKey] = useState(existing?.key ?? defaultKey);
  const [value, setValue] = useState(existing?.kind === "setting" ? existing.value ?? "" : "");
  const [secret, setSecret] = useState(existing?.kind === "secret");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only when adding: the type the new key is created with, and what it is for. Both are fixed at creation —
  // the server refuses to change either through this form — so editing shows neither as a field (the type is
  // shown, read-only, in the About panel above).
  const [newType, setNewType] = useState<NonNullable<SettingEntry["type"]>>("str");
  const [description, setDescription] = useState("");
  const trimmedDescription = description.trim();
  const descriptionTooLong = trimmedDescription.length > MAX_DESCRIPTION_CHARS;

  // An existing key's type is the one it already has (declared in code, or given when it was added). A new
  // key's is the one being chosen.
  const settingType = isEditing ? (existing.type ?? null) : newType;
  // Adding starts with an empty value, which is not an error yet, only not saveable yet.
  const valueMissing = !isEditing && value.trim() === "";
  const valueError = valueMissing ? null : validateSettingValue(settingType, value);
  const descriptionMissing = !isEditing && trimmedDescription === "";
  // A key that decides what ARC runs or which files it can reach is changed on the server, not here — the
  // server refuses it from this console, so the form does not offer it.
  const operatorOnly = existing?.operator_only === true;
  const cannotSave = operatorOnly || (secret && !confirmed) || !!valueError || valueMissing || descriptionMissing || descriptionTooLong;

  const chooseType = (next: NonNullable<SettingEntry["type"]>) => {
    setNewType(next);
    // a bool is a switch, so it starts at a real value; leaving bool clears that value rather than keeping "false"
    if (next === "bool") setValue("false");
    else if (newType === "bool") setValue("");
  };

  const submit = async () => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      toast.error("A key is required.");
      return;
    }
    if (secret && !confirmed) {
      toast.error("Check the confirmation box below first.");
      return;
    }
    if (valueError) {
      toast.error(valueError);
      return;
    }
    if (valueMissing) {
      toast.error("A value is required.");
      return;
    }
    if (descriptionMissing) {
      toast.error("Say in a sentence what this is for.");
      return;
    }
    setBusy(true);
    try {
      await call(
        "set_setting",
        isEditing
          ? { key: trimmedKey, value, secret }
          : { key: trimmedKey, value, secret, value_type: newType, description: trimmedDescription },
      );
      toast.success(`Saved "${trimmedKey}".`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  // Ctrl/Cmd+S saves the value; not while a description is being typed in the panel above it
  useSaveShortcut(submit, !busy && !cannotSave && !editingDescription);

  return (
    <Modal
      title={isEditing ? `Edit — ${existing.key}` : "Add setting"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={cannotSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {about && (
          <SettingAbout
            entry={about}
            onEditingChange={setEditingDescription}
            onChange={(next) => {
              if (next === null) {
                onSaved(); // a hand-added key that had nothing left but its description: it is gone
                return;
              }
              setAbout(next);
            }}
          />
        )}
        <TextInput
          label="Key"
          hint={isEditing ? "Can't rename — delete and re-add under a new key instead." : "e.g. redix_url, authn_min_password_score"}
          placeholder="key_name"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={isEditing}
          autoFocus={!isEditing}
        />

        {!isEditing && (
          <>
            <Select
              label="Type"
              hint="Decides what values are accepted. Set once — it can't be changed afterwards."
              value={newType}
              onChange={(e) => chooseType(e.target.value as NonNullable<SettingEntry["type"]>)}
            >
              {SETTING_TYPE_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </Select>
            <TextArea
              label="Description"
              required
              rows={3}
              placeholder="In a sentence or two: what is this for, and what happens when it changes?"
              hint={`${trimmedDescription.length} of ${MAX_DESCRIPTION_CHARS} characters. Shown to everyone who opens this; you can edit it later.`}
              error={descriptionTooLong ? `Too long: ${trimmedDescription.length} of ${MAX_DESCRIPTION_CHARS} characters.` : undefined}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </>
        )}

        {settingType === "bool" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-muted">Value</span>
            <Switch
              checked={settingValueToBool(value)}
              onChange={(v) => setValue(boolToSettingValue(v))}
              label={settingValueToBool(value) ? "True" : "False"}
              disabled={operatorOnly}
            />
          </div>
        ) : (
          <TextInput
            label="Value"
            type={settingType === "int" || settingType === "float" ? "number" : "text"}
            step={settingType === "float" ? "any" : undefined}
            error={valueError ?? undefined}
            hint={
              operatorOnly
                ? `Can only be changed on the server: arc settings set ${existing?.key} <value>`
                : isEditing && existing.kind === "secret"
                  ? "Enter a new value to overwrite — the current value is never shown here."
                  : undefined
            }
            disabled={operatorOnly}
            placeholder={isEditing && existing.kind === "secret" ? "New value…" : "value"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={isEditing && !operatorOnly}
          />
        )}

        <Checkbox
          checked={secret}
          disabled={isEditing}
          onChange={(e) => {
            setSecret(e.target.checked);
            setConfirmed(false);
          }}
          label="This is a secret — value hidden by default, stored encrypted"
        />

        {secret && (
          <>
            <div className="rounded-lg border border-danger/30 bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">
              <strong>You're changing a secret.</strong> Most plugins read a setting once at boot — a new value
              here typically won't take effect until the relevant process (Gateway, a worker, etc.) restarts. Once
              this value has been viewed or changed, it can't be un-set back to "hidden" without re-entering it.
            </div>
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} label="I understand, save it anyway" />
          </>
        )}
      </div>
    </Modal>
  );
}
