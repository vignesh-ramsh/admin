import { useCallback, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import type { SettingEntry } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { TextInput, Checkbox, Switch } from "../../components/Field";
import { LoadingBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { boolToSettingValue, settingValueToBool, validateSettingValue } from "./settingTypes";

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
  const isEditing = existing !== null;
  const [key, setKey] = useState(existing?.key ?? defaultKey);
  const [value, setValue] = useState(existing?.kind === "setting" ? existing.value ?? "" : "");
  const [secret, setSecret] = useState(existing?.kind === "secret");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only ever known for a key some plugin already declared a type for
  // (existing?.type) — a brand-new key being created here has no type
  // to validate against yet, same as any setting did before typed
  // settings existed; it can only ever GAIN a type the next time a
  // plugin's own register() runs with a real declare() call.
  const settingType = existing?.type ?? null;
  const valueError = !isEditing ? null : validateSettingValue(settingType, value);

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
    setBusy(true);
    try {
      await call("set_setting", { key: trimmedKey, value, secret });
      toast.success(`Saved "${trimmedKey}".`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  useSaveShortcut(submit, !busy && !(secret && !confirmed) && !valueError);

  return (
    <Modal
      title={isEditing ? `Edit — ${existing.key}` : "Add setting"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={(secret && !confirmed) || !!valueError}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {settingType && (
          <div className="-mb-2 flex items-center gap-1.5 text-xs text-text-faint">
            Declared type:
            <Badge tone="neutral" className="font-mono uppercase">
              {settingType}
            </Badge>
          </div>
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

        {settingType === "bool" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-muted">Value</span>
            <Switch
              checked={settingValueToBool(value)}
              onChange={(v) => setValue(boolToSettingValue(v))}
              label={settingValueToBool(value) ? "True" : "False"}
            />
            {existing?.doc && <p className="text-xs text-text-faint">{existing.doc}</p>}
          </div>
        ) : (
          <TextInput
            label="Value"
            type={settingType === "int" || settingType === "float" ? "number" : "text"}
            step={settingType === "float" ? "any" : undefined}
            error={valueError ?? undefined}
            hint={
              isEditing && existing.kind === "secret"
                ? "Enter a new value to overwrite — the current value is never shown here."
                : existing?.doc
                  ? existing.default != null
                    ? `${existing.doc} Default: ${existing.default}.`
                    : existing.doc
                  : undefined
            }
            placeholder={isEditing && existing.kind === "secret" ? "New value…" : "value"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={isEditing}
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
