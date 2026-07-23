import { useEffect, useState } from "react";
import { call } from "../../api/client";
import type { AuditEntry } from "../../api/types";
import { Button } from "../../components/Button";
import { Loading, EmptyState, ErrorState } from "../../components/States";
import { AuditTrail, type AuditEntry as AgniAuditEntry } from "../../components/agni/erp/AuditTrail";
import { useUserDirectory } from "../shared/useUserDirectory";
import { formatWhen } from "../users/userUtils";
import { SYSTEM_STRIPPED } from "./format";
import { IconChevron } from "../../layout/icons";

/* _audit_{plugin} tables have no schema file (raw bootstrap SQL, docs/
   arc.MD §3.9) and so are invisible to the generic Data Browser — this is
   the only place this data is viewable in admin. changed_by is resolved
   to an email via the same directory every other screen uses, rather than
   showing the raw UUID a DB row happens to carry.

   Always rendered scoped to ONE document (row_id), as a collapsible side
   panel next to whatever's showing that document's own fields — never a
   whole-table view. A whole-table version existed earlier and was removed:
   for anything with real row volume it was neither useful (an undifferentiated
   stream of every row's changes) nor how anyone actually wants to ask "what
   happened to this one" — that question is always about a specific document. */

export function AuditHistoryPanel({
  plugin,
  table,
  rowId,
  collapsed,
  onToggleCollapsed,
}: {
  plugin: string;
  table: string;
  rowId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const dir = useUserDirectory();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (collapsed) return;
    setLoading(true);
    setError(null);
    call<AuditEntry[]>("list_audit_entries", { plugin, table, row_id: rowId, limit, offset }, { method: "GET" })
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit history"))
      .finally(() => setLoading(false));
  }, [plugin, table, rowId, offset, collapsed]);

  if (collapsed) {
    return (
      <div className="row-editor__audit row-editor__audit--collapsed">
        <button className="row-editor__audit-collapse" onClick={onToggleCollapsed} aria-label="Expand audit history">
          <IconChevron direction="left" />
          <span className="row-editor__audit-collapse-label">Audit history</span>
        </button>
      </div>
    );
  }

  return (
    <div className="row-editor__audit">
      <div className="row-editor__audit-head">
        <span className="row-editor__audit-title">Audit history</span>
        <button className="row-editor__audit-collapse" onClick={onToggleCollapsed} aria-label="Collapse audit history">
          <IconChevron direction="right" />
        </button>
      </div>
      <div className="row-editor__audit-body">
        {loading || dir.loading ? (
          <Loading message="Loading audit trail…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : entries.length === 0 ? (
          <EmptyState title="No changes recorded" message="This row has no audit history yet." />
        ) : (
          <AuditTrail entries={entries.map((e) => toAgniEntry(e, dir.emailFor))} />
        )}
      </div>
      {entries.length > 0 && (
        <div className="row-editor__audit-pager">
          <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={entries.length < limit} onClick={() => setOffset(offset + limit)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function toAgniEntry(entry: AuditEntry, emailFor: (id: string) => string): AgniAuditEntry {
  const before = entry.changes?.before;
  const after = entry.changes?.after;
  // System bookkeeping (updated_at changes on literally every write, id/
  // _state/created_at never change at all, created_by/updated_by would
  // show as a raw unresolved UUID and who-made-this-change is already the
  // entry's own actor) is technically accurate but pure noise next to the
  // one or two fields someone actually changed — filtered the same way
  // the row editor's own field list already excludes them (format.ts's
  // SYSTEM_STRIPPED covers all of these).
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed = [...keys].filter(
    (k) => !SYSTEM_STRIPPED.has(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])
  );

  return {
    actor: entry.changed_by ? emailFor(entry.changed_by) : "system",
    action: "updated this row",
    ts: formatWhen(entry.changed_at),
    icon: "ph-pencil-simple",
    detail:
      changed.length === 0 ? (
        <span className="muted">No field-level changes recorded.</span>
      ) : (
        <div className="audit-diff">
          {changed.map((k) => (
            // Hash/secret fields (password_hash, key_hash, token_hash) are
            // already redacted to the literal string "(hidden)" server-side
            // (admin.audit_api._redact) — never sent over the wire at all,
            // not just hidden here.
            <div key={k} className="audit-diff__field">
              <span className="audit-diff__name mono">{k}</span>
              <div className="audit-diff__values">
                <span className="audit-diff__before" title={fmt(before?.[k])}>
                  {fmt(before?.[k])}
                </span>
                <i className="ph ph-arrow-right audit-diff__arrow" aria-hidden="true" />
                <span className="audit-diff__after" title={fmt(after?.[k])}>
                  {fmt(after?.[k])}
                </span>
              </div>
            </div>
          ))}
        </div>
      ),
  };
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
