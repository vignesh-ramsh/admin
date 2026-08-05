import type { ReactNode } from "react";
import clsx from "clsx";
import { Loader2, Inbox } from "lucide-react";
import { Checkbox } from "./Field";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
}

/** Row multi-select — adds a checkbox column. `selectedIds` holds the
 *  rowKey() of every currently-checked row; `onToggleAll` only ever
 *  affects the rows actually passed in `rows` (whatever's loaded so far
 *  in an infinite-scroll list), never a blanket "every row matching the
 *  current filter" — a bulk action always targets an explicit, visible
 *  set of ids. */
export interface SelectionProps {
  selectedIds: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
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
  selection,
  footer,
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
  selection?: SelectionProps;
  /** Rendered inside the table's own scrolling container, right after the
   *  last row — an infinite-scroll sentinel needs to live INSIDE this
   *  overflow-auto div (not as a sibling after it) so it actually scrolls
   *  into view along with the rows. */
  footer?: ReactNode;
}) {
  const allChecked = selection ? rows.length > 0 && rows.every((r) => selection.selectedIds.has(rowKey(r))) : false;
  const someChecked = selection ? rows.some((r) => selection.selectedIds.has(rowKey(r))) : false;
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
            {selection && (
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all loaded rows"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked;
                  }}
                  onChange={() => selection.onToggleAll()}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 cursor-pointer rounded border-border-strong text-accent-600 focus:ring-2 focus:ring-accent-500/25 accent-[var(--accent-600)]"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={clsx(
                  "whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-text-faint",
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
              <td colSpan={columns.length + (selection ? 1 : 0)} className="px-3.5 py-14 text-center text-text-faint">
                <Loader2 size={18} className="mx-auto animate-spin" />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selection ? 1 : 0)} className="px-3.5 py-14 text-center text-text-faint">
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
                {selection && (
                  <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      label=""
                      aria-label="Select row"
                      checked={selection.selectedIds.has(key)}
                      onChange={() => selection.onToggle(key)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "whitespace-nowrap px-3 py-1.5 text-text",
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
      {footer}
    </div>
  );
}
