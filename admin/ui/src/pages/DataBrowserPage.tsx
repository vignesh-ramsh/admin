import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { call, ApiError } from "../api/client";
import type { Row, TableMeta, TableSchema } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Select } from "../components/Field";
import { Combobox, type ComboOption } from "../components/Combobox";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { IconPlus, IconRefresh } from "../layout/icons";
import { RowEditorModal, TableFlags } from "./data/RowEditorModal";
import { FilterBar, type Filters } from "./data/FilterBar";
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
    call<string[]>("list_plugins", { surface: SURFACE }).then(setPlugins).catch(handleErr);
    call<TableMeta[]>("list_table_meta", { surface: SURFACE }).then(setTableMeta).catch(handleErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleErr]);

  // Every table, narrowed by plugin only when one is chosen.
  const tableOptions: ComboOption[] = useMemo(
    () =>
      tableMeta
        .filter((m) => !plugin || m.plugin === plugin)
        .map((m) => ({
          value: m.table,
          label: m.table,
          sublabel: [m.plugin, m.child ? "child" : m.system ? "system" : null].filter(Boolean).join(" · "),
        })),
    [tableMeta, plugin]
  );

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
    call<TableSchema>("get_table_schema", { table })
      .then(setSchema)
      .catch((err) => {
        if (!handleErr(err)) setError(err instanceof ApiError ? err.message : "Failed to load schema");
      });
  }, [table, handleErr]);

  const loadRows = useCallback(() => {
    if (!table) return;
    setLoading(true);
    setError(null);
    call<Row[]>("list_rows", {
      table,
      filters,
      order_by: orderBy ? [orderBy] : null,
      limit,
      offset,
    })
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

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => String(r.id)))
    );

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} row${selected.size === 1 ? "" : "s"}? Soft-deleted, recoverable from _trash.`)) return;
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
    <>
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

      <div className="data-toolbar">
        <div className="data-toolbar__group">
          <label className="data-toolbar__label">Plugin</label>
          <Select value={plugin} onChange={(e) => setPlugin(e.target.value)} style={{ width: 200 }}>
            <option value="">All plugins</option>
            {plugins.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="data-toolbar__group">
          <label className="data-toolbar__label">Table</label>
          <div style={{ width: 260 }}>
            <Combobox
              value={table}
              onChange={setTable}
              options={tableOptions}
              placeholder="Search tables…"
              emptyText="No matching tables"
            />
          </div>
        </div>
        {schema && <TableFlags schema={schema} />}
      </div>

      {!table ? (
        <div className="card">
          <EmptyState
            title="No table selected"
            message="Search for a table above — by name, across every plugin — or narrow the search first by picking a plugin."
          />
        </div>
      ) : (
        <div className="card">
          {schema && <FilterBar schema={schema} onApply={(f) => { setOffset(0); setFilters(f); }} />}

          {!readOnly && selected.size > 0 && (
            <div className="bulk-bar">
              <span>{selected.size} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button variant="danger" size="sm" onClick={bulkDelete} loading={bulkDeleting}>
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
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {!readOnly && (
                      <th style={{ width: 32 }}>
                        <input
                          type="checkbox"
                          checked={rows.length > 0 && selected.size === rows.length}
                          onChange={toggleAll}
                          aria-label="Select all rows"
                        />
                      </th>
                    )}
                    <th style={{ width: 96 }}>ID</th>
                    {columns.map((c) => (
                      <th key={c.name}>
                        <button className="th-sort" onClick={() => toggleSort(c.name)}>
                          {c.name}
                          {orderBy === c.name && " ↑"}
                          {orderBy === `-${c.name}` && " ↓"}
                        </button>
                      </th>
                    ))}
                    <th style={{ width: 70 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const id = String(r.id ?? i);
                    return (
                      <tr key={id} className="row-clickable" onClick={() => setEditing({ id: String(r.id) })}>
                        {!readOnly && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(id)}
                              onChange={() => toggleRow(id)}
                              aria-label={`Select row ${id}`}
                            />
                          </td>
                        )}
                        <td className="mono muted">{shortId(r.id)}</td>
                        {columns.map((c) => (
                          <td key={c.name}>
                            <span className="truncate" title={formatCell(r[c.name])}>
                              {formatCell(r[c.name])}
                            </span>
                          </td>
                        ))}
                        <td>
                          <div className="table__actions">
                            <span className="row-open">{readOnly ? "View" : "Edit"}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
            <div className="inline">
              <span className="muted" style={{ fontSize: 12.5 }}>
                {rows.length === 0 ? "0" : `${offset + 1}–${offset + rows.length}`}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={!hasMore} onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
