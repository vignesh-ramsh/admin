import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { ApplySchemaResult } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Loading, ErrorState } from "../../components/States";
import { useToast } from "../../components/Toast";

/* Apply Now — table-scoped live apply (2026-07-17), the Frappe-style
   "reload doctype" alternative to the full CLI/restart path the migration
   preview modal still offers. Two-phase, mirroring `arc psqldb migrate`'s
   own CLI posture exactly: always show the plan first, one confirm, no
   separate destructive-only gate.

     1. On open: apply_{schema,patch}_file(..., confirm: false) — a dry
        preview, applies nothing, just returns the plan for THIS table.
     2. On "Apply Now" click: the same call with confirm: true — applies
        the real DDL, writes the migration file, and reloads this table's
        shape into THIS server process's own in-memory schema — live,
        no restart, for this process only. */

interface Props {
  plugin: string;
  kind: "schema" | "patch";
  name: string;
  onClose: () => void;
  onApplied: () => void;
}

export function ApplyNowModal({ plugin, kind, name, onClose, onApplied }: Props) {
  const toast = useToast();
  const endpoint = kind === "patch" ? "apply_patch_file" : "apply_schema_file";

  const { data: preview, loading, error } = useAsync<ApplySchemaResult>(
    () => call(endpoint, { plugin, name, confirm: false }),
    [plugin, kind, name]
  );

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplySchemaResult | null>(null);

  const shown = result ?? preview;
  // The global "ensure trigger functions" bootstrap op (and, for an
  // audited/indexed table, its own always-reasserted ensure-index/attach-
  // trigger ops) show up on every plan regardless of whether anything
  // REAL changed — same behavior `arc psqldb plan` already has. Split out
  // so "nothing to do" reads as nothing to do, not a wall of idempotent
  // housekeeping the operator has to mentally filter themselves.
  const tableOps = shown ? shown.ops.filter((op) => op.table === shown.table) : [];
  const housekeepingOps = shown ? shown.ops.filter((op) => op.table !== shown.table) : [];
  const hasRealChange = tableOps.length > 0;

  const applyNow = async () => {
    setApplying(true);
    try {
      const res = await call<ApplySchemaResult>(endpoint, { plugin, name, confirm: true });
      setResult(res);
      if (res.applied) {
        toast.success(`Applied to "${res.table}" — live in this server process now.`, "Apply Now");
        onApplied();
      } else {
        toast.info(`Nothing to apply for "${res.table}" — already up to date.`, "Apply Now");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Apply failed.", "Apply Now");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      title={`Apply Now — ${name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {result?.applied ? "Close" : "Cancel"}
          </Button>
          {!result?.applied && (
            <Button variant="primary" onClick={applyNow} loading={applying} disabled={loading || !hasRealChange}>
              Apply Now
            </Button>
          )}
        </>
      }
    >
      {loading && <Loading message="Diffing this table against the database…" />}
      {error && <ErrorState message={error} />}

      {shown && (
        <div className="row-gap">
          {!hasRealChange ? (
            <div className="warn-note" style={{ borderColor: "var(--border)" }}>
              No changes to <strong>{shown.table}</strong> — the live database already matches this file.
            </div>
          ) : (
            <div className="plan">
              {tableOps.map((op, i) => (
                <div className="plan__op" key={i}>
                  <Badge tone={op.destructive ? "danger" : "success"}>
                    {op.destructive ? "destructive" : "safe"}
                  </Badge>
                  <div className="plan__op-body">
                    <div className="plan__op-desc">{op.description}</div>
                    <div className="plan__op-meta muted">
                      {op.table} · {op.source}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {shown.warnings.length > 0 && (
            <div className="plan__warnings">
              {shown.warnings.map((w, i) => (
                <div key={i} className="plan__warning">
                  {w}
                </div>
              ))}
            </div>
          )}

          {result?.applied ? (
            <div className="apply-note">
              <div className="apply-note__title">Applied</div>
              <p className="muted" style={{ margin: "4px 0 10px" }}>
                Migration recorded at <code className="mono">{result.migration_file}</code>.
              </p>
              <div className="warn-note">{result.process_warning}</div>
            </div>
          ) : (
            hasRealChange && (
              <div className="apply-note">
                <p className="muted" style={{ margin: 0 }}>
                  Applying runs this DDL against the live database immediately, then reloads{" "}
                  <strong>{shown.table}</strong>'s shape into this server process — no restart
                  needed. Other running ARC processes (other Gateway workers, lineup
                  worker/scheduler) auto-reconcile within a few seconds via the schema-version
                  watcher; <code>arc reload</code> pushes it instantly.
                </p>
              </div>
            )
          )}

          {housekeepingOps.length > 0 && !hasRealChange && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {housekeepingOps.length} routine housekeeping statement(s) (trigger/index upkeep) would
              also re-run, harmlessly, same as every {`arc psqldb migrate`} run.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
