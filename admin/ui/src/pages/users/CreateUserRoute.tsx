import { useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Role, RowPage } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { TextInput } from "../../components/Field";
import { Checkbox } from "../../components/Field";
import { useToast } from "../../components/Toast";

interface CreateUserResult {
  user: { email: string };
  generated_password: string | null;
  skipped_unknown_roles: string[];
}

export function CreateUserRoute() {
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const toast = useToast();

  const { data: rolesPage } = useAsync<RowPage>(() => call<RowPage>("list_roles", { limit: 500 }, { method: "GET" }));
  const roles = (rolesPage?.rows ?? []) as unknown as Role[];

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [maxSessions, setMaxSessions] = useState("");
  const [allowedIps, setAllowedIps] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateUserResult | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    reload();
    navigate("/users");
  };

  const toggleRole = (name: string) => {
    setSelectedRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await call<CreateUserResult>("create_user", {
        email: email.trim(),
        password: password.trim() || undefined,
        roles: selectedRoles,
        username: username.trim() || undefined,
        full_name: fullName.trim() || undefined,
        max_sessions: maxSessions.trim() ? Number(maxSessions.trim()) : undefined,
        allowed_ips: allowedIps.trim()
          ? allowedIps
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      });
      setResult(res);
      if (res.skipped_unknown_roles.length > 0) {
        toast.error(`Unknown roles skipped: ${res.skipped_unknown_roles.join(", ")}`);
      }
      if (!res.generated_password) {
        toast.success("User created.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user.");
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async () => {
    if (!result?.generated_password) return;
    await navigator.clipboard.writeText(result.generated_password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (result) {
    return (
      <Modal title="User created" onClose={close} footer={<Button variant="primary" onClick={close}>Done</Button>}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-bg/50 px-3 py-2 text-[13px] text-success">
            <Check size={15} className="mt-0.5 shrink-0" />
            {result.user.email} was created successfully.
          </div>
          {result.generated_password && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                This generated password is shown only once and cannot be retrieved again.
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextInput label="Generated password" mono readOnly value={result.generated_password} />
                </div>
                <Button variant="secondary" size="md" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copyPassword}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="New user"
      subtitle="Create an account and optionally assign roles."
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Create user
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextInput label="Email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <TextInput
          label="Password"
          type="text"
          mono
          hint="Leave blank to auto-generate a strong password."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-text-muted">Roles</p>
          <div className="flex flex-col gap-1.5 rounded-md border border-border-strong p-2.5">
            {roles.length === 0 && <p className="text-[13px] text-text-faint">No roles defined yet.</p>}
            {roles.map((r) => (
              <Checkbox
                key={r.id}
                label={r.name}
                checked={selectedRoles.includes(r.name)}
                onChange={() => toggleRole(r.name)}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Max sessions"
            type="number"
            min={1}
            value={maxSessions}
            onChange={(e) => setMaxSessions(e.target.value)}
          />
          <TextInput
            label="Allowed IPs"
            hint="Comma-separated IPs/CIDRs"
            value={allowedIps}
            onChange={(e) => setAllowedIps(e.target.value)}
          />
        </div>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
