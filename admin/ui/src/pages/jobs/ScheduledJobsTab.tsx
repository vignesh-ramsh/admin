import { useCallback, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { call } from "../../api/client";
import type { ScheduledJob } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { DataTable, Pagination, type Column } from "../../components/Table";
import { formatDateTime } from "../shared/datetime";

const PAGE_SIZE = 25;

/* Live config, not history — small N in practice (one entry per
   @arc.relay.task(cron=...) anywhere in the system), so search and
   pagination both happen client-side against the one already-fetched
   list rather than round-tripping to the server for either. */
export function ScheduledJobsTab() {
  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const [offset, setOffset] = useState(0);
  const searchRef = usePageSearchFocus();

  const loader = useCallback(() => call<ScheduledJob[]>("list_scheduled_jobs", {}, { method: "GET" }), []);
  const { data, loading, error, reload } = useAsync(loader, []);
  const all = data ?? [];

  const filtered = useMemo(
    () => all.filter((s) => s.task_name.toLowerCase().includes(q.trim().toLowerCase())),
    [all, q],
  );
  const paged = filtered.slice(offset, offset + PAGE_SIZE);

  const columns: Column<ScheduledJob>[] = [
    { key: "task_name", header: "Task", render: (r) => r.task_name, mono: true },
    { key: "queue", header: "Queue", render: (r) => <Badge tone="accent">{r.queue}</Badge> },
    { key: "cron", header: "Cron", render: (r) => r.cron, mono: true },
    { key: "last_run_at", header: "Last run", render: (r) => formatDateTime(r.last_run_at) },
    {
      key: "last_status",
      header: "Result",
      render: (r) =>
        r.last_status === null ? <span className="text-text-faint">never run</span> : (
          <Badge tone={r.last_status === "success" ? "success" : "danger"}>{r.last_status}</Badge>
        ),
    },
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
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              setOffset(0);
            }}
          />
        </div>
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
            rows={paged}
            rowKey={(r) => r.task_name}
            loading={loading}
            emptyLabel={q ? `Nothing matches "${q}".` : "No task anywhere declares a cron= schedule, or lineup isn't installed."}
            fillHeight
          />
          {filtered.length > 0 && (
            <Pagination offset={offset} limit={PAGE_SIZE} total={filtered.length} onChange={setOffset} />
          )}
        </div>
      )}
    </div>
  );
}
