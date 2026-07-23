import { useState } from "react";
import { call } from "../../api/client";
import type { MigrationPlan } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/States";

export function MigrationPreviewModal({ plugin, onClose }: { plugin: string; onClose: () => void }) {
  const { data: plan, loading, error } = useAsync<MigrationPlan>(
    () => call("preview_migration_plan", { plugin }, { method: "GET" }),
    [plugin]
  );
  const { data: cmd } = useAsync<{ command: string }>(
    () => call("get_migrate_command", { plugin }, { method: "GET" }),
    [plugin]
  );
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the command is visible to copy manually */
    }
  };

  return (
    <Modal
      title={`Migration preview — ${plugin}`}
      onClose={onClose}
      wide
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      {loading && <Loading message="Diffing schemas against the database…" />}
      {error && <ErrorState message={error} />}

      {plan && (
        <div className="row-gap">
          {plan.empty ? (
            <EmptyState
              title="No changes"
              message="The live database already matches every registered schema and patch for this plugin."
            />
          ) : (
            <div className="plan">
              {plan.ops.map((op, i) => (
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

          {plan.warnings.length > 0 && (
            <div className="plan__warnings">
              {plan.warnings.map((w, i) => (
                <div key={i} className="plan__warning">
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="apply-note">
            <div className="apply-note__title">To apply every pending change at once</div>
            <p className="muted" style={{ margin: "4px 0 10px" }}>
              For a single table, use the <strong>Apply Now</strong> button in that table's editor
              instead — it applies immediately and takes effect in this server process with no
              restart. To apply everything pending across every table/plugin in one pass, run the
              real migration yourself:
            </p>
            <div className="cmd">
              <code className="cmd__text mono">{cmd?.command ?? "…"}</code>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="warn-note" style={{ marginTop: 10 }}>
              Running ARC processes (this server, other Gateway workers, lineup
              worker/scheduler) notice the applied changes on their own within a few seconds —
              the schema-version watcher reconciles them automatically. <code>arc reload</code>{" "}
              pushes it instantly; <code>arc ps</code> lists the registered processes. Only a
              process running without the reload bridge (older code, plain scripts) needs a
              restart — and <em>code</em> changes always do (<code>arc restart</code>).
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
