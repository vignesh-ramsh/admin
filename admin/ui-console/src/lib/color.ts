/**
 * Accent-driven palette engine.
 *
 * The user picks ONE color; everything else (10-step accent ramp, a
 * faintly-tinted neutral ramp, light/dark variants) is derived from it in
 * OKLCH space so contrast stays predictable regardless of the picked hue.
 * OKLCH is used (not HSL) because its lightness axis is perceptually
 * uniform — an L=0.55 step reads as "the same darkness" for a yellow and
 * a blue, which plain HSL cannot guarantee.
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

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type AccentStep = (typeof ACCENT_STEPS)[number];

export type ThemeMode = "light" | "dark";

/** Chroma floor applied to a picked accent before deriving anything from
 *  it. Deliberately low: the previous 0.12 floor was high enough to
 *  *override* genuinely near-neutral picks — slate (#334155, chroma 0.039)
 *  came out as a medium blue (#3b6cb0) rather than slate. 0.03 still lifts
 *  a fully desaturated pick off pure gray, without hijacking a hue the
 *  user deliberately chose to be quiet. */
const CHROMA_FLOOR = 0.03;

/** How much chroma a *neutral* ramp (canvas, surfaces, body text, borders)
 *  may carry. Keeps the accent's hue as a faint wash rather than letting a
 *  red accent turn body text maroon and the page pink — the tinted-neutral
 *  convention used by data-dense consoles. */
export const NEUTRAL_CHROMA_CAP = 0.02;

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

// Dark-mode counterparts. The ORIENTATION is deliberately preserved
// (50 = lightest … 950 = darkest) because components already encode that
// meaning directly — `dark:bg-accent-950` is used as a deep tinted panel
// in 10 places and `dark:text-accent-300` as a light tint in 11. Flipping
// the ramp for dark would turn every one of those inside out. What changes
// is the *mid-band*: on a dark canvas the light ramp's 600 (L 0.53) sits
// only ~3:1 against the background, so the whole middle lifts a step while
// the extremes stay put.
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

/** Full 11-step accent ramp derived from one hex color. Fixed at 11 steps
 *  deliberately — these specific numbers (50..950) are baked into every
 *  component's Tailwind classes (`bg-accent-600`, `dark:bg-accent-950`,
 *  ...), so the step count here can't just grow without renaming classes
 *  throughout the app. `toneAtLightness` below is the escape hatch for
 *  anything that wants finer-than-11-step control over ONE color from
 *  this same hue — it doesn't touch this table or its callers. */
export function generateAccentScale(hex: string, mode: ThemeMode = "light"): Record<AccentStep, string> {
  const { c, h } = hexToOklch(hex);
  const baseChroma = Math.max(c, CHROMA_FLOOR);
  const lightness = mode === "dark" ? DARK_STEP_LIGHTNESS : STEP_LIGHTNESS;
  const chroma = mode === "dark" ? DARK_STEP_CHROMA_FACTOR : STEP_CHROMA_FACTOR;
  const out = {} as Record<AccentStep, string>;
  for (const step of ACCENT_STEPS) {
    out[step] = oklchToHex(lightness[step], baseChroma * chroma[step], h);
  }
  return out;
}

// Lightness of the solid "action" fill (primary button, active pill) per
// mode. Light mode matches the ramp's own 600; dark mode goes markedly
// brighter than any ramp step would, because a dark-canvas button has to
// separate from the background rather than blend into it.
const ACTION_LIGHTNESS: Record<ThemeMode, number> = { light: 0.53, dark: 0.7 };

// Yellow through yellow-green. These hues carry their identity at high
// lightness: forced down to the standard 0.53 action lightness, amber
// renders #a05600 — a brown, not the color anyone picked. They get a
// lifted fill instead and, via contrastFg, dark text on it. Same treatment
// Radix gives its "bright" scales, and the reason Tailwind's amber button
// is dark-on-light rather than white-on-dark.
//
// 0.66 is the most chromatic lightness that still clears BOTH bars for
// this band: >=4.5:1 text on the fill, and >=3:1 fill against a near-white
// canvas (WCAG 1.4.11, non-text contrast). Going brighter looks better in
// isolation but dissolves the button's edge against the page.
const BRIGHT_HUE_RANGE: readonly [number, number] = [45, 115];
const BRIGHT_ACTION_LIGHTNESS = 0.66;

function isBrightHue(h: number): boolean {
  return h >= BRIGHT_HUE_RANGE[0] && h <= BRIGHT_HUE_RANGE[1];
}

/** The one solid accent fill a user actually clicks, plus a foreground
 *  guaranteed to be readable on it. Split out from the numbered ramp
 *  because the two modes want genuinely different lightness *and*
 *  different foregrounds — a bright dark-mode fill needs near-black text,
 *  which `bg-accent-600 text-white` could never express. */
export function accentAction(hex: string, mode: ThemeMode = "light"): { bg: string; fg: string } {
  const { c, h } = hexToOklch(hex);
  const baseChroma = Math.max(c, CHROMA_FLOOR);
  // Dark mode already sits above the bright-hue floor, so only light mode
  // needs the lift.
  const lightness = mode === "light" && isBrightHue(h) ? BRIGHT_ACTION_LIGHTNESS : ACTION_LIGHTNESS[mode];
  const bg = oklchToHex(lightness, baseChroma * (mode === "dark" ? 0.98 : 1), h);
  return { bg, fg: contrastFg(bg) };
}

// (lightness, chroma-factor) control points, reusing the exact same 11
// perceptual anchors generateAccentScale is built from, sorted by
// lightness so they can be linearly interpolated between.
const LIGHTNESS_CHROMA_POINTS: Array<[number, number]> = ACCENT_STEPS.map(
  (step) => [STEP_LIGHTNESS[step], STEP_CHROMA_FACTOR[step]] as [number, number],
).sort((a, b) => a[0] - b[0]);

function chromaFactorAtLightness(l: number): number {
  const pts = LIGHTNESS_CHROMA_POINTS;
  if (l <= pts[0][0]) return pts[0][1];
  if (l >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [l0, f0] = pts[i];
    const [l1, f1] = pts[i + 1];
    if (l >= l0 && l <= l1) {
      const t = l1 === l0 ? 0 : (l - l0) / (l1 - l0);
      return f0 + (f1 - f0) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/** ANY lightness (0..100), not just the 11 fixed steps — for controls
 *  (sliders) that want continuous, not discrete, tone selection along one
 *  hue. Uses the same chroma envelope as generateAccentScale, linearly
 *  interpolated between its 11 anchor points rather than looked up by a
 *  fixed key, so the two stay visually consistent at any resolution. */
export function toneAtLightness(hex: string, lightnessPercent: number, chromaCap?: number): string {
  const { c, h } = hexToOklch(hex);
  const capped = chromaCap === undefined ? c : Math.min(c, chromaCap);
  const baseChroma = Math.max(capped, Math.min(CHROMA_FLOOR, chromaCap ?? CHROMA_FLOOR));
  const l = Math.min(0.99, Math.max(0.02, lightnessPercent / 100));
  return oklchToHex(l, baseChroma * chromaFactorAtLightness(l), h);
}

/** The tone a *surface* (page canvas, card) should take at a given
 *  lightness — same hue as the accent, but chroma clamped to the neutral
 *  cap so large flat areas read as near-neutral with a hint of the accent
 *  rather than as a saturated wash. */
export function neutralToneAtLightness(hex: string, lightnessPercent: number): string {
  return toneAtLightness(hex, lightnessPercent, NEUTRAL_CHROMA_CAP);
}

// Chroma envelope shared by both neutral ramps: near-white/near-black
// steps carry almost no color; midtones carry the most — same
// perceptual logic as the accent ramp's own envelope above.
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

/** Dark-mode neutral ramp anchored to a configurable base background color
 *  (default: admin-desk's navy #060B2E). neutral-950 is the base itself, so
 *  the darkest surface matches the chosen background exactly; lighter steps
 *  step up in lightness while keeping the base hue and easing chroma down,
 *  so every surface (canvas → cards → hover → borders) and the near-white
 *  text all read as one cohesive color family instead of a flat gray that
 *  fights a tinted background. */
export function generateDarkNeutralScale(baseHex: string): Record<AccentStep, string> {
  const { h, c } = hexToOklch(baseHex);
  const chroma = Math.min(c, 0.06); // cap so a wildly saturated pick can't neon the whole UI
  const out = {} as Record<AccentStep, string>;
  const DARK_L: Record<AccentStep, number> = {
    50: 0.97,
    100: 0.93,
    200: 0.87,
    300: 0.78,
    400: 0.68,
    500: 0.57,
    600: 0.46,
    700: 0.35,
    800: 0.26,
    900: 0.19,
    950: 0.14,
  };
  for (const step of ACCENT_STEPS) {
    // Anchor the darkest step to the base color exactly; derive the rest.
    out[step] = step === 950 ? baseHex : oklchToHex(DARK_L[step], chroma * NEUTRAL_CHROMA_FACTOR[step], h);
  }
  return out;
}

// Lightness anchors for the tinted-neutral ramps. Both modes keep the same
// orientation (50 = lightest … 950 = darkest) because index.css maps
// --text to neutral-50 and --canvas to neutral-950 in dark, the mirror of
// what it does in light — the ramp is read from opposite ends, not flipped.
const NEUTRAL_LIGHTNESS: Record<ThemeMode, Record<AccentStep, number>> = {
  light: { 50: 0.985, 100: 0.96, 200: 0.925, 300: 0.86, 400: 0.71, 500: 0.58, 600: 0.48, 700: 0.38, 800: 0.29, 900: 0.22, 950: 0.13 },
  dark: { 50: 0.97, 100: 0.93, 200: 0.87, 300: 0.78, 400: 0.68, 500: 0.57, 600: 0.46, 700: 0.35, 800: 0.26, 900: 0.19, 950: 0.14 },
};

/** Near-neutral ramp carrying only a trace of the accent's hue — the
 *  surfaces, borders and body text of the whole console. Replaces the
 *  earlier "neutral IS the accent ramp" collapse, which at full chroma
 *  rendered body text as e.g. #3b0001 (maroon) and the page pink whenever
 *  a warm accent was picked. Chroma is capped, not zeroed, so the UI still
 *  reads as one temperature-coherent family rather than gray-on-color. */
export function generateNeutralScale(hex: string, mode: ThemeMode = "light"): Record<AccentStep, string> {
  const { c, h } = hexToOklch(hex);
  const chroma = Math.min(c, NEUTRAL_CHROMA_CAP);
  const lightness = NEUTRAL_LIGHTNESS[mode];
  const out = {} as Record<AccentStep, string>;
  for (const step of ACCENT_STEPS) {
    out[step] = oklchToHex(lightness[step], chroma * NEUTRAL_CHROMA_FACTOR[step], h);
  }
  return out;
}

export function isValidHex(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

/** Relative luminance-based pick of black/white foreground for a given bg. */
export function contrastFg(hex: string): "#0a0a0a" | "#fafafa" {
  const { l } = hexToOklch(hex);
  return l > 0.62 ? "#0a0a0a" : "#fafafa";
}

const TONE_STEP_ORDER: AccentStep[] = [...ACCENT_STEPS];

/** Given an 11-step scale and the chosen background hex, pick readable
 *  text/border tones from that SAME scale — never a new hue, just farther
 *  or nearer steps along the one ramp, in whichever direction contrasts
 *  with the background's actual lightness. Shared by ThemeContext (the
 *  live "Custom" accent mode) and the Theme Lab prototype it was first
 *  built for, so the two stay in sync by construction. */
export function deriveTonalText(
  scale: Record<AccentStep, string>,
  bgHex: string,
): { text: string; textMuted: string; textFaint: string; border: string; borderStrong: string } {
  const { l } = hexToOklch(bgHex);
  const isLight = l > 0.55;
  const order = isLight ? [...TONE_STEP_ORDER].reverse() : TONE_STEP_ORDER; // darkest-first on a light bg, lightest-first on a dark bg
  return {
    text: scale[order[0]],
    textMuted: scale[order[3]],
    textFaint: scale[order[5]],
    border: scale[order[1]],
    borderStrong: scale[order[2]],
  };
}
