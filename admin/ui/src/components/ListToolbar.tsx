import { useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ListFilter, Pencil, Trash2, X } from "lucide-react";
import clsx from "clsx";
import type { TableSchema } from "../api/types";
import { Button, IconButton } from "./Button";
import { FilterBar, type FilterBarHandle } from "../pages/data/FilterBar";
import { SearchBar } from "../pages/data/SearchBar";

/** The merged search/filter/sort/pagination-count strip every cursor-
 *  paginated list now shares. Two states:
 *   - rows selected (checkboxes): direct Edit/Delete buttons act on those
 *     ids — the ONLY way bulk actions surface. A filter/search being
 *     active on its own never shows these; the row-selection checkboxes
 *     are the one and only trigger.
 *   - no selection: search + filters + sort only, no bulk actions. */
export function ListToolbar({
  schema,
  search,
  onSearchChange,
  onFiltersChange,
  hasActiveFilters,
  sortColumnNames,
  sortField,
  sortDesc,
  onSortChange,
  total,
  loadedCount,
  selectedCount,
  onClearSelection,
  onBulkEdit,
  onBulkDelete,
}: {
  schema: TableSchema;
  search: string[];
  onSearchChange: (terms: string[]) => void;
  onFiltersChange: (filters: Record<string, unknown> | null) => void;
  /** Structured filters ONLY — search terms never flip this on (they're a
   *  separate concern with their own, separate clear control). */
  hasActiveFilters: boolean;
  sortColumnNames: string[];
  sortField: string;
  sortDesc: boolean;
  onSortChange: (field: string, desc: boolean) => void;
  total: number | null;
  loadedCount: number;
  selectedCount: number;
  onClearSelection: () => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
}) {
  const countLabel = total !== null ? `${loadedCount} of ${total}` : `${loadedCount} rows`;

  if (selectedCount > 0) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent-500 bg-accent-50 px-2.5 py-2 dark:bg-accent-950/30">
        <IconButton label="Clear selection" icon={<X size={15} />} onClick={onClearSelection} />
        <span className="text-[13px] font-medium text-text">{selectedCount} selected</span>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={onBulkEdit}>
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Trash2 size={13} />}
            className="text-danger hover:border-danger/40 hover:bg-danger-bg/40"
            onClick={onBulkDelete}
          >
            Delete
          </Button>
        </div>
        <div className="flex-1" />
        <span className="text-[13px] text-text-faint">{countLabel}</span>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
      <SearchBar terms={search} onChange={onSearchChange} className="w-full sm:w-auto sm:max-w-xs" />

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <FiltersControl schema={schema} active={hasActiveFilters} onFiltersChange={onFiltersChange} />
        <SortControl columns={sortColumnNames} field={sortField} desc={sortDesc} onChange={onSortChange} />
        <span className="whitespace-nowrap text-[13px] text-text-faint">{countLabel}</span>
      </div>
    </div>
  );
}

function FiltersControl({
  schema,
  active,
  onFiltersChange,
}: {
  schema: TableSchema;
  active: boolean;
  onFiltersChange: (filters: Record<string, unknown> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<FilterBarHandle>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
          active
            ? "border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
            : "border-border-strong text-text-muted hover:bg-neutral-100 dark:hover:bg-neutral-800",
        )}
      >
        <ListFilter size={14} /> Filters
        {active && (
          <span
            role="button"
            aria-label="Clear filters"
            onClick={(e) => {
              e.stopPropagation();
              filterBarRef.current?.clearAll();
            }}
            className="-mr-1 cursor-pointer rounded-full p-0.5 hover:bg-accent-100 dark:hover:bg-accent-900"
          >
            <X size={12} />
          </span>
        )}
      </button>
      <div className={clsx("absolute right-0 z-30 mt-1 w-[min(560px,calc(100vw-2rem))]", !open && "hidden")}>
        <FilterBar ref={filterBarRef} schema={schema} open={open} onChange={onFiltersChange} />
      </div>
    </div>
  );
}

/** Frappe-style sort control — a single pill split into two independently
 *  clickable segments: the field name (opens a dropdown to pick a column)
 *  and a direction arrow (toggles ascending/descending directly, no
 *  dropdown needed). Always shows SOME sort (the app defaults to id desc,
 *  DataTableView never lets sortField go empty), so there's no "cleared"
 *  state to design for here. */
function SortControl({
  columns,
  field,
  desc,
  onChange,
}: {
  columns: string[];
  field: string;
  desc: boolean;
  onChange: (field: string, desc: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-border-strong text-[13px] font-medium text-text-muted">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={field}
          className="min-w-[3ch] max-w-[15ch] cursor-pointer truncate px-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {field}
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          aria-label={desc ? "Sort descending — click for ascending" : "Sort ascending — click for descending"}
          onClick={() => {
            onChange(field, !desc);
            setOpen(false);
          }}
          className="cursor-pointer px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {desc ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />}
        </button>
      </div>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/20">
          {columns.map((name) => {
            const active = name === field;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name, active ? desc : false);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px]",
                  active
                    ? "bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
                    : "text-text hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
              >
                {name}
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
