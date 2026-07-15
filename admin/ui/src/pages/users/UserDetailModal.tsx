import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { Role, User } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Field, Input, Select } from "../../components/Field";
import { useToast } from "../../components/Toast";
import { isLocked, statusTone } from "./userUtils";

/* Each section maps to its own granular endpoint (set_status / add_role /
   remove_role / set_password) rather than one bulk save — mirroring how
   authn's own CLI is shaped, and keeping each change atomic and auditable. */

export function UserDetailModal({
  user,
  roles,
  onClose,
  onChanged,
}: {
  user: User;
  roles: Role[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState<User>(user);
  const [busy, setBusy] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const held = current.has_roles ?? [];
  const available = roles.filter((r) => !held.includes(r.name));
  const locked = isLocked(current);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = (status: string) =>
    run("status", async () => {
      await call("set_status", { email: current.email, status });
      setCurrent((u) => ({
        ...u,
        status: status as User["status"],
        // Setting Active also clears any brute-force lockout server-side.
        locked_until: status === "Active" ? null : u.locked_until,
      }));
      toast.success(
        status === "Active"
          ? "Status set to Active (any lockout cleared)."
          : `Status set to ${status}.`
      );
    });

  const addRole = (role: string) =>
    run("role", async () => {
      const res = await call<{ has_roles: string[] }>("add_role", { email: current.email, role });
      setCurrent((u) => ({ ...u, has_roles: res.has_roles }));
      toast.success(`Added role “${role}”.`);
    });

  const removeRole = (role: string) =>
    run("role", async () => {
      const res = await call<{ has_roles: string[] }>("remove_role", { email: current.email, role });
      setCurrent((u) => ({ ...u, has_roles: res.has_roles }));
      toast.success(`Removed role “${role}”.`);
    });

  const savePassword = () =>
    run("password", async () => {
      const res = await call<{ sessions_revoked: number }>("set_password", {
        email: current.email,
        password: newPassword,
      });
      setNewPassword("");
      setShowPasswordForm(false);
      toast.success(
        `Password updated — ${res.sessions_revoked} active session(s) revoked.`,
        "Done"
      );
    });

  return (
    <Modal
      title={current.email}
      onClose={onClose}
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="row-gap">
        {locked && (
          <div className="danger-note">
            This account is locked out until <strong>{current.locked_until}</strong> after repeated
            failed logins. Setting the status to <strong>Active</strong> clears the lockout.
          </div>
        )}

        <div className="detail-grid">
          <Field label="Status">
            <Select
              value={current.status}
              disabled={busy === "status"}
              onChange={(e) => changeStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Locked">Locked</option>
            </Select>
          </Field>
          <Field label="Max sessions">
            <Input value={current.max_sessions ?? "unlimited"} disabled />
          </Field>
          <Field label="Last login">
            <Input value={current.last_login_at ?? "never"} disabled />
          </Field>
        </div>

        <div>
          <div className="section-label">Roles</div>
          <div className="role-list">
            {held.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No roles assigned.</span>}
            {held.map((r) => (
              <span key={r} className="role-tag">
                <Badge tone={r === "Superuser" ? "danger" : "accent"}>{r}</Badge>
                <button
                  className="role-tag__x"
                  onClick={() => removeRole(r)}
                  disabled={busy === "role"}
                  aria-label={`Remove ${r}`}
                  title={`Remove ${r}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          {available.length > 0 && (
            <div className="inline" style={{ marginTop: 12 }}>
              <Select
                defaultValue=""
                disabled={busy === "role"}
                style={{ width: 200 }}
                onChange={(e) => {
                  if (e.target.value) {
                    addRole(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Add a role…</option>
                {available.map((r) => (
                  <option key={r.id ?? r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div>
          <div className="section-label">Password</div>
          {!showPasswordForm ? (
            <Button variant="secondary" size="sm" onClick={() => setShowPasswordForm(true)}>
              Set a new password
            </Button>
          ) : (
            <div className="row-gap" style={{ gap: 10 }}>
              <div className="warn-note">
                Setting a password also clears any lockout and <strong>revokes every active
                session</strong> for this user.
              </div>
              <div className="inline">
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ maxWidth: 280 }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={savePassword}
                  loading={busy === "password"}
                  disabled={!newPassword}
                >
                  Save password
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setNewPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="meta">
          <div className="meta__title">Record</div>
          <div className="meta__grid">
            <div className="meta__item">
              <span className="meta__label">id</span>
              <span className="meta__value mono">{current.id}</span>
            </div>
            <div className="meta__item">
              <span className="meta__label">status</span>
              <span className="meta__value">
                <Badge tone={statusTone(current)}>{locked ? "Locked out" : current.status}</Badge>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
