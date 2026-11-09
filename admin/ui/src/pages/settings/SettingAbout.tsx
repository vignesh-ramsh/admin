import { useState } from "react";
import { Pencil } from "lucide-react";
import { ApiError, call } from "../../api/client";
import type { SettingEntry } from "../../api/types";
import { Badge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { TextArea } from "../../components/Field";
import { useToast } from "../../components/Toast";
import { formatDefault } from "./settingTypes";

/** The most an administrator may save (the server refuses more). */
export const MAX_DESCRIPTION_CHARS = 2000;

/** A description is plain text; `code` spans (a value, a command, another setting's name) are shown as code.
 *  Never HTML: whatever is stored, it is only ever rendered as text. */
export function DescriptionText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-text">
      {parts.map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12px] dark:bg-neutral-800">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

/** What a setting or secret is for, shown at the top of its popup: the description, then its type and its
 *  default. A secret never shows a default (none declares one, and a placeholder credential must not leak).
 *
 *  The description can be rewritten here. That changes only the copy kept in the settings store: the text in the
 *  code stays as it is, and "Reset to original" brings it back. `onChange(null)` says the key is gone (a key
 *  added by hand that had nothing left but its description). */
export function SettingAbout({
  entry,
  onChange,
  onEditingChange,
}: {
  entry: SettingEntry;
  onChange: (next: SettingEntry | null) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const toast = useToast();
  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const isSecret = entry.kind === "secret";
  const kindWord = isSecret ? "secret" : "setting";
  const defaultText = isSecret ? null : formatDefault(entry.default);
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MAX_DESCRIPTION_CHARS;
  const unchanged = trimmed === entry.doc.trim();

  const setEditing = (value: boolean) => {
    setEditingState(value);
    onEditingChange?.(value);
  };
  const startEditing = () => {
    setDraft(entry.doc);
    setEditing(true);
  };

  const run = async (fn: "set_setting_description" | "reset_setting_description", params: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const res = await call<SettingEntry & { removed?: boolean }>(fn, params);
      setEditing(false);
      setShowOriginal(false);
      onChange(res.removed ? null : res);
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save the description");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-neutral-50 px-3.5 py-3 dark:bg-neutral-900/50" aria-label={`About this ${kindWord}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">What this {kindWord} is for</h3>
        {entry.doc_edited && <Badge tone="info">Edited</Badge>}
        {!editing && (
          <IconButton className="-mr-1.5 -mt-1 ml-auto h-7 w-7" label="Edit description" icon={<Pencil size={13} />} onClick={startEditing} />
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <TextArea
            aria-label="Description"
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            error={tooLong ? `Too long: ${trimmed.length} of ${MAX_DESCRIPTION_CHARS} characters.` : undefined}
            hint={`${trimmed.length} of ${MAX_DESCRIPTION_CHARS} characters. Only this copy changes; the text in the code stays as it is. Use \`backticks\` around a value or command.`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={trimmed === "" || tooLong || unchanged}
              onClick={() => run("set_setting_description", { key: entry.key, description: draft }, "Description saved.")}
            >
              Save description
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {entry.doc_edited && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={busy}
                onClick={() => run("reset_setting_description", { key: entry.key }, "Original description restored.")}
              >
                Reset to original
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {entry.doc.trim() ? (
            <DescriptionText text={entry.doc} />
          ) : (
            <p className="text-[13.5px] italic text-text-faint">No description has been written for this {kindWord} yet.</p>
          )}
          {entry.doc_edited && (
            <div className="mt-2 text-xs text-text-faint">
              Edited{entry.doc_by ? ` by ${entry.doc_by}` : ""}
              {entry.doc_at ? ` on ${new Date(entry.doc_at).toLocaleString()}` : ""}.{" "}
              <button type="button" className="cursor-pointer font-medium underline underline-offset-2" onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? "Hide the original" : "Show the original"}
              </button>
              {showOriginal && (
                <div className="mt-1.5 rounded-md border border-border bg-surface px-2.5 py-2">
                  {entry.code_doc.trim() ? <DescriptionText text={entry.code_doc} /> : <span className="italic">The code has no description for this {kindWord}.</span>}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(entry.type || defaultText !== null) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-faint">
          {entry.type && (
            <span className="inline-flex items-center gap-1.5">
              Type
              <Badge tone="neutral" className="font-mono uppercase">
                {entry.type}
              </Badge>
            </span>
          )}
          {defaultText !== null && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              Default
              <code className="max-w-full truncate rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px] text-text dark:bg-neutral-800" title={defaultText}>
                {defaultText}
              </code>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
