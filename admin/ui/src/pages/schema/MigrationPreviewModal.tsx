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
    () => call("preview_migration_plan", { plugin }),
    [plugin]
  );
  const { data: cmd } = useAsync<{ command: string }>(
    () => call("get_migrate_command", { plugin }),
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
            <div className="apply-note__title">To apply these changes</div>
            <p className="muted" style={{ margin: "4px 0 10px" }}>
              Schema edits are saved to disk. Applying them runs a real migration in a fresh
              process (which also reloads the running app). Run this command in your project:
            </p>
            <div className="cmd">
              <code className="cmd__text mono">{cmd?.command ?? "…"}</code>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
