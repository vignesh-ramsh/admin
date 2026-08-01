import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { generateAccentScale, generateNeutralScale, accentAction, withAlpha, ACCENT_STEPS, type AccentStep, type Appearance } from "../lib/color";
import { BUILTIN_PRESETS, DEFAULT_PRESET_NAME, type ThemePreset } from "./presets";
import { setMyTheme } from "../api/client";

const PRESET_KEY = "arc-console-theme-preset";
// Pre-preset localStorage key ("light" | "dark") — read as a one-time
// fallback for a returning user who has this but not PRESET_KEY yet.
const LEGACY_MODE_KEY = "arc-console-theme";
const LEGACY_NAME_BY_MODE: Record<string, string> = { light: "Daylight", dark: "Late Night" };

function presetByName(name: string): ThemePreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.name === name);
}

/** Any string in -> a real preset name out. Handles three cases: already
 *  a known preset name (unchanged), a legacy "light"/"dark" mode value
 *  (mapped to its equivalent preset), or anything else — unknown,
 *  null, a preset that's since been renamed/removed (falls back to the
 *  default). Used for both localStorage and the server's `_users.theme`
 *  value, so neither can hand this app a name it doesn't recognize. */
function resolvePresetName(candidate: string | null | undefined): string {
  if (candidate) {
    if (presetByName(candidate)) return candidate;
    const legacy = LEGACY_NAME_BY_MODE[candidate];
    if (legacy) return legacy;
  }
  return DEFAULT_PRESET_NAME;
}

function readStoredPresetName(): string {
  const stored = localStorage.getItem(PRESET_KEY);
  if (stored) return resolvePresetName(stored);
  return resolvePresetName(localStorage.getItem(LEGACY_MODE_KEY));
}

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
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
}

interface ThemeContextValue {
  presetName: string;
  preset: ThemePreset;
  presets: ThemePreset[];
  setPresetName: (name: string, opts?: { persist?: boolean }) => void;
  resolved: ResolvedTheme; // the final computed values, e.g. for swatch readouts
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Every derived value a preset's checklist doesn't supply directly —
 *  the accent/neutral 11-step ramps, the action fill + its foreground,
 *  and a soft translucent background for each semantic color. */
function resolveTheme(preset: ThemePreset): ResolvedTheme {
  const accentScale = generateAccentScale(preset.accent, preset.appearance);
  const neutralScale = generateNeutralScale(preset.canvas, preset.appearance);
  const action = accentAction(preset.accent, preset.appearance);
  const softAlpha = preset.appearance === "dark" ? 0.16 : 0.12;
  return {
    accentScale,
    neutralScale,
    canvas: preset.canvas,
    surface: preset.surface,
    border: preset.border,
    borderStrong: preset.borderStrong,
    text: preset.text,
    textMuted: preset.textMuted,
    textFaint: preset.textFaint,
    action: action.bg,
    actionFg: action.fg,
    success: preset.success,
    successBg: withAlpha(preset.success, softAlpha),
    warning: preset.warning,
    warningBg: withAlpha(preset.warning, softAlpha),
    danger: preset.danger,
    dangerBg: withAlpha(preset.danger, softAlpha),
    info: preset.info,
    infoBg: withAlpha(preset.info, softAlpha),
  };
}

function applyTheme(resolved: ResolvedTheme, appearance: Appearance) {
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
  root.setProperty("--success", resolved.success);
  root.setProperty("--success-bg", resolved.successBg);
  root.setProperty("--warning", resolved.warning);
  root.setProperty("--warning-bg", resolved.warningBg);
  root.setProperty("--danger", resolved.danger);
  root.setProperty("--danger-bg", resolved.dangerBg);
  root.setProperty("--info", resolved.info);
  root.setProperty("--info-bg", resolved.infoBg);
  // Native form controls / scrollbars follow this, not our own CSS — the
  // one place `appearance` matters outside of lib/color.ts's own math.
  document.documentElement.style.colorScheme = appearance;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [presetName, setPresetNameState] = useState<string>(readStoredPresetName);
  const preset = useMemo(() => presetByName(presetName) ?? BUILTIN_PRESETS[0], [presetName]);
  const resolved = useMemo(() => resolveTheme(preset), [preset]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", preset.appearance);
  }, [preset.appearance]);

  useEffect(() => {
    applyTheme(resolved, preset.appearance);
  }, [resolved, preset.appearance]);

  const setPresetName = useCallback((next: string, opts: { persist?: boolean } = { persist: true }) => {
    const resolvedName = resolvePresetName(next);
    setPresetNameState(resolvedName);
    localStorage.setItem(PRESET_KEY, resolvedName);
    if (opts.persist !== false) {
      setMyTheme(resolvedName).catch(() => {
        /* not logged in yet, or server unreachable — local state already applied */
      });
    }
  }, []);

  const value = useMemo(
    () => ({ presetName: preset.name, preset, presets: BUILTIN_PRESETS, setPresetName, resolved }),
    [preset, setPresetName, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
