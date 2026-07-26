import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { KeyRound, ShieldCheck, ShieldOff, ShieldAlert, LogOut, FlaskConical } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Role, Session, User } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal, ConfirmModal } from "../../components/Modal";
import { Button, IconButton } from "../../components/Button";
import { TextInput, Checkbox } from "../../components/Field";
import { Badge, StatusBadge } from "../../components/Badge";
import { LoadingBlock, ErrorBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { formatDateTime, isTestAccount } from "../shared/datetime";

export function UserDetailRoute() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { reload: reloadList } = useOutletContext<{ reload: () => void }>();
  const toast = useToast();

  const { data: users, loading: usersLoading, error: usersError, reload: reloadUsers } = useAsync<User[]>(
    () => call<User[]>("list_users", {}, { method: "GET" }),
  );
  const user = users?.find((u) => u.id === userId) ?? null;

  const { data: rolesData } = useAsync<Role[]>(() => call<Role[]>("list_roles", {}, { method: "GET" }));
  const allRoles = rolesData ?? [];

  const {
    data: sessions,
    loading: sessionsLoading,
    reload: reloadSessions,
  } = useAsync<Session[]>(() => (user ? call<Session[]>("list_sessions", { email: user.email }) : Promise.resolve([])), [user?.email]);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [maxSessions, setMaxSessions] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setUsername(user.username ?? "");
    setAllowedIps((user.allowed_ips ?? []).join(", "));
    setMaxSessions(user.max_sessions != null ? String(user.max_sessions) : "");
    setSelectedRoles(user.has_roles ?? []);
  }, [user]);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null);

  const close = () => {
    reloadList();
    navigate("/users");
  };

  const refreshAfterMutation = () => {
    reloadUsers();
    reloadList();
  };

  const toggleRole = (name: string) => {
    setSelectedRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await call("update_profile", {
        email: user.email,
        full_name: fullName.trim() || undefined,
        username: username.trim() || undefined,
        allowed_ips: allowedIps.trim()
          ? allowedIps
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      });

      const before = new Set(user.has_roles ?? []);
      const after = new Set(selectedRoles);
      const toAdd = [...after].filter((r) => !before.has(r));
      const toRemove = [...before].filter((r) => !after.has(r));
      for (const role of toAdd) await call("add_role", { email: user.email, role });
      for (const role of toRemove) await call("remove_role", { email: user.email, role });

      toast.success("Profile updated.");
      refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(saveProfile, !!user && !saving);

  const setStatus = async (status: "Active" | "Inactive" | "Locked") => {
    if (!user) return;
    try {
      await call("set_status", { email: user.email, status });
      toast.success(`Status set to ${status}.`);
      refreshAfterMutation();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to set status.");
    }
  };

  const revokeSession = async () => {
    if (!revokeSessionId) return;
    try {
      await call("revoke_session", { session_id: revokeSessionId });
      toast.success("Session revoked.");
      reloadSessions();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke session.");
    } finally {
      setRevokeSessionId(null);
    }
  };

  if (usersLoading && !users) {
    return (
      <Modal title="User" onClose={close}>
        <LoadingBlock label="Loading user…" />
      </Modal>
    );
  }

  if (usersError) {
    return (
      <Modal title="User" onClose={close}>
        <ErrorBlock message={usersError} onRetry={reloadUsers} />
      </Modal>
    );
  }

  if (!user) {
    return (
      <Modal title="User not found" onClose={close}>
        <p className="text-sm text-text-muted">This user could not be found — it may have been deleted.</p>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        title={user.email}
        subtitle={user.full_name ?? undefined}
        size="lg"
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Close
            </Button>
            <Button variant="primary" onClick={saveProfile} loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={user.status} />
            {isTestAccount(user.email, user.username) && (
              <Badge tone="neutral" dot>
                <FlaskConical size={10} />
                Test account
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant={user.status === "Active" ? "primary" : "secondary"}
                icon={<ShieldCheck size={14} />}
                onClick={() => setStatus("Active")}
              >
                Active
              </Button>
              <Button
                size="sm"
                variant={user.status === "Inactive" ? "primary" : "secondary"}
                icon={<ShieldOff size={14} />}
                onClick={() => setStatus("Inactive")}
              >
                Inactive
              </Button>
              <Button
                size="sm"
                variant={user.status === "Locked" ? "danger" : "secondary"}
                icon={<ShieldAlert size={14} />}
                onClick={() => setStatus("Locked")}
              >
                Locked
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <TextInput label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Max sessions"
              type="number"
              min={1}
              disabled
              hint="Not editable from this screen."
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

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-text-muted">Roles</p>
            <div className="flex flex-col gap-1.5 rounded-md border border-border-strong p-2.5">
              {allRoles.length === 0 && <p className="text-[13px] text-text-faint">No roles defined yet.</p>}
              {allRoles.map((r) => (
                <Checkbox key={r.id} label={r.name} checked={selectedRoles.includes(r.name)} onChange={() => toggleRole(r.name)} />
              ))}
            </div>
          </div>

          <div>
            <Button variant="secondary" size="sm" icon={<KeyRound size={14} />} onClick={() => setShowPasswordModal(true)}>
              Set password
            </Button>
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-text-muted">Active sessions</p>
            <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/60">
                    <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Type</th>
                    <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">IP</th>
                    <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Expires</th>
                    <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Last seen</th>
                    <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sessionsLoading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-text-faint">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!sessionsLoading && (sessions ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-text-faint">
                        No sessions.
                      </td>
                    </tr>
                  )}
                  {(sessions ?? []).map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-text">{s.session_type}</td>
                      <td className="px-3 py-2 font-mono text-[13px] text-text">{s.ip_address ?? "—"}</td>
                      <td className="px-3 py-2 text-text">{formatDateTime(s.expires_at)}</td>
                      <td className="px-3 py-2 text-text">{formatDateTime(s.last_seen_at)}</td>
                      <td className="px-3 py-2">
                        {s.revoked_at ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!s.revoked_at && (
                          <IconButton label="Revoke session" icon={<LogOut size={14} />} onClick={() => setRevokeSessionId(s.id)} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {showPasswordModal && <SetPasswordModal email={user.email} onClose={() => setShowPasswordModal(false)} />}

      {revokeSessionId && (
        <ConfirmModal
          title="Revoke session"
          message="This session will no longer be usable. The user will need to sign in again on that device."
          confirmLabel="Revoke"
          danger
          onConfirm={revokeSession}
          onClose={() => setRevokeSessionId(null)}
        />
      )}
    </>
  );
}

function SetPasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await call("set_password", { email, password });
      toast.success("Password updated. Existing sessions were revoked.");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set password.");
    } finally {
      setBusy(false);
    }
  };

  useSaveShortcut(submit, !busy && !!password);

  return (
    <Modal
      title="Set password"
      subtitle={email}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!password}>
            Set password
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <TextInput
          label="New password"
          mono
          autoFocus
          hint="This immediately revokes the user's existing sessions."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
