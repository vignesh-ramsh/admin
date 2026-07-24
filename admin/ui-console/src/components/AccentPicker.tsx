import { useEffect, useRef, useState } from "react";
import { Check, Palette, Sun, Moon, Square, Ban } from "lucide-react";
import clsx from "clsx";
import {
  useTheme,
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  LIGHT_BG_PRESETS,
  DARK_BG_PRESETS,
  LIGHT_SURFACE_PRESETS,
  DARK_SURFACE_PRESETS,
} from "../theme/ThemeContext";
import { isValidHex } from "../lib/color";

function Swatch({
  hex,
  selected,
  onClick,
  size = "md",
  label,
}: {
  hex: string;
  selected: boolean;
  onClick: () => void;
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110",
        size === "md" ? "h-6 w-6" : "h-5 w-5",
        selected ? "border-accent-500 ring-1 ring-accent-500" : "border-black/15",
      )}
      style={{ background: hex }}
    >
      {selected && <Check size={size === "md" ? 12 : 10} className="text-white drop-shadow" />}
    </button>
  );
}

function AutoSwatch({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Auto (derived from background)"
      title="Auto — derive from background"
      onClick={onClick}
      className={clsx(
        "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed transition-transform hover:scale-110",
        selected ? "border-accent-500 text-accent-600" : "border-border-strong text-text-faint",
      )}
    >
      {selected ? <Check size={10} /> : <Ban size={10} />}
    </button>
  );
}

export function AccentPicker({ placement = "bottom" }: { placement?: "top" | "bottom" }) {
  const {
    mode,
    accent,
    setAccent,
    lightBg,
    darkBg,
    setLightBg,
    setDarkBg,
    surfaceLight,
    surfaceDark,
    setSurfaceLight,
    setSurfaceDark,
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [accentDraft, setAccentDraft] = useState(accent);
  const rootRef = useRef<HTMLDivElement>(null);

  const bg = mode === "dark" ? darkBg : lightBg;
  const setBg = mode === "dark" ? setDarkBg : setLightBg;
  const bgPresets = mode === "dark" ? DARK_BG_PRESETS : LIGHT_BG_PRESETS;

  const surface = mode === "dark" ? surfaceDark : surfaceLight;
  const setSurface = mode === "dark" ? setSurfaceDark : setSurfaceLight;
  const surfacePresets = mode === "dark" ? DARK_SURFACE_PRESETS : LIGHT_SURFACE_PRESETS;

  const [bgDraft, setBgDraft] = useState(bg);
  const [surfaceDraft, setSurfaceDraft] = useState(surface ?? bg);

  useEffect(() => setAccentDraft(accent), [accent]);
  useEffect(() => setBgDraft(bg), [bg]);
  useEffect(() => setSurfaceDraft(surface ?? bg), [surface, bg]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme colors"
        title="Theme colors"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: accent }} />
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
            {ACCENT_PRESETS.map((hex) => (
              <Swatch key={hex} hex={hex} label={hex} selected={hex.toLowerCase() === accent.toLowerCase()} onClick={() => setAccent(hex)} />
            ))}
          </div>
          <div className="flex items-center gap-2">
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
          {accent.toLowerCase() !== DEFAULT_ACCENT.toLowerCase() && (
            <button type="button" onClick={() => setAccent(DEFAULT_ACCENT)} className="mt-2 cursor-pointer text-[12px] text-text-faint hover:text-text-muted">
              Reset accent
            </button>
          )}

          <div className="my-3 border-t border-border" />

          {/* Background (canvas) — mode-aware, same control shape in light and dark. */}
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-text">
            {mode === "dark" ? <Moon size={13} /> : <Sun size={13} />} Background color
          </p>
          <div className="flex items-center gap-1.5">
            {bgPresets.map((hex) => (
              <Swatch key={hex} hex={hex} size="sm" label={hex} selected={bg.toLowerCase() === hex.toLowerCase()} onClick={() => setBg(hex)} />
            ))}
            <input
              type="color"
              value={isValidHex(bgDraft) ? bgDraft : bg}
              onChange={(e) => {
                setBgDraft(e.target.value);
                setBg(e.target.value);
              }}
              aria-label="Custom background color"
              className="ml-auto h-6 w-7 cursor-pointer rounded border border-border-strong bg-transparent p-0.5"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">The page canvas behind every panel.</p>

          <div className="my-3 border-t border-border" />

          {/* Panel/surface — sidebar, cards, tables. Independent of canvas. */}
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-text">
            <Square size={12} /> Panel color
          </p>
          <div className="flex items-center gap-1.5">
            <AutoSwatch selected={surface === null} onClick={() => setSurface(null)} />
            {surfacePresets.map((hex) => (
              <Swatch key={hex} hex={hex} size="sm" label={hex} selected={surface !== null && surface.toLowerCase() === hex.toLowerCase()} onClick={() => setSurface(hex)} />
            ))}
            <input
              type="color"
              value={isValidHex(surfaceDraft) ? surfaceDraft : bg}
              onChange={(e) => {
                setSurfaceDraft(e.target.value);
                setSurface(e.target.value);
              }}
              aria-label="Custom panel color"
              className="ml-auto h-6 w-7 cursor-pointer rounded border border-border-strong bg-transparent p-0.5"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">Sidebar, cards, and table backgrounds.</p>
        </div>
      )}
    </div>
  );
}
