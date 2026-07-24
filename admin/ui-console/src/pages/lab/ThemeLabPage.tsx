import { useMemo, useState, type CSSProperties } from "react";
import { FlaskConical, Moon, RotateCcw, Sun } from "lucide-react";
import clsx from "clsx";
import { generateAccentScale, isValidHex, toneAtLightness, deriveTonalText, ACCENT_STEPS, type AccentStep } from "../../lib/color";
import { ACCENT_PRESETS, DEFAULT_ACCENT } from "../../theme/ThemeContext";
import { PageHeader } from "../../components/PageHeader";
import { Button, IconButton } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/Table";
import { ToneSlider } from "../../components/ToneSlider";

/* ============================================================
   PROTOTYPE — not wired into the live theme system.

   Tests a different model than the shipped AccentPicker: instead of
   independent hue pickers for accent/background/panel, everything here
   comes from ONE hue (the accent). Background and Panel are each a
   LIGHTNESS position (0-100, continuous) along that single hue+chroma
   curve — never a second hue, and not limited to 11 discrete stops.
   Text/border tones are then auto-derived from whichever tone was picked
   for the background, so the whole UI reads as one tinted color family
   at every lightness.

   Why background/panel get a continuous slider but the accent swatches
   above them don't: the fixed 11-step table (src/lib/color.ts's
   generateAccentScale/ACCENT_STEPS) is what every real component's
   Tailwind classes are actually written against (`bg-accent-600`,
   `dark:bg-accent-950`, ...) — expanding THAT table would mean renaming
   classes throughout the app. Background/Panel aren't tied to any class
   name, they're just one hex assigned to --canvas/--surface, so they're
   free to use `toneAtLightness()` (same hue+chroma curve, interpolated
   continuously) instead of being boxed into those same 11 stops.

   Isolation: the preview pane below sets `--accent-*`/`--neutral-*`/
   `--canvas`/`--surface`/... and `data-theme` as INLINE STYLE on its own
   wrapper div, not on <html>. Every real component in this app (Button,
   Badge, DataTable, ...) reads those same custom properties via plain
   CSS var() — confirmed against the built CSS, no indirection — so
   descendants inside the wrapper pick up these LOCAL values through
   ordinary CSS inheritance while the rest of the app (including this
   page's own chrome) keeps using whatever the real ThemeContext has set
   on <html>. Nothing here touches ThemeContext, localStorage, or the
   document root. Delete this whole src/pages/lab/ directory (and its
   nav entry) any time with zero effect on the shipped app. */

type Mode = "light" | "dark";

// Lightness percentages matching the fixed scale's own 50/100 (light) and
// 900/950 (dark) anchors — just expressed continuously now.
const SUGGESTED: Record<Mode, { bg: number; surface: number }> = {
  light: { bg: 98, surface: 95.5 },
  dark: { bg: 22, surface: 32 },
};

// Semantic (success/warning/danger/info) colors stay fixed, same posture
// as the real app — only background/surface are accent-tone-driven.
// Backgrounds use alpha so they read correctly against ANY chosen surface
// tone without needing a color-mix computed against it.
const SEMANTIC: Record<Mode, { success: string; successBg: string; warning: string; warningBg: string; danger: string; dangerBg: string; info: string; infoBg: string }> = {
  light: {
    success: "#16a34a", successBg: "rgba(22,163,74,0.14)",
    warning: "#d97706", warningBg: "rgba(217,119,6,0.14)",
    danger: "#dc2626", dangerBg: "rgba(220,38,38,0.14)",
    info: "#2563eb", infoBg: "rgba(37,99,235,0.14)",
  },
  dark: {
    success: "#4ade80", successBg: "rgba(74,222,128,0.16)",
    warning: "#fbbf24", warningBg: "rgba(251,191,36,0.16)",
    danger: "#f87171", dangerBg: "rgba(248,113,113,0.16)",
    info: "#60a5fa", infoBg: "rgba(96,165,250,0.16)",
  },
};

function buildPreviewVars(
  accentHex: string,
  scale: Record<AccentStep, string>,
  bgLightness: number,
  surfaceLightness: number,
  mode: Mode,
): CSSProperties {
  const canvas = toneAtLightness(accentHex, bgLightness);
  const surface = toneAtLightness(accentHex, surfaceLightness);
  const auto = deriveTonalText(scale, canvas);
  const semantic = SEMANTIC[mode];

  const vars: Record<string, string> = {};
  for (const step of ACCENT_STEPS) {
    vars[`--accent-${step}`] = scale[step];
    // Neutral ramp = the accent ramp itself — no second, desaturated hue.
    vars[`--neutral-${step}`] = scale[step];
  }
  vars["--canvas"] = canvas;
  vars["--surface"] = surface;
  vars["--surface-raised"] = surface;
  vars["--border"] = auto.border;
  vars["--border-strong"] = auto.borderStrong;
  vars["--text"] = auto.text;
  vars["--text-muted"] = auto.textMuted;
  vars["--text-faint"] = auto.textFaint;
  vars["--success"] = semantic.success;
  vars["--success-bg"] = semantic.successBg;
  vars["--warning"] = semantic.warning;
  vars["--warning-bg"] = semantic.warningBg;
  vars["--danger"] = semantic.danger;
  vars["--danger-bg"] = semantic.dangerBg;
  vars["--info"] = semantic.info;
  vars["--info-bg"] = semantic.infoBg;
  return vars as CSSProperties;
}


interface MockRow {
  id: string;
  name: string;
  status: string;
  updated: string;
}

const MOCK_ROWS: MockRow[] = [
  { id: "1", name: "employee_id", status: "Active", updated: "2 min ago" },
  { id: "2", name: "department", status: "Active", updated: "1 hr ago" },
  { id: "3", name: "designation", status: "Inactive", updated: "yesterday" },
];

const MOCK_COLUMNS: Column<MockRow>[] = [
  { key: "name", header: "Field", render: (r) => r.name, mono: true },
  { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "Active" ? "success" : "neutral"}>{r.status}</Badge> },
  { key: "updated", header: "Updated", render: (r) => r.updated, align: "right" },
];

export function ThemeLabPage() {
  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT);
  const accent = isValidHex(accentDraft) ? accentDraft : DEFAULT_ACCENT;
  const [mode, setMode] = useState<Mode>("dark");
  const [bgLightness, setBgLightness] = useState<number>(SUGGESTED.dark.bg);
  const [surfaceLightness, setSurfaceLightness] = useState<number>(SUGGESTED.dark.surface);

  const scale = useMemo(() => generateAccentScale(accent), [accent]);
  const canvasHex = useMemo(() => toneAtLightness(accent, bgLightness), [accent, bgLightness]);
  const surfaceHex = useMemo(() => toneAtLightness(accent, surfaceLightness), [accent, surfaceLightness]);
  const auto = useMemo(() => deriveTonalText(scale, canvasHex), [scale, canvasHex]);
  const previewVars = useMemo(
    () => buildPreviewVars(accent, scale, bgLightness, surfaceLightness, mode),
    [accent, scale, bgLightness, surfaceLightness, mode],
  );

  const applyMode = (next: Mode) => {
    setMode(next);
    setBgLightness(SUGGESTED[next].bg);
    setSurfaceLightness(SUGGESTED[next].surface);
  };

  const resetTones = () => {
    setBgLightness(SUGGESTED[mode].bg);
    setSurfaceLightness(SUGGESTED[mode].surface);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Theme Lab"
        description="Prototype — pick one accent, then drag a tone along its own scale. Background & panel are continuous positions on the accent's hue, never a separate color. Isolated: nothing here touches the live theme."
        actions={
          <Badge tone="accent">
            <FlaskConical size={11} /> Prototype
          </Badge>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* Controls — ordinary page chrome, reads the REAL global theme like any other page. */}
        <div className="scrollbar-thin flex flex-col gap-5 overflow-y-auto rounded-lg border border-border bg-surface p-4">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-text">1. Accent color</p>
            <div className="mb-2.5 grid grid-cols-8 gap-1.5">
              {ACCENT_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  onClick={() => setAccentDraft(hex)}
                  className={clsx(
                    "h-6 w-6 cursor-pointer rounded-full border transition-transform hover:scale-110",
                    hex.toLowerCase() === accent.toLowerCase() ? "border-accent-500 ring-1 ring-accent-500" : "border-black/15",
                  )}
                  style={{ background: hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccentDraft(e.target.value)}
                className="h-8 w-9 cursor-pointer rounded border border-border-strong bg-transparent p-0.5"
              />
              <input
                value={accentDraft}
                onChange={(e) => setAccentDraft(e.target.value)}
                placeholder="#dc2626"
                spellCheck={false}
                className="h-8 flex-1 rounded-md border border-border-strong bg-surface px-2 font-mono text-[13px] text-text outline-none focus:border-accent-500"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-[13px] font-semibold text-text">2. Mode</p>
            <div className="flex gap-2">
              <Button variant={mode === "light" ? "primary" : "secondary"} size="sm" icon={<Sun size={14} />} onClick={() => applyMode("light")} className="flex-1">
                Light
              </Button>
              <Button variant={mode === "dark" ? "primary" : "secondary"} size="sm" icon={<Moon size={14} />} onClick={() => applyMode("dark")} className="flex-1">
                Dark
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-text">3. Background tone</p>
              <span className="font-mono text-[11px] text-text-faint">{bgLightness.toFixed(1)}% L</span>
            </div>
            <ToneSlider accentHex={accent} valuePercent={bgLightness} onChange={setBgLightness} />
            <p className="mt-1.5 text-[11px] text-text-faint">The page canvas — drag anywhere on the accent's own scale, not just fixed stops.</p>
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-text">4. Panel tone</p>
              <span className="font-mono text-[11px] text-text-faint">{surfaceLightness.toFixed(1)}% L</span>
            </div>
            <ToneSlider accentHex={accent} valuePercent={surfaceLightness} onChange={setSurfaceLightness} />
            <p className="mt-1.5 text-[11px] text-text-faint">Sidebar, cards, and table backgrounds.</p>
          </div>

          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={resetTones}>
            Reset to suggested {mode} tones
          </Button>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-[13px] font-semibold text-text">Computed values</p>
            <dl className="flex flex-col gap-1 font-mono text-[11px]">
              {[
                ["canvas", canvasHex],
                ["surface", surfaceHex],
                ["border", auto.border],
                ["text", auto.text],
                ["text-muted", auto.textMuted],
                ["accent-600", scale[600]],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <dt className="text-text-faint">{k}</dt>
                  <dd className="flex items-center gap-1.5 text-text">
                    <span className="h-3 w-3 rounded-sm border border-black/10" style={{ background: v }} />
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Isolated live preview — everything below this line resolves its
            colors against the inline vars set on THIS wrapper, not <html>. */}
        <div className="min-h-[560px] overflow-hidden rounded-lg border border-border-strong">
          <div data-theme={mode} style={previewVars} className="flex h-full min-h-[560px]">
            <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface p-3">
              <div className="mb-4 flex items-center gap-2 px-1 py-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-white">
                  <FlaskConical size={15} />
                </div>
                <span className="text-[14px] font-semibold text-text">Preview</span>
              </div>
              <nav className="flex flex-col gap-0.5">
                {["Health", "Data Browser", "Users", "Settings"].map((label, i) => (
                  <span
                    key={label}
                    className={clsx(
                      "cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] font-medium",
                      i === 0
                        ? "bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"
                        : "text-text-muted hover:bg-neutral-100 hover:text-text dark:hover:bg-neutral-800",
                    )}
                  >
                    {label}
                  </span>
                ))}
              </nav>
              <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-700 dark:bg-accent-900 dark:text-accent-300">
                  VP
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-text">Preview User</p>
                  <p className="truncate text-[11px] text-text-faint">user@example.com</p>
                </div>
              </div>
            </aside>

            <main className="scrollbar-thin flex-1 overflow-y-auto bg-canvas p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text">Mock panel</h2>
                  <p className="text-sm text-text-muted">Demonstrates text hierarchy, badges, buttons, and a table on these tones.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">
                    Secondary
                  </Button>
                  <Button variant="primary" size="sm">
                    Primary action
                  </Button>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-border bg-surface p-4">
                <p className="mb-1 text-sm text-text">Primary text sits at full contrast against the panel.</p>
                <p className="mb-1 text-sm text-text-muted">Muted text is the secondary read — descriptions, labels.</p>
                <p className="mb-3 text-sm text-text-faint">Faint text is the quietest tone — hints, placeholders.</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">Neutral</Badge>
                  <Badge tone="accent">Accent</Badge>
                  <Badge tone="success">Success</Badge>
                  <Badge tone="warning">Warning</Badge>
                  <Badge tone="danger">Danger</Badge>
                  <Badge tone="info">Info</Badge>
                  <IconButton label="Sample icon button" icon={<Sun size={14} />} />
                </div>
              </div>

              <DataTable columns={MOCK_COLUMNS} rows={MOCK_ROWS} rowKey={(r) => r.id} emptyLabel="No rows." />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
