import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Row, TableSchema } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { DataTable, Pagination, type Column } from "../../components/Table";
import { ErrorBlock, LoadingBlock } from "../../components/States";
import { FilterBar } from "./FilterBar";
import { formatCell, listColumns, PROTECTED_TABLES, shortId } from "./format";

export interface DataTableOutletContext {
  table: string;
  schema: TableSchema;
  readOnly: boolean;
  reloadRows: () => void;
}

export function DataTableView() {
  const { table = "" } = useParams<{ table: string }>();
  const navigate = useNavigate();
  const { onUnauthorized } = useAuth();

  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown> | null>(null);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const readOnly = PROTECTED_TABLES.has(table);

  const handleErr = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized],
  );

  // Table changed — reset paging/filters and load its schema fresh.
  useEffect(() => {
    setSchema(null);
    setSchemaError(null);
    setFilters(null);
    setOrderBy(null);
    setOffset(0);
    if (!table) return;
    call<TableSchema>("get_table_schema", { table }, { method: "GET" })
      .then(setSchema)
      .catch((err) => {
        if (!handleErr(err)) setSchemaError(err instanceof ApiError ? err.message : "Failed to load schema");
      });
  }, [table, handleErr]);

  const loadRows = useCallback(() => {
    if (!table || !schema) return;
    setLoading(true);
    setRowsError(null);
    call<Row[]>("list_rows", { table, filters, order_by: orderBy ? [orderBy] : null, limit, offset }, { method: "QUERY" })
      .then(setRows)
      .catch((err) => {
        if (!handleErr(err)) setRowsError(err instanceof ApiError ? err.message : "Failed to load rows");
      })
      .finally(() => setLoading(false));
  }, [table, schema, filters, orderBy, limit, offset, handleErr]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  if (schemaError) {
    return <ErrorBlock message={schemaError} />;
  }
  if (!schema) {
    return <LoadingBlock label="Loading table…" />;
  }

  const columns = listColumns(schema);
  const hasMore = rows.length === limit;

  const tableColumns: Column<Row>[] = [
    { key: "id", header: "ID", width: "110px", mono: true, render: (r) => shortId(r.id) },
    ...columns.map(
      (c): Column<Row> => ({
        key: c.name,
        header: c.name + (orderBy === c.name ? " ↑" : orderBy === `-${c.name}` ? " ↓" : ""),
        render: (r) => (
          <span className="block max-w-[240px] truncate" title={formatCell(r[c.name], c.type)}>
            {formatCell(r[c.name], c.type)}
          </span>
        ),
      }),
    ),
    {
      key: "_open",
      header: "",
      width: "28px",
      render: () => <ChevronRight size={14} className="text-text-faint" />,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-text">{table}</h2>
          {schema.system && <Badge tone="warning">system</Badge>}
          {schema.child && <Badge tone="accent">child</Badge>}
          {schema.audit && <Badge tone="neutral">audited</Badge>}
          {readOnly && <Badge tone="danger">read-only</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadRows}>
            Refresh
          </Button>
          {!readOnly && (
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => navigate(`/data/${table}/new`)}>
              New row
            </Button>
          )}
        </div>
      </div>

      {readOnly && (
        <p className="mb-3 rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
          <strong>{table}</strong> is managed through its own dedicated screen — this view is read-only here to avoid bypassing its validation.
        </p>
      )}

      <FilterBar schema={schema} onChange={(f) => { setOffset(0); setFilters(f); }} />

      <div className="mb-2 flex items-center gap-2 text-[13px] text-text-muted">
        <span>Sort</span>
        <select
          value={orderBy?.replace(/^-/, "") ?? ""}
          onChange={(e) => {
            setOffset(0);
            setOrderBy(e.target.value || null);
          }}
          className="h-8 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-[13px] text-text"
        >
          <option value="">none</option>
          {columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {orderBy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOffset(0);
              setOrderBy((cur) => (cur?.startsWith("-") ? cur.slice(1) : `-${cur}`));
            }}
          >
            {orderBy.startsWith("-") ? "descending" : "ascending"}
          </Button>
        )}
      </div>

      {rowsError ? (
        <ErrorBlock message={rowsError} onRetry={loadRows} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={tableColumns}
            rows={rows}
            rowKey={(r) => String(r.id)}
            loading={loading}
            emptyLabel={filters ? "No rows match this filter." : "This table has no rows yet."}
            onRowClick={(r) => navigate(`/data/${table}/${r.id}`)}
            fillHeight
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Pagination offset={offset} limit={limit} total={hasMore ? null : offset + rows.length} onChange={setOffset} />
        <select
          value={limit}
          onChange={(e) => {
            setOffset(0);
            setLimit(Number(e.target.value));
          }}
          className="h-8 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-[13px] text-text"
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>

      <Outlet context={{ table, schema, readOnly, reloadRows: loadRows } satisfies DataTableOutletContext} />
    </div>
  );
}
