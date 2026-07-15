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
   remove_role / set_password / update_profile) rather than one bulk save —
   mirroring how authn's own CLI is shaped, and keeping each change atomic
   and auditable. */

export function UserDetailModal({
  user,
  roles,
  users,
  onClose,
  onChanged,
}: {
  user: User;
  roles: Role[];
  users: User[]; // for resolving created_by/updated_by to an email, no extra fetch
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState<User>(user);
  const [busy, setBusy] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pendingLockUntil, setPendingLockUntil] = useState("");

  // Profile (full_name/username/allowed_ips) form state, seeded from the
  // current record and only sent on explicit Save — unlike status/roles,
  // these aren't the kind of thing you want firing a request per keystroke.
  const [fullName, setFullName] = useState(current.full_name ?? "");
  const [username, setUsername] = useState(current.username ?? "");
  const [ipsText, setIpsText] = useState((current.allowed_ips ?? []).join("\n"));

  const held = current.has_roles ?? [];
  const available = roles.filter((r) => !held.includes(r.name));
  // isLocked() alone can't distinguish WHY login is blocked: authn's
  // login() blocks on status != "Active" regardless of locked_until, so
  // once status is "Locked" that's the dominant, non-self-clearing reason
  // — even if locked_until (reused as this manual lock's reminder date)
  // happens to still be in the future. Only when status ISN'T already
  // "Locked" does a future locked_until mean the real, self-expiring
  // brute-force lock (verified directly: an identical correct password
  // was rejected with status=Locked even with locked_until cleared to
  // None, then accepted the instant status flipped to Active).
  const autoLocked = current.status !== "Locked" && isLocked(current);
  const locked = isLocked(current);
  const emailFor = (id: string) => users.find((u) => u.id === id)?.email ?? id;

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

  const changeStatus = (status: string, lockedUntilIso?: string) =>
    run("status", async () => {
      await call("set_status", { email: current.email, status, locked_until: lockedUntilIso || null });
      setCurrent((u) => ({
        ...u,
        status: status as User["status"],
        locked_until:
          status === "Active" ? null : status === "Locked" ? lockedUntilIso ?? u.locked_until : u.locked_until,
      }));
      setPendingLockUntil("");
      toast.success(
        status === "Active"
          ? "Status set to Active (any lockout cleared)."
          : status === "Locked"
            ? "Status set to Locked."
            : `Status set to ${status}.`
      );
    });

  const onStatusChange = (value: string) => {
    if (value === "Locked") {
      // Needs the "until" prompt first — don't submit yet.
      setCurrent((u) => ({ ...u, status: "Locked" }));
      return;
    }
    changeStatus(value);
  };

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

  const saveProfile = () =>
    run("profile", async () => {
      const ips = ipsText.split("\n").map((s) => s.trim()).filter(Boolean);
      await call("update_profile", {
        email: current.email,
        full_name: fullName,
        username: username.trim() === "" ? undefined : username,
        clear_username: username.trim() === "" && current.username != null,
        allowed_ips: ips,
      });
      setCurrent((u) => ({ ...u, full_name: fullName || null, username: username.trim() || null, allowed_ips: ips }));
      toast.success("Profile updated.");
    });

  // Showing an actual pending-lock confirmation UI whenever status was
  // just switched to "Locked" but not yet submitted with a date.
  const showLockPrompt = current.status === "Locked" && busy !== "status" && user.status !== "Locked" && !current.locked_until;

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
        {autoLocked && (
          <div className="danger-note">
            This account is automatically locked out until <strong>{current.locked_until}</strong> after
            repeated failed logins. This clears itself — or setting status to <strong>Active</strong> clears
            it immediately.
          </div>
        )}
        {current.status === "Locked" && (
          <div className="warn-note">
            Manually locked
            {current.locked_until && (
              <>, with <strong>{current.locked_until}</strong> noted as a reminder of when this was meant
              to end</>
            )}
            . This does <strong>not</strong> auto-unlock the account, regardless of that date — you still
            need to set status back to Active.
          </div>
        )}

        <div className="detail-grid">
          <Field label="Status">
            <Select
              value={current.status}
              disabled={busy === "status"}
              onChange={(e) => onStatusChange(e.target.value)}
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

        {showLockPrompt && (
          <div className="row-gap" style={{ gap: 8 }}>
            <div className="warn-note">
              Locking is <strong>not self-expiring</strong> (only the automatic brute-force lock is) —
              this date is stored purely so you know when it was meant to end.
            </div>
            <div className="inline">
              <Input
                type="datetime-local"
                value={pendingLockUntil}
                onChange={(e) => setPendingLockUntil(e.target.value)}
                style={{ maxWidth: 240 }}
              />
              <Button
                variant="danger"
                size="sm"
                loading={busy === "status"}
                onClick={() => changeStatus("Locked", pendingLockUntil ? new Date(pendingLockUntil).toISOString() : undefined)}
              >
                Lock {pendingLockUntil ? "until this date" : "indefinitely"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrent((u) => ({ ...u, status: user.status }))}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

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
          <div className="spread">
            <div className="section-label" style={{ margin: 0 }}>Profile</div>
            <Button variant="secondary" size="sm" onClick={saveProfile} loading={busy === "profile"}>
              Save profile
            </Button>
          </div>
          <div className="detail-grid" style={{ marginTop: 10 }}>
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Username" hint="Can also be used to log in. 'admin'/'administrator'/'guest' are reserved.">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="none set"
              />
            </Field>
          </div>
          <Field
            label="Allowed IPs"
            hint="One per line — a plain IP or a CIDR range (e.g. 10.0.0.0/24). Empty = no restriction."
          >
            <textarea
              className="textarea mono"
              rows={3}
              value={ipsText}
              onChange={(e) => setIpsText(e.target.value)}
              placeholder="203.0.113.4&#10;10.0.0.0/24"
            />
          </Field>
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
            {current.created_by && (
              <div className="meta__item">
                <span className="meta__label">created by</span>
                <span className="meta__value">{emailFor(current.created_by)}</span>
              </div>
            )}
            {current.updated_by && (
              <div className="meta__item">
                <span className="meta__label">updated by</span>
                <span className="meta__value">{emailFor(current.updated_by)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
