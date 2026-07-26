import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  generateAccentScale,
  generateDarkNeutralScale,
  generateNeutralScale,
  neutralToneAtLightness,
  accentAction,
  contrastFg,
  deriveTonalText,
  hexToOklch,
  isValidHex,
  ACCENT_STEPS,
  type AccentStep,
} from "../lib/color";
import { DEFAULT_ACCENT_LIGHT, DEFAULT_ACCENT_DARK, DEFAULT_NEUTRAL_LIGHT, DEFAULT_TOKENS_LIGHT, DEFAULT_TOKENS_DARK, defaultAccentScale, defaultModeTokens } from "./adminDeskDefault";
import { setMyTheme } from "../api/client";

export type Mode = "light" | "dark";
export type AccentMode = "default" | "custom";
export type ComputedKey = "border" | "borderStrong" | "text" | "textMuted" | "textFaint";

const MODE_KEY = "arc-console-theme";
const ACCENT_MODE_KEY = "arc-console-accent-mode";
const ACCENT_KEY = "arc-console-accent";
const BG_LIGHT_KEY = "arc-console-bg-light";
const BG_DARK_KEY = "arc-console-bg-dark";
const SURFACE_LIGHT_KEY = "arc-console-surface-light";
const SURFACE_DARK_KEY = "arc-console-surface-dark";
const OVERRIDES_LIGHT_KEY = "arc-console-overrides-light";
const OVERRIDES_DARK_KEY = "arc-console-overrides-dark";

export const DEFAULT_ACCENT = "#4f46e5"; // indigo — the starting point once a user leaves "Default" for a custom hue

/**
 * The eight offered accents, spread deliberately around the hue wheel and
 * kept clear of the fixed semantic hues (danger ~29°, warning ~55°,
 * success ~155°, info ~255°) — in a console where Delete is red and status
 * pills are green, a brand accent sitting on those same hues makes primary
 * and destructive actions read alike. Rose leans pink of danger and
 * Emerald sits cool of success for exactly that reason.
 *
 * Each entry is a single hue; the light and dark ramps, and the solid
 * action fill for each mode, are derived from it (see lib/color.ts).
 */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Sky", hex: "#0284c7" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Emerald", hex: "#059669" },
  { name: "Amber", hex: "#d97706" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Slate", hex: "#334155" },
];

// Continuous lightness (0-100) defaults for a freshly-picked custom accent,
// matching the fixed scale's own 50/100 (light) and 900/950 (dark) anchors.
const SUGGESTED_LIGHTNESS: Record<Mode, { bg: number; surface: number }> = {
  light: { bg: 98, surface: 95.5 },
  dark: { bg: 22, surface: 32 },
};

type Overrides = Partial<Record<ComputedKey, string>>;

interface ResolvedTheme {
  accentScale: Record<AccentStep, string>;
  neutralScale: Record<AccentStep, string>;
  canvas: string;
  surface: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  action: string; // the solid accent fill users click
  actionFg: string; // a foreground guaranteed readable on `action`
}

interface ThemeContextValue {
  mode: Mode;
  toggleMode: () => void;
  setMode: (mode: Mode, opts?: { persist?: boolean }) => void;

  accentMode: AccentMode;
  accent: string;
  setAccent: (hex: string) => void; // picking any real color implies leaving "Default"
  useDefaultAccent: () => void; // switch to "Default" (admin-desk, exact)
  switchToCustomFromDefault: () => void; // leave Default, seeded from its own current look — no visual jump

  bgLightness: number; // for the CURRENT mode
  surfaceLightness: number;
  setBgLightness: (percent: number) => void;
  setSurfaceLightness: (percent: number) => void;

  overrides: Overrides; // for the CURRENT mode
  setOverride: (key: ComputedKey, hex: string | null) => void; // null clears back to auto

  resolved: ResolvedTheme; // the final computed values, e.g. for swatch readouts
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readMode(): Mode {
  const stored = localStorage.getItem(MODE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function readAccentMode(): AccentMode {
  const stored = localStorage.getItem(ACCENT_MODE_KEY);
  return stored === "custom" ? "custom" : "default";
}

function readHex(key: string, fallback: string): string {
  const stored = localStorage.getItem(key);
  return stored && isValidHex(stored) ? stored : fallback;
}

function readNumber(key: string, fallback: number): number {
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  const n = Number(stored);
  return Number.isFinite(n) ? n : fallback;
}

function readOverrides(key: string): Overrides {
  const stored = localStorage.getItem(key);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Resolve every CSS custom property for one mode. Two entirely different
 *  paths: "default" replays admin-desk's own literal hex codes (see
 *  adminDeskDefault.ts) with no computation at all; "custom" derives
 *  everything from one accent hue + two continuous lightness picks (the
 *  slider-based model). User overrides (border/text/...) apply last, on
 *  top of either path, so they work the same way regardless of which base
 *  is active. */
function resolveTheme(
  mode: Mode,
  accentMode: AccentMode,
  accent: string,
  bgLightness: number,
  surfaceLightness: number,
  overrides: Overrides,
): ResolvedTheme {
  let base: Omit<ResolvedTheme, "accentScale" | "neutralScale"> & { accentScale: Record<AccentStep, string>; neutralScale: Record<AccentStep, string> };

  if (accentMode === "default") {
    const accentScale = defaultAccentScale(mode);
    const tokens = defaultModeTokens(mode);
    const neutralScale = mode === "dark" ? generateDarkNeutralScale(DEFAULT_TOKENS_DARK.canvas) : DEFAULT_NEUTRAL_LIGHT;
    base = {
      accentScale,
      neutralScale,
      canvas: tokens.canvas,
      surface: tokens.surface,
      border: tokens.border,
      borderStrong: tokens.borderStrong,
      text: tokens.text,
      textMuted: tokens.textMuted,
      textFaint: tokens.textFaint,
      // Default keeps admin-desk's own literal 600 as the action fill —
      // the whole point of this branch is "no change" — and only derives
      // the foreground, which was previously hardcoded white.
      action: accentScale[600],
      actionFg: contrastFg(accentScale[600]),
    };
  } else {
    const accentScale = generateAccentScale(accent, mode);
    const neutralScale = generateNeutralScale(accent, mode);
    const canvas = neutralToneAtLightness(accent, bgLightness);
    const surface = neutralToneAtLightness(accent, surfaceLightness);
    // Text/borders come off the *neutral* ramp, not the accent's own —
    // a page of body copy should be near-neutral even when the accent is
    // a saturated rose.
    const auto = deriveTonalText(neutralScale, canvas);
    const action = accentAction(accent, mode);
    base = {
      accentScale,
      neutralScale,
      canvas,
      surface,
      border: auto.border,
      borderStrong: auto.borderStrong,
      text: auto.text,
      textMuted: auto.textMuted,
      textFaint: auto.textFaint,
      action: action.bg,
      actionFg: action.fg,
    };
  }

  return {
    ...base,
    border: overrides.border ?? base.border,
    borderStrong: overrides.borderStrong ?? base.borderStrong,
    text: overrides.text ?? base.text,
    textMuted: overrides.textMuted ?? base.textMuted,
    textFaint: overrides.textFaint ?? base.textFaint,
  };
}

function applyTheme(mode: Mode, accentMode: AccentMode, resolved: ResolvedTheme) {
  const root = document.documentElement.style;
  for (const step of ACCENT_STEPS) {
    root.setProperty(`--accent-${step}`, resolved.accentScale[step]);
    root.setProperty(`--neutral-${step}`, resolved.neutralScale[step]);
  }
  root.setProperty("--canvas", resolved.canvas);
  root.setProperty("--surface", resolved.surface);
  root.setProperty("--surface-raised", resolved.surface);
  root.setProperty("--border", resolved.border);
  root.setProperty("--border-strong", resolved.borderStrong);
  root.setProperty("--text", resolved.text);
  root.setProperty("--text-muted", resolved.textMuted);
  root.setProperty("--text-faint", resolved.textFaint);
  root.setProperty("--accent-action", resolved.action);
  root.setProperty("--accent-fg", resolved.actionFg);

  if (accentMode === "default") {
    // Replay admin-desk's own semantic hues exactly.
    const tokens = defaultModeTokens(mode);
    root.setProperty("--success", tokens.success);
    root.setProperty("--success-bg", tokens.successBg);
    root.setProperty("--warning", tokens.warning);
    root.setProperty("--warning-bg", tokens.warningBg);
    root.setProperty("--danger", tokens.danger);
    root.setProperty("--danger-bg", tokens.dangerBg);
    root.setProperty("--info", tokens.info);
    root.setProperty("--info-bg", tokens.infoBg);
  } else {
    // Let index.css's own light/dark semantic rules apply (unchanged from
    // what already shipped) — remove any inline override left by Default.
    for (const prop of ["--success", "--success-bg", "--warning", "--warning-bg", "--danger", "--danger-bg", "--info", "--info-bg"]) {
      root.removeProperty(prop);
    }
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [accentMode, setAccentModeState] = useState<AccentMode>(readAccentMode);
  const [accent, setAccentState] = useState<string>(() => readHex(ACCENT_KEY, DEFAULT_ACCENT));

  const [bgLightnessLight, setBgLightnessLightState] = useState(() => readNumber(BG_LIGHT_KEY, SUGGESTED_LIGHTNESS.light.bg));
  const [bgLightnessDark, setBgLightnessDarkState] = useState(() => readNumber(BG_DARK_KEY, SUGGESTED_LIGHTNESS.dark.bg));
  const [surfaceLightnessLight, setSurfaceLightnessLightState] = useState(() => readNumber(SURFACE_LIGHT_KEY, SUGGESTED_LIGHTNESS.light.surface));
  const [surfaceLightnessDark, setSurfaceLightnessDarkState] = useState(() => readNumber(SURFACE_DARK_KEY, SUGGESTED_LIGHTNESS.dark.surface));

  const [overridesLight, setOverridesLightState] = useState<Overrides>(() => readOverrides(OVERRIDES_LIGHT_KEY));
  const [overridesDark, setOverridesDarkState] = useState<Overrides>(() => readOverrides(OVERRIDES_DARK_KEY));

  const bgLightness = mode === "dark" ? bgLightnessDark : bgLightnessLight;
  const surfaceLightness = mode === "dark" ? surfaceLightnessDark : surfaceLightnessLight;
  const overrides = mode === "dark" ? overridesDark : overridesLight;

  const resolved = useMemo(
    () => resolveTheme(mode, accentMode, accent, bgLightness, surfaceLightness, overrides),
    [mode, accentMode, accent, bgLightness, surfaceLightness, overrides],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  useEffect(() => {
    applyTheme(mode, accentMode, resolved);
  }, [mode, accentMode, resolved]);

  const setMode = useCallback((next: Mode, opts: { persist?: boolean } = { persist: true }) => {
    setModeState(next);
    localStorage.setItem(MODE_KEY, next);
    if (opts.persist !== false) {
      setMyTheme(next).catch(() => {
        /* not logged in yet, or server unreachable — local state already applied */
      });
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const setAccent = useCallback((hex: string) => {
    if (!isValidHex(hex)) return;
    setAccentState(hex);
    localStorage.setItem(ACCENT_KEY, hex);
    setAccentModeState("custom");
    localStorage.setItem(ACCENT_MODE_KEY, "custom");
  }, []);

  const useDefaultAccent = useCallback(() => {
    setAccentModeState("default");
    localStorage.setItem(ACCENT_MODE_KEY, "default");
  }, []);

  const switchToCustomFromDefault = useCallback(() => {
    // Seed the custom controls from Default's OWN current look, so
    // flipping the toggle doesn't jump to an unrelated color — the user
    // starts exactly where Default left off and can then drag from there.
    // Same OKLCH lightness the sliders themselves store, read straight
    // off admin-desk's real canvas/surface hex — not an approximation.
    const seedAccent = mode === "dark" ? DEFAULT_ACCENT_DARK[600] : DEFAULT_ACCENT_LIGHT[600];
    const tokens = mode === "dark" ? DEFAULT_TOKENS_DARK : DEFAULT_TOKENS_LIGHT;
    const canvasL = Math.round(hexToOklch(tokens.canvas).l * 100);
    const surfaceL = Math.round(hexToOklch(tokens.surface).l * 100);
    setAccent(seedAccent);
    if (mode === "dark") {
      setBgLightnessDarkState(canvasL);
      localStorage.setItem(BG_DARK_KEY, String(canvasL));
      setSurfaceLightnessDarkState(surfaceL);
      localStorage.setItem(SURFACE_DARK_KEY, String(surfaceL));
    } else {
      setBgLightnessLightState(canvasL);
      localStorage.setItem(BG_LIGHT_KEY, String(canvasL));
      setSurfaceLightnessLightState(surfaceL);
      localStorage.setItem(SURFACE_LIGHT_KEY, String(surfaceL));
    }
  }, [mode, setAccent]);

  const setBgLightness = useCallback(
    (percent: number) => {
      const clamped = Math.min(98, Math.max(2, percent));
      if (mode === "dark") {
        setBgLightnessDarkState(clamped);
        localStorage.setItem(BG_DARK_KEY, String(clamped));
      } else {
        setBgLightnessLightState(clamped);
        localStorage.setItem(BG_LIGHT_KEY, String(clamped));
      }
    },
    [mode],
  );

  const setSurfaceLightness = useCallback(
    (percent: number) => {
      const clamped = Math.min(98, Math.max(2, percent));
      if (mode === "dark") {
        setSurfaceLightnessDarkState(clamped);
        localStorage.setItem(SURFACE_DARK_KEY, String(clamped));
      } else {
        setSurfaceLightnessLightState(clamped);
        localStorage.setItem(SURFACE_LIGHT_KEY, String(clamped));
      }
    },
    [mode],
  );

  const setOverride = useCallback(
    (key: ComputedKey, hex: string | null) => {
      const current = mode === "dark" ? overridesDark : overridesLight;
      const next: Overrides = { ...current };
      if (hex === null) {
        delete next[key];
      } else if (isValidHex(hex)) {
        next[key] = hex;
      } else {
        return;
      }
      const storageKey = mode === "dark" ? OVERRIDES_DARK_KEY : OVERRIDES_LIGHT_KEY;
      if (Object.keys(next).length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(next));
      }
      if (mode === "dark") setOverridesDarkState(next);
      else setOverridesLightState(next);
    },
    [mode, overridesDark, overridesLight],
  );

  const value = useMemo(
    () => ({
      mode,
      toggleMode,
      setMode,
      accentMode,
      accent,
      setAccent,
      useDefaultAccent,
      switchToCustomFromDefault,
      bgLightness,
      surfaceLightness,
      setBgLightness,
      setSurfaceLightness,
      overrides,
      setOverride,
      resolved,
    }),
    [
      mode, toggleMode, setMode, accentMode, accent, setAccent, useDefaultAccent, switchToCustomFromDefault,
      bgLightness, surfaceLightness, setBgLightness, setSurfaceLightness, overrides, setOverride, resolved,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
