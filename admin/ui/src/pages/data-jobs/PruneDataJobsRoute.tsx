import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { call, ApiError } from "../../api/client";
import { ConfirmModal } from "../../components/Modal";
import { TextInput } from "../../components/Field";
import { useToast } from "../../components/Toast";

export function PruneDataJobsRoute() {
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const toast = useToast();

  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const close = () => navigate("/data-jobs");

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await call<{ ok: true; deleted: number }>("prune_data_import_export_log", {
        older_than_days: days.trim() ? Number(days.trim()) : 30,
      });
      toast.success(`${res.deleted} job log entr${res.deleted === 1 ? "y" : "ies"} pruned.`);
      reload();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to prune the job log.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      title="Prune job log"
      confirmLabel="Prune"
      danger
      loading={busy}
      onConfirm={confirm}
      onClose={close}
      message={
        <div className="flex flex-col gap-3">
          <p>
            Permanently deletes finished import/export jobs (Completed, Completed with errors, or Failed — never a
            job still queued, awaiting review, or running) older than the cutoff below. An import job's staged rows
            are deleted with it. This cannot be undone.
          </p>
          <TextInput label="Older than (days)" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      }
    />
  );
}
