import type { ReactNode } from "react";
import clsx from "clsx";
import { Loader2, Inbox } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyLabel = "No records found.",
  emptyIcon,
  onRowClick,
  selectedKey,
  fillHeight = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyLabel?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** Grow to fill the parent's height and center the empty/loading state
   *  vertically (the parent must be a flex column with a bounded height). */
  fillHeight?: boolean;
}) {
  // When there's nothing to show and we're asked to fill height, render a
  // big centered empty/loading state instead of a near-empty table — the
  // "no data" message lands in the middle of the container, not pinned to
  // the top under the header row.
  if (fillHeight && rows.length === 0) {
    return (
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center text-text-faint">
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              {emptyIcon ?? <Inbox size={26} className="opacity-50" />}
              <span className="text-sm">{emptyLabel}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "scrollbar-thin overflow-auto rounded-lg border border-border bg-surface",
        fillHeight ? "min-h-0 flex-1" : "overflow-x-auto",
      )}
    >
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/60">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={clsx(
                  "whitespace-nowrap px-3.5 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3.5 py-14 text-center text-text-faint">
                <Loader2 size={18} className="mx-auto animate-spin" />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3.5 py-14 text-center text-text-faint">
                <Inbox size={22} className="mx-auto mb-2 opacity-50" />
                {emptyLabel}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  "border-b border-border last:border-0",
                  onRowClick && "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50",
                  selectedKey === key && "bg-accent-50 dark:bg-accent-950/40",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "whitespace-nowrap px-3.5 py-2.5 text-text",
                      col.mono && "font-mono text-[13px]",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number | null;
  onChange: (offset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pageCount = total !== null ? Math.max(1, Math.ceil(total / limit)) : null;
  const canPrev = offset > 0;
  const canNext = total === null ? true : offset + limit < total;

  return (
    <div className="flex items-center justify-between px-1 pt-3 text-[13px] text-text-muted">
      <span>
        {total !== null ? (
          <>
            {Math.min(offset + 1, total)}–{Math.min(offset + limit, total)} of {total}
          </>
        ) : (
          <>Page {page}</>
        )}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="cursor-pointer rounded-md border border-border-strong px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="tabular-nums">{pageCount ? `${page} / ${pageCount}` : page}</span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
          className="cursor-pointer rounded-md border border-border-strong px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
