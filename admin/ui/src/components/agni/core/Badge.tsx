// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Badge.d.ts) ── */
export interface BadgeProps {
  children?: React.ReactNode;
  /** Status tone — themed token pair. @default "neutral" */
  tone?: "done" | "doing" | "todo" | "error" | "warning" | "pending" | "blocked" | "brand" | "neutral";
  /** Leading status dot. */
  dot?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
/** Compact status / category pill. */


/**
 * AgniUI · Badge
 * Compact status/label pill. Tone reads themed CSS vars so it flips in dark.
 * Tones: done · doing · todo · error · warning · brand · neutral.
 */
export function Badge({
  children,
  tone = "neutral",   // done | doing | todo | error | warning | brand | neutral
  dot = false,
  size = "md",        // sm | md
  style = {},
  ...rest
}: BadgeProps) {
  const map = {
    done:    { fg: "var(--tone-done-fg)",    bg: "var(--tone-done-bg)" },
    doing:   { fg: "var(--tone-doing-fg)",   bg: "var(--tone-doing-bg)" },
    todo:    { fg: "var(--tone-todo-fg)",    bg: "var(--tone-todo-bg)" },
    error:   { fg: "var(--tone-error-fg)",   bg: "var(--tone-error-bg)" },
    warning: { fg: "var(--tone-warning-fg)", bg: "var(--tone-warning-bg)" },
    pending: { fg: "var(--tone-pending-fg)", bg: "var(--tone-pending-bg)" },
    blocked: { fg: "var(--tone-blocked-fg)", bg: "var(--tone-blocked-bg)" },
    brand:   { fg: "var(--tone-brand-fg)",   bg: "var(--tone-brand-bg)" },
    neutral: { fg: "var(--tone-todo-fg)",    bg: "var(--tone-todo-bg)" },
  };
  const c = map[tone] || map.neutral;
  const dims = size === "sm"
    ? { fs: "var(--text-2xs)", px: 6, py: 2, gap: 4, dot: 5 }
    : { fs: "var(--text-xs)",  px: 8, py: 3, gap: 5, dot: 6 };

  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: dims.gap,
        padding: `${dims.py}px ${dims.px}px`,
        fontFamily: "var(--font-sans)", fontSize: dims.fs, fontWeight: "var(--fw-semibold)",
        lineHeight: 1, letterSpacing: "0.01em", whiteSpace: "nowrap",
        color: c.fg, background: c.bg, borderRadius: "var(--radius-full)",
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: dims.dot, height: dims.dot, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />}
      {children}
    </span>
  );
}
