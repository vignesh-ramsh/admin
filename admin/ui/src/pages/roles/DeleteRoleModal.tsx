import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { Role, User } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/AuthContext";

/* delete_role CASCADES: it strips the role from every user holding it,
   then deletes the row. authn's own CLI previews the affected users before
   confirming — this does the same, rather than making a cascade invisible
   behind a one-line confirm. */

export function DeleteRoleModal({
  role,
  holders,
  onClose,
  onDeleted,
}: {
  role: Role;
  holders: User[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const { email: myEmail } = useAuth();
  const [busy, setBusy] = useState(false);

  const isSuperuser = role.name === "Superuser";
  // Would this strip MY own access? Every admin endpoint requires Superuser,
  // so deleting that role out from under yourself locks you out immediately.
  const locksMeOut = isSuperuser && holders.some((u) => u.email === myEmail);

  const del = async () => {
    setBusy(true);
    try {
      const res = await call<{ users_updated: number }>("delete_role", { name: role.name });
      toast.success(
        res.users_updated > 0
          ? `Deleted “${role.name}” and removed it from ${res.users_updated} user(s).`
          : `Deleted “${role.name}”.`
      );
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete role");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Delete role — ${role.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={del} loading={busy}>
            Delete role
          </Button>
        </>
      }
    >
      <div className="row-gap">
        {locksMeOut && (
          <div className="danger-note">
            <strong>This will lock you out.</strong> You ({myEmail}) hold this role, and every screen
            in this admin requires Superuser. Deleting it now will end your own access — you would
            need CLI server access (<code>arc authn create-user --superuser</code>) to recover.
          </div>
        )}

        {isSuperuser && !locksMeOut && (
          <div className="danger-note">
            <strong>Superuser is the full-bypass role.</strong> Deleting it removes admin access from
            everyone who holds it.
          </div>
        )}

        {holders.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5 }}>
            No users hold <strong>{role.name}</strong>. Deleting it affects nothing else.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              {holders.length === 1 ? (
                <>
                  <strong>1</strong> user currently holds this role. It will be removed from them:
                </>
              ) : (
                <>
                  <strong>{holders.length}</strong> users currently hold this role. It will be
                  removed from each of them:
                </>
              )}
            </p>
            <ul className="holder-list">
              {holders.map((u) => (
                <li key={u.id}>
                  {u.email}
                  {u.email === myEmail && <span className="holder-list__you">you</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Each user update is its own transaction, so this isn’t atomic — but it is idempotent and
          safe to re-run if interrupted.
        </p>
      </div>
    </Modal>
  );
}
