import { useEffect, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";

const AUTO_APPLY_MS = 1000;

/** Plain committing search input — matches Combobox.tsx's own bordered-box
 *  styling. Whatever's typed auto-commits as a new search term
 *  AUTO_APPLY_MS after the user stops typing (no need to press Enter) —
 *  Enter still commits immediately for anyone who doesn't want to wait.
 *  Every term is OR'd against every list-view column server-side
 *  (data_api.py's _search_where). Committed terms render as pills in
 *  SearchTermPills below, not inline here — this box only ever shows what
 *  you're currently typing, so it can't itself grow/overflow as terms
 *  pile up. */
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

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && terms.length > 0) {
      onChange(terms.slice(0, -1));
    }
  };

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
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={terms.length === 0 ? "Search…" : "Add another…"}
        aria-label="Search"
        className="min-w-[60px] flex-1 bg-transparent text-text outline-none placeholder:text-text-faint"
      />
    </div>
  );
}

/** Committed search terms, as a pill strip that sits between the toolbar
 *  and the table (DataTableView.tsx) — not inside SearchBar's own input
 *  box, so the box's width never has to accommodate them. Horizontally
 *  scrollable with the scrollbar itself hidden (.scrollbar-none) once
 *  terms overflow the available width, rather than wrapping the table
 *  down across multiple lines or growing the strip's own height. Renders
 *  nothing when there are no terms, so the table only shifts down while
 *  a search is actually active. */
export function SearchTermPills({ terms, onChange }: { terms: string[]; onChange: (terms: string[]) => void }) {
  if (terms.length === 0) return null;
  const removeAt = (idx: number) => onChange(terms.filter((_, i) => i !== idx));

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {terms.map((term, idx) => (
          <SearchPill key={`${term}-${idx}`} term={term} onRemove={() => removeAt(idx)} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([])}
        className="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-text-faint hover:bg-neutral-100 hover:text-text dark:hover:bg-neutral-800"
      >
        Clear all
      </button>
    </div>
  );
}

function SearchPill({ term, onRemove }: { term: string; onRemove: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-100 py-0.5 pl-2 pr-1 text-xs font-medium text-accent-700 dark:bg-accent-900/50 dark:text-accent-300">
      {term}
      <button
        type="button"
        aria-label={`Remove search term "${term}"`}
        onClick={onRemove}
        className="cursor-pointer rounded-full p-0.5 text-accent-600 hover:bg-accent-200 dark:text-accent-400 dark:hover:bg-accent-800"
      >
        <X size={11} />
      </button>
    </span>
  );
}
