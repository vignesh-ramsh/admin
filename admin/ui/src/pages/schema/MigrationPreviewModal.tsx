import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { call } from "../../api/client";
import type { MigrationPlan } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { LoadingBlock, ErrorBlock, EmptyState } from "../../components/States";

export function MigrationPreviewModal({ plugin, table, onClose }: { plugin: string; table?: string; onClose: () => void }) {
  const { data: plan, loading, error } = useAsync<MigrationPlan>(() => call("preview_migration_plan", { plugin, table }, { method: "GET" }), [plugin, table]);
  const { data: cmd } = useAsync<{ command: string }>(() => call("get_migrate_command", { plugin, table }, { method: "GET" }), [plugin, table]);
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
    <Modal title={`Migration preview — ${plugin}`} onClose={onClose} size="lg" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {loading && <LoadingBlock label="Diffing schemas against the database…" />}
      {error && <ErrorBlock message={error} />}

      {plan && (
        <div className="flex flex-col gap-4">
          {plan.empty ? (
            <EmptyState title="No changes" description="The live database already matches every registered schema and patch for this plugin." />
          ) : (
            <div className="flex flex-col gap-2">
              {plan.ops.map((op, i) => (
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

          {plan.warnings.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {plan.warnings.map((w, i) => (
                <p key={i} className="rounded-md border border-warning/25 bg-warning-bg/50 px-2.5 py-1.5 text-xs text-warning">
                  {w}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-md border border-border bg-neutral-50 p-3 dark:bg-neutral-900/40">
            <p className="mb-1 text-[13px] font-semibold text-text">To apply every pending change at once</p>
            <p className="mb-2.5 text-[13px] text-text-muted">
              For a single table, use <strong>Apply Now</strong> in that table's editor instead — it applies immediately, live in this server
              process, no restart. To apply everything pending across every table/plugin in one pass, run the real migration yourself:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-text">
                {cmd?.command ?? "…"}
              </code>
              <Button variant="secondary" size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-2.5 text-xs text-text-faint">
              Running ARC processes (this server, other Gateway workers, lineup worker/scheduler) notice applied changes on their own within a few
              seconds — the schema-version watcher reconciles automatically. <code className="font-mono">arc reload</code> pushes it instantly;{" "}
              <code className="font-mono">arc ps</code> lists registered processes. Only a process running without the reload bridge needs a
              restart — and code changes always do (<code className="font-mono">arc restart</code>).
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
