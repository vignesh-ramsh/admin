// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React from "react";

/* ── Types (mirrored in Skeleton.d.ts) ── */
export interface SkeletonProps {
  variant?: "line" | "block" | "circle";
  width?: number | string;
  height?: number | string;
  /** For variant="line": number of stacked lines. */
  lines?: number;
  radius?: string;
  style?: React.CSSProperties;
}
/** Shimmer loading placeholder. */


/**
 * AgniUI · Skeleton
 * Shimmer placeholder for loading states. variant: line · block · circle.
 * `lines` renders a stack of text lines (last one shorter).
 */
export function Skeleton({ variant = "line", width, height, lines = 1, radius, style = {} }: SkeletonProps) {
  const base = {
    background: "linear-gradient(90deg, var(--surface-sunken) 25%, var(--surface-soft) 50%, var(--surface-sunken) 75%)",
    backgroundSize: "200% 100%", animation: "agni-shimmer 1.4s ease-in-out infinite",
  };
  const shimmer = <style>{`@keyframes agni-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>;

  if (variant === "circle") {
    const d = width || height || 36;
    return <span style={{ display: "inline-block", width: d, height: d, borderRadius: "50%", ...base, ...style }}>{shimmer}</span>;
  }
  if (variant === "block") {
    return <div style={{ width: width || "100%", height: height || 80, borderRadius: radius || "var(--radius-md)", ...base, ...style }}>{shimmer}</div>;
  }
  // lines
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: width || "100%", ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: height || 12, width: i === lines - 1 && lines > 1 ? "60%" : "100%", borderRadius: radius || "var(--radius-xs)", ...base }} />
      ))}
      {shimmer}
    </div>
  );
}
