import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { ApplySchemaResult } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { LoadingBlock, ErrorBlock } from "../../components/States";
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
        shape into THIS server process's own in-memory schema — live, no
        restart, for this process only. */

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

  const { data: preview, loading, error } = useAsync<ApplySchemaResult>(() => call(endpoint, { plugin, name, confirm: false }), [plugin, kind, name]);

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplySchemaResult | null>(null);

  const shown = result ?? preview;
  // The global "ensure trigger functions" bootstrap op (and, for an
  // audited/indexed table, its own always-reasserted ensure-index/attach-
  // trigger ops) show up on every plan regardless of whether anything REAL
  // changed. Split out so "nothing to do" reads as nothing to do, not a
  // wall of idempotent housekeeping.
  const tableOps = shown ? shown.ops.filter((op) => op.table === shown.table) : [];
  const housekeepingOps = shown ? shown.ops.filter((op) => op.table !== shown.table) : [];
  const hasRealChange = tableOps.length > 0;

  const applyNow = async () => {
    setApplying(true);
    try {
      const res = await call<ApplySchemaResult>(endpoint, { plugin, name, confirm: true });
      setResult(res);
      if (res.applied) {
        toast.success(`Applied to "${res.table}" — live in this server process now.`);
        onApplied();
      } else {
        toast.show(`Nothing to apply for "${res.table}" — already up to date.`, "info");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      title={`Apply Now — ${name}`}
      onClose={onClose}
      size="lg"
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
      {loading && <LoadingBlock label="Diffing this table against the database…" />}
      {error && <ErrorBlock message={error} />}

      {shown && (
        <div className="flex flex-col gap-4">
          {!hasRealChange ? (
            <p className="rounded-md border border-border px-3 py-2 text-[13px] text-text-muted">
              No changes to <strong>{shown.table}</strong> — the live database already matches this file.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {tableOps.map((op, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-md border border-border bg-surface p-2.5">
                  <Badge tone={op.destructive ? "danger" : "success"}>{op.destructive ? "destructive" : "safe"}</Badge>
                  <div className="min-w-0">
                    <p className="text-[13px] text-text">{op.description}</p>
                    <p className="text-xs text-text-faint">
                      {op.table} · {op.source}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {shown.warnings.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {shown.warnings.map((w, i) => (
                <p key={i} className="rounded-md border border-warning/25 bg-warning-bg/50 px-2.5 py-1.5 text-xs text-warning">
                  {w}
                </p>
              ))}
            </div>
          )}

          {result?.applied ? (
            <div>
              <p className="mb-1 text-[13px] font-semibold text-success">Applied</p>
              <p className="mb-2.5 text-[13px] text-text-muted">
                Migration recorded at <code className="font-mono text-[12.5px]">{result.migration_file}</code>.
              </p>
              <p className="rounded-md border border-border px-3 py-2 text-[13px] text-text-muted">{result.process_warning}</p>
            </div>
          ) : (
            hasRealChange && (
              <p className="text-[13px] text-text-muted">
                Applying runs this DDL against the live database immediately, then reloads <strong>{shown.table}</strong>'s shape into this server
                process — no restart needed. Other running ARC processes (other Gateway workers, lineup worker/scheduler) auto-reconcile within a
                few seconds via the schema-version watcher; <code className="font-mono">arc reload</code> pushes it instantly.
              </p>
            )
          )}

          {housekeepingOps.length > 0 && !hasRealChange && (
            <p className="text-xs text-text-faint">
              {housekeepingOps.length} routine housekeeping statement(s) (trigger/index upkeep) would also re-run, harmlessly, same as every{" "}
              <code className="font-mono">arc psqldb migrate</code> run.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
