import { useMemo } from "react";
import { toneAtLightness } from "../lib/color";

const GRADIENT_SAMPLES = 24;

/** Continuous tone picker: drag anywhere along one hue's own lightness
 *  range (2-98%), not just fixed stops. The gradient track is sampled
 *  live from toneAtLightness so it always matches the current accent.
 *  Shared by the live AccentPicker and the Theme Lab prototype it was
 *  first built for. */
export function ToneSlider({
  accentHex,
  valuePercent,
  onChange,
  ariaLabel = "Tone lightness",
  chromaCap,
}: {
  accentHex: string;
  valuePercent: number;
  onChange: (percent: number) => void;
  ariaLabel?: string;
  /** Clamp the previewed chroma — pass this wherever the slider drives a
   *  surface (canvas, panel), which the theme renders at neutral chroma,
   *  so the track shows the tone the user will actually get rather than a
   *  saturated version of it. */
  chromaCap?: number;
}) {
  const gradient = useMemo(() => {
    const stops: string[] = [];
    for (let i = 0; i <= GRADIENT_SAMPLES; i++) {
      const pct = (i / GRADIENT_SAMPLES) * 100;
      const lightness = 2 + (pct / 100) * 96;
      stops.push(`${toneAtLightness(accentHex, lightness, chromaCap)} ${pct}%`);
    }
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }, [accentHex, chromaCap]);

  return (
    <div className="relative h-8 w-full overflow-hidden rounded-md border border-border-strong" style={{ backgroundImage: gradient }}>
      <input
        type="range"
        min={2}
        max={98}
        step={0.5}
        value={valuePercent}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className="tone-slider absolute inset-0 h-8 w-full cursor-pointer"
      />
    </div>
  );
}
