/**
 * OKLCH color conversion primitives, plus the derivation helpers every
 * theme preset (theme/presets.ts) relies on at runtime. A preset only
 * ever supplies a small, fixed set of literal colors (canvas, surface,
 * text, one accent hex, ...) — everything else a component actually
 * needs (the 11-step accent ramp `bg-accent-600`/`dark:bg-accent-950`
 * classes are written against, the matching neutral ramp, a readable
 * foreground for the accent's solid action fill, translucent "soft"
 * backgrounds for success/warning/danger/info) is derived from those few
 * values here — so adding a new preset never means hand-picking 40+
 * individual shades, just the handful the interface actually asks for.
 *
 * This previously backed a single user-editable "Custom" theme mode
 * (pick one hue, drag sliders) alongside a fixed "Default" theme that
 * used none of this — that whole mode toggle is gone now. Every theme,
 * built-in or later added, goes through the exact same derivation path.
 */

export interface Oklch {
  l: number; // 0..1
  c: number; // chroma, roughly 0..0.4
  h: number; // hue, 0..360
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** r, g, b are each in the 0..1 (sRGB, gamma-encoded) range. */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const c = Math.max(0, v);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// linear-sRGB <-> OKLab (Björn Ottosson's matrices)
function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex);
  const [lr, lg, lb] = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  const [L, a, bb] = linearRgbToOklab(lr, lg, lb);
  const c = Math.sqrt(a * a + bb * bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function inGamut(r: number, g: number, b: number): boolean {
  return r >= -1e-4 && r <= 1 + 1e-4 && g >= -1e-4 && g <= 1 + 1e-4 && b >= -1e-4 && b <= 1 + 1e-4;
}

/** Reduce chroma until the OKLCH color maps to an in-gamut sRGB color. */
export function oklchToHex(l: number, c: number, h: number): string {
  const hRad = (h * Math.PI) / 180;
  let chroma = c;
  for (let i = 0; i < 24; i++) {
    const a = Math.cos(hRad) * chroma;
    const bb = Math.sin(hRad) * chroma;
    const [lr, lg, lb] = oklabToLinearRgb(l, a, bb);
    if (inGamut(lr, lg, lb) || chroma < 0.001) {
      return rgbToHex(linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb));
    }
    chroma *= 0.92;
  }
  return "#808080";
}

/** hex + an alpha (0..1) as a CSS rgba() string — used to turn a preset's
 *  single semantic color (success/warning/danger/info) into the soft
 *  translucent background those pills/banners render on, without every
 *  preset having to hand-pick a second "soft" shade per status color. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type AccentStep = (typeof ACCENT_STEPS)[number];

export type Appearance = "light" | "dark";

/** Chroma floor applied to a preset's accent before deriving anything
 *  from it — low enough not to override a genuinely near-neutral pick
 *  (e.g. a slate accent), but keeps a fully desaturated pick off pure
 *  gray so the ramp still reads as "that color", faintly, end to end. */
const CHROMA_FLOOR = 0.03;

// Target lightness per step — a fixed perceptual ramp independent of hue.
const STEP_LIGHTNESS: Record<AccentStep, number> = {
  50: 0.98,
  100: 0.955,
  200: 0.9,
  300: 0.82,
  400: 0.72,
  500: 0.62,
  600: 0.53,
  700: 0.45,
  800: 0.38,
  900: 0.32,
  950: 0.22,
};

// Chroma envelope: near-white/near-black steps desaturate (matches how
// human perception + real pigments behave); midtones carry full chroma.
const STEP_CHROMA_FACTOR: Record<AccentStep, number> = {
  50: 0.2,
  100: 0.32,
  200: 0.55,
  300: 0.78,
  400: 0.95,
  500: 1,
  600: 1,
  700: 0.92,
  800: 0.78,
  900: 0.62,
  950: 0.42,
};

// Dark-appearance counterparts. The ORIENTATION is deliberately preserved
// (50 = lightest … 950 = darkest) because components already encode that
// meaning directly — `dark:bg-accent-950` is a deep tinted panel,
// `dark:text-accent-300` a light tint. What changes on a dark canvas is
// the *mid-band*: the light ramp's 600 (L 0.53) would only read ~3:1
// against a dark background, so the whole middle lifts a step while the
// extremes stay put.
const DARK_STEP_LIGHTNESS: Record<AccentStep, number> = {
  50: 0.97,
  100: 0.94,
  200: 0.88,
  300: 0.8,
  400: 0.71,
  500: 0.63,
  600: 0.58,
  700: 0.5,
  800: 0.4,
  900: 0.3,
  950: 0.2,
};

const DARK_STEP_CHROMA_FACTOR: Record<AccentStep, number> = {
  50: 0.18,
  100: 0.28,
  200: 0.5,
  300: 0.75,
  400: 0.92,
  500: 1,
  600: 1,
  700: 0.95,
  800: 0.82,
  900: 0.66,
  950: 0.46,
};

/** Full 11-step accent ramp derived from a preset's one accent hex. Fixed
 *  at 11 steps deliberately — these specific numbers (50..950) are baked
 *  into every component's Tailwind classes. */
export function generateAccentScale(hex: string, appearance: Appearance = "light"): Record<AccentStep, string> {
  const { c, h } = hexToOklch(hex);
  const baseChroma = Math.max(c, CHROMA_FLOOR);
  const lightness = appearance === "dark" ? DARK_STEP_LIGHTNESS : STEP_LIGHTNESS;
  const chroma = appearance === "dark" ? DARK_STEP_CHROMA_FACTOR : STEP_CHROMA_FACTOR;
  const out = {} as Record<AccentStep, string>;
  for (const step of ACCENT_STEPS) {
    out[step] = oklchToHex(lightness[step], baseChroma * chroma[step], h);
  }
  return out;
}

// Lightness of the solid "action" fill (primary button, active pill) per
// appearance. Light goes markedly darker than any light-ramp step so it
// can carry white text; dark goes markedly brighter than any dark-ramp
// step so it separates from a dark canvas instead of blending into it.
const ACTION_LIGHTNESS: Record<Appearance, number> = { light: 0.53, dark: 0.7 };

// Yellow through yellow-green. These hues carry their identity at high
// lightness: forced down to the standard 0.53 action lightness, amber
// renders as brown, not the color anyone picked. They get a lifted fill
// instead and, via contrastFg, dark text on it.
const BRIGHT_HUE_RANGE: readonly [number, number] = [45, 115];
const BRIGHT_ACTION_LIGHTNESS = 0.66;

function isBrightHue(h: number): boolean {
  return h >= BRIGHT_HUE_RANGE[0] && h <= BRIGHT_HUE_RANGE[1];
}

/** The one solid accent fill a user actually clicks, plus a foreground
 *  guaranteed to be readable on it — split out from the numbered ramp
 *  because light/dark want genuinely different lightness *and* different
 *  foregrounds, which `bg-accent-600 text-white` could never express for
 *  both. */
export function accentAction(hex: string, appearance: Appearance = "light"): { bg: string; fg: string } {
  const { c, h } = hexToOklch(hex);
  const baseChroma = Math.max(c, CHROMA_FLOOR);
  // Dark already sits above the bright-hue floor, so only light needs the lift.
  const lightness = appearance === "light" && isBrightHue(h) ? BRIGHT_ACTION_LIGHTNESS : ACTION_LIGHTNESS[appearance];
  const bg = oklchToHex(lightness, baseChroma * (appearance === "dark" ? 0.98 : 1), h);
  return { bg, fg: contrastFg(bg) };
}

// Chroma envelope shared by the neutral ramp below: near-white/near-black
// steps carry almost no color; midtones carry the most.
const NEUTRAL_CHROMA_FACTOR: Record<AccentStep, number> = {
  50: 0.05,
  100: 0.08,
  200: 0.12,
  300: 0.18,
  400: 0.28,
  500: 0.4,
  600: 0.55,
  700: 0.72,
  800: 0.85,
  900: 0.95,
  950: 1,
};

// Lightness anchors for the neutral ramp, one per appearance. Both keep
// the same orientation (50 = lightest … 950 = darkest) — a dark preset
// anchors its darkest step (950) to its own canvas exactly; a light
// preset anchors its lightest step (50) to its own canvas exactly — so
// the darkest/lightest surface in either case matches what the preset
// actually asked for, with every other step derived around it.
const LIGHT_NEUTRAL_LIGHTNESS: Record<AccentStep, number> = {
  50: 0.985, 100: 0.96, 200: 0.925, 300: 0.86, 400: 0.71, 500: 0.58, 600: 0.48, 700: 0.38, 800: 0.29, 900: 0.22, 950: 0.13,
};
const DARK_NEUTRAL_LIGHTNESS: Record<AccentStep, number> = {
  50: 0.97, 100: 0.93, 200: 0.87, 300: 0.78, 400: 0.68, 500: 0.57, 600: 0.46, 700: 0.35, 800: 0.26, 900: 0.19, 950: 0.14,
};

/** Neutral ramp (surfaces/borders/near-neutral text) derived from a
 *  preset's own canvas color, anchored so the ramp's own lightest-or-
 *  darkest step (whichever matches this appearance) equals the canvas
 *  exactly — every surface (canvas → cards → hover → borders) reads as
 *  one cohesive color family instead of a flat gray fighting a tinted
 *  background. */
export function generateNeutralScale(canvasHex: string, appearance: Appearance = "light"): Record<AccentStep, string> {
  const { h, c } = hexToOklch(canvasHex);
  const chroma = Math.min(c, 0.06); // cap so a wildly saturated canvas can't neon the whole UI
  const lightness = appearance === "dark" ? DARK_NEUTRAL_LIGHTNESS : LIGHT_NEUTRAL_LIGHTNESS;
  const anchorStep: AccentStep = appearance === "dark" ? 950 : 50;
  const out = {} as Record<AccentStep, string>;
  for (const step of ACCENT_STEPS) {
    out[step] = step === anchorStep ? canvasHex : oklchToHex(lightness[step], chroma * NEUTRAL_CHROMA_FACTOR[step], h);
  }
  return out;
}

/** Relative luminance-based pick of black/white foreground for a given bg. */
export function contrastFg(hex: string): "#0a0a0a" | "#fafafa" {
  const { l } = hexToOklch(hex);
  return l > 0.62 ? "#0a0a0a" : "#fafafa";
}
