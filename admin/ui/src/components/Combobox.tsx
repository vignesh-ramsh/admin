import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { CONTROL_HEIGHT, FieldShell, type ControlSize } from "./Field";

export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
}

export function Combobox({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  query,
  onQueryChange,
  loading,
  placeholder = "Select…",
  clearable,
  size = "md",
}: {
  label?: string;
  hint?: string;
  error?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboOption[];
  query: string;
  onQueryChange: (q: string) => void;
  loading?: boolean;
  placeholder?: string;
  clearable?: boolean;
  /** Matches TextInput/Select's own `size` — shares the identical
   *  CONTROL_HEIGHT value so a Combobox sitting in the same row as a
   *  "sm" TextInput/Select (e.g. a REFERENCE field's target-table
   *  picker next to the Name/Type columns) can never end up a few
   *  pixels taller than its neighbors the way a separately-authored
   *  "h-9" here once did. */
  size?: ControlSize;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const selected = options.find((o) => o.value === value);

  // Rendered through a portal (below) rather than as a normal absolutely-
  // positioned child, so its own position is tracked separately here —
  // `position: fixed` needs real viewport coordinates, not "relative to
  // rootRef". Recomputed on open and kept in sync with scrolling/resizing
  // anywhere in the page (capture:true so a scroll on an ANCESTOR, like a
  // Modal's own scrollable body, is caught too, not just window-level
  // scrolling) — otherwise the panel would visually detach from its input
  // the instant the page underneath it moved.
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const update = () => {
      const r = rootRef.current!.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error}>
      <div
        ref={rootRef}
        className="relative"
        onKeyDownCapture={(e) => {
          // Capture phase, on the root — see MultiCombobox's identical
          // handler for why this can't just live on the input's own
          // onKeyDown: focus can land on an option button inside the
          // portaled dropdown, and only the root sees every keypress
          // regardless of which descendant currently has focus.
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <div
          className={clsx(
            "flex cursor-text items-center gap-1.5 overflow-hidden rounded-md border bg-surface text-sm transition-colors focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25",
            size === "sm" ? "h-8 px-2" : "h-9 px-2.5",
            error ? "border-danger" : "border-border-strong",
          )}
          style={{ height: CONTROL_HEIGHT[size] }}
          onClick={() => {
            setOpen(true);
            document.getElementById(fieldId)?.focus();
          }}
        >
          <input
            id={fieldId}
            value={open ? query : (selected?.label ?? query)}
            placeholder={selected ? selected.label : placeholder}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setOpen(true);
              setActiveIdx(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const opt = options[activeIdx];
                if (opt) {
                  onChange(opt.value);
                  onQueryChange("");
                  setOpen(false);
                }
              }
              // Escape is handled by the root's onKeyDownCapture below.
            }}
            className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-faint"
            autoComplete="off"
          />
          {loading && <Loader2 size={14} className="animate-spin text-text-faint" />}
          {clearable && value && (
            <button
              type="button"
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                onQueryChange("");
              }}
              className="cursor-pointer text-text-faint hover:text-text"
            >
              ×
            </button>
          )}
          <ChevronsUpDown size={14} className="shrink-0 text-text-faint" />
        </div>
        {open &&
          rect &&
          createPortal(
            <div
              ref={panelRef}
              className="scrollbar-thin fixed z-[60] mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/10"
              style={{ top: rect.top, left: rect.left, width: rect.width }}
            >
              {options.length === 0 && !loading && (
                <p className="px-3 py-2 text-[13px] text-text-faint">No matches.</p>
              )}
              {options.map((opt, idx) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    onQueryChange("");
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                    idx === activeIdx ? "bg-accent-50 dark:bg-accent-950/40" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50",
                  )}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-text">{opt.label}</span>
                    {opt.sublabel && <span className="block truncate text-xs text-text-faint">{opt.sublabel}</span>}
                  </span>
                  {opt.value === value && <Check size={14} className="shrink-0 text-accent-600" />}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </FieldShell>
  );
}
