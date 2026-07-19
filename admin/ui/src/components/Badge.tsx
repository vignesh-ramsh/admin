import type { ReactNode } from "react";
import { Badge as AgniBadge } from "./agni/core/Badge";

/**
 * Thin adapter over the copied AgniUI Badge (agni/core/Badge.tsx) — maps
 * this app's existing tone vocabulary onto AgniUI's tone set so no call
 * site needed touching.
 */
type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONE_MAP: Record<Tone, "neutral" | "warning" | "error" | "brand" | "done"> = {
  neutral: "neutral",
  success: "done",
  warning: "warning",
  danger: "error",
  accent: "brand",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <AgniBadge tone={TONE_MAP[tone]} dot={dot}>
      {children}
    </AgniBadge>
  );
}
