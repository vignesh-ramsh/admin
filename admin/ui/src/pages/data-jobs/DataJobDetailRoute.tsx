import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { call } from "../../api/client";
import type { DataJob } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { ImportProgress } from "../data/ImportModal";
import { ExportProgress } from "../data/ExportModal";

/* Doubles as both "watch a job run" and "look at a finished one" — a
   terminal job just renders its final state on the first poll tick
   instead of ever animating, since ImportProgress/ExportProgress (lifted
   out of their own modals, see those files' own exports) already handle
   that distinction internally. One extra get_data_job fetch here, only
   to learn `direction` before picking which of the two to render — a
   small, one-time cost against not having to fork this route in two. */
export function DataJobDetailRoute() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { reload } = useOutletContext<{ reload: () => void }>();
  const close = () => navigate("/data-jobs");

  const { data: job, loading, error } = useAsync(
    () => call<DataJob>("get_data_job", { job_id: jobId }, { method: "GET" }),
    [jobId],
  );

  if (loading || !job) {
    return (
      <Modal title="Job" onClose={close} size="lg">
        {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-text-muted">Loading…</p>}
      </Modal>
    );
  }

  return job.direction === "Import" ? (
    <ImportProgress
      table={job.table}
      jobId={job.id}
      onClose={close}
      onImported={() => {
        reload();
      }}
    />
  ) : (
    <ExportProgress table={job.table} jobId={job.id} onClose={close} />
  );
}
