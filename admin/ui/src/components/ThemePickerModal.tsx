import { useId, useState } from "react";
import { Check, Pencil, ArrowLeft, Download } from "lucide-react";
import clsx from "clsx";
import { Modal } from "./Modal";
import { Button, IconButton } from "./Button";
import { TextInput, FieldShell, CONTROL_CLASS } from "./Field";
import { useTheme } from "../theme/ThemeContext";
import type { ThemePreset } from "../theme/presets";

type ColorField = {
  key: keyof Pick<
    ThemePreset,
    "canvas" | "surface" | "border" | "borderStrong" | "text" | "textMuted" | "textFaint" | "accent" | "success" | "warning" | "danger" | "info"
  >;
  label: string;
};

const COLOR_FIELDS: ColorField[] = [
  { key: "canvas", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "border", label: "Border" },
  { key: "borderStrong", label: "Border (strong)" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Text (muted)" },
  { key: "textFaint", label: "Text (faint)" },
  { key: "accent", label: "Accent" },
  { key: "success", label: "Success" },
  { key: "warning", label: "Warning" },
  { key: "danger", label: "Danger" },
  { key: "info", label: "Info" },
];

function downloadPresetJson(preset: ThemePreset): void {
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "theme"}.theme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A text input for a color value, with a native color-picker swatch
 *  embedded in its left edge — clicking the swatch opens the OS/browser
 *  picker, typing the code directly still works exactly as before (the
 *  picker is an optional shortcut, not a replacement). `<input
 *  type="color">` only ever understands 6-digit hex, so a value it
 *  can't parse (border/borderStrong on a dark preset are `rgba(...)`,
 *  by design — see presets.ts) falls the SWATCH back to black without
 *  touching the actual typed value at all; picking a new color from it
 *  always writes back a real hex the swatch can then represent. */
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const fieldId = useId();
  const isPickerCompatible = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FieldShell label={label} htmlFor={fieldId}>
      <div className="relative">
        <input
          type="color"
          value={isPickerCompatible ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Pick a color for ${label}`}
          className="absolute left-1.5 top-1/2 h-5 w-5 -translate-y-1/2 cursor-pointer appearance-none rounded border border-black/10 bg-transparent p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:rounded [&::-webkit-color-swatch-wrapper]:p-0"
        />
        <input
          id={fieldId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(CONTROL_CLASS, "h-8 pl-8 font-mono text-[12px]")}
        />
      </div>
    </FieldShell>
  );
}

/** A preset's own literal colors, rendered as a self-contained mini
 *  mockup — deliberately inline styles, never the app's live --canvas/
 *  --accent/... CSS vars, so every card always shows ITS OWN theme
 *  regardless of whichever theme happens to be applied right now. */
function ThemeSwatch({ preset }: { preset: ThemePreset }) {
  return (
    <div
      className="h-16 w-full overflow-hidden rounded-md border border-black/10"
      style={{ background: preset.canvas }}
    >
      <div className="h-5 w-full" style={{ background: preset.surface }} />
      <div className="flex items-center gap-1.5 px-2 py-2">
        {([preset.accent, preset.success, preset.warning, preset.danger, preset.info] as const).map((c, i) => (
          <span key={i} className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function ThemeCard({
  preset,
  isCommitted,
  isShowing,
  onPick,
  onImprovise,
}: {
  preset: ThemePreset;
  isCommitted: boolean;
  isShowing: boolean;
  onPick: () => void;
  onImprovise: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      className={clsx(
        "group relative cursor-pointer rounded-lg border p-2.5 text-left transition-colors",
        isShowing ? "border-accent-500 ring-1 ring-accent-500" : "border-border-strong hover:border-text-faint",
      )}
    >
      <ThemeSwatch preset={preset} />
      <div className="mt-2 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{preset.name}</span>
        {isCommitted && <Check size={14} className="shrink-0 text-accent-600 dark:text-accent-300" />}
      </div>
      <IconButton
        label={`Improvise from ${preset.name}`}
        icon={<Pencil size={13} />}
        onClick={(e) => {
          e.stopPropagation();
          onImprovise();
        }}
        className="absolute right-1.5 top-1.5 h-6 w-6 bg-surface/90 opacity-0 backdrop-blur-sm group-hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}

function draftFrom(base: ThemePreset, isOwnCustomPreset: boolean): ThemePreset {
  // Improvising a BUILT-IN starts the name blank — the whole point is
  // "this becomes a NEW theme," never a silent overwrite of the base
  // (see presets.ts). Improvising your OWN already-saved custom theme
  // pre-fills its own name instead, since re-saving under that exact
  // name is exactly how you refine it further — see addCustomPreset's
  // `editingName` for the other half of this.
  return { ...base, name: isOwnCustomPreset ? base.name : "" };
}

interface ThemePickerModalProps {
  open: boolean;
  onClose: () => void;
}

export function ThemePickerModal({ open, onClose }: ThemePickerModalProps) {
  const { presetName, presets, setPresetName, previewPreset, previewedPresetName, addCustomPreset, isCustomPresetName } =
    useTheme();
  const [draft, setDraft] = useState<ThemePreset | null>(null);
  // The ORIGINAL name of the custom preset being improvised, if Improvise
  // was opened from one of this browser's own saved themes rather than a
  // built-in — null means "this can only ever create something new."
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  if (!open) return null;

  // Whatever's currently applied to the real app: the live preview if
  // one's active, otherwise the committed theme itself.
  const shownName = previewedPresetName ?? presetName;

  const handleClose = () => {
    previewPreset(null); // discard any unsaved live preview — "re-apply existing theme"
    setDraft(null);
    setEditingName(null);
    setDraftError(null);
    onClose();
  };

  const handlePick = (preset: ThemePreset) => {
    previewPreset(preset); // apply live — NOT persisted until Save
  };

  const handleImprovise = (preset: ThemePreset) => {
    const own = isCustomPresetName(preset.name);
    setDraft(draftFrom(preset, own));
    setEditingName(own ? preset.name : null);
    setDraftError(null);
    previewPreset(preset);
  };

  const handleBackFromImprovise = () => {
    setDraft(null);
    setEditingName(null);
    setDraftError(null);
    previewPreset(null);
  };

  const handleDraftChange = (key: ColorField["key"], value: string) => {
    if (!draft) return;
    const next = { ...draft, [key]: value };
    setDraft(next);
    previewPreset(next);
  };

  const handleDraftNameChange = (value: string) => {
    if (!draft) return;
    setDraft({ ...draft, name: value });
    setDraftError(null);
  };

  const handleSaveDraft = () => {
    if (!draft) return;
    const result = addCustomPreset(draft, editingName); // adds/updates AND selects it, atomically
    if (!result.ok) {
      setDraftError(result.error);
      return;
    }
    downloadPresetJson({ ...draft, name: draft.name.trim() });
    setDraft(null);
    setEditingName(null);
    setDraftError(null);
    onClose();
  };

  const handleSaveSelection = () => {
    setPresetName(shownName);
    onClose();
  };

  const hasUnsavedSelection = shownName !== presetName;

  if (draft) {
    const draftName = draft.name.trim();
    const isUpdatingInPlace = editingName != null && draftName === editingName;
    return (
      <Modal
        title={isUpdatingInPlace ? `Editing ${editingName}` : `Improvise from ${editingName ?? (draft.name || "…")}`}
        subtitle={
          editingName != null
            ? "Keep the name to update this theme, or change it to save a separate new one."
            : "Pick colors, then save this as its own new theme — the original stays untouched."
        }
        onClose={handleClose}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={handleBackFromImprovise}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button variant="primary" onClick={handleSaveDraft} disabled={!draftName}>
              <Download size={14} /> {isUpdatingInPlace ? "Save Changes" : "Save as New Theme"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextInput
            label="Theme name"
            required
            value={draft.name}
            onChange={(e) => handleDraftNameChange(e.target.value)}
            error={draftError ?? undefined}
            placeholder="e.g. Sunset Ridge"
            autoFocus
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <ColorInput
                key={field.key}
                label={field.label}
                value={draft[field.key]}
                onChange={(v) => handleDraftChange(field.key, v)}
              />
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Choose a theme"
      subtitle="Click a theme to preview it, then Save to keep it."
      onClose={handleClose}
      size="lg"
      scrollBody={false}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveSelection} disabled={!hasUnsavedSelection}>
            Save
          </Button>
        </>
      }
    >
      <div className="scrollbar-thin grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
        {presets.map((preset) => (
          <ThemeCard
            key={preset.name}
            preset={preset}
            isCommitted={preset.name === presetName}
            isShowing={preset.name === shownName}
            onPick={() => handlePick(preset)}
            onImprovise={() => handleImprovise(preset)}
          />
        ))}
      </div>
    </Modal>
  );
}
