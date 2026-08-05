import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";

const AUTO_APPLY_MS = 1000;
/** Only the first committed term renders as its own pill — any more than
 *  that collapse into a single "+N" chip (the box has bounded width, and a
 *  pill-per-term list would overflow fast). Clicking "+N" opens a dropdown
 *  listing every term, each independently removable. */
const MAX_INLINE_PILLS = 1;

/** Tag-input search box — matches Combobox.tsx's own bordered-box styling.
 *  Whatever's typed auto-commits as a new search term AUTO_APPLY_MS after
 *  the user stops typing (no need to press Enter) — Enter still commits
 *  immediately for anyone who doesn't want to wait. Every term is OR'd
 *  against every list-view column server-side (data_api.py's
 *  _search_where). */
export function SearchBar({
  terms,
  onChange,
  className,
}: {
  terms: string[];
  onChange: (terms: string[]) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const commit = () => {
    setDraft((current) => {
      const term = current.trim();
      if (term) onChange(terms.includes(term) ? terms : [...terms, term]);
      return "";
    });
  };

  // Auto-apply: whatever's currently typed becomes a committed term
  // AUTO_APPLY_MS after the user stops typing — Enter (below) short-
  // circuits this for an immediate commit instead of waiting.
  useEffect(() => {
    if (!draft.trim()) return;
    const id = setTimeout(commit, AUTO_APPLY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, terms]);

  useEffect(() => {
    if (!overflowOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [overflowOpen]);

  const removeAt = (idx: number) => onChange(terms.filter((_, i) => i !== idx));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && terms.length > 0) {
      onChange(terms.slice(0, -1));
    }
  };

  const inlinePills = terms.slice(0, MAX_INLINE_PILLS);
  const overflowCount = terms.length - inlinePills.length;

  return (
    <div
      className={clsx(
        "flex h-9 min-w-0 flex-1 cursor-text items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-sm transition-colors focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25",
        className,
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus();
      }}
    >
      <Search size={14} className="shrink-0 text-text-faint" />
      {inlinePills.map((term, idx) => (
        <SearchPill key={`${term}-${idx}`} term={term} onRemove={() => removeAt(idx)} />
      ))}
      {overflowCount > 0 && (
        <div ref={overflowRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOverflowOpen((v) => !v)}
            className="cursor-pointer rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700 hover:bg-accent-100 dark:bg-accent-950/50 dark:text-accent-300 dark:hover:bg-accent-900"
          >
            +{overflowCount}
          </button>
          {overflowOpen && (
            <div className="absolute left-0 z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/20">
              {terms.map((term, idx) => (
                <div key={`${term}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-text">
                  <span className="min-w-0 truncate">{term}</span>
                  <button
                    type="button"
                    aria-label={`Remove search term "${term}"`}
                    onClick={() => removeAt(idx)}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-text-faint hover:bg-neutral-100 hover:text-text dark:hover:bg-neutral-800"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={terms.length === 0 ? "Search…" : "Add another…"}
        aria-label="Search"
        className="min-w-[60px] flex-1 bg-transparent text-text outline-none placeholder:text-text-faint"
      />
      {terms.length > 0 && (
        <button
          type="button"
          aria-label="Clear all search terms"
          onClick={() => onChange([])}
          className="shrink-0 cursor-pointer rounded p-0.5 text-text-faint hover:bg-neutral-100 hover:text-text dark:hover:bg-neutral-800"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function SearchPill({ term, onRemove }: { term: string; onRemove: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-50 py-0.5 pl-2 pr-1 text-xs font-medium text-accent-700 dark:bg-accent-950/50 dark:text-accent-300">
      {term}
      <button
        type="button"
        aria-label={`Remove search term "${term}"`}
        onClick={onRemove}
        className="cursor-pointer rounded-full p-0.5 text-accent-600 hover:bg-accent-100 dark:text-accent-400 dark:hover:bg-accent-900"
      >
        <X size={11} />
      </button>
    </span>
  );
}
