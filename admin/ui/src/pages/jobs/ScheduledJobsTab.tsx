import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { ScheduledJob } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select } from "../../components/Field";
import { Loading, EmptyState, ErrorState } from "../../components/States";
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
  const hasMore = offset + limit < filtered.length;

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
          <div className="table-wrap">
            <table className="table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Queue</th>
                  <th>Cron</th>
                  <th>Last run</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((s) => (
                  <tr key={s.task_name}>
                    <td className="mono truncate" title={s.task_name}>
                      {s.task_name}
                    </td>
                    <td>
                      <Badge tone="accent">{s.queue}</Badge>
                    </td>
                    <td className="mono">{s.cron}</td>
                    <td className="muted">{formatWhen(s.last_run_at)}</td>
                    <td>
                      {s.last_status === null ? (
                        <span className="muted">never run</span>
                      ) : (
                        <Badge tone={s.last_status === "success" ? "success" : "danger"}>{s.last_status}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            <div className="inline">
              <span className="muted" style={{ fontSize: 12.5 }}>
                {`${offset + 1}–${Math.min(offset + limit, filtered.length)} of ${filtered.length}`}
              </span>
              <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
