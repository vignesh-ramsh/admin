import { useEffect, useId, useRef, useState } from "react";
import { ChevronsUpDown, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { FieldShell } from "./Field";

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
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error}>
      <div ref={rootRef} className="relative">
        <div
          className={clsx(
            "flex h-9 cursor-text items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-sm focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25",
            error && "border-danger",
          )}
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
              } else if (e.key === "Escape") {
                setOpen(false);
              }
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
        {open && (
          <div className="scrollbar-thin absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/10">
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
          </div>
        )}
      </div>
    </FieldShell>
  );
}
