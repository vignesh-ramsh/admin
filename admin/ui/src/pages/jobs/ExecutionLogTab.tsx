import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { JobLogEntry } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select } from "../../components/Field";
import { Loading, EmptyState, ErrorState } from "../../components/States";
import { IconRefresh, IconSearch } from "../../layout/icons";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

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
    call<JobLogEntry[]>("list_job_log", {
      task_name: taskName.trim() || null,
      status: status || null,
      job_type: jobType || null,
      executor: executor || null,
      limit,
      offset,
    })
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
          <div className="table-wrap">
            <table className="table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 80 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Queue</th>
                  <th>Job type</th>
                  <th>Executor</th>
                  <th>Queued by</th>
                  <th>Status</th>
                  <th>Finished</th>
                  <th className="num">Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono truncate" title={r.task_name}>
                      {r.task_name}
                    </td>
                    <td className="mono">{r.queue}</td>
                    <td>
                      <Badge tone={r.job_type === "Scheduler" ? "accent" : "neutral"}>{r.job_type}</Badge>
                    </td>
                    <td className="mono muted">{r.executor}</td>
                    <td className="mono muted">{r.queued_by ?? "—"}</td>
                    <td>
                      <Badge tone={r.status === "success" ? "success" : "danger"}>{r.status}</Badge>
                    </td>
                    <td className="muted">{formatWhen(r.finished_at)}</td>
                    <td className="mono muted num">{r.duration_ms} ms</td>
                    <td className="truncate" title={r.error ?? undefined}>
                      {r.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="inline">
            <span className="muted" style={{ fontSize: 12.5 }}>
              {rows.length === 0 ? "0" : `${offset + 1}–${offset + rows.length}`}
            </span>
            <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => setOffset(offset + limit)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
