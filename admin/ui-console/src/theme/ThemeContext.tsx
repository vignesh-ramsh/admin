import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  generateAccentScale,
  generateLightNeutralScale,
  generateDarkNeutralScale,
  isValidHex,
  ACCENT_STEPS,
} from "../lib/color";
import { setMyTheme } from "../api/client";

export type Mode = "light" | "dark";

const MODE_KEY = "arc-console-theme";
const ACCENT_KEY = "arc-console-accent";
const LIGHT_BG_KEY = "arc-console-light-bg";
const DARK_BG_KEY = "arc-console-dark-bg";
const SURFACE_LIGHT_KEY = "arc-console-surface-light";
const SURFACE_DARK_KEY = "arc-console-surface-dark";

export const DEFAULT_ACCENT = "#4f46e5"; // indigo — neutral, confident default; fully user-replaceable
export const DEFAULT_LIGHT_BG = "#F8FAFC"; // near-white, faint cool tint
// The admin-desk dark page background, reused so both consoles share one dark base.
export const DEFAULT_DARK_BG = "#060B2E"; // brand navy

export const ACCENT_PRESETS = [
  "#4f46e5", // indigo
  "#0ea5a4", // teal
  "#dc2626", // red
  "#d97706", // amber
  "#16a34a", // green
  "#2563eb", // blue
  "#c026d3", // fuchsia
  "#334155", // slate (near-monochrome)
];

// Configurable canvas/page backgrounds, per mode.
export const LIGHT_BG_PRESETS = [
  "#F8FAFC", // near-white (default)
  "#FFFFFF", // pure white
  "#F6F7F6", // admin-desk light
  "#FAF5FF", // faint lavender
  "#F0FDF9", // faint mint
];

export const DARK_BG_PRESETS = [
  "#060B2E", // navy (admin-desk, default)
  "#0a0a0a", // near-black
  "#0f172a", // slate
  "#1a1626", // plum
  "#0b1a17", // forest
];

// Configurable "panel" background — sidebar, cards, tables (bg-surface /
// bg-surface-raised). Independent of the canvas color so the two can
// contrast (e.g. a white page with faint-gray panels). `null` = auto
// (derive from the canvas neutral ramp, the original behavior).
export const LIGHT_SURFACE_PRESETS = ["#FFFFFF", "#F9FAFB", "#F3F4F6", "#FDF4FF", "#F0FDF4"];
export const DARK_SURFACE_PRESETS = ["#0C1340", "#111827", "#18181B", "#1E1B2E", "#0F2A24"];

interface ThemeContextValue {
  mode: Mode;
  accent: string;
  lightBg: string;
  darkBg: string;
  surfaceLight: string | null;
  surfaceDark: string | null;
  toggleMode: () => void;
  setMode: (mode: Mode, opts?: { persist?: boolean }) => void;
  setAccent: (hex: string) => void;
  setLightBg: (hex: string) => void;
  setDarkBg: (hex: string) => void;
  setSurfaceLight: (hex: string | null) => void;
  setSurfaceDark: (hex: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readMode(): Mode {
  const stored = localStorage.getItem(MODE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function readHex(key: string, fallback: string): string {
  const stored = localStorage.getItem(key);
  return stored && isValidHex(stored) ? stored : fallback;
}

function readOptionalHex(key: string): string | null {
  const stored = localStorage.getItem(key);
  return stored && isValidHex(stored) ? stored : null;
}

/** Apply the accent ramp (mode-independent) plus the neutral ramp for the
 *  active mode's chosen background, then either override --surface/
 *  --surface-raised with the user's panel-color pick or let them fall back
 *  to the CSS file's derived default (var(--neutral-900) in dark, white in
 *  light) by clearing the inline override. */
function applyTheme(
  mode: Mode,
  accent: string,
  lightBg: string,
  darkBg: string,
  surfaceLight: string | null,
  surfaceDark: string | null,
) {
  const accentScale = generateAccentScale(accent);
  const neutralScale = mode === "dark" ? generateDarkNeutralScale(darkBg) : generateLightNeutralScale(lightBg);
  const root = document.documentElement.style;
  for (const step of ACCENT_STEPS) {
    root.setProperty(`--accent-${step}`, accentScale[step]);
    root.setProperty(`--neutral-${step}`, neutralScale[step]);
  }

  const surfaceOverride = mode === "dark" ? surfaceDark : surfaceLight;
  if (surfaceOverride) {
    root.setProperty("--surface", surfaceOverride);
    root.setProperty("--surface-raised", surfaceOverride);
  } else {
    root.removeProperty("--surface");
    root.removeProperty("--surface-raised");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [accent, setAccentState] = useState<string>(() => readHex(ACCENT_KEY, DEFAULT_ACCENT));
  const [lightBg, setLightBgState] = useState<string>(() => readHex(LIGHT_BG_KEY, DEFAULT_LIGHT_BG));
  const [darkBg, setDarkBgState] = useState<string>(() => readHex(DARK_BG_KEY, DEFAULT_DARK_BG));
  const [surfaceLight, setSurfaceLightState] = useState<string | null>(() => readOptionalHex(SURFACE_LIGHT_KEY));
  const [surfaceDark, setSurfaceDarkState] = useState<string | null>(() => readOptionalHex(SURFACE_DARK_KEY));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  useEffect(() => {
    applyTheme(mode, accent, lightBg, darkBg, surfaceLight, surfaceDark);
  }, [mode, accent, lightBg, darkBg, surfaceLight, surfaceDark]);

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
  }, []);

  const setLightBg = useCallback((hex: string) => {
    if (!isValidHex(hex)) return;
    setLightBgState(hex);
    localStorage.setItem(LIGHT_BG_KEY, hex);
  }, []);

  const setDarkBg = useCallback((hex: string) => {
    if (!isValidHex(hex)) return;
    setDarkBgState(hex);
    localStorage.setItem(DARK_BG_KEY, hex);
  }, []);

  const setSurfaceLight = useCallback((hex: string | null) => {
    if (hex === null) {
      setSurfaceLightState(null);
      localStorage.removeItem(SURFACE_LIGHT_KEY);
      return;
    }
    if (!isValidHex(hex)) return;
    setSurfaceLightState(hex);
    localStorage.setItem(SURFACE_LIGHT_KEY, hex);
  }, []);

  const setSurfaceDark = useCallback((hex: string | null) => {
    if (hex === null) {
      setSurfaceDarkState(null);
      localStorage.removeItem(SURFACE_DARK_KEY);
      return;
    }
    if (!isValidHex(hex)) return;
    setSurfaceDarkState(hex);
    localStorage.setItem(SURFACE_DARK_KEY, hex);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      accent,
      lightBg,
      darkBg,
      surfaceLight,
      surfaceDark,
      toggleMode,
      setMode,
      setAccent,
      setLightBg,
      setDarkBg,
      setSurfaceLight,
      setSurfaceDark,
    }),
    [mode, accent, lightBg, darkBg, surfaceLight, surfaceDark, toggleMode, setMode, setAccent, setLightBg, setDarkBg, setSurfaceLight, setSurfaceDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
