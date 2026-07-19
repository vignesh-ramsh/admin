import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { Role, User } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Banner } from "../../components/agni/feedback/Banner";
import { Field, Input } from "../../components/Field";
import { Checkbox } from "../../components/agni/forms/Checkbox";
import { useToast } from "../../components/Toast";

interface CreateResult {
  user: User;
  generated_password: string | null;
  skipped_unknown_roles: string[];
}

export function CreateUserModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: Role[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [generate, setGenerate] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [superuser, setSuperuser] = useState(false);
  const [maxSessions, setMaxSessions] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleRole = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));

  const submit = async () => {
    if (!email.trim()) {
      toast.error("An email is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await call<CreateResult>("create_user", {
        email: email.trim(),
        full_name: fullName.trim() || null,
        username: username.trim() || null,
        password: generate ? null : password,
        roles: selected,
        superuser,
        max_sessions: maxSessions ? Number(maxSessions) : null,
      });
      if (res.skipped_unknown_roles?.length) {
        toast.error(`Skipped unknown roles: ${res.skipped_unknown_roles.join(", ")}`, "Some roles skipped");
      }
      if (res.generated_password) {
        setResult(res); // keep the modal open — the password is shown exactly once
      } else {
        toast.success(`User ${email} created.`);
        onCreated();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user", "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!result?.generated_password) return;
    try {
      await navigator.clipboard.writeText(result.generated_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the value is visible to copy by hand */
    }
  };

  if (result) {
    return (
      <Modal
        title="User created"
        onClose={() => {
          onCreated();
        }}
        footer={
          <Button variant="primary" onClick={onCreated}>
            Done
          </Button>
        }
      >
        <div className="row-gap">
          <p style={{ margin: 0, fontSize: 13.5 }}>
            <strong>{result.user.email}</strong> was created with a generated password.
          </p>
          <div className="secret">
            <div className="secret__label">Password — shown once, copy it now</div>
            <div className="secret__row">
              <code className="secret__value mono">{result.generated_password}</code>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            It is stored only as an Argon2id hash — it cannot be shown again.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="New user"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Create user
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <Field label="Email">
          <Input
            type="email"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Full name" hint="Optional.">
          <Input placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <Field
          label="Username"
          hint="Optional — can also be used to log in. 'admin'/'administrator'/'guest' are reserved."
        >
          <Input placeholder="Optional" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>

        <Checkbox checked={generate} onChange={setGenerate} label="Generate a random password" />

        {!generate && (
          <Field label="Password" hint="Scored by zxcvbn — weak passwords are rejected by the server.">
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}

        <Field label="Roles">
          {roles.length === 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>No roles defined yet.</span>
          ) : (
            <div className="role-picker">
              {roles.map((r) => (
                <label key={r.id ?? r.name} className={`role-chip ${selected.includes(r.name) ? "role-chip--on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selected.includes(r.name)}
                    onChange={() => toggleRole(r.name)}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          )}
        </Field>

        <Field label="Max sessions" hint="Leave empty for unlimited.">
          <Input
            type="number"
            min={1}
            placeholder="unlimited"
            value={maxSessions}
            onChange={(e) => setMaxSessions(e.target.value)}
          />
        </Field>

        <Checkbox checked={superuser} onChange={setSuperuser} label={<>Make this user a <strong>Superuser</strong></>} />
        {superuser && (
          <Banner tone="error">
            A Superuser bypasses every role check on every endpoint. The Superuser role is created
            automatically if it doesn’t exist yet.
          </Banner>
        )}
      </div>
    </Modal>
  );
}
