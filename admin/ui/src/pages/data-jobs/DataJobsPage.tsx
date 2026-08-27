import { useCallback, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { Trash2, Plus } from "lucide-react";
import { call } from "../../api/client";
import type { DataJob } from "../../api/types";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Select } from "../../components/Field";
import { DataTable, type Column } from "../../components/Table";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { Badge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { formatDateTime } from "../shared/datetime";

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  Queued: "neutral",
  PendingReview: "accent",
  Running: "accent",
  Completed: "success",
  CompletedWithErrors: "danger",
  Failed: "danger",
};

function statsSummary(job: DataJob): string {
  const s = job.stats;
  if (!s) return "—";
  if (job.direction === "Export") {
    return s.total !== null ? `${s.processed ?? 0} / ${s.total} rows` : `${s.processed ?? 0} rows`;
  }
  const succeeded = s.succeeded ?? 0;
  const failed = s.failed ?? 0;
  return s.total !== null ? `${succeeded + failed} / ${s.total} rows (${failed} failed)` : `${failed} failed so far`;
}

export function DataJobsPage() {
  const navigate = useNavigate();
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");

  const fetchPage = useCallback(
    (cursor: string | null, limit: number) =>
      call<CursorPage<DataJob>>(
        "list_data_jobs",
        { direction: direction || null, status: status || null, after: cursor, limit },
        { method: "GET" },
      ),
    [direction, status],
  );
  const { rows, loading, hasMore, loadingMore, total, error, reload, loadMore } = useCursorList<DataJob>({
    fetchPage,
    rowKey: (j) => j.id,
    deps: [direction, status],
  });

  const columns: Column<DataJob>[] = [
    { key: "table", header: "Table", mono: true, render: (j) => j.table },
    { key: "direction", header: "Direction", render: (j) => j.direction },
    { key: "status", header: "Status", render: (j) => <Badge tone={STATUS_TONE[j.status] ?? "neutral"}>{j.status}</Badge> },
    { key: "stats", header: "Progress", render: (j) => <span className="text-text-muted">{statsSummary(j)}</span> },
    { key: "created_by", header: "Started by", render: (j) => j.created_by ?? "—" },
    { key: "started_at", header: "Started", render: (j) => formatDateTime(j.started_at) },
    { key: "finished_at", header: "Finished", render: (j) => formatDateTime(j.finished_at) },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Data Import & Export"
        description="Every bulk import/export job across every table — start a new one, review errors, and clean up old runs."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={() => navigate("prune")}>
              Prune log
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate("new")}>
              New
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Select value={direction} onChange={(e) => setDirection(e.target.value)} className="!w-auto">
          <option value="">Any direction</option>
          <option value="Import">Import</option>
          <option value="Export">Export</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
          <option value="">Any status</option>
          <option value="Queued">Queued</option>
          <option value="PendingReview">Pending review</option>
          <option value="Running">Running</option>
          <option value="Completed">Completed</option>
          <option value="CompletedWithErrors">Completed with errors</option>
          <option value="Failed">Failed</option>
        </Select>
        <span className="ml-auto text-[13px] text-text-faint">{total !== null ? `${rows.length} of ${total}` : `${rows.length} jobs`}</span>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(j) => j.id}
            loading={loading}
            emptyLabel="No import/export jobs yet."
            fillHeight
            onRowClick={(j) => navigate(j.id)}
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      <Outlet context={{ reload }} />
    </div>
  );
}
