import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { Role } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Input } from "../../components/Field";
import { useToast } from "../../components/Toast";

/* Description only — `name` is the role's identity, referenced by plain
   string arrays (has_roles/scopes, §3.13), not a REFERENCE column, so
   renaming isn't a plain field edit (see update_role's own docstring).
   docs/admin-ui-ux-review.md #4.1: this is what closes "a typo'd
   description was permanent short of delete-and-recreate." */
export function EditRoleModal({
  role,
  onClose,
  onSaved,
}: {
  role: Role;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [description, setDescription] = useState(role.description ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await call("update_role", { name: role.name, description: description.trim() || null });
      toast.success(`Role “${role.name}” updated.`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update role", "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit role — ${role.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <Field label="Name" hint="Used verbatim in whitelisted functions' roles=[…] — not renameable here.">
          <Input value={role.name} disabled />
        </Field>
        <Field label="Description" hint="What this role is for.">
          <Input
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
