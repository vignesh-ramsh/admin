import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { JobLogEntry } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select } from "../../components/Field";
import { Loading, EmptyState, ErrorState } from "../../components/States";
import { DataTable } from "../../components/agni/data/DataTable";
import { Pagination } from "../../components/agni/data/Pagination";
import { IconRefresh, IconSearch } from "../../layout/icons";
import { formatWhen } from "../shared/datetime";

export function ExecutionLogTab() {
  const { onUnauthorized } = useAuth();
  const [rows, setRows] = useState<JobLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [status, setStatus] = useState("");
  const [jobType, setJobType] = useState("");
  const [executor, setExecutor] = useState("");
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    call<JobLogEntry[]>(
      "list_job_log",
      {
        task_name: taskName.trim() || null,
        status: status || null,
        job_type: jobType || null,
        executor: executor || null,
        limit,
        offset,
      },
      { method: "GET" }
    )
      .then(setRows)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load job log");
      })
      .finally(() => setLoading(false));
  }, [handleErr, taskName, status, jobType, executor, limit, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const hasMore = rows.length === limit;

  return (
    <>
      <div className="list-toolbar">
        <div className="search">
          <IconSearch />
          <input
            className="search__input"
            placeholder="Search by task name…"
            value={taskName}
            onChange={(e) => {
              setOffset(0);
              setTaskName(e.target.value);
            }}
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value);
          }}
          style={{ width: 130 }}
        >
          <option value="">Any status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </Select>
        <Select
          value={jobType}
          onChange={(e) => {
            setOffset(0);
            setJobType(e.target.value);
          }}
          style={{ width: 140 }}
        >
          <option value="">Any job type</option>
          <option value="Task">Task</option>
          <option value="Scheduler">Scheduler</option>
        </Select>
        <Select
          value={executor}
          onChange={(e) => {
            setOffset(0);
            setExecutor(e.target.value);
          }}
          style={{ width: 130 }}
        >
          <option value="">Any executor</option>
          <option value="relay">relay</option>
          <option value="lineup">lineup</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}>
          <IconRefresh /> Refresh
        </Button>
      </div>

      <div className="card">
        {loading ? (
          <Loading message="Loading execution log…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState title="No matching runs" message="Nothing has executed yet, or nothing matches these filters." />
        ) : (
          <DataTable
            rowKey="id"
            rows={rows}
            columns={[
              { key: "task_name", label: "Task", width: "22%", render: (v: string) => <span className="mono truncate" title={v}>{v}</span> },
              { key: "queue", label: "Queue", width: 90, render: (v: string) => <span className="mono">{v}</span> },
              { key: "job_type", label: "Job type", width: 100, render: (v: string) => <Badge tone={v === "Scheduler" ? "accent" : "neutral"}>{v}</Badge> },
              { key: "executor", label: "Executor", width: 90, render: (v: string) => <span className="mono muted">{v}</span> },
              { key: "queued_by", label: "Queued by", width: 110, render: (v: string | null) => <span className="mono muted">{v ?? "—"}</span> },
              { key: "status", label: "Status", width: 90, render: (v: string) => <Badge tone={v === "success" ? "success" : "danger"}>{v}</Badge> },
              { key: "finished_at", label: "Finished", width: 160, render: (v: string) => <span className="muted">{formatWhen(v)}</span> },
              { key: "duration_ms", label: "Duration", width: 80, align: "right", render: (v: number) => <span className="mono muted">{v} ms</span> },
              { key: "error", label: "Error", render: (v: string | null) => <span className="truncate" title={v ?? undefined}>{v ?? "—"}</span> },
            ]}
          />
        )}

        <div className="pager">
          <div className="inline">
            <span className="muted" style={{ fontSize: 12.5 }}>
              Rows per page
            </span>
            <Select
              value={String(limit)}
              onChange={(e) => {
                setOffset(0);
                setLimit(Number(e.target.value));
              }}
              style={{ width: 80, height: 30 }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <Pagination
            page={Math.floor(offset / limit) + 1}
            pageCount={hasMore ? Math.floor(offset / limit) + 2 : Math.floor(offset / limit) + 1}
            onChange={(p) => setOffset((p - 1) * limit)}
            totalLabel={rows.length === 0 ? "0" : `${offset + 1}–${offset + rows.length}`}
          />
        </div>
      </div>
    </>
  );
}
