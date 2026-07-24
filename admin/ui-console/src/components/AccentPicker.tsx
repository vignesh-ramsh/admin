import { useEffect, useRef, useState } from "react";
import { Check, Palette, Sparkles, RotateCcw, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useTheme, ACCENT_PRESETS, type ComputedKey } from "../theme/ThemeContext";
import { isValidHex, hexToOklch, toneAtLightness } from "../lib/color";
import { ToneSlider } from "./ToneSlider";

const COMPUTED_ROWS: { key: ComputedKey; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Muted text" },
  { key: "textFaint", label: "Faint text" },
  { key: "border", label: "Border" },
  { key: "borderStrong", label: "Border (strong)" },
];

function Swatch({ hex, selected, onClick, label }: { hex: string; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110",
        selected ? "border-accent-500 ring-1 ring-accent-500" : "border-black/15",
      )}
      style={{ background: hex }}
    >
      {selected && <Check size={12} className="text-white drop-shadow" />}
    </button>
  );
}

/** One overridable computed value: a swatch that expands an inline
 *  slider + hex input + reset-to-auto when clicked ("clicking the color
 *  pops up the picker/slider" — an inline accordion reveal rather than a
 *  second floating popover nested inside this one). */
function ComputedRow({ label, autoHex, overrideHex, accentHex, onChange, onReset }: {
  label: string;
  autoHex: string;
  overrideHex: string | undefined;
  accentHex: string;
  onChange: (hex: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = overrideHex ?? autoHex;
  const currentLightness = isValidHex(current) ? Math.round(hexToOklch(current).l * 100) : 50;

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left"
      >
        <ChevronRight size={12} className={clsx("shrink-0 text-text-faint transition-transform", open && "rotate-90")} />
        <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ background: current }} />
        <span className="flex-1 text-[12.5px] text-text">{label}</span>
        {overrideHex && <span className="text-[10px] font-medium text-accent-600 dark:text-accent-400">custom</span>}
        <span className="font-mono text-[11px] text-text-faint">{current}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border px-2.5 py-2.5">
          <ToneSlider accentHex={accentHex} valuePercent={currentLightness} onChange={(pct) => onChange(toneAtLightness(accentHex, pct))} ariaLabel={`${label} tone`} />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={isValidHex(current) ? current : autoHex}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 w-8 cursor-pointer rounded border border-border-strong bg-transparent p-0.5"
            />
            <input
              value={current}
              onChange={(e) => {
                if (isValidHex(e.target.value)) onChange(e.target.value);
              }}
              spellCheck={false}
              className="h-7 flex-1 rounded border border-border-strong bg-surface px-2 font-mono text-[11px] text-text outline-none focus:border-accent-500"
            />
            {overrideHex && (
              <button type="button" onClick={onReset} title="Reset to auto" aria-label="Reset to auto" className="cursor-pointer rounded p-1 text-text-faint hover:text-text">
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AccentPicker({ placement = "bottom" }: { placement?: "top" | "bottom" }) {
  const {
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
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [accentDraft, setAccentDraft] = useState(accent);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setAccentDraft(accent), [accent]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const swatchHex = accentMode === "default" ? resolved.accentScale[600] : accent;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme colors"
        title="Theme colors"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: swatchHex }} />
      </button>
      {open && (
        <div
          className={clsx(
            "scrollbar-thin absolute left-0 z-50 max-h-[80vh] w-72 overflow-y-auto rounded-lg border border-border bg-surface-raised p-3.5 shadow-lg shadow-black/20",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {/* Accent */}
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-text">
            <Palette size={14} /> Accent color
          </p>
          <div className="mb-2.5 grid grid-cols-8 gap-1.5">
            <button
              type="button"
              onClick={useDefaultAccent}
              aria-label="Default (admin-desk)"
              title="Default — admin-desk's own colors, unchanged"
              className={clsx(
                "relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110",
                accentMode === "default" ? "border-accent-500 ring-1 ring-accent-500" : "border-black/15",
              )}
              style={{ background: "conic-gradient(from 180deg, #3F7343, #7ED4A4, #3F7343)" }}
            >
              {accentMode === "default" ? <Check size={12} className="text-white drop-shadow" /> : <Sparkles size={10} className="text-white drop-shadow" />}
            </button>
            {ACCENT_PRESETS.map((hex) => (
              <Swatch key={hex} hex={hex} label={hex} selected={accentMode === "custom" && hex.toLowerCase() === accent.toLowerCase()} onClick={() => setAccent(hex)} />
            ))}
          </div>

          {accentMode === "default" ? (
            <p className="mb-2 rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-text-faint">
              Using admin-desk's original light &amp; dark palette, unchanged.{" "}
              <button type="button" onClick={switchToCustomFromDefault} className="cursor-pointer font-medium text-accent-600 underline underline-offset-2 dark:text-accent-400">
                Customize from here
              </button>
            </p>
          ) : (
            <div className="mb-2 flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(accentDraft) ? accentDraft : accent}
                onChange={(e) => {
                  setAccentDraft(e.target.value);
                  setAccent(e.target.value);
                }}
                className="h-8 w-9 cursor-pointer rounded border border-border-strong bg-transparent p-0.5"
              />
              <input
                value={accentDraft}
                onChange={(e) => {
                  setAccentDraft(e.target.value);
                  if (isValidHex(e.target.value)) setAccent(e.target.value);
                }}
                placeholder="#4f46e5"
                spellCheck={false}
                className="h-8 flex-1 rounded-md border border-border-strong bg-surface px-2 font-mono text-[13px] text-text outline-none focus:border-accent-500"
              />
            </div>
          )}

          <div className="my-3 border-t border-border" />

          {/* Background / Panel tone — continuous sliders, custom mode only */}
          <fieldset disabled={accentMode === "default"} className={clsx(accentMode === "default" && "pointer-events-none opacity-40")}>
            <div className="mb-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-text">Background tone</p>
                <span className="font-mono text-[11px] text-text-faint">{bgLightness.toFixed(1)}%</span>
              </div>
              <ToneSlider accentHex={accent} valuePercent={bgLightness} onChange={setBgLightness} ariaLabel="Background tone" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[13px] font-medium text-text">Panel tone</p>
                <span className="font-mono text-[11px] text-text-faint">{surfaceLightness.toFixed(1)}%</span>
              </div>
              <ToneSlider accentHex={accent} valuePercent={surfaceLightness} onChange={setSurfaceLightness} ariaLabel="Panel tone" />
            </div>
          </fieldset>
          <p className="mt-1.5 text-[11px] text-text-faint">
            {accentMode === "default"
              ? "Background & panel follow admin-desk's own values while Default is selected."
              : "Drag anywhere along the accent's own scale — sidebar, cards, and table backgrounds."}
          </p>

          <div className="my-3 border-t border-border" />

          {/* Computed values — click any row to override just that one value. */}
          <p className="mb-2 text-[13px] font-medium text-text">Computed values</p>
          <div className="flex flex-col gap-1.5">
            {COMPUTED_ROWS.map((row) => (
              <ComputedRow
                key={row.key}
                label={row.label}
                autoHex={resolved[row.key]}
                overrideHex={overrides[row.key]}
                accentHex={accent}
                onChange={(hex) => setOverride(row.key, hex)}
                onReset={() => setOverride(row.key, null)}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">Overrides apply on top of Default or Custom, and are remembered until you clear them.</p>
        </div>
      )}
    </div>
  );
}
