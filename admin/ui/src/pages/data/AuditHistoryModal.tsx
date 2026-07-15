import { useEffect, useState } from "react";
import { call } from "../../api/client";
import type { AuditEntry } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Loading, EmptyState, ErrorState } from "../../components/States";
import { useUserDirectory } from "../shared/useUserDirectory";
import { formatWhen } from "../users/userUtils";

/* _audit_{plugin} tables have no schema file (raw bootstrap SQL, docs/
   arc.MD §3.9) and so are invisible to the generic Data Browser — this is
   the only place this data is viewable in admin. changed_by is resolved
   to an email via the same directory every other screen uses, rather than
   showing the raw UUID a DB row happens to carry. */

export function AuditHistoryModal({
  plugin,
  table,
  onClose,
}: {
  plugin: string;
  table: string;
  onClose: () => void;
}) {
  const dir = useUserDirectory();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const load = () => {
    setLoading(true);
    setError(null);
    call<AuditEntry[]>("list_audit_entries", { plugin, table, limit, offset })
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit history"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [plugin, table, offset]);

  return (
    <Modal title={`Audit history — ${table}`} onClose={onClose} wide footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading || dir.loading ? (
        <Loading message="Loading audit trail…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : entries.length === 0 ? (
        <EmptyState title="No changes recorded" message="This table has no audit history yet." />
      ) : (
        <div className="row-gap">
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} emailFor={dir.emailFor} />
          ))}
          <div className="pager" style={{ borderTop: "none", padding: "4px 0" }}>
            <span />
            <div className="inline">
              <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={entries.length < limit} onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AuditRow({ entry, emailFor }: { entry: AuditEntry; emailFor: (id: string) => string }) {
  const before = entry.changes?.before;
  const after = entry.changes?.after;
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed = [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));

  return (
    <div className="audit-row">
      <div className="audit-row__head">
        <span className="mono muted" style={{ fontSize: 11.5 }}>{entry.row_id.slice(0, 8)}…</span>
        <span className="audit-row__by">{entry.changed_by ? emailFor(entry.changed_by) : "system"}</span>
        <span className="muted" style={{ fontSize: 12 }}>{formatWhen(entry.changed_at)}</span>
      </div>
      {changed.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5 }}>No field-level changes recorded.</div>
      ) : (
        <div className="audit-diff">
          {changed.map((k) => (
            // Hash/secret fields (password_hash, key_hash, token_hash) are
            // already redacted to the literal string "(hidden)" server-side
            // (admin.audit_api._redact) — never sent over the wire at all,
            // not just hidden here.
            <div key={k} className="audit-diff__field">
              <span className="audit-diff__name mono">{k}</span>
              <span className="audit-diff__before">{fmt(before?.[k])}</span>
              <span className="audit-diff__arrow">→</span>
              <span className="audit-diff__after">{fmt(after?.[k])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
