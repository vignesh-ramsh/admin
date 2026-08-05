/**
 * Built-in theme presets — the whole theme system, top to bottom, is
 * "pick one of these objects." No separate light/dark mode: `appearance`
 * is just a hidden tag on each preset (drives the browser's native
 * `color-scheme`, i.e. scrollbars/checkboxes/date pickers, and picks
 * which lightness curve lib/color.ts's derivation helpers use) — never a
 * second axis a user chooses independently of the preset itself.
 *
 * Each preset supplies a small, fixed checklist of literal colors —
 * nothing computed, nothing optional. Everything else the interface
 * needs (the 11-step accent/neutral ramps, a readable foreground for the
 * accent's action fill, translucent success/warning/danger/info
 * backgrounds) is derived from these few values by lib/color.ts.
 *
 * To add a theme: add one more object to BUILTIN_PRESETS with a `name`
 * not already used by another preset. That's the entire extension
 * mechanism — no other file needs to change.
 */

export interface ThemePreset {
  /** Unique — also what's persisted (localStorage + `_users.theme`) and
   *  shown in the picker, so keep it short and human-readable. */
  name: string;
  appearance: "light" | "dark";
  canvas: string; // page background
  surface: string; // card/panel background
  border: string; // subtle border — hex or any valid CSS color (e.g. rgba() over a dark canvas)
  borderStrong: string;
  text: string; // primary text
  textMuted: string; // secondary text
  textFaint: string; // tertiary text
  accent: string; // one hex — the whole accent ramp + action fill are derived from this
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export const BUILTIN_PRESETS: ThemePreset[] = [
  {
    name: "Daylight",
    appearance: "light",
    canvas: "#F6F7F6",
    surface: "#FFFFFF",
    border: "#E1E3E4",
    borderStrong: "#CBCED1",
    text: "#16191D",
    textMuted: "#3E434B",
    textFaint: "#717680",
    accent: "#3F7343",
    success: "#079455",
    warning: "#DC6803",
    danger: "#D92D20",
    info: "#1570EF",
  },
  {
    name: "Paper",
    appearance: "light",
    canvas: "#FAF9F6",
    surface: "#FFFFFF",
    border: "#E6E2DA",
    borderStrong: "#D3CDC0",
    text: "#1F2328",
    textMuted: "#57606A",
    textFaint: "#8B94A0",
    accent: "#4F46E5",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#2563EB",
  },
  {
    name: "Blue Night",
    appearance: "dark",
    canvas: "#060B2E",
    surface: "#0C1340",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.16)",
    text: "#EAEEF6",
    textMuted: "#B6C0D9",
    textFaint: "#7E8AAD",
    accent: "#3F8C50",
    success: "#079455",
    warning: "#DC6803",
    danger: "#D92D20",
    info: "#1570EF",
  },
  {
    name: "Obsidian",
    appearance: "dark",
    canvas: "#0B0D10",
    surface: "#16191D",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.16)",
    text: "#F2F4F5",
    textMuted: "#ADB5BD",
    textFaint: "#6C757D",
    accent: "#22D3EE",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#38BDF8",
  },
  {
  "name": "Yellow Sky",
  "appearance": "dark",
  "canvas": "#0B0D10",
  "surface": "#16191D",
  "border": "rgba(255,255,255,0.08)",
  "borderStrong": "rgba(255,255,255,0.16)",
  "text": "#ffffff",
  "textMuted": "#c7c7c7",
  "textFaint": "#b9babc",
  "accent": "#edb10c",
  "success": "#7bdb9e",
  "warning": "#d77a2d",
  "danger": "#e86969",
  "info": "#89bfd7"
}
];

/** New users, and anyone whose stored preset name doesn't match a known
 *  preset (a preset renamed/removed after last visit), land here. */
export const DEFAULT_PRESET_NAME = "Daylight";
