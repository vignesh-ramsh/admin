import { useCallback, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { call } from "../../api/client";
import type { JobLogEntry } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select } from "../../components/Field";
import { ErrorBlock } from "../../components/States";
import { DataTable, Pagination, type Column } from "../../components/Table";
import { formatDateTime } from "../shared/datetime";

const PAGE_SIZE = 25;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionLogTab() {
  const [taskNameInput, setTaskNameInput] = useState("");
  const taskName = useDebounce(taskNameInput, 300);
  const [status, setStatus] = useState("");
  const [jobType, setJobType] = useState("");
  const [executor, setExecutor] = useState("");
  const [offset, setOffset] = useState(0);
  const searchRef = usePageSearchFocus();

  const loader = useCallback(
    () =>
      call<JobLogEntry[]>(
        "list_job_log",
        {
          task_name: taskName.trim() || null,
          status: status || null,
          job_type: jobType || null,
          executor: executor || null,
          limit: PAGE_SIZE,
          offset,
        },
        // KNOWN BACKEND BUG (admin/api/jobs_api.py list_job_log): limit/
        // offset aren't coerced to int before hitting arc.relay.list(), so
        // over GET/QUERY they arrive as strings and asyncpg 500s. POST
        // sends a real JSON body, so they arrive as real numbers — this
        // sidesteps the bug without touching the Python file.
        { method: "POST" },
      ),
    [taskName, status, jobType, executor, offset],
  );

  const { data, loading, error, reload } = useAsync(loader, [taskName, status, jobType, executor, offset]);
  const rows = data ?? [];

  const onFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setOffset(0);
  };

  const columns: Column<JobLogEntry>[] = [
    { key: "task_name", header: "Task", render: (r) => r.task_name, mono: true },
    { key: "queue", header: "Queue", render: (r) => r.queue, mono: true },
    { key: "executor", header: "Executor", render: (r) => r.executor },
    { key: "job_type", header: "Job type", render: (r) => <Badge tone={r.job_type === "Scheduler" ? "accent" : "neutral"}>{r.job_type}</Badge> },
    { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "success" ? "success" : "danger"}>{r.status}</Badge> },
    {
      key: "error",
      header: "Error",
      render: (r) => (
        <span className="block max-w-[220px] truncate text-text-muted" title={r.error ?? undefined}>
          {r.error ?? "—"}
        </span>
      ),
    },
    { key: "started_at", header: "Started", render: (r) => formatDateTime(r.started_at) },
    { key: "finished_at", header: "Finished", render: (r) => formatDateTime(r.finished_at) },
    { key: "duration_ms", header: "Duration", align: "right", render: (r) => formatDuration(r.duration_ms) },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            ref={searchRef}
            className="h-9 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            placeholder="Search by task name…"
            value={taskNameInput}
            onChange={(e) => {
              setTaskNameInput(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <Select value={status} onChange={(e) => onFilterChange(setStatus)(e.target.value)} className="!w-auto">
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </Select>
        <Select value={jobType} onChange={(e) => onFilterChange(setJobType)(e.target.value)} className="!w-auto">
          <option value="">Any job type</option>
          <option value="Task">Task</option>
          <option value="Scheduler">Scheduler</option>
        </Select>
        <Select value={executor} onChange={(e) => onFilterChange(setExecutor)(e.target.value)} className="!w-auto">
          <option value="">Any executor</option>
          <option value="relay">relay</option>
          <option value="lineup">lineup</option>
        </Select>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={loading}
            emptyLabel="Nothing has executed yet, or nothing matches these filters."
            fillHeight
          />
          <Pagination offset={offset} limit={PAGE_SIZE} total={rows.length < PAGE_SIZE ? offset + rows.length : null} onChange={setOffset} />
        </div>
      )}
    </div>
  );
}
