import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { call } from "../../api/client";
import type { FieldMeta, Row, TableSchema } from "../../api/types";
import { useCursorList, type CursorPage } from "../../hooks/useCursorList";
import { DataTable, type Column } from "../../components/Table";
import { IconButton } from "../../components/Button";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { LoadingBlock, ErrorBlock } from "../../components/States";
import { loadTableMeta } from "./tableMeta";
import { listColumns, formatCell, shortId } from "./format";

/** A child (TABLE-typed field) row list, embedded directly in the parent
 *  row's own preview — only the child's own `list: true` columns (point 5:
 *  the full row only ever renders in the expanded side panel, on click).
 *  Capped to ~10 visible rows before its own scrollbar takes over (never
 *  grows the surrounding modal) — real cursor pagination underneath, in
 *  case a child table genuinely has more rows than that.
 *
 *  `refreshToken` is bumped by the parent whenever a child row is added/
 *  edited/deleted via the expand panel — this component owns its own
 *  cursor list and has no other way to know that happened. */
export function ChildTablePreview({
  field,
  parentRowId,
  refreshToken,
  onOpenChildRow,
  onAddChildRow,
}: {
  field: FieldMeta;
  parentRowId: string;
  refreshToken: number;
  onOpenChildRow: (childTable: string, row: Row) => void;
  onAddChildRow: (childTable: string, nextIdx: number) => void;
}) {
  const [physicalTable, setPhysicalTable] = useState<string | null>(null);
  const [childSchema, setChildSchema] = useState<TableSchema | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhysicalTable(null);
    setChildSchema(null);
    setResolveError(null);
    loadTableMeta()
      .then((meta) => meta.find((m) => m.name === field.target)?.table ?? field.target)
      .then(async (physical) => {
        if (!physical) throw new Error("no target table");
        const s = await call<TableSchema>("get_table_schema", { table: physical }, { method: "GET" });
        if (cancelled) return;
        setPhysicalTable(physical);
        setChildSchema(s);
      })
      .catch(() => {
        if (!cancelled) setResolveError("Could not load this child table.");
      });
    return () => {
      cancelled = true;
    };
  }, [field.target]);

  const fetchPage = useCallback(
    (cursor: string | null, limit: number): Promise<CursorPage<Row>> => {
      if (!physicalTable) return Promise.resolve({ rows: [], next_cursor: null, total: 0 });
      return call<CursorPage<Row>>(
        "list_rows",
        { table: physicalTable, filters: { parent: { eq: parentRowId } }, order_by: ["idx"], after: cursor, limit },
        { method: "QUERY" },
      );
    },
    [physicalTable, parentRowId],
  );
  const { rows, loading, hasMore, loadingMore, total, error, loadMore } = useCursorList<Row>({
    fetchPage,
    limit: 20,
    rowKey: (r) => String(r.id),
    deps: [physicalTable, parentRowId, refreshToken],
  });

  if (resolveError) return <ErrorBlock message={resolveError} />;
  if (error) return <ErrorBlock message={error} />;
  if (!childSchema || !physicalTable) return <LoadingBlock label="Loading…" />;

  const listCols = listColumns(childSchema);
  const columns: Column<Row>[] = [
    { key: "id", header: "ID", width: "90px", mono: true, render: (r) => shortId(r.id) },
    ...listCols.map(
      (c): Column<Row> => ({
        key: c.name,
        header: c.name,
        render: (r) => (
          <span className="block max-w-[200px] truncate" title={formatCell(r[c.name], c.type)}>
            {formatCell(r[c.name], c.type)}
          </span>
        ),
      }),
    ),
  ];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-faint">
          {total !== null ? `${rows.length} of ${total} row${total === 1 ? "" : "s"}` : ""}
        </span>
        <IconButton
          label="Add row"
          icon={<Plus size={14} />}
          onClick={() => onAddChildRow(physicalTable, (total ?? rows.length) + 1)}
        />
      </div>
      <div className="scrollbar-thin max-h-[22rem] overflow-y-auto rounded-lg">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          loading={loading}
          emptyLabel="No Records/Entries Available"
          onRowClick={(r) => onOpenChildRow(physicalTable, r)}
          footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
        />
      </div>
    </div>
  );
}
