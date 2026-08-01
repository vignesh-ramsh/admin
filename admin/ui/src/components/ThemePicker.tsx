import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import clsx from "clsx";
import { useTheme } from "../theme/ThemeContext";

/** Sidebar-footer theme picker — replaces the old light/dark toggle now
 *  that a "theme" is a whole named preset, not a mode. A trigger button
 *  opens a small popover listing every preset (theme/presets.ts) as a
 *  swatch + name; picking one calls setPresetName and closes. */
export function ThemePicker() {
  const { presetName, presets, setPresetName } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        aria-label="Change theme"
        title="Change theme"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface text-text-muted transition-colors hover:bg-neutral-100 hover:text-text dark:hover:bg-neutral-800"
      >
        <Palette size={15} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-lg border border-border-strong bg-surface p-1.5 shadow-lg">
          {presets.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setPresetName(p.name);
                setOpen(false);
              }}
              className={clsx(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800",
                p.name === presetName && "bg-accent-50 dark:bg-accent-950/50",
              )}
            >
              <span
                className="h-5 w-5 shrink-0 overflow-hidden rounded-full border border-black/10"
                style={{ background: p.canvas }}
              >
                <span className="block h-full w-1/2" style={{ background: p.accent }} />
              </span>
              <span className="flex-1 truncate font-medium text-text">{p.name}</span>
              {p.name === presetName && <Check size={14} className="shrink-0 text-accent-600 dark:text-accent-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
