import { useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { User } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { Combobox } from "../../components/Combobox";

interface CreateAccessKeyResult {
  key: string;
  key_prefix: string;
  id: string;
}

export function CreateAccessKeyRoute() {
  const navigate = useNavigate();
  const { reload, users } = useOutletContext<{ reload: () => void; users: User[] }>();

  const [userQuery, setUserQuery] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [scopesText, setScopesText] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAccessKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    reload();
    navigate("/access-keys");
  };

  const selectedUser = users.find((u) => u.email === email) ?? null;
  const filteredUsers = users.filter((u) => u.email.toLowerCase().includes(userQuery.toLowerCase()));
  const userOptions = filteredUsers.map((u) => ({ value: u.email, label: u.email, sublabel: u.full_name ?? undefined }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Select a user.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await call<CreateAccessKeyResult>("create_access_key", {
        email,
        label: label.trim() || undefined,
        scopes: scopesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        expires_in_days: expiresInDays.trim() ? Number(expiresInDays.trim()) : undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create access key.");
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (result) {
    return (
      <Modal title="Access key created" onClose={close} footer={<Button variant="primary" onClick={close}>Done</Button>}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            This key is shown only once and can never be retrieved again. Copy it now and store it securely.
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextInput label="Access key" mono readOnly value={result.key} />
            </div>
            <Button variant="secondary" size="md" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copyKey}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-[13px] text-text-faint">Prefix: <span className="font-mono">{result.key_prefix}</span></p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="New access key"
      subtitle="Scopes must be a subset of the owner's roles and can never include Superuser."
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Create key
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Combobox
          label="User"
          value={email}
          onChange={setEmail}
          options={userOptions}
          query={userQuery}
          onQueryChange={setUserQuery}
          placeholder="Search users…"
          clearable
        />
        <TextInput label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <TextInput
          label="Scopes"
          hint={
            selectedUser
              ? `Comma-separated, must be a subset of: ${(selectedUser.has_roles ?? []).join(", ") || "(no roles)"}`
              : "Comma-separated role names"
          }
          value={scopesText}
          onChange={(e) => setScopesText(e.target.value)}
        />
        <TextInput
          label="Expires in (days)"
          type="number"
          min={1}
          hint="Leave blank for no expiry."
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
