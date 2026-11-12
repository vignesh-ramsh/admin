/** A row count for display: "10,000+" when the server stopped counting at its cap (`total_capped`), the plain
 *  number otherwise. A broad free-text search over a big table is only counted up to a cap, because the exact
 *  count scans the whole table on every page. */
export function formatCount(count: number, capped = false): string {
  return capped ? `${count.toLocaleString("en-US")}+` : String(count);
}
