import { useEffect, useState } from "react";
import { ArrowRight, History } from "lucide-react";
import { call } from "../../api/client";
import type { AuditEntry } from "../../api/types";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ErrorBlock, LoadingBlock, EmptyState } from "../../components/States";
import { resolveFilerFile, SYSTEM_STRIPPED } from "./format";

/* _audit_{plugin} tables have no schema file (raw bootstrap SQL, docs/
   arc.MD §3.9) and so are invisible to the generic Data Browser — this is
   the only place this data is viewable in admin.

   changed_by/created_by/updated_by are the acting user's EMAIL already
   (admin._security.by_of writes it that way, not a UUID needing a
   separate directory lookup) — shown as-is.

   Always rendered scoped to ONE row (row_id), as a side panel next to
   that row's own fields. The list itself scrolls independently of
   whatever it sits beside (its parent must be a bounded-height flex
   column — see RowEditorRoute) so a long trail never drags the rest of
   the modal down with it. Each entry is a preview (truncated, single
   line per field) that opens a dedicated modal with the full, untruncated
   diff on click. */

function changedFieldsOf(entry: AuditEntry): string[] {
  const before = entry.changes?.before;
  const after = entry.changes?.after;
  // System bookkeeping (updated_at changes on every write, id/_state/
  // created_at never change, created_by/updated_by would just repeat the
  // entry's own actor) is technically accurate but pure noise next to the
  // field someone actually changed — filtered the same way the row
  // editor's own field list already excludes them.
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => !SYSTEM_STRIPPED.has(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
}

function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditHistoryPanel({ plugin, table, rowId }: { plugin: string; table: string; rowId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [openEntry, setOpenEntry] = useState<AuditEntry | null>(null);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    setError(null);
    call<AuditEntry[]>("list_audit_entries", { plugin, table, row_id: rowId, limit, offset }, { method: "GET" })
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit history"))
      .finally(() => setLoading(false));
  }, [plugin, table, rowId, offset]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-text">
        <History size={14} /> Audit history
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <LoadingBlock label="Loading audit trail…" />
        ) : error ? (
          <ErrorBlock message={error} />
        ) : entries.length === 0 ? (
          <EmptyState title="No changes recorded" description="This row has no audit history yet." bordered={false} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {entries.map((e) => (
              <AuditEntryRow key={e.id} entry={e} onOpen={() => setOpenEntry(e)} />
            ))}
          </ul>
        )}
      </div>
      {entries.length > 0 && (
        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-border pt-2.5">
          <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={entries.length < limit} onClick={() => setOffset(offset + limit)}>
            Next
          </Button>
        </div>
      )}

      {openEntry && <AuditEntryDetailModal entry={openEntry} onClose={() => setOpenEntry(null)} />}
    </div>
  );
}

function AuditEntryRow({ entry, onOpen }: { entry: AuditEntry; onOpen: () => void }) {
  const before = entry.changes?.before;
  const after = entry.changes?.after;
  const changed = changedFieldsOf(entry);
  const PREVIEW_MAX = 5;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full cursor-pointer rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-accent-300 dark:hover:border-accent-700"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-text">{entry.changed_by ?? "system"}</span>
          <span className="shrink-0 text-xs text-text-faint">{new Date(entry.changed_at).toLocaleString()}</span>
        </div>
        {changed.length === 0 ? (
          <p className="text-xs text-text-faint">No field-level changes recorded.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {changed.slice(0, PREVIEW_MAX).map((k) => (
              <DiffPreviewLine key={k} name={k} before={before?.[k]} after={after?.[k]} />
            ))}
            {changed.length > PREVIEW_MAX && (
              <p className="mt-0.5 text-[11px] text-text-faint">+{changed.length - PREVIEW_MAX} more field(s) — click to view all</p>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

/* Compact, always-truncated preview line — no strikethrough, just a
   muted-red "before" and a solid-green "after" so the direction of the
   change reads at a glance without needing to click through. */
function DiffPreviewLine({ name, before, after }: { name: string; before: unknown; after: unknown }) {
  return (
    <div className="grid grid-cols-[minmax(0,84px)_1fr] items-center gap-x-2 text-xs">
      <span className="truncate font-mono text-[11px] text-text-faint" title={name}>
        {name}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-danger/80" title={formatDiffValue(before)}>
          {formatDiffValue(before)}
        </span>
        <ArrowRight size={11} className="shrink-0 text-text-faint" />
        <span className="truncate font-medium text-success" title={formatDiffValue(after)}>
          {formatDiffValue(after)}
        </span>
      </span>
    </div>
  );
}

/* The dedicated, click-through view: full untruncated content, light-red
   "before" / light-green "after" blocks (no strikethrough), independently
   scrollable from whatever opened it since it's its own Modal. */
function AuditEntryDetailModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const before = entry.changes?.before;
  const after = entry.changes?.after;
  const changed = changedFieldsOf(entry);

  return (
    <Modal
      title="Audit entry"
      subtitle={`${entry.changed_by ?? "system"} · ${new Date(entry.changed_at).toLocaleString()}`}
      onClose={onClose}
      size="lg"
    >
      {changed.length === 0 ? (
        <p className="text-sm text-text-faint">No field-level changes recorded.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {changed.map((k) => (
            <FullDiffField key={k} name={k} before={before?.[k]} after={after?.[k]} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function FullDiffField({ name, before, after }: { name: string; before: unknown; after: unknown }) {
  // Same FILE/MULTIFILE resolved-filename improvement as the preview, just
  // resolved for both sides at full-detail time.
  const looksLikeFileId = (v: unknown) => typeof v === "string" && /^(pub|pri)_/.test(v);
  const [beforeLabel, setBeforeLabel] = useState<string | null>(null);
  const [afterLabel, setAfterLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (looksLikeFileId(before)) resolveFilerFile(before as string).then((r) => !cancelled && setBeforeLabel(r?.filename ?? null));
    if (looksLikeFileId(after)) resolveFilerFile(after as string).then((r) => !cancelled && setAfterLabel(r?.filename ?? null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after]);

  const fmt = (v: unknown, label: string | null) => {
    if (label) return label;
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  };

  return (
    <div>
      <p className="mb-1.5 font-mono text-[12px] font-medium text-text-muted">{name}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-danger/25 bg-danger-bg/70 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-danger">Before</p>
          <p className="whitespace-pre-wrap break-words text-[13px] text-text">{fmt(before, beforeLabel)}</p>
        </div>
        <div className="rounded-md border border-success/25 bg-success-bg/70 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-success">After</p>
          <p className="whitespace-pre-wrap break-words text-[13px] text-text">{fmt(after, afterLabel)}</p>
        </div>
      </div>
    </div>
  );
}
