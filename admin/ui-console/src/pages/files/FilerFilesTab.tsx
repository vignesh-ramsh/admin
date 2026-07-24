import { useCallback, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Search, RefreshCw, Plus } from "lucide-react";
import { call } from "../../api/client";
import type { FilerFileRow } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { useDebounce } from "../../hooks/useDebounce";
import { Button } from "../../components/Button";
import { Select } from "../../components/Field";
import { Badge, StatusBadge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { DataTable, type Column } from "../../components/Table";
import { formatDateTime } from "../shared/datetime";
import { formatBytes } from "./filerUtils";

const PAGE_SIZE = 25;

export interface FilesOutletContext {
  rows: FilerFileRow[];
  loading: boolean;
  reload: () => void;
}

export function FilerFilesTab() {
  const navigate = useNavigate();
  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const [status, setStatus] = useState("");
  const [storage, setStorage] = useState("");
  const [visibility, setVisibility] = useState("");
  const [offset, setOffset] = useState(0);

  const loader = useCallback(
    () =>
      call<FilerFileRow[]>(
        "list_filer_files",
        {
          q: q || null,
          status: status || null,
          storage: storage || null,
          private: visibility || null,
          limit: PAGE_SIZE,
          offset,
        },
        { method: "GET" },
      ),
    [q, status, storage, visibility, offset],
  );

  const { data, loading, error, reload } = useAsync(loader, [q, status, storage, visibility, offset]);
  const rows = useMemo(() => data ?? [], [data]);

  const onFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setOffset(0);
  };

  const columns: Column<FilerFileRow>[] = [
    { key: "original_filename", header: "Filename", render: (r) => r.original_filename },
    { key: "size_bytes", header: "Size", render: (r) => formatBytes(r.size_bytes), align: "right" },
    { key: "content_type", header: "Type", render: (r) => r.content_type, mono: true },
    { key: "storage", header: "Storage", render: (r) => r.storage },
    {
      key: "private",
      header: "Visibility",
      render: (r) => <Badge tone={r.private ? "warning" : "neutral"}>{r.private ? "Private" : "Public"}</Badge>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "created_at", header: "Uploaded at", render: (r) => formatDateTime(r.created_at) },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            className="h-9 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            placeholder="Search by filename or path…"
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <Select
          value={status}
          onChange={(e) => onFilterChange(setStatus)(e.target.value)}
          className="!w-auto"
        >
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="clean">clean</option>
          <option value="infected">infected</option>
          <option value="skipped">skipped</option>
          <option value="deleted">deleted</option>
        </Select>
        <Select value={storage} onChange={(e) => onFilterChange(setStorage)(e.target.value)} className="!w-auto">
          <option value="">All storage</option>
          <option value="local">local</option>
          <option value="s3">s3</option>
        </Select>
        <Select value={visibility} onChange={(e) => onFilterChange(setVisibility)(e.target.value)} className="!w-auto">
          <option value="">Public + private</option>
          <option value="true">Private only</option>
          <option value="false">Public only</option>
        </Select>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
          Refresh
        </Button>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} className="ml-auto" onClick={() => navigate("/files/browse/upload")}>
          Upload
        </Button>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.file_id}
            loading={loading}
            emptyLabel={q || status || storage || visibility ? "No files match this search." : "Nothing has been uploaded yet."}
            onRowClick={(r) => navigate(`/files/browse/${r.file_id}`)}
            fillHeight
          />
          <div className="mt-3 flex items-center justify-between text-[13px] text-text-muted">
            <span>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <Outlet context={{ rows, loading, reload } satisfies FilesOutletContext} />
    </div>
  );
}
