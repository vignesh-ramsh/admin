/** The one date/time display format used across the whole app
 * (docs/admin-ui-ux-review.md #1.1 — three different formats used to be
 * live simultaneously: this sliced-ISO style, `toLocaleString()`'s
 * locale-dependent DD/MM/YYYY, and ad hoc inline `new Date(...)
 * .toLocaleString()` calls). Deterministic regardless of the viewer's
 * browser locale — a timestamp reads the same for every admin. */
export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 16).replace("T", " ");
}
