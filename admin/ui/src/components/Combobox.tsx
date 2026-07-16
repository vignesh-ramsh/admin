import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./combobox.css";

/* A searchable select. Two modes:
   - static  : pass `options`, filtered client-side as you type.
   - async   : pass `onSearch`, debounced, for lists too big to ship
               (e.g. rows of a referenced table).
   Keyboard: ArrowUp/Down to move, Enter to pick, Escape to close.

   The menu renders in a PORTAL with fixed positioning, anchored to the
   input. It has to: the field editor's container is `overflow: hidden`
   (for its rounded corners) and a modal body is `overflow-y: auto`, both
   of which clip an absolutely-positioned menu — so an in-flow dropdown is
   only ever partly visible inside them. Fixed + portal escapes every
   ancestor, and the menu flips above the input when there isn't room
   below. */

export interface ComboOption {
  value: string;
  label: string;
  /** Small eyebrow line under the label (e.g. the owning plugin). */
  sublabel?: string;
  /** Right-aligned mono detail (e.g. the raw value actually stored). */
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options?: ComboOption[];
  onSearch?: (query: string) => Promise<ComboOption[]>;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Closed-state text to show instead of the raw `value` — for callers
   *  whose stored value (e.g. a UUID) isn't human-readable on its own. */
  displayValue?: string;
}

const MENU_MAX_H = 280;

interface Anchor {
  top: number;
  left: number;
  width: number;
  up: boolean;
}

export function Combobox({
  value,
  onChange,
  options,
  onSearch,
  placeholder,
  emptyText = "No matches",
  disabled,
  displayValue,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asyncOpts, setAsyncOpts] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    // Flip up only if there genuinely isn't room below AND there's more room above.
    const up = below < MENU_MAX_H && r.top > below;
    setAnchor({
      top: up ? r.top - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
      up,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // Keep the menu glued to the input while anything scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, measure]);

  // Close on outside click — the menu is portalled, so it must be checked
  // separately from the input's own wrapper.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.parentElement?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Async search, debounced.
  useEffect(() => {
    if (!onSearch || !open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      onSearch(query)
        .then((res) => {
          if (!cancelled) setAsyncOpts(res);
        })
        .catch(() => {
          if (!cancelled) setAsyncOpts([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, onSearch]);

  const shown = useMemo(() => {
    if (onSearch) return asyncOpts;
    const q = query.trim().toLowerCase();
    const all = options ?? [];
    if (!q) return all;
    return all.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sublabel ?? "").toLowerCase().includes(q)
    );
  }, [options, onSearch, asyncOpts, query]);

  useEffect(() => setActive(0), [shown.length]);

  const pick = (opt: ComboOption) => {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const menu =
    open && anchor
      ? createPortal(
          <div
            ref={menuRef}
            className="combo__menu"
            style={{
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              maxHeight: MENU_MAX_H,
              transform: anchor.up ? "translateY(-100%)" : undefined,
            }}
          >
            {loading ? (
              <div className="combo__msg">Searching…</div>
            ) : shown.length === 0 ? (
              <div className="combo__msg">{emptyText}</div>
            ) : (
              shown.map((o, i) => (
                <button
                  key={o.value}
                  className={`combo__opt ${i === active ? "combo__opt--active" : ""} ${
                    o.value === value ? "combo__opt--selected" : ""
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                >
                  <span className="combo__text">
                    <span className="combo__label">{o.label}</span>
                    {o.sublabel && <span className="combo__sub">{o.sublabel}</span>}
                  </span>
                  {o.hint && <span className="combo__hint">{o.hint}</span>}
                </button>
              ))
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="combo">
      <input
        ref={inputRef}
        className="input combo__input"
        value={open ? query : (displayValue ?? value)}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={onKey}
      />
      {value && !disabled && (
        <button
          className="combo__clear"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          tabIndex={-1}
          aria-label="Clear"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      {menu}
    </div>
  );
}
