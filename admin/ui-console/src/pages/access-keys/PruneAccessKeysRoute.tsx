import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import { ConfirmModal } from "../../components/Modal";
import { TextInput } from "../../components/Field";
import { useToast } from "../../components/Toast";

export function PruneAccessKeysRoute() {
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const toast = useToast();

  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const close = () => navigate("/access-keys");

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await call<{ ok: true; deleted: number }>("prune_access_keys", {
        older_than_days: days.trim() ? Number(days.trim()) : 30,
      });
      toast.success(`${res.deleted} access key(s) pruned.`);
      reload();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to prune access keys.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      title="Prune expired access keys"
      confirmLabel="Prune"
      danger
      loading={busy}
      onConfirm={confirm}
      onClose={close}
      message={
        <div className="flex flex-col gap-3">
          <p>Permanently deletes access keys that are revoked or expired, older than the cutoff below. This cannot be undone.</p>
          <TextInput label="Older than (days)" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      }
    />
  );
}
