import { useState } from "react";
import { call, ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Field, Input } from "../../components/Field";
import { useToast } from "../../components/Toast";

export function CreateRoleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("A role name is required.");
      return;
    }
    setBusy(true);
    try {
      await call("create_role", { name: name.trim(), description: description.trim() || null });
      toast.success(`Role “${name.trim()}” created.`);
      onCreated();
    } catch (err) {
      // A duplicate name surfaces as psqldb's friendly unique-violation error.
      toast.error(err instanceof ApiError ? err.message : "Failed to create role", "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New role"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Create role
          </Button>
        </>
      }
    >
      <div className="row-gap">
        <Field label="Name" hint="Used verbatim in a whitelisted function’s roles=[…] declaration.">
          <Input
            placeholder="e.g. HR Manager"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </Field>
        <Field label="Description" hint="Optional — what this role is for.">
          <Input
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
      </div>
    </Modal>
  );
}
