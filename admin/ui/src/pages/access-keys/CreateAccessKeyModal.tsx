import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { User } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Input, Select } from "../../components/Field";
import { useToast } from "../../components/Toast";

interface CreateResult {
  key: string;
  key_prefix: string;
  id: string;
}

export function CreateAccessKeyModal({
  users,
  onClose,
  onCreated,
}: {
  users: User[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const user = users.find((u) => u.email === email);
  // The server rejects Superuser/"*" in scopes outright (a leaked key must
  // never carry the full-role bypass a session can) — so it's never even
  // offered here, not just blocked after the fact.
  const availableScopes = (user?.has_roles ?? []).filter((r) => r !== "Superuser");

  const toggleScope = (role: string) =>
    setSelectedScopes((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const submit = async () => {
    if (!email) {
      toast.error("Pick a user.");
      return;
    }
    setSaving(true);
    try {
      const res = await call<CreateResult>("create_access_key", {
        email,
        scopes: selectedScopes,
        label: label.trim() || null,
        expires_in_days: expiresInDays ? Number(expiresInDays) : null,
      });
      setResult(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create access key", "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the value is visible to copy by hand */
    }
  };

  if (result) {
    return (
      <Modal
        title="Access key created"
        onClose={onCreated}
        footer={
          <Button variant="primary" onClick={onCreated}>
            Done
          </Button>
        }
      >
        <div className="row-gap">
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Key <strong className="mono">{result.key_prefix}…</strong> was created for{" "}
            <strong>{email}</strong>.
          </p>
          <div className="secret">
            <div className="secret__label">Key — shown once, copy it now</div>
            <div className="secret__row">
              <code className="secret__value mono">{result.key}</code>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Only a hash is stored — it cannot be shown again. A caller sends it as{" "}
            <code>X-Api-Key</code>.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="New access key"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Create key
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <Field label="User">
          <Select
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSelectedScopes([]);
            }}
            autoFocus
          >
            <option value="">Pick a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.email}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Scopes" hint="Must be a subset of the user's own roles.">
          {!user ? (
            <span className="muted" style={{ fontSize: 13 }}>Pick a user first.</span>
          ) : availableScopes.length === 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>
              {user.email} has no non-Superuser roles to grant.
            </span>
          ) : (
            <div className="role-picker">
              {availableScopes.map((r) => (
                <label
                  key={r}
                  className={`role-chip ${selectedScopes.includes(r) ? "role-chip--on" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(r)}
                    onChange={() => toggleScope(r)}
                  />
                  {r}
                </label>
              ))}
            </div>
          )}
        </Field>

        <Field label="Label" hint="Optional — helps identify this key later.">
          <Input placeholder="e.g. CI pipeline" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>

        <Field label="Expires in (days)" hint="Leave empty for a key that never expires.">
          <Input
            type="number"
            min={1}
            placeholder="never"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
