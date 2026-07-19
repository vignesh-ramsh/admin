// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState, useRef, useCallback, useEffect } from "react";

/* ── Types (mirrored in Tooltip.d.ts) ── */
export interface TooltipProps {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Hover/focus open delay in ms. @default 300 */
  delay?: number;
  style?: React.CSSProperties;
}
/** Hover/focus tooltip around a single child. */

/* Position of the bubble relative to its (position:relative) anchor. */
const BUBBLE_POS = {
  top:    { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  left:   { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  right:  { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
};

/* Little diamond caret; the two bordered sides face away from the anchor. */
function caretStyle(side) {
  const base = {
    position: "absolute", width: 8, height: 8, background: "var(--tooltip-bg)",
    borderRight: "1px solid var(--tooltip-bdr)", borderBottom: "1px solid var(--tooltip-bdr)",
  };
  return {
    top:    { ...base, bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)" },
    bottom: { ...base, top: -4, left: "50%", transform: "translateX(-50%) rotate(-135deg)" },
    left:   { ...base, right: -4, top: "50%", transform: "translateY(-50%) rotate(-45deg)" },
    right:  { ...base, left: -4, top: "50%", transform: "translateY(-50%) rotate(135deg)" },
  }[side];
}

/**
 * AgniUI · TipBubble
 * The bare styled tooltip bubble + caret. Render inside a `position:relative`
 * anchor (button/span). Shared by <Tooltip> and any icon control that shows a
 * tooltip (IconButton, table row actions, …) so every tooltip looks identical.
 */
export function TipBubble({ label, side = "top", style = {} }) {
  return (
    <span
      role="tooltip"
      style={{
        position: "absolute", zIndex: 120, ...BUBBLE_POS[side], whiteSpace: "nowrap",
        padding: "5px 9px", borderRadius: "var(--tooltip-radius)",
        background: "var(--tooltip-bg)", color: "var(--tooltip-fg)",
        border: "1px solid var(--tooltip-bdr)",
        fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)", fontWeight: "var(--fw-medium)",
        lineHeight: 1.35, boxShadow: "var(--tooltip-shadow)", pointerEvents: "none",
        animation: "agni-tip-in var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
    >
      {label}
      <span aria-hidden="true" style={caretStyle(side)} />
      <style>{`@keyframes agni-tip-in{from{opacity:0;transform:${BUBBLE_POS[side].transform} scale(0.94)}}`}</style>
    </span>
  );
}

/**
 * useTip(delay) — open/close state + handlers for an anchored tooltip.
 * Spread `bind` onto the anchor element; render <TipBubble> when `open`.
 * Used by primitives (IconButton, …) that don't want an extra wrapper node.
 */
export function useTip(delay = 300) {
  const [open, setOpen] = useState(false);
  const t = useRef(null);
  const clear = () => { if (t.current) { clearTimeout(t.current); t.current = null; } };
  const show = useCallback(() => { clear(); t.current = setTimeout(() => setOpen(true), delay); }, [delay]);
  const hide = useCallback(() => { clear(); setOpen(false); }, []);
  useEffect(() => clear, []);
  return {
    open,
    bind: {
      onMouseEnter: show, onMouseLeave: hide,
      onFocus: show, onBlur: hide,
      onMouseDown: hide, onClick: hide,
    },
  };
}

/**
 * AgniUI · Tooltip
 * Hover/focus tooltip. Wraps a single child; `label` is the content. Themed via
 * --tooltip-* tokens (flips for dark). Adds a caret and an open delay.
 */
export function Tooltip({ label, children, side = "top", delay = 300, style = {} }: TooltipProps) {
  const { open, bind } = useTip(delay);
  return (
    <span style={{ position: "relative", display: "inline-flex" }} {...bind}>
      {children}
      {open && label != null && label !== "" && <TipBubble label={label} side={side} style={style} />}
    </span>
  );
}
