import { useCallback, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Search, RefreshCw, Plus } from "lucide-react";
import { call } from "../../api/client";
import type { FilerFileRow } from "../../api/types";
import { useDebounce } from "../../hooks/useDebounce";
import { usePageSearchFocus } from "../../hooks/usePageSearchFocus";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { Button } from "../../components/Button";
import { Select } from "../../components/Field";
import { Badge, StatusBadge } from "../../components/Badge";
import { ErrorBlock } from "../../components/States";
import { DataTable, type Column } from "../../components/Table";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { formatDateTime } from "../shared/datetime";
import { formatBytes } from "./filerUtils";

export interface FilesOutletContext {
  rows: FilerFileRow[];
  loading: boolean;
  reload: () => void;
}

export function FilerFilesTab() {
  const navigate = useNavigate();
  const [qInput, setQInput] = useState("");
  const q = useDebounce(qInput, 300);
  const searchRef = usePageSearchFocus();
  const [status, setStatus] = useState("");
  const [storage, setStorage] = useState("");
  const [visibility, setVisibility] = useState("");

  const fetchPage = useCallback(
    (cursor: string | null, limit: number) =>
      call<CursorPage<FilerFileRow>>(
        "list_filer_files",
        {
          q: q || null,
          status: status || null,
          storage: storage || null,
          private: visibility || null,
          after: cursor,
          limit,
        },
        { method: "GET" },
      ),
    [q, status, storage, visibility],
  );
  const { rows, loading, hasMore, loadingMore, total, error, reload, loadMore } = useCursorList<FilerFileRow>({
    fetchPage,
    rowKey: (r) => r.file_id,
    deps: [q, status, storage, visibility],
  });

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
            ref={searchRef}
            className="h-9 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25"
            placeholder="Search by filename or path…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="clean">clean</option>
          <option value="infected">infected</option>
          <option value="skipped">skipped</option>
          <option value="deleted">deleted</option>
        </Select>
        <Select value={storage} onChange={(e) => setStorage(e.target.value)} className="!w-auto">
          <option value="">All storage</option>
          <option value="local">local</option>
          <option value="s3">s3</option>
        </Select>
        <Select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="!w-auto">
          <option value="">Public + private</option>
          <option value="true">Private only</option>
          <option value="false">Public only</option>
        </Select>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
          Refresh
        </Button>
        <span className="text-[13px] text-text-faint">{total !== null ? `${rows.length} of ${total}` : `${rows.length} files`}</span>
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
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      <Outlet context={{ rows, loading, reload } satisfies FilesOutletContext} />
    </div>
  );
}
