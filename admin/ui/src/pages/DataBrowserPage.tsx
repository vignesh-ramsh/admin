import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { call, ApiError } from "../api/client";
import type { Row, TableMeta, TableSchema } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Select } from "../components/Field";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { DataTable, type DataColumn } from "../components/agni/data/DataTable";
import { Pagination } from "../components/agni/data/Pagination";
import { IconPlus, IconRefresh } from "../layout/icons";
import { RowEditorModal, TableFlags } from "./data/RowEditorModal";
import { FilterBar, type Filters } from "./data/FilterBar";
import { ConfirmModal } from "./shared/ConfirmModal";
import { PanelSearch } from "./shared/PanelSearch";
import { useIncrementalReveal } from "../hooks/useIncrementalReveal";
import { formatCell, listColumns, PROTECTED_TABLES, shortId } from "./data/format";
import "./shared/shared.css";
import "./data.css";

const SURFACE = "data_browser";

export function DataBrowserPage() {
  const { onUnauthorized } = useAuth();
  // Selection lives in the URL (?plugin=&table=) so a refresh or a shared
  // link lands back on the same table instead of resetting to the first.
  // Plugin is an optional NARROWING filter on the table search below, not
  // a prerequisite — a table can be picked (searched by name, across every
  // plugin) with no plugin chosen at all.
  const [params, setParams] = useSearchParams();
  const plugin = params.get("plugin") ?? "";
  const table = params.get("table") ?? "";
  const setPlugin = (name: string) => setParams(name ? { plugin: name, table } : { table }, { replace: true });
  const setTable = (name: string) => setParams(plugin ? { plugin, table: name } : { table: name });
  const [q, setQ] = useState("");

  const [plugins, setPlugins] = useState<string[]>([]);
  const [tableMeta, setTableMeta] = useState<TableMeta[]>([]);
  const [schema, setSchema] = useState<TableSchema | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<Filters>(null);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const readOnly = PROTECTED_TABLES.has(table);

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

  useEffect(() => {
    call<string[]>("list_plugins", { surface: SURFACE }, { method: "GET" }).then(setPlugins).catch(handleErr);
    call<TableMeta[]>("list_table_meta", { surface: SURFACE }, { method: "GET" }).then(setTableMeta).catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleErr]);

  // Every table, narrowed by plugin (panel's filter icon) and search text
  // (panel's search box) — both client-side, over the one list_table_meta
  // fetch above (small N in practice, no real pagination API to page
  // against server-side).
  const tableOptions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tableMeta
      .filter((m) => !plugin || m.plugin === plugin)
      .filter((m) => !needle || m.table.toLowerCase().includes(needle))
      .map((m) => ({
        value: m.table,
        label: m.table,
        sublabel: [m.plugin, m.child ? "child" : m.system ? "system" : null].filter(Boolean).join(" · "),
      }));
  }, [tableMeta, plugin, q]);

  // Table changed -> load its schema, reset paging/filters/selection.
  useEffect(() => {
    setSelected(new Set());
    if (!table) {
      setSchema(null);
      setRows([]);
      return;
    }
    setFilters(null);
    setOrderBy(null);
    setOffset(0);
    call<TableSchema>("get_table_schema", { table }, { method: "GET" })
      .then(setSchema)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load schema");
      });
  }, [table, handleErr]);

  const loadRows = useCallback(() => {
    if (!table) return;
    setLoading(true);
    setError(null);
    call<Row[]>(
      "list_rows",
      {
        table,
        filters,
        order_by: orderBy ? [orderBy] : null,
        limit,
        offset,
      },
      { method: "QUERY" }
    )
      .then((r) => {
        setRows(r);
        setSelected(new Set());
      })
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load rows");
      })
      .finally(() => setLoading(false));
  }, [table, filters, orderBy, limit, offset, handleErr]);

  useEffect(() => {
    if (schema) loadRows();
  }, [schema, loadRows]);

  const toggleSort = (name: string) => {
    setOffset(0);
    setOrderBy((cur) => (cur === name ? `-${name}` : cur === `-${name}` ? null : name));
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    setConfirmingBulkDelete(false);
    setBulkDeleting(true);
    try {
      await call("delete_rows", { table, ids: Array.from(selected) });
      setSelected(new Set());
      loadRows();
    } catch (err) {
      if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to delete rows");
    } finally {
      setBulkDeleting(false);
    }
  };

  const columns = schema ? listColumns(schema) : [];
  const hasMore = rows.length === limit;

  return (
    <div className="workspace">
      <PageHeader
        title="Data Browser"
        subtitle="Browse and edit rows on any table, driven by its own schema."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadRows} disabled={!table}>
              <IconRefresh /> Refresh
            </Button>
            {!readOnly && (
              <Button variant="primary" size="sm" onClick={() => setEditing({ id: null })} disabled={!schema}>
                <IconPlus /> New row
              </Button>
            )}
          </>
        }
      />

      <div className="browse-shell">
        <aside className="browse-panel">
          <PanelSearch
            value={q}
            onChange={setQ}
            plugins={plugins}
            activePlugin={plugin}
            onPluginChange={setPlugin}
            placeholder="Search tables…"
          />
          <TableList options={tableOptions} activeTable={table} onSelect={setTable} />
        </aside>

      {!table ? (
        <section className="browse-content card">
          <EmptyState
            title="No table selected"
            message="Pick a table on the left — search by name, or use the filter icon to narrow by plugin."
          />
        </section>
      ) : (
        <section className="browse-content card">
          {schema && <TableFlags schema={schema} />}
          {schema && <FilterBar schema={schema} onApply={(f) => { setOffset(0); setFilters(f); }} />}

          {!readOnly && selected.size > 0 && (
            <div className="bulk-bar">
              <span>{selected.size} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmingBulkDelete(true)} loading={bulkDeleting}>
                Delete selected
              </Button>
            </div>
          )}

          {loading ? (
            <Loading message="Loading rows…" />
          ) : error ? (
            <ErrorState message={error} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No rows"
              message={filters ? "No rows match this filter." : "This table has no rows yet."}
            />
          ) : (
            <DataTable
              rowKey="id"
              rows={rows}
              selectable={!readOnly}
              selected={selected}
              onSelect={(next) => setSelected(next as Set<string>)}
              onRowClick={(r: Row) => setEditing({ id: String(r.id) })}
              columns={[
                {
                  key: "id",
                  label: "ID",
                  width: 96,
                  sortable: false,
                  render: (v: unknown) => <span className="mono muted">{shortId(v)}</span>,
                },
                ...columns.map(
                  (c): DataColumn => ({
                    key: c.name,
                    // DataTable's own click-to-sort only re-sorts the current
                    // PAGE client-side — wrong here, since sorting has to
                    // drive the server-side order_by (this table can be far
                    // bigger than one page). sortable: false disables that,
                    // and the label itself is the same click-to-sort button
                    // this page already had, unchanged.
                    sortable: false,
                    label: (
                      <button className="th-sort" onClick={() => toggleSort(c.name)}>
                        {c.name}
                        {orderBy === c.name && " ↑"}
                        {orderBy === `-${c.name}` && " ↓"}
                      </button>
                    ),
                    render: (v: unknown) => (
                      <span className="truncate" title={formatCell(v, c.type)}>
                        {formatCell(v, c.type)}
                      </span>
                    ),
                  })
                ),
                {
                  key: "_actions",
                  label: "",
                  width: 70,
                  sortable: false,
                  render: () => <span className="row-open">{readOnly ? "View" : "Edit"}</span>,
                },
              ]}
            />
          )}

          <div className="pager">
            <div className="inline">
              <span className="muted" style={{ fontSize: 12.5 }}>Rows per page</span>
              <Select
                value={String(limit)}
                onChange={(e) => {
                  setOffset(0);
                  setLimit(Number(e.target.value));
                }}
                style={{ width: 80, height: 30 }}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <Pagination
              page={Math.floor(offset / limit) + 1}
              pageCount={hasMore ? Math.floor(offset / limit) + 2 : Math.floor(offset / limit) + 1}
              onChange={(p) => setOffset((p - 1) * limit)}
              totalLabel={rows.length === 0 ? "0" : `${offset + 1}–${offset + rows.length}`}
            />
          </div>
        </section>
      )}
      </div>

      {editing && schema && (
        <RowEditorModal
          table={table}
          schema={schema}
          rowId={editing.id}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadRows();
          }}
        />
      )}

      {confirmingBulkDelete && (
        <ConfirmModal
          title="Delete rows"
          message={`Delete ${selected.size} row${selected.size === 1 ? "" : "s"}? Soft-deleted, recoverable from _trash.`}
          onConfirm={bulkDelete}
          onCancel={() => setConfirmingBulkDelete(false)}
        />
      )}
    </div>
  );
}

function TableList({
  options,
  activeTable,
  onSelect,
}: {
  options: { value: string; label: string; sublabel: string }[];
  activeTable: string;
  onSelect: (name: string) => void;
}) {
  const { visible, sentinelRef, hasMore } = useIncrementalReveal(options, 40);
  if (options.length === 0) {
    return <div className="file-group__empty" style={{ padding: "10px 10px" }}>No matching tables</div>;
  }
  return (
    <div className="browse-panel__list">
      <ul className="file-list">
        {visible.map((o) => (
          <li key={o.value}>
            <button
              className={`file-item ${activeTable === o.value ? "file-item--active" : ""}`}
              onClick={() => onSelect(o.value)}
            >
              <span>{o.label}</span>
              {o.sublabel && <span className="file-item__sub">{o.sublabel}</span>}
            </button>
          </li>
        ))}
      </ul>
      {hasMore && <div ref={sentinelRef} className="browse-panel__sentinel" />}
    </div>
  );
}
