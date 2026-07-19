import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { ScheduledJob } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select } from "../../components/Field";
import { Loading, EmptyState, ErrorState } from "../../components/States";
import { DataTable } from "../../components/agni/data/DataTable";
import { Pagination } from "../../components/agni/data/Pagination";
import { IconRefresh, IconSearch } from "../../layout/icons";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/* Live config, not history (docs/arc.MD §3.15) — small N in practice (one
   entry per @arc.relay.task(cron=...) anywhere in the system), so search
   and pagination both happen client-side against the one already-fetched
   list rather than round-tripping to the server for either. */
export function ScheduledJobsTab() {
  const { onUnauthorized } = useAuth();
  const [all, setAll] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
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
    call<ScheduledJob[]>("list_scheduled_jobs")
      .then(setAll)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load scheduled jobs");
      })
      .finally(() => setLoading(false));
  }, [handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = all.filter((s) => s.task_name.toLowerCase().includes(q.trim().toLowerCase()));
  const paged = filtered.slice(offset, offset + limit);

  return (
    <>
      <div className="list-toolbar">
        <div className="search">
          <IconSearch />
          <input
            className="search__input"
            placeholder="Search by task name…"
            value={q}
            onChange={(e) => {
              setOffset(0);
              setQ(e.target.value);
            }}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <IconRefresh /> Refresh
        </Button>
      </div>

      <div className="card">
        {loading ? (
          <Loading message="Loading scheduled jobs…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : all.length === 0 ? (
          <EmptyState
            title="No scheduled jobs"
            message="No task anywhere declares a cron= schedule, or lineup isn't installed."
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" message={`Nothing matches “${q}”.`} />
        ) : (
          <DataTable
            rowKey="task_name"
            rows={paged}
            columns={[
              { key: "task_name", label: "Task", render: (v: string) => <span className="mono truncate" title={v}>{v}</span> },
              { key: "queue", label: "Queue", width: 110, render: (v: string) => <Badge tone="accent">{v}</Badge> },
              { key: "cron", label: "Cron", width: 150, render: (v: string) => <span className="mono">{v}</span> },
              { key: "last_run_at", label: "Last run", width: 190, render: (v: string) => <span className="muted">{formatWhen(v)}</span> },
              {
                key: "last_status",
                label: "Result",
                width: 100,
                render: (v: string | null) =>
                  v === null ? <span className="muted">never run</span> : <Badge tone={v === "success" ? "success" : "danger"}>{v}</Badge>,
              },
            ]}
          />
        )}

        {filtered.length > 0 && (
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
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <Pagination
              page={Math.floor(offset / limit) + 1}
              pageCount={Math.max(1, Math.ceil(filtered.length / limit))}
              onChange={(p) => setOffset((p - 1) * limit)}
              totalLabel={`${offset + 1}–${Math.min(offset + limit, filtered.length)} of ${filtered.length}`}
            />
          </div>
        )}
      </div>
    </>
  );
}
