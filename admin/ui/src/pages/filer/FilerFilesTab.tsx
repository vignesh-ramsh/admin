import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../../api/client";
import type { FilerFileRow } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Select } from "../../components/Field";
import { Loading, EmptyState, ErrorState } from "../../components/States";
import { DataTable } from "../../components/agni/data/DataTable";
import { IconRefresh, IconSearch, IconPlus, IconChevron } from "../../layout/icons";
import { FilePreviewModal } from "./FilePreviewModal";
import { UploadFileModal } from "./UploadFileModal";
import { formatBytes, statusTone } from "./filerUtils";
import "../shared/shared.css";
import "./filer.css";

const PAGE_SIZE = 25;

export function FilerFilesTab() {
  const { onUnauthorized } = useAuth();
  // One box, matching EITHER filename or path server-side (docs/admin-ui-
  // ux-review.md #5 — these used to be two separate inputs). Debounced
  // (#1.2 in the same review) so typing doesn't fire a request per
  // keystroke — 300ms, the standard "feels instant, still coalesces a
  // fast typist" window.
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [storage, setStorage] = useState("");
  const [visibility, setVisibility] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const [rows, setRows] = useState<FilerFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FilerFileRow | null>(null);
  const [uploading, setUploading] = useState(false);

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
      { method: "GET" }
    )
      .then((r) => {
        setRows(r);
        setSelected((cur) => (cur ? (r.find((x) => x.file_id === cur.file_id) ?? cur) : null));
      })
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load files");
      })
      .finally(() => setLoading(false));
  }, [q, status, storage, visibility, offset, handleErr]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change resets to the first page — an offset that made
  // sense under the old filters is meaningless under new ones.
  useEffect(() => {
    setOffset(0);
  }, [q, status, storage, visibility]);

  return (
    <>
      <div className="filer-toolbar">
        <div className="search">
          <IconSearch />
          <input
            className="search__input"
            placeholder="Search by filename or path…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 150 }}>
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="clean">clean</option>
          <option value="infected">infected</option>
          <option value="skipped">skipped</option>
          <option value="deleted">deleted</option>
        </Select>
        <Select value={storage} onChange={(e) => setStorage(e.target.value)} style={{ width: 130 }}>
          <option value="">All storage</option>
          <option value="local">local</option>
          <option value="s3">s3</option>
        </Select>
        <Select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={{ width: 130 }}>
          <option value="">Public + private</option>
          <option value="true">Private only</option>
          <option value="false">Public only</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}>
          <IconRefresh /> Refresh
        </Button>
        <Button variant="primary" size="sm" onClick={() => setUploading(true)} style={{ marginLeft: "auto" }}>
          <IconPlus /> Upload
        </Button>
      </div>

      <div className="card">
        {loading ? (
          <Loading message="Loading files…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No files"
            message={q || status || storage || visibility ? "No files match this search." : "Nothing has been uploaded yet."}
          />
        ) : (
          <DataTable
            rowKey="file_id"
            rows={rows}
            onRowClick={(r: FilerFileRow) => setSelected(r)}
            columns={[
              { key: "original_filename", label: "Filename" },
              { key: "path", label: "Path", width: 130, render: (v: string) => <span className="mono muted" style={{ fontSize: 12.5 }}>{v}</span> },
              { key: "content_type", label: "Type", width: 170, render: (v: string) => <span className="mono muted" style={{ fontSize: 12.5 }}>{v}</span> },
              { key: "size_bytes", label: "Size", width: 100, render: (v: number) => formatBytes(v) },
              {
                key: "private",
                label: "Visibility",
                width: 100,
                render: (v: boolean) => <Badge tone={v ? "warning" : "neutral"}>{v ? "Private" : "Public"}</Badge>,
              },
              {
                key: "status",
                label: "Status",
                width: 100,
                render: (v: FilerFileRow["status"]) => (
                  <Badge tone={statusTone(v)} dot>
                    {v}
                  </Badge>
                ),
              },
              { key: "storage", label: "Storage", width: 90 },
              { key: "created_by", label: "Uploaded by", width: 180, render: (v: string | null) => v || <span className="muted">—</span> },
              {
                key: "_actions",
                label: "",
                width: 32,
                sortable: false,
                render: () => (
                  <span className="row-open" aria-hidden="true">
                    <IconChevron size={14} />
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </Button>
      </div>

      {selected && (
        <FilePreviewModal
          file={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            load();
          }}
        />
      )}

      {uploading && (
        <UploadFileModal
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            load();
          }}
        />
      )}
    </>
  );
}
