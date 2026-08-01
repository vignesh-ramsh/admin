import { useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import type { Role, User } from "../../api/types";
import { ConfirmModal, Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

export function DeleteRoleRoute() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const { reload, roles, users } = useOutletContext<{ reload: () => void; roles: Role[]; users: User[] }>();
  const toast = useToast();

  const role = roles.find((r) => r.id === roleId) ?? null;
  const [busy, setBusy] = useState(false);

  const close = () => navigate("/roles");

  if (!role) {
    return (
      <Modal title="Role not found" onClose={close}>
        <p className="text-sm text-text-muted">This role could not be found — it may have already been deleted.</p>
      </Modal>
    );
  }

  const memberCount = users.filter((u) => (u.has_roles ?? []).includes(role.name)).length;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await call<{ ok: true; users_updated: number }>("delete_role", { name: role.name });
      toast.success(`Role deleted. ${res.users_updated} user(s) updated.`);
      reload();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      title={`Delete ${role.name}`}
      confirmLabel="Delete role"
      danger
      loading={busy}
      onConfirm={confirm}
      onClose={close}
      message={
        <div className="flex flex-col gap-2">
          <p>This permanently deletes the role. This cannot be undone.</p>
          {memberCount > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning-bg/50 px-3 py-2 text-warning">
              {memberCount} user{memberCount === 1 ? "" : "s"} currently {memberCount === 1 ? "has" : "have"} this role and will
              have it removed. Any access key scopes referencing "{role.name}" will be orphaned and left unresolved.
            </p>
          )}
        </div>
      }
    />
  );
}
