import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import clsx from "clsx";

export interface KebabMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/** A small "⋯" overflow menu — no generic Dropdown/Menu component exists
 *  anywhere in this codebase yet (checked), so this follows the exact
 *  open-state + outside-click pattern ListToolbar.tsx's own FiltersControl/
 *  SortControl already establish, rather than introducing a new one. */
export function KebabMenu({ items, label = "More actions" }: { items: KebabMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-colors",
          open
            ? "border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300"
            : "border-border-strong text-text-muted hover:bg-neutral-100 dark:hover:bg-neutral-800",
        )}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/20"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
