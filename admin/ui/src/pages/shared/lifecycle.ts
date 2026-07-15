/* Shared status logic for _sessions/_access_keys rows — both have the same
   revoked_at/expires_at shape and the same three-state meaning:
     revoked_at set        -> Revoked (explicit)
     expires_at is past    -> Expired (never revoked, just timed out)
     neither                -> Active
   Matches prune_sessions/prune_access_keys' own "revoked OR expired"
   eligibility rule, so the badge shown here is the same test the backend
   prune actually applies. */

export type LifecycleState = "active" | "revoked" | "expired";

interface HasLifecycle {
  revoked_at: string | null;
  expires_at: string | null;
}

export function lifecycleOf(row: HasLifecycle): LifecycleState {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

export function lifecycleTone(state: LifecycleState): "success" | "neutral" | "warning" {
  if (state === "active") return "success";
  if (state === "expired") return "warning";
  return "neutral";
}

export function lifecycleLabel(state: LifecycleState): string {
  return state === "active" ? "Active" : state === "expired" ? "Expired" : "Revoked";
}

export function isPruneEligible(row: HasLifecycle, cutoffDays: number): boolean {
  const cutoff = Date.now() - cutoffDays * 86400_000;
  const revokedOld = row.revoked_at != null && new Date(row.revoked_at).getTime() < cutoff;
  const expiredOld = row.expires_at != null && new Date(row.expires_at).getTime() < cutoff;
  return revokedOld || expiredOld;
}
