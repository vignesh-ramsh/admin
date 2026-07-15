import { useCallback, useEffect, useState } from "react";
import { call, ApiError } from "../api/client";
import type { Row, TableSchema } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Select } from "../components/Field";
import { Loading, EmptyState, ErrorState } from "../components/States";
import { IconPlus, IconRefresh } from "../layout/icons";
import { RowEditorModal, TableFlags } from "./data/RowEditorModal";
import { FilterBar, type Filters } from "./data/FilterBar";
import { formatCell, listColumns, PROTECTED_TABLES, shortId } from "./data/format";
import "./data.css";

export function DataBrowserPage() {
  const { onUnauthorized } = useAuth();
  const [plugins, setPlugins] = useState<string[]>([]);
  const [plugin, setPlugin] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState("");
  const [schema, setSchema] = useState<TableSchema | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<Filters>(null);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

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
    call<string[]>("list_plugins")
      .then((list) => {
        setPlugins(list);
        if (list.length) setPlugin((p) => p || list[0]);
      })
      .catch(handleErr);
  }, [handleErr]);

  // Plugin changed -> load its tables, reset the table selection.
  useEffect(() => {
    if (!plugin) return;
    setTable("");
    setSchema(null);
    setRows([]);
    call<string[]>("list_tables", { plugin })
      .then((list) => {
        setTables(list);
        setTable(list[0] ?? "");
      })
      .catch(handleErr);
  }, [plugin, handleErr]);

  // Table changed -> load its schema, reset paging/filters.
  useEffect(() => {
    if (!table) return;
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
      .then(setRows)
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
          <Select value={plugin} onChange={(e) => setPlugin(e.target.value)} style={{ width: 180 }}>
            {plugins.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="data-toolbar__group">
          <label className="data-toolbar__label">Table</label>
          <Select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            style={{ width: 220 }}
            disabled={!tables.length}
          >
            {tables.length === 0 && <option value="">— no tables —</option>}
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        {schema && <TableFlags schema={schema} />}
      </div>

      {!table ? (
        <div className="card">
          <EmptyState
            title="No tables"
            message="This plugin doesn’t own any tables yet. Pick another plugin, or define one in the Schema Builder."
          />
        </div>
      ) : (
        <div className="card">
          {schema && <FilterBar schema={schema} onApply={(f) => { setOffset(0); setFilters(f); }} />}

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
                  {rows.map((r, i) => (
                    <tr key={String(r.id ?? i)} className="row-clickable" onClick={() => setEditing({ id: String(r.id) })}>
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
                  ))}
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
