import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { call } from "../../api/client";
import type { TrashRow } from "../../api/types";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { Button } from "../../components/Button";
import { Select } from "../../components/Field";
import { ErrorBlock } from "../../components/States";
import { DataTable, type Column } from "../../components/Table";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { formatDateTime } from "../shared/datetime";
import { TrashPreviewModal } from "./TrashPreviewModal";

export function TrashPage() {
  const [table, setTable] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    call<string[]>("list_trash_tables", {}, { method: "GET" })
      .then(setTables)
      .catch(() => {
        /* best-effort — an empty filter dropdown just means "no filter yet" */
      });
  }, []);

  const fetchPage = useCallback(
    (cursor: string | null, limit: number) =>
      call<CursorPage<TrashRow>>("list_trash_rows", { table: table || null, after: cursor, limit }, { method: "GET" }),
    [table],
  );
  const { rows, loading, hasMore, loadingMore, total, error, reload, loadMore } = useCursorList<TrashRow>({
    fetchPage,
    rowKey: (r) => r.id,
    deps: [table],
  });

  const onRestored = () => {
    setSelectedId(null);
    reload();
  };

  const columns: Column<TrashRow>[] = [
    { key: "table", header: "Table", render: (r) => r.table, mono: true },
    { key: "deleted_by", header: "Deleted by", render: (r) => r.deleted_by ?? "—" },
    { key: "deleted_at", header: "Deleted at", render: (r) => formatDateTime(r.deleted_at) },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-text">Trash</h2>
          <p className="text-[13px] text-text-muted">Rows soft-deleted from any table. Click one to preview and restore it.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={table} onChange={(e) => setTable(e.target.value)} className="!w-auto">
          <option value="">All tables</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
          Refresh
        </Button>
        <span className="ml-auto text-[13px] text-text-faint">{total !== null ? `${rows.length} of ${total}` : `${rows.length} entries`}</span>
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
            emptyLabel="Nothing in trash right now."
            onRowClick={(r) => setSelectedId(r.id)}
            fillHeight
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      {selectedId && (
        <TrashPreviewModal trashId={selectedId} onClose={() => setSelectedId(null)} onRestored={onRestored} />
      )}
    </div>
  );
}
