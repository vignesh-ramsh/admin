import { ACCENT_STEPS, type AccentStep } from "../lib/color";

/**
 * The "Default" accent option — an exact reproduction of admin-desk's own
 * light/dark palette (plugins/admin/admin/ui/src/styles/tokens/{brand,colors}.css),
 * not a computed ramp. Chosen when the user picks "Default" instead of a
 * hue, per instruction: same color codes, no change.
 *
 * Every value below traces to a real admin-desk token:
 *   - canvas/surface/border/text  -> --surface-page/--surface-card/
 *     --border-subtle/--border-default/--text-primary/--text-secondary/
 *     --text-tertiary (colors.css)
 *   - accent 600/700/800          -> --brand-primary/-shade (light),
 *     --action-brand/-hover (dark, colors.css's [data-theme="dark"] block)
 *   - accent 300 (dark)           -> --brand-accent (brand.css) — the exact
 *     mint admin-desk uses for text/border-brand on dark surfaces
 *   - accent 50-200/900 (light)   -> --agni-green-50..900 (colors.css) —
 *     admin-desk already ships almost a full 11-step green ladder for light
 *   - semantic (success/warning/danger/info) -> --hue-* / --status-*-soft
 *
 * The handful of steps admin-desk never defined itself (accent-950 in both
 * modes; accent-50/100/200/400/500 in dark, where admin-desk only ever
 * uses two or three fixed green tones, never a full numbered scale) are
 * filled by hue-preserving interpolation between the real neighbors above
 * and below — same hue and roughly the right lightness, just not a value
 * admin-desk's own CSS ever literally wrote down. Marked below.
 */

export const DEFAULT_ACCENT_LIGHT: Record<AccentStep, string> = {
  50: "#EEF4EC", // --agni-green-50 / --brand-primary-wash
  100: "#D9E7D6", // --agni-green-100
  200: "#BCD4B7", // --agni-green-200
  300: "#97BC90", // --agni-green-300
  400: "#76A06E", // --agni-green-400
  500: "#5C8A58", // --agni-green-500 / --brand-primary-tint
  600: "#3F7343", // --agni-green-600 / --brand-primary (primary button/link)
  700: "#335C36", // --agni-green-700 / --brand-primary-shade (hover)
  800: "#294829", // --agni-green-800 (press)
  900: "#1E351F", // --agni-green-900
  950: "#001202", // interpolated — admin-desk has no green-950
};

export const DEFAULT_ACCENT_DARK: Record<AccentStep, string> = {
  50: "#CEF7DE", // interpolated
  100: "#B7EDCD", // interpolated
  200: "#99E1B7", // interpolated
  300: "#7ED4A4", // --brand-accent / --agni-green-600 dark (text/border-brand)
  400: "#64B782", // interpolated
  500: "#50A067", // interpolated
  600: "#3F8C50", // --action-brand dark (primary button)
  700: "#4C9C5D", // --action-brand-hover dark — lighter than 600, faithful to source (dark buttons brighten on hover)
  800: "#357A45", // --action-brand-press dark
  900: "#1E351F", // admin-desk doesn't override this in dark scope — reused as-is
  950: "#001202", // interpolated
};

// admin-desk's real, separate neutral/slate scale (agni-neutral-*) — NOT
// the same hue as the green accent scale. Only used in "Default" mode;
// "Custom" mode deliberately collapses neutral into the accent's own hue
// instead (see ThemeContext) for the monochromatic look already tested.
export const DEFAULT_NEUTRAL_LIGHT: Record<AccentStep, string> = {
  50: "#F5F6F5",
  100: "#ECEEEC",
  200: "#E1E3E4",
  300: "#CBCED1",
  400: "#9CA1A8",
  500: "#717680",
  600: "#565B64",
  700: "#3E434B",
  800: "#292D33",
  900: "#16191D", // --brand-ink / --agni-neutral-900
  950: "#0A0B0D", // interpolated — darker than admin-desk's own darkest neutral
};

interface ModeTokens {
  canvas: string;
  surface: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
}

export const DEFAULT_TOKENS_LIGHT: ModeTokens = {
  canvas: "#F6F7F6", // --surface-page
  surface: "#FFFFFF", // --surface-card
  border: "#E1E3E4", // --border-subtle
  borderStrong: "#CBCED1", // --border-default
  text: "#16191D", // --text-primary
  textMuted: "#3E434B", // --text-secondary
  textFaint: "#717680", // --text-tertiary
  success: "#079455", // --hue-success
  successBg: "#ECFDF3", // --hue-success-soft
  warning: "#DC6803",
  warningBg: "#FFFAEB",
  danger: "#D92D20", // admin-desk's "error"
  dangerBg: "#FEF3F2",
  info: "#1570EF",
  infoBg: "#EFF8FF",
};

export const DEFAULT_TOKENS_DARK: ModeTokens = {
  canvas: "#060B2E", // --brand-navy
  surface: "#0C1340", // --brand-navy-raised / --surface-card dark
  border: "rgba(255,255,255,0.08)", // --border-subtle dark
  borderStrong: "rgba(255,255,255,0.16)", // --border-default dark
  text: "#EAEEF6", // --text-primary dark
  textMuted: "#B6C0D9", // --text-secondary dark
  textFaint: "#7E8AAD", // --text-tertiary dark
  // admin-desk's dark theme only re-tints the *-soft backgrounds; the
  // status hue itself is intentionally left unchanged from light mode.
  success: "#079455",
  successBg: "rgba(7,148,85,0.16)",
  warning: "#DC6803",
  warningBg: "rgba(220,104,3,0.16)",
  danger: "#D92D20",
  dangerBg: "rgba(217,45,32,0.16)",
  info: "#1570EF",
  infoBg: "rgba(21,112,239,0.16)",
};

export function defaultAccentScale(mode: "light" | "dark"): Record<AccentStep, string> {
  return mode === "dark" ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT_LIGHT;
}

// Dark mode has no faithful separate neutral ladder in admin-desk (only
// translucent-white borders/hovers, already captured in DEFAULT_TOKENS_DARK's
// border/borderStrong) — callers needing a full dark neutral-* ramp should
// use generateDarkNeutralScale(DEFAULT_TOKENS_DARK.canvas) instead, the same
// derivation this app already uses for any other chosen dark canvas. Only
// light mode gets a hardcoded ramp here because admin-desk actually defines
// one (agni-neutral-*).
export function defaultModeTokens(mode: "light" | "dark"): ModeTokens {
  return mode === "dark" ? DEFAULT_TOKENS_DARK : DEFAULT_TOKENS_LIGHT;
}

export const ACCENT_STEP_LIST = ACCENT_STEPS;
