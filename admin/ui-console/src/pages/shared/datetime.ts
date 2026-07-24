/** Single consistent date/time formatter for the Users/Roles/Sessions/Access
 *  Keys pages — the old app's documented bug (docs/admin-ui-ux-review.md
 *  §1.1/§6.2) was three different, disagreeing date formats across pages. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Heuristic flag for obviously test/scratch accounts (docs/admin-ui-ux-review.md
 *  §4.3) — a data-hygiene gap the old app documented but never fixed. */
export function isTestAccount(email: string | null | undefined, username: string | null | undefined): boolean {
  const needle = /test|scratch/i;
  return needle.test(email ?? "") || needle.test(username ?? "");
}
