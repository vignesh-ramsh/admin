import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Check, X } from "lucide-react";
import clsx from "clsx";
import { CONTROL_HEIGHT, FieldShell, type ControlSize } from "./Field";
import type { ComboOption } from "./Combobox";

/* Sibling to Combobox.tsx rather than a `multiple` prop bolted onto it —
   the two components' interaction models genuinely differ (chips instead
   of a single label, the dropdown stays open across clicks, search is
   always local/synchronous rather than a caller-driven async query) and
   cramming both into one component via a discriminated union would have
   made every change to either one a change to both. Shares the exact
   same portal + position-tracking approach as Combobox (see that file's
   own comment) for the same reason: a dropdown positioned relative to an
   ancestor gets clipped by the first `overflow` ancestor it has — a
   Modal's own scrollable body, in every real caller of either
   component — so it has to escape via a portal to render correctly. */
export function MultiCombobox({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  placeholder = "Search…",
  size = "md",
}: {
  label?: string;
  hint?: string;
  error?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: ComboOption[];
  placeholder?: string;
  size?: ControlSize;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);

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
      setQuery("");
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (v: string) => {
    onChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error}>
      <div
        ref={rootRef}
        className="relative"
        onKeyDownCapture={(e) => {
          // Capture phase, on the root — not just the search input's own
          // onKeyDown — because focus can land on an OPTION button inside
          // the portaled dropdown (a click there moves focus to whatever
          // was clicked), and only the root is guaranteed to see every
          // keypress regardless of which descendant currently has focus.
          // React still bubbles a portaled child's events up through the
          // REACT tree (not the DOM tree) to this ancestor even though
          // the dropdown itself renders into document.body — see
          // https://react.dev/reference/react-dom/createPortal#rendering-to-a-different-dom-subtree.
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
            setQuery("");
          }
        }}
      >
        <div
          className={clsx(
            "flex min-h-9 cursor-text flex-wrap items-center gap-1 rounded-md border bg-surface px-2 py-1 text-sm transition-colors focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25",
            error ? "border-danger" : "border-border-strong",
          )}
          style={{ minHeight: CONTROL_HEIGHT[size] }}
          onClick={() => {
            setOpen(true);
            document.getElementById(fieldId)?.focus();
          }}
        >
          {value.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="flex items-center gap-1 rounded bg-accent-50 px-1.5 py-0.5 text-[12px] text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"
              >
                {opt?.label ?? v}
                <button
                  type="button"
                  aria-label={`Remove ${opt?.label ?? v}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                  className="cursor-pointer text-accent-700/70 hover:text-accent-700 dark:text-accent-300/70 dark:hover:text-accent-300"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          <input
            id={fieldId}
            value={query}
            placeholder={value.length === 0 ? placeholder : ""}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIdx(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const opt = filtered[activeIdx];
                if (opt) toggle(opt.value);
              } else if (e.key === "Backspace" && query === "" && value.length > 0) {
                toggle(value[value.length - 1]);
              }
              // Escape is handled by the root's onKeyDownCapture below —
              // it needs to fire regardless of which descendant (this
              // input, or an option button inside the portaled dropdown)
              // currently has focus.
            }}
            className="min-w-[80px] flex-1 bg-transparent text-text outline-none placeholder:text-text-faint"
            autoComplete="off"
          />
          <ChevronsUpDown size={14} className="ml-auto shrink-0 text-text-faint" />
        </div>
        {open &&
          rect &&
          createPortal(
            <div
              ref={panelRef}
              className="scrollbar-thin fixed z-[60] mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/10"
              style={{ top: rect.top, left: rect.left, width: rect.width }}
            >
              {filtered.length === 0 && <p className="px-3 py-2 text-[13px] text-text-faint">No matches.</p>}
              {filtered.map((opt, idx) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
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
                  {selectedSet.has(opt.value) && <Check size={14} className="shrink-0 text-accent-600" />}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </FieldShell>
  );
}
