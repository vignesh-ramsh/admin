import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";

/** Collapsible section wrapper for a long field/row list — the shared fix
 *  for the same gap named three separate times in docs/admin-ui-ux-review.md
 *  (§3.2 Schema Builder's field editor, §7.1 Settings & Secrets, and the
 *  Row Editor on a wide table like Employee): a flat list with no visual
 *  grouping. SettingsPage.tsx already solved this once, inline, for its
 *  own table-row layout (`groupOf`/`collapsed` there) — this is the
 *  generic, div-based extraction of that same visual language (chevron +
 *  label + count) for callers that aren't rendering `<tr>`s, so the next
 *  screen that needs it doesn't reinvent it a third time.
 *
 *  Defaults open — a group starting collapsed by default risks hiding a
 *  validation error inside it with no obvious way to know where the error
 *  actually is (see RowEditorRoute's scroll-to-first-error, which assumes
 *  every group is expanded when it runs). */
export function FieldGroup({
  label,
  count,
  defaultOpen = true,
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border">
      {/* rounded-t-md directly on the header (not overflow-hidden on the
       *  parent) — a SELECT/REFERENCE field's own dropdown is a plain
       *  absolutely-positioned DOM popup (components/Field.tsx's own
       *  Select, not a native <select>'s OS-level one), so overflow-hidden
       *  here would clip it the instant it's the last field in an open
       *  group — confirmed live, exactly this happened to `employment_type`
       *  in the Identity group. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex w-full cursor-pointer items-center gap-2 bg-neutral-50 px-3.5 py-2.5 text-left dark:bg-neutral-900/60",
          // Collapsed (no body below) needs all four corners rounded to
          // match the outer card exactly; open only needs the top two —
          // the body div below supplies its own bottom corners implicitly
          // by just being square against the card's own rounded bottom.
          open ? "rounded-t-md" : "rounded-md",
        )}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="text-[13px] font-semibold text-text">{label}</span>
        {count != null && <span className="text-xs text-text-faint">({count})</span>}
      </button>
      {open && <div className="border-t border-border p-3.5">{children}</div>}
    </div>
  );
}
