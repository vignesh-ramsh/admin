import { useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import type { Role } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { TextArea } from "../../components/Field";
import { useToast } from "../../components/Toast";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";

export function EditRoleRoute() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const { reload, roles } = useOutletContext<{ reload: () => void; roles: Role[] }>();
  const toast = useToast();

  const role = roles.find((r) => r.id === roleId) ?? null;
  const [description, setDescription] = useState(role?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => navigate("/roles");

  const submit = async () => {
    if (!role) return;
    setError(null);
    setBusy(true);
    try {
      await call("update_role", { name: role.name, description: description.trim() || undefined });
      toast.success("Role updated.");
      reload();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role.");
    } finally {
      setBusy(false);
    }
  };

  // Defined unconditionally, above the `!role` early return below — a hook
  // call can't itself be conditional, so `role`'s presence is folded into
  // `enabled` instead of guarding this line.
  useSaveShortcut(submit, !!role && !busy);

  if (!role) {
    return (
      <Modal title="Role not found" onClose={close}>
        <p className="text-sm text-text-muted">This role could not be found — it may have been deleted.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Edit ${role.name}`}
      subtitle="Only the description can be changed — role names are referenced by users and access keys."
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <TextArea
          label="Description"
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
