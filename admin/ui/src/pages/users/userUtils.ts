import type { User } from "../../api/types";
export { formatWhen } from "../shared/datetime";

/* A brute-force lockout (locked_until in the future) is a SEPARATE
   mechanism from status (authn's own CLI documents this: setting status
   Active is what clears a lockout). A user can be status=Active yet still
   locked out, so the UI must show both rather than treating status alone
   as the truth. */

export function isLocked(user: User): boolean {
  if (!user.locked_until) return false;
  const until = new Date(user.locked_until).getTime();
  return Number.isFinite(until) && until > Date.now();
}

export function statusTone(user: User): "success" | "neutral" | "danger" | "warning" {
  if (isLocked(user)) return "danger";
  if (user.status === "Active") return "success";
  if (user.status === "Locked") return "danger";
  return "neutral";
}

