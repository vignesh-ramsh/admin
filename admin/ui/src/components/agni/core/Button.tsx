// @ts-nocheck -- vendored from AgniUI (/home/vignesh/design_system/AgniUI/), kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useState } from "react";
import { TipBubble, useTip } from "../feedback/Tooltip.tsx";

/* ── Types (mirrored in Button.d.ts) ── */
export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual intent. @default "primary" */
  category?: "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "brand-soft";
  /** Control height / density. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Leading icon node, e.g. <i className="ph ph-plus" /> */
  icon?: React.ReactNode;
  /** Trailing icon node */
  iconTrailing?: React.ReactNode;
  /** Stretch to fill container width. */
  block?: boolean;
  disabled?: boolean;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  /** Label shown in a DS tooltip on hover/focus (useful for icon-only buttons). */
  title?: string;
  /** Tooltip side. @default "top" */
  tooltipSide?: "top" | "bottom" | "left" | "right";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

/**
 * Primary action control for AgniUI desks.
 * @startingPoint section="Core" subtitle="Buttons in every category & size" viewport="700x180"
 */


/**
 * AgniUI · Button
 * Primary action control. Category drives intent; size drives density.
 * Fully interactive: hover, active(press-scale), focus-visible, disabled, loading.
 */
export function Button({
  children,
  category = "primary",          // primary | secondary | tertiary | ghost | danger | brand-soft
  size = "md",                   // sm | md | lg
  icon = null,                   // leading ReactNode (e.g. <i className="ph ph-plus" />)
  iconTrailing = null,
  block = false,
  disabled = false,
  loading = false,
  type = "button",
  title,
  tooltipSide = "top",
  onClick,
  style = {},
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const tip = useTip(300);
  const hasTip = !!title && !disabled && !loading;

  const sizes = {
    sm: { h: 32, px: 12, fs: "var(--text-sm)",  gap: 6,  icon: 15 },
    md: { h: 38, px: 16, fs: "var(--text-base)", gap: 8,  icon: 17 },
    lg: { h: 44, px: 20, fs: "var(--text-md)",  gap: 10, icon: 19 },
  };
  const s = sizes[size] || sizes.md;

  const palettes = {
    primary: {
      bg: "var(--action-brand)",
      bgHover: "var(--action-brand-hover)",
      bgPress: "var(--action-brand-press)",
      fg: "var(--text-on-brand)", bdr: "transparent", shadow: "var(--shadow-xs)",
    },
    secondary: {
      bg: "var(--surface-card)",
      bgHover: "var(--surface-soft)",
      bgPress: "var(--surface-sunken)",
      fg: "var(--text-secondary)", bdr: "var(--border-default)", shadow: "var(--shadow-xs)",
    },
    ghost: {
      bg: "transparent",
      bgHover: "var(--state-hover-overlay)",
      bgPress: "var(--state-press-overlay)",
      fg: "var(--text-secondary)", bdr: "transparent", shadow: "none",
    },
    tertiary: {
      bg: "transparent",
      bgHover: "var(--surface-brand-soft)",
      bgPress: "var(--agni-green-100)",
      fg: "var(--text-brand)", bdr: "transparent", shadow: "none",
    },
    danger: {
      bg: "var(--button-danger-bg, var(--status-error))",
      bgHover: "var(--button-danger-bg-hover, var(--status-error-hover))",
      bgPress: "var(--button-danger-bg-press, var(--status-error-press))",
      fg: "var(--text-on-brand)", bdr: "transparent", shadow: "var(--shadow-xs)",
    },
    "brand-soft": {
      bg: "var(--surface-brand-soft)",
      bgHover: "var(--agni-green-100)",
      bgPress: "var(--agni-green-200)",
      fg: "var(--text-brand)", bdr: "transparent", shadow: "none",
    },
  };
  const p = palettes[category] || palettes.primary;
  const bg = disabled ? p.bg : press ? p.bgPress : hover ? p.bgHover : p.bg;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-label={!children && title ? title : undefined}
      onClick={(e) => { tip.bind.onClick(); onClick && onClick(e); }}
      onMouseEnter={() => { setHover(true); if (hasTip) tip.bind.onMouseEnter(); }}
      onMouseLeave={() => { setHover(false); setPress(false); if (hasTip) tip.bind.onMouseLeave(); }}
      onMouseDown={() => { setPress(true); if (hasTip) tip.bind.onMouseDown(); }}
      onMouseUp={() => setPress(false)}
      onFocus={() => { if (hasTip) tip.bind.onFocus(); }}
      onBlur={() => { if (hasTip) tip.bind.onBlur(); }}
      style={{
        position: "relative",
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        alignItems: "center", justifyContent: "center", gap: s.gap,
        height: s.h, padding: `0 ${s.px}px`,
        fontFamily: "var(--font-sans)", fontSize: s.fs, fontWeight: "var(--fw-semibold)",
        lineHeight: 1, letterSpacing: "0.005em", whiteSpace: "nowrap",
        color: p.fg, background: bg,
        border: `1px solid ${p.bdr}`, borderRadius: "var(--radius-md)",
        boxShadow: hover && !disabled ? "var(--shadow-sm)" : p.shadow,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--state-disabled-opacity)" : 1,
        transform: press && !disabled ? "scale(var(--press-scale))" : "scale(1)",
        transition: "background var(--dur-fast) var(--ease-standard), transform var(--dur-fast), box-shadow var(--dur-fast)",
        userSelect: "none",
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <span style={{
          width: s.icon, height: s.icon, borderRadius: "50%",
          border: `2px solid ${p.fg}`, borderTopColor: "transparent",
          display: "inline-block", animation: "agni-spin 0.6s linear infinite",
        }} />
      )}
      {!loading && icon && <span style={{ fontSize: s.icon, display: "inline-flex", flexShrink: 0 }}>{icon}</span>}
      {children && <span>{children}</span>}
      {!loading && iconTrailing && <span style={{ fontSize: s.icon, display: "inline-flex", flexShrink: 0 }}>{iconTrailing}</span>}
      {hasTip && tip.open && <TipBubble label={title} side={tooltipSide} />}
      <style>{`@keyframes agni-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
