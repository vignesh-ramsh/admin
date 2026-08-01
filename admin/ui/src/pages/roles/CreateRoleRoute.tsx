import { useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { TextInput, TextArea } from "../../components/Field";
import { useToast } from "../../components/Toast";

export function CreateRoleRoute() {
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const toast = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => navigate("/roles");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await call("create_role", { name: name.trim(), description: description.trim() || undefined });
      toast.success("Role created.");
      reload();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New role"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Create role
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextInput label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
