// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState } from "react";
import { TipBubble, useTip } from "../feedback/Tooltip.tsx";

/* ── Types (mirrored in IconButton.d.ts) ── */
export interface IconButtonProps {
  icon: React.ReactNode;
  /** @default "ghost" */
  variant?: "solid" | "outline" | "ghost";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Circular instead of rounded-square. */
  round?: boolean;
  /** Toggled/selected state (brand-soft fill). */
  active?: boolean;
  disabled?: boolean;
  /** Label shown in a DS tooltip on hover/focus (also the accessible name). */
  title?: string;
  /** Tooltip side. @default "bottom" */
  tooltipSide?: "top" | "bottom" | "left" | "right";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}
/** Icon-only control — toolbars, headers, table row actions. */


/**
 * AgniUI · IconButton
 * Square/round icon-only control. Variants: solid · outline · ghost.
 * Interactive hover/press/focus, optional active (toggled) state.
 */
export function IconButton({
  icon,
  variant = "ghost",      // solid | outline | ghost
  size = "md",            // sm | md | lg
  round = false,
  active = false,
  disabled = false,
  title,
  tooltipSide = "bottom",
  onClick,
  style = {},
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const tip = useTip(300);
  const hasTip = !!title && !disabled;

  const sizes = { sm: { d: 32, fs: 16 }, md: { d: 36, fs: 18 }, lg: { d: 42, fs: 20 } };
  const s = sizes[size] || sizes.md;

  const palettes = {
    solid:   { bg: "var(--action-brand)", bgHover: "var(--action-brand-hover)", fg: "var(--text-on-brand)", bdr: "transparent" },
    outline: { bg: "var(--surface-card)", bgHover: "var(--surface-soft)", fg: "var(--text-secondary)", bdr: "var(--border-default)" },
    ghost:   { bg: "transparent", bgHover: "var(--state-hover-overlay)", fg: "var(--text-secondary)", bdr: "transparent" },
  };
  const p = palettes[variant] || palettes.ghost;

  const bg = active ? "var(--surface-brand-soft)" : press ? "var(--state-press-overlay)" : hover ? p.bgHover : p.bg;
  const fg = active ? "var(--text-brand)" : p.fg;
  const bdr = active ? "var(--border-brand)" : p.bdr;

  return (
    <button
      type="button" aria-label={title} disabled={disabled} onClick={(e) => { tip.bind.onClick(); onClick && onClick(e); }}
      onMouseEnter={() => { setHover(true); if (hasTip) tip.bind.onMouseEnter(); }}
      onMouseLeave={() => { setHover(false); setPress(false); if (hasTip) tip.bind.onMouseLeave(); }}
      onMouseDown={() => { setPress(true); if (hasTip) tip.bind.onMouseDown(); }}
      onMouseUp={() => setPress(false)}
      onFocus={() => { if (hasTip) tip.bind.onFocus(); }}
      onBlur={() => { if (hasTip) tip.bind.onBlur(); }}
      style={{
        position: "relative",
        width: s.d, height: s.d, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: s.fs, color: fg, background: bg,
        border: `1px solid ${bdr}`,
        borderRadius: round ? "50%" : "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1,
        transform: press && !disabled ? "scale(0.92)" : "scale(1)",
        transition: "background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast), border-color var(--dur-fast)",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {hasTip && tip.open && <TipBubble label={title} side={tooltipSide} />}
    </button>
  );
}
