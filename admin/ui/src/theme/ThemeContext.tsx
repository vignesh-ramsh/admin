import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { generateAccentScale, generateNeutralScale, accentAction, withAlpha, ACCENT_STEPS, type AccentStep, type Appearance } from "../lib/color";
import { BUILTIN_PRESETS, DEFAULT_PRESET_NAME, type ThemePreset } from "./presets";
import { setMyTheme } from "../api/client";

const PRESET_KEY = "arc-console-theme-preset";
// Themes improvised via ThemePickerModal's "Improvise" flow and saved —
// a plain JSON array of ThemePreset, so they show up in the picker
// alongside BUILTIN_PRESETS in every future session on this browser,
// exactly like a built-in would, without needing a server round trip.
const CUSTOM_PRESETS_KEY = "arc-console-custom-presets";
// Pre-preset localStorage key ("light" | "dark") — read as a one-time
// fallback for a returning user who has this but not PRESET_KEY yet.
const LEGACY_MODE_KEY = "arc-console-theme";
const LEGACY_NAME_BY_MODE: Record<string, string> = { light: "Daylight", dark: "Late Night" };

function isThemePresetShape(v: unknown): v is ThemePreset {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.name === "string" &&
    (p.appearance === "light" || p.appearance === "dark") &&
    typeof p.canvas === "string" &&
    typeof p.accent === "string"
  );
}

function loadCustomPresets(): ThemePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isThemePresetShape) : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: ThemePreset[]): void {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
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

export type AddPresetResult = { ok: true } | { ok: false; error: string };

interface ThemeContextValue {
  presetName: string; // committed — persisted (localStorage + server)
  preset: ThemePreset; // committed
  presets: ThemePreset[]; // built-in + this browser's saved custom ones
  setPresetName: (name: string, opts?: { persist?: boolean }) => void; // COMMITS
  previewPreset: (preset: ThemePreset | null) => void; // visual only, never persisted — null reverts to committed
  previewedPresetName: string | null; // name of whatever's live-previewing right now, if anything
  // `editingName`: pass the ORIGINAL name of the custom preset being
  // improvised, if any — keeping that exact name updates it in place
  // instead of being rejected as a duplicate. Never bypasses the
  // uniqueness check against anything else, and never applies to a
  // built-in (see the callback's own comment).
  addCustomPreset: (preset: ThemePreset, editingName?: string | null) => AddPresetResult;
  /** True for a name that belongs to one of THIS browser's own saved
   *  custom presets (never a built-in) — ThemePickerModal uses this to
   *  decide whether "Improvise" opens in edit-in-place mode. */
  isCustomPresetName: (name: string) => boolean;
  resolved: ResolvedTheme; // whatever's CURRENTLY SHOWING (preview if active, else committed)
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
  const [customPresets, setCustomPresets] = useState<ThemePreset[]>(loadCustomPresets);
  const presets = useMemo(() => [...BUILTIN_PRESETS, ...customPresets], [customPresets]);

  const presetByName = useCallback((name: string) => presets.find((p) => p.name === name), [presets]);

  /** Any string in -> a real preset name out. Handles three cases: already
   *  a known preset name (built-in or custom, unchanged), a legacy
   *  "light"/"dark" mode value (mapped to its equivalent preset), or
   *  anything else — unknown, null, a preset since renamed/removed
   *  (falls back to the default). Used for both localStorage and the
   *  server's `_users.theme` value, so neither can hand this app a name
   *  it doesn't recognize. */
  const resolvePresetName = useCallback(
    (candidate: string | null | undefined): string => {
      if (candidate) {
        if (presetByName(candidate)) return candidate;
        const legacy = LEGACY_NAME_BY_MODE[candidate];
        if (legacy) return legacy;
      }
      return DEFAULT_PRESET_NAME;
    },
    [presetByName],
  );

  const [presetName, setPresetNameState] = useState<string>(() => {
    // Bootstrap runs before any state (including customPresets above) is
    // wired up, so it resolves against a freshly-read combined list of
    // its own rather than presetByName/resolvePresetName above.
    const all = [...BUILTIN_PRESETS, ...loadCustomPresets()];
    const stored = localStorage.getItem(PRESET_KEY) ?? localStorage.getItem(LEGACY_MODE_KEY);
    if (stored) {
      if (all.some((p) => p.name === stored)) return stored;
      const legacy = LEGACY_NAME_BY_MODE[stored];
      if (legacy) return legacy;
    }
    return DEFAULT_PRESET_NAME;
  });

  // Ephemeral, visual-only override — set while ThemePickerModal is open
  // and the user is browsing/improvising, cleared the moment a choice is
  // actually committed (setPresetName) or explicitly discarded
  // (previewPreset(null), e.g. closing the modal without saving).
  const [previewOverride, setPreviewOverride] = useState<ThemePreset | null>(null);

  const committedPreset = useMemo(() => presetByName(presetName) ?? BUILTIN_PRESETS[0], [presetByName, presetName]);
  const shownPreset = previewOverride ?? committedPreset;
  const resolved = useMemo(() => resolveTheme(shownPreset), [shownPreset]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", shownPreset.appearance);
  }, [shownPreset.appearance]);

  useEffect(() => {
    applyTheme(resolved, shownPreset.appearance);
  }, [resolved, shownPreset.appearance]);

  const previewPreset = useCallback((next: ThemePreset | null) => {
    setPreviewOverride(next);
  }, []);

  const setPresetName = useCallback(
    (next: string, opts: { persist?: boolean } = { persist: true }) => {
      const resolvedName = resolvePresetName(next);
      setPresetNameState(resolvedName);
      setPreviewOverride(null); // committing resolves/clears whatever was being previewed
      localStorage.setItem(PRESET_KEY, resolvedName);
      if (opts.persist !== false) {
        setMyTheme(resolvedName).catch(() => {
          /* not logged in yet, or server unreachable — local state already applied */
        });
      }
    },
    [resolvePresetName],
  );

  const isCustomPresetName = useCallback(
    (name: string) => customPresets.some((p) => p.name === name),
    [customPresets],
  );

  // Adds AND selects the new preset in one atomic call — deliberately
  // not two separate calls (add, then setPresetName(name)). setPresetName
  // resolves its argument against the CURRENT `presets` array via a
  // closure captured at render time; calling it synchronously right
  // after addCustomPreset's own setCustomPresets (whose effect hasn't
  // re-rendered yet) would look the new name up in a `presets` array
  // that doesn't contain it yet and silently fall back to the default.
  // Selecting it directly here, with the exact name just validated
  // above, sidesteps that entirely.
  //
  // `editingName` lets improvising your OWN already-saved custom theme
  // and keeping its exact name UPDATE it in place rather than bounce off
  // the uniqueness check below — without this, re-opening Improvise on a
  // theme you just made and saving again (the obvious, expected way to
  // refine it further) always failed with "That name is already used,"
  // silently, since the modal doesn't close on an error and the message
  // is easy to miss. Only ever matches a name that WAS a real custom
  // preset going in (isCustomPresetName, checked by the caller) — a
  // built-in's name reaching here with editingName set to itself would
  // still correctly fall through to the ordinary collision rejection,
  // since it was never added to customPresets to match against.
  const addCustomPreset = useCallback(
    (preset: ThemePreset, editingName: string | null = null): AddPresetResult => {
      const name = preset.name.trim();
      if (!name) return { ok: false, error: "Name is required." };
      const isSelfUpdate = editingName != null && editingName === name && isCustomPresetName(editingName);
      const collidesWithSomethingElse = presets.some(
        (p) => p.name.toLowerCase() === name.toLowerCase() && p.name !== editingName,
      );
      if (collidesWithSomethingElse) {
        return { ok: false, error: "That name is already used by another theme." };
      }
      const saved: ThemePreset = { ...preset, name };
      const next = isSelfUpdate
        ? customPresets.map((p) => (p.name === editingName ? saved : p))
        : [...customPresets, saved];
      setCustomPresets(next);
      saveCustomPresets(next);
      setPresetNameState(name);
      setPreviewOverride(null);
      localStorage.setItem(PRESET_KEY, name);
      setMyTheme(name).catch(() => {
        /* not logged in yet, or server unreachable — local state already applied */
      });
      return { ok: true };
    },
    [presets, customPresets, isCustomPresetName],
  );

  const value = useMemo(
    () => ({
      presetName,
      preset: committedPreset,
      presets,
      setPresetName,
      previewPreset,
      previewedPresetName: previewOverride?.name ?? null,
      addCustomPreset,
      isCustomPresetName,
      resolved,
    }),
    [
      presetName,
      committedPreset,
      presets,
      setPresetName,
      previewPreset,
      previewOverride,
      addCustomPreset,
      isCustomPresetName,
      resolved,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
