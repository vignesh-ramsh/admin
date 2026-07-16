import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { SettingEntry } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Input } from "../../components/Field";
import { useToast } from "../../components/Toast";

/* `existing === null` means "add a new key" — key/secret are freely
   editable. Editing an existing key locks both: the key because set()
   always upserts by name (there's no rename), and the secret/plain
   toggle because arc.settings.set() itself hard-errors on flipping an
   already-declared secret's kind without deleting it first (arc/arc/
   settings.py) — the lock here is what keeps that path from ever being
   hit by hand, not a redundant restriction.

   Saving a secret's value requires an extra confirmation checkbox first
   — by explicit design decision, changing a secret gets a real warning
   step, changing a plain setting does not. */
export function SetSettingModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: SettingEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEditing = existing !== null;
  const [key, setKey] = useState(existing?.key ?? "");
  const [value, setValue] = useState(existing?.kind === "setting" ? existing.value ?? "" : "");
  const [secret, setSecret] = useState(existing?.kind === "secret");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      await call("set_setting", { key: trimmedKey, value, secret });
      toast.success(`Saved “${trimmedKey}”.`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save", "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isEditing ? `Edit — ${existing.key}` : "Add setting"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={secret && !confirmed}>
            Save
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <Field label="Key" hint={isEditing ? "Can't rename — delete and re-add under a new key instead." : "e.g. redix_url, authn_min_password_score"}>
          <Input
            placeholder="key_name"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </Field>

        <Field label="Value" hint={isEditing && existing.kind === "secret" ? "Enter a new value to overwrite — the current value is never shown here." : undefined}>
          <Input
            placeholder={isEditing && existing.kind === "secret" ? "New value…" : "value"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={isEditing}
          />
        </Field>

        <label className="check-line">
          <input
            type="checkbox"
            checked={secret}
            disabled={isEditing}
            onChange={(e) => {
              setSecret(e.target.checked);
              setConfirmed(false);
            }}
          />
          This is a secret — value hidden by default, stored encrypted
        </label>

        {secret && (
          <>
            <div className="danger-note">
              <strong>You're changing a secret.</strong> Most plugins read a setting once at boot —
              a new value here typically won't take effect until the relevant process (Gateway,
              a worker, etc.) restarts.
            </div>
            <label className="check-line">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I understand, save it anyway
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
