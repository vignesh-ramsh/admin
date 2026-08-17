import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { ExportJob, FieldMeta, TableSchema } from "../../api/types";
import { call, ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useJobPolling } from "../../hooks/useJobPolling";

const TERMINAL_STATUSES = new Set(["Completed", "Failed"]);

function allExportableFields(schema: TableSchema): FieldMeta[] {
  // Broader than format.ts's editableFields() on purpose — that list
  // deliberately excludes the primary key and other write-only-irrelevant
  // system fields (you can't SET id on a save), but an export is a read,
  // and id/created_at/etc. are usually exactly what you want in the file.
  return [...schema.system_fields.filter((f) => f.is_column), ...schema.fields.filter((f) => f.is_column)];
}

/* A real child component, not just a step branch inside one shared render
   — useJobPolling must only mount once a job id exists. It used to sit at
   the top of ExportModal's own function body instead, so it started
   polling get_export_status with job_id=null from the very first render
   (confirmed live: an instant burst of 400s the moment the modal opens),
   despite this file's own comment already claiming the opposite. Only a
   genuinely separate component, mounted from inside the `jobId` guard
   below, makes "gated by the job existing" true. */
function ExportProgress({ table, jobId, onClose }: { table: string; jobId: string; onClose: () => void }) {
  const { job, error: pollError } = useJobPolling<ExportJob>(
    () => call<ExportJob>("get_export_status", { job_id: jobId }, { method: "GET" }),
    (j) => TERMINAL_STATUSES.has(j.status),
    1500,
  );
  const pct = job?.rows_total ? Math.min(100, Math.round(((job.rows_exported ?? 0) / job.rows_total) * 100)) : null;
  return (
    <Modal title={`Export ${table}`} onClose={onClose} size="md">
      <div className="flex flex-col gap-4">
        {!job ? (
          <p className="text-sm text-text-muted">Starting…</p>
        ) : job.status === "Failed" ? (
          <p className="text-sm text-danger">{job.error || "Export failed."}</p>
        ) : (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={pct === null ? "h-full w-1/3 animate-pulse bg-accent-500" : "h-full bg-accent-500 transition-all"}
                style={pct !== null ? { width: `${pct}%` } : undefined}
              />
            </div>
            <p className="text-[13px] text-text-muted">
              {job.status === "Completed"
                ? `Exported ${job.rows_exported} row${job.rows_exported === 1 ? "" : "s"}.`
                : `${job.rows_exported}${job.rows_total !== null ? ` of ${job.rows_total}` : ""} rows…`}
            </p>
            {job.status === "Completed" && job.scan_pending && (
              <p className="text-[13px] text-text-faint">Finalizing — waiting on the file's security scan…</p>
            )}
            {job.status === "Completed" && job.download_url && (
              <a
                href={job.download_url}
                download
                className="inline-flex w-fit items-center gap-2 rounded-md bg-accent-action px-3.5 py-2 text-sm font-medium text-accent-fg hover:brightness-95"
              >
                <Download size={14} /> Download {table}_export.{job.format}
              </a>
            )}
          </>
        )}
        {pollError && <p className="text-xs text-text-faint">{pollError} — retrying…</p>}
      </div>
    </Modal>
  );
}

export function ExportModal({
  table,
  schema,
  filters,
  search,
  hasActiveQuery,
  onClose,
}: {
  table: string;
  schema: TableSchema;
  filters: Record<string, unknown> | null;
  search: string[];
  hasActiveQuery: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const fields = useMemo(() => allExportableFields(schema), [schema]);

  const [step, setStep] = useState<"configure" | "progress">("configure");
  const [scopeAll, setScopeAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const allChecked = fields.length > 0 && fields.every((f) => selected.has(f.name));
  const toggleSelectAll = () => setSelected(allChecked ? new Set() : new Set(fields.map((f) => f.name)));
  const toggleOne = (name: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const start = async () => {
    if (selected.size === 0) return;
    setStarting(true);
    try {
      const created = await call<ExportJob>("start_export", {
        table,
        fields: [...selected],
        format,
        filters: scopeAll || !hasActiveQuery ? null : filters,
        search: scopeAll || !hasActiveQuery ? null : search.length > 0 ? search : null,
      });
      setJobId(created.id);
      setStep("progress");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start export");
    } finally {
      setStarting(false);
    }
  };

  if (step === "progress" && jobId) {
    return <ExportProgress table={table} jobId={jobId} onClose={onClose} />;
  }

  return (
    <Modal
      title={`Export ${table}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={starting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} loading={starting} disabled={selected.size === 0}>
            Export {selected.size > 0 ? `${selected.size} field${selected.size === 1 ? "" : "s"}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hasActiveQuery && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-muted">Scope</span>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} />
              All matching records
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} />
              Only the currently filtered view
            </label>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-muted">Format</span>
          <div className="flex gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} />
              CSV
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
              Excel (.xlsx)
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-text-muted">Fields</span>
            <Checkbox label="Select all" checked={allChecked} onChange={toggleSelectAll} />
          </div>
          <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-md border border-border">
            {fields.map((f) => (
              <label
                key={f.name}
                className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm text-text last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <input
                  type="checkbox"
                  checked={selected.has(f.name)}
                  onChange={() => toggleOne(f.name)}
                  className="h-4 w-4 cursor-pointer rounded border-border-strong text-accent-600 accent-[var(--accent-600)]"
                />
                {f.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
