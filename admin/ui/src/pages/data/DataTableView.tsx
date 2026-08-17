import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import { call, ApiError } from "../../api/client";
import type { Row, RowPage, TableSchema } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Field";
import { DataTable, type Column } from "../../components/Table";
import { KebabMenu } from "../../components/KebabMenu";
import { ListToolbar } from "../../components/ListToolbar";
import { InfiniteScroll } from "../../components/InfiniteScroll";
import { BulkEditModal } from "../../components/BulkEditModal";
import { ConfirmModal } from "../../components/Modal";
import { ErrorBlock, LoadingBlock } from "../../components/States";
import { useToast } from "../../components/Toast";
import { useCursorList } from "../../hooks/useCursorList";
import { ExportModal } from "./ExportModal";
import { ImportModal } from "./ImportModal";
import { formatCell, listColumns, PROTECTED_TABLES, shortId } from "./format";
import { SearchTermPills } from "./SearchBar";

export interface DataTableOutletContext {
  table: string;
  schema: TableSchema;
  readOnly: boolean;
  reloadRows: () => void;
}

const DEFAULT_SORT_FIELD = "id";

export function DataTableView() {
  const { table = "" } = useParams<{ table: string }>();
  const navigate = useNavigate();
  const { onUnauthorized } = useAuth();
  const toast = useToast();

  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState<string[]>([]);
  const [sortField, setSortField] = useState<string>(DEFAULT_SORT_FIELD);
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [deleteScopeAll, setDeleteScopeAll] = useState(true);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

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

  // Table changed — reset paging/filters/search/selection/sort and load
  // its schema fresh.
  useEffect(() => {
    setSchema(null);
    setSchemaError(null);
    setFilters(null);
    setSearch([]);
    setSortField(DEFAULT_SORT_FIELD);
    setSortDesc(true);
    setSelectedIds(new Set());
    if (!table) return;
    call<TableSchema>("get_table_schema", { table }, { method: "GET" })
      .then(setSchema)
      .catch((err) => {
        if (!handleErr(err)) setSchemaError(err instanceof ApiError ? err.message : "Failed to load schema");
      });
  }, [table, handleErr]);

  const fetchPage = useCallback(
    (cursor: string | null, limit: number): Promise<RowPage> => {
      if (!table || !schema) return Promise.resolve({ rows: [], next_cursor: null, total: 0 });
      return call<RowPage>(
        "list_rows",
        {
          table,
          filters,
          search: search.length > 0 ? search : null,
          order_by: [`${sortDesc ? "-" : ""}${sortField}`],
          after: cursor,
          limit,
        },
        { method: "QUERY" },
      );
    },
    [table, schema, filters, search, sortField, sortDesc],
  );

  const {
    rows,
    loading,
    loadingMore,
    hasMore,
    total,
    error: rowsError,
    reload: loadRows,
    loadMore,
    removeByIds,
    patchByIds,
  } = useCursorList<Row>({
    fetchPage,
    rowKey: (r) => String(r.id),
    deps: [table, schema, filters, search, sortField, sortDesc],
  });

  // A filter/search/sort/table change reloads the row set from scratch —
  // whatever was selected no longer necessarily corresponds to a visible row.
  useEffect(() => {
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filters, search, sortField, sortDesc]);

  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelect = (key: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedIds((cur) => {
      const loadedKeys = rows.map((r) => String(r.id));
      const allSelected = loadedKeys.length > 0 && loadedKeys.every((k) => cur.has(k));
      return allSelected ? new Set() : new Set(loadedKeys);
    });

  // Every loaded row is selected AND there are more matching rows beyond
  // what's loaded — the one case where "act on everything matching the
  // filter, not just what's selected" is actually meaningful. Selecting
  // some (not all-loaded) rows is always an unambiguous ids-only
  // operation; no scope choice to offer there.
  const filterScope =
    selectedIds.size > 0 && rows.length > 0 && selectedIds.size === rows.length && total !== null && total > rows.length
      ? { total, loadedCount: rows.length }
      : undefined;

  const hasActiveFilters = filters !== null;
  const hasAnyQuery = filters !== null || search.length > 0;

  const doBulkEdit = async (patch: Record<string, unknown>, scope: "all" | "loaded") => {
    setBulkApplying(true);
    try {
      if (scope === "all" && filterScope) {
        const result = await call<{ count: number }>("save_rows_bulk_by_filter", { table, filters, search, patch });
        loadRows();
        toast.success(`${result.count} row${result.count === 1 ? "" : "s"} updated.`);
      } else {
        const ids = [...selectedIds];
        await call("save_rows_bulk", { table, ids, patch });
        patchByIds(ids, patch);
        toast.success(`${ids.length} row${ids.length === 1 ? "" : "s"} updated.`);
      }
      setBulkEditOpen(false);
      clearSelection();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update rows");
    } finally {
      setBulkApplying(false);
    }
  };

  const doBulkDelete = async () => {
    setConfirmingBulkDelete(false);
    setBulkDeleting(true);
    try {
      if (filterScope && deleteScopeAll) {
        const result = await call<{ count: number }>("delete_rows_by_filter", { table, filters, search });
        loadRows();
        toast.success(`${result.count} row${result.count === 1 ? "" : "s"} deleted.`);
      } else {
        const ids = [...selectedIds];
        await call("delete_rows", { table, ids });
        removeByIds(ids);
        toast.success(`${ids.length} row${ids.length === 1 ? "" : "s"} deleted.`);
      }
      clearSelection();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete rows");
    } finally {
      setBulkDeleting(false);
    }
  };

  if (schemaError) {
    return <ErrorBlock message={schemaError} />;
  }
  if (!schema) {
    return <LoadingBlock label="Loading table…" />;
  }

  const columns = listColumns(schema);
  const sortColumnNames = [...schema.system_fields.filter((f) => f.is_column).map((f) => f.name), ...columns.map((c) => c.name)];

  const tableColumns: Column<Row>[] = [
    { key: "id", header: "ID", width: "110px", mono: true, render: (r) => shortId(r.id) },
    ...columns.map(
      (c): Column<Row> => ({
        key: c.name,
        header: c.name,
        render: (r) => (
          <span className="block max-w-[240px] truncate" title={formatCell(r[c.name], c.type)}>
            {formatCell(r[c.name], c.type)}
          </span>
        ),
      }),
    ),
  ];

  const deleteTargetCount = filterScope && deleteScopeAll ? filterScope.total : selectedIds.size;

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
          {!readOnly && (
            <KebabMenu
              items={[
                {
                  key: "export",
                  label: "Export",
                  icon: <Download size={14} />,
                  onSelect: () => setExportModalOpen(true),
                },
                {
                  key: "import",
                  label: "Import",
                  icon: <Upload size={14} />,
                  onSelect: () => setImportModalOpen(true),
                },
              ]}
            />
          )}
        </div>
      </div>

      {readOnly && (
        <p className="mb-3 rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2 text-[13px] text-warning">
          <strong>{table}</strong> is managed through its own dedicated screen — this view is read-only here to avoid bypassing its validation.
        </p>
      )}

      <ListToolbar
        schema={schema}
        search={search}
        onSearchChange={setSearch}
        onFiltersChange={setFilters}
        hasActiveFilters={hasActiveFilters}
        sortColumnNames={sortColumnNames}
        sortField={sortField}
        sortDesc={sortDesc}
        onSortChange={(field, desc) => {
          setSortField(field);
          setSortDesc(desc);
        }}
        total={total}
        loadedCount={rows.length}
        selectedCount={readOnly ? 0 : selectedIds.size}
        onClearSelection={clearSelection}
        onBulkEdit={() => setBulkEditOpen(true)}
        onBulkDelete={() => {
          setDeleteScopeAll(true);
          setConfirmingBulkDelete(true);
        }}
      />

      <SearchTermPills terms={search} onChange={setSearch} />

      {rowsError ? (
        <ErrorBlock message={rowsError} onRetry={loadRows} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DataTable
            columns={tableColumns}
            rows={rows}
            rowKey={(r) => String(r.id)}
            loading={loading}
            emptyLabel={hasAnyQuery ? "No rows match this filter." : "This table has no rows yet."}
            onRowClick={(r) => navigate(`/data/${table}/${r.id}`)}
            fillHeight
            selection={readOnly ? undefined : { selectedIds, onToggle: toggleSelect, onToggleAll: toggleSelectAll }}
            footer={<InfiniteScroll hasMore={hasMore} loading={loadingMore} onReachEnd={loadMore} />}
          />
        </div>
      )}

      {bulkEditOpen && (
        <BulkEditModal
          schema={schema}
          selectedCount={selectedIds.size}
          filterScope={filterScope}
          applying={bulkApplying}
          onApply={doBulkEdit}
          onClose={() => setBulkEditOpen(false)}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmModal
          title={`Delete ${deleteTargetCount} row${deleteTargetCount === 1 ? "" : "s"}`}
          message={
            filterScope ? (
              <div className="flex flex-col gap-2.5">
                <p>
                  Are you sure you want to delete {deleteTargetCount} record{deleteTargetCount === 1 ? "" : "s"}? Each is
                  soft-deleted and recoverable from _trash.
                </p>
                <div className="rounded-md border border-warning/25 bg-warning-bg/50 px-3 py-2.5">
                  <Checkbox
                    label={`Apply to all ${filterScope.total} matching record${filterScope.total === 1 ? "" : "s"}`}
                    checked={deleteScopeAll}
                    onChange={(e) => setDeleteScopeAll(e.target.checked)}
                  />
                  <p className="mt-1 pl-6 text-xs text-text-faint">
                    {deleteScopeAll
                      ? "Every row matching the current filter/search — not just the selected ones."
                      : `Unchecked — only deletes the ${selectedIds.size} selected row${selectedIds.size === 1 ? "" : "s"}.`}
                  </p>
                </div>
              </div>
            ) : (
              `Delete ${selectedIds.size} row${selectedIds.size === 1 ? "" : "s"}? Each is soft-deleted and recoverable from _trash.`
            )
          }
          confirmLabel="Delete"
          danger
          loading={bulkDeleting}
          onConfirm={doBulkDelete}
          onClose={() => setConfirmingBulkDelete(false)}
        />
      )}

      {exportModalOpen && (
        <ExportModal
          table={table}
          schema={schema}
          filters={filters}
          search={search}
          hasActiveQuery={hasAnyQuery}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {importModalOpen && (
        <ImportModal table={table} schema={schema} onClose={() => setImportModalOpen(false)} onImported={loadRows} />
      )}

      <Outlet context={{ table, schema, readOnly, reloadRows: loadRows } satisfies DataTableOutletContext} />
    </div>
  );
}
