import { useEffect, useMemo, useRef, useState } from "react";
import "./combobox.css";

/* A searchable select. Two modes:
   - static  : pass `options`, filtered client-side as you type.
   - async   : pass `onSearch`, debounced, for lists too big to ship
               (e.g. rows of a referenced table).
   Keyboard: ArrowUp/Down to move, Enter to pick, Escape to close. */

export interface ComboOption {
  value: string;
  label: string;
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
  allowFreeText?: boolean;
}

export function Combobox({
  value,
  onChange,
  options,
  onSearch,
  placeholder,
  emptyText = "No matches",
  disabled,
  allowFreeText = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [async_, setAsync] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Async search, debounced.
  useEffect(() => {
    if (!onSearch || !open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      onSearch(query)
        .then((res) => {
          if (!cancelled) setAsync(res);
        })
        .catch(() => {
          if (!cancelled) setAsync([]);
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
    if (onSearch) return async_;
    const q = query.trim().toLowerCase();
    const all = options ?? [];
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, onSearch, async_, query]);

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

  const display = open ? query : value;

  return (
    <div className="combo" ref={boxRef}>
      <input
        className="input combo__input"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (allowFreeText) onChange(e.target.value);
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
      {open && (
        <div className="combo__menu">
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
                <span className="combo__label">{o.label}</span>
                {o.hint && <span className="combo__hint">{o.hint}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
