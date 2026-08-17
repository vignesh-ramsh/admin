import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type { ImportJob, ImportPreview, ImportRowError, TableSchema } from "../../api/types";
import { call, ApiError } from "../../api/client";
import { uploadFilerFile } from "../../api/filerClient";
import { Button } from "../../components/Button";
import { Checkbox, Select } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useJobPolling } from "../../hooks/useJobPolling";
import { editableFields } from "./format";

const TERMINAL_STATUSES = new Set(["Completed", "CompletedWithErrors", "Failed"]);
const SKIP = "";

type Step = "upload" | "map" | "configure" | "progress";

/* Split out so useJobPolling only ever mounts (and starts hitting
   get_import_status) once a real job id exists — mirrors ExportModal's
   own stated intent ("gate by only rendering the progress step"), which
   that component's flat structure never actually achieved: its polling
   hook sat at the top of the function body, unconditionally, so it
   started polling with job_id=null from the very first render. Confirmed
   live — that shape spams 400s the instant either modal opens. A real
   child component is what makes "only mounts once the job exists" true. */
function ImportProgress({
  table,
  jobId,
  onClose,
  onImported,
}: {
  table: string;
  jobId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const [errorRows, setErrorRows] = useState<ImportRowError[] | null>(null);
  const [resuming, setResuming] = useState(false);

  const { job } = useJobPolling<ImportJob>(
    () => call<ImportJob>("get_import_status", { job_id: jobId }, { method: "GET" }),
    (j) => TERMINAL_STATUSES.has(j.status),
    1500,
  );

  const reloadedRef = useRef(false);
  useEffect(() => {
    if (job && TERMINAL_STATUSES.has(job.status) && !reloadedRef.current) {
      reloadedRef.current = true;
      onImported();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  useEffect(() => {
    if (job?.status === "CompletedWithErrors") {
      call<{ rows: ImportRowError[] }>("list_import_row_errors", { job_id: jobId, limit: 50 }, { method: "GET" })
        .then((res) => setErrorRows(res.rows))
        .catch(() => {
          /* best-effort — the summary counts still tell the story */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const resume = async () => {
    setResuming(true);
    setErrorRows(null);
    reloadedRef.current = false;
    try {
      await call("resume_import", { job_id: jobId });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to resume");
    } finally {
      setResuming(false);
    }
  };

  const pct = job?.rows_total ? Math.min(100, Math.round((job.rows_processed / job.rows_total) * 100)) : null;
  const canResume = job && (job.status === "CompletedWithErrors" || (job.status === "Failed" && job.rows_total !== null));

  return (
    <Modal title={`Import into ${table}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {!job ? (
          <p className="text-sm text-text-muted">Starting…</p>
        ) : (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className={
                  pct === null
                    ? "h-full w-1/3 animate-pulse bg-accent-500"
                    : job.status === "Failed"
                      ? "h-full bg-danger transition-all"
                      : "h-full bg-accent-500 transition-all"
                }
                style={pct !== null ? { width: `${pct}%` } : undefined}
              />
            </div>
            <p className="text-[13px] text-text-muted">
              {job.rows_processed}
              {job.rows_total !== null ? ` of ${job.rows_total}` : ""} rows processed — {job.rows_succeeded} succeeded,{" "}
              {job.rows_failed} failed.
            </p>

            {job.status === "Failed" && (
              <p className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {job.error || "Import failed."}
              </p>
            )}

            {errorRows && errorRows.length > 0 && (
              <div className="scrollbar-thin max-h-56 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-surface-raised text-text-muted">
                    <tr>
                      <th className="border-b border-border px-3 py-1.5 text-left font-medium">Row</th>
                      <th className="border-b border-border px-3 py-1.5 text-left font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-1.5 font-mono text-text-faint">#{r.row_number}</td>
                        <td className="px-3 py-1.5 text-danger">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canResume && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={<RotateCcw size={13} />} onClick={resume} loading={resuming}>
                  Resume
                </Button>
                <p className="text-xs text-text-faint">
                  Retries the still-failing rows as-is — to fix bad data in the file itself, start a new import instead.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ImportModal({
  table,
  schema,
  onClose,
  onImported,
}: {
  table: string;
  schema: TableSchema;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const fields = useMemo(() => editableFields(schema), [schema]);
  const fieldsByName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileToken, setFileToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const [mapping, setMapping] = useState<Record<string, string>>({}); // file column -> field name, "" = skip
  const [matchOn, setMatchOn] = useState<Set<string>>(new Set());
  const [onError, setOnError] = useState<"abort" | "skip">("abort");

  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const doUpload = async () => {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadFilerFile(file, { private: true });
      const p = await call<ImportPreview>("preview_import_columns", { file: uploaded.file_id }, { method: "GET" });
      setFileToken(uploaded.file_id);
      setPreview(p);
      // Best-effort pre-fill: a file column whose header text exactly
      // matches a real field name maps itself; everything else starts
      // unmapped rather than guessing wrong.
      const guess: Record<string, string> = {};
      for (const col of p.columns) {
        if (fieldsByName.has(col)) guess[col] = col;
      }
      setMapping(guess);
      setStep("map");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to read file");
    } finally {
      setUploading(false);
    }
  };

  const mappedFieldNames = useMemo(
    () => new Set(Object.values(mapping).filter((v) => v !== SKIP)),
    [mapping],
  );
  const mappedCount = mappedFieldNames.size;

  const start = async () => {
    if (!fileToken || !preview || mappedCount === 0) return;
    setStarting(true);
    try {
      const columnMapping: Record<string, string> = {};
      for (const col of preview.columns) {
        if (mapping[col] && mapping[col] !== SKIP) columnMapping[col] = mapping[col];
      }
      const created = await call<ImportJob>("start_import", {
        table,
        file: fileToken,
        column_mapping: columnMapping,
        on_error: onError,
        match_on: matchOn.size > 0 ? [...matchOn] : null,
      });
      setJobId(created.id);
      setStep("progress");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start import");
    } finally {
      setStarting(false);
    }
  };

  if (step === "upload") {
    return (
      <Modal
        title={`Import into ${table}`}
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={doUpload} loading={uploading} disabled={!file}>
              Read file
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-text-muted">File (CSV or Excel)</label>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="cursor-pointer text-sm text-text file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-action file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg hover:file:brightness-95"
          />
        </div>
      </Modal>
    );
  }

  if (step === "map" && preview) {
    return (
      <Modal
        title={`Import into ${table}`}
        subtitle="Map file columns"
        onClose={onClose}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button variant="primary" onClick={() => setStep("configure")} disabled={mappedCount === 0}>
              Next
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="scrollbar-thin max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-raised text-[13px] text-text-muted">
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left font-medium">File column</th>
                  <th className="border-b border-border px-3 py-2 text-left font-medium">Sample</th>
                  <th className="border-b border-border px-3 py-2 text-left font-medium">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {preview.columns.map((col, idx) => (
                  <tr key={col} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-[13px] text-text">{col}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-text-faint" title={preview.sample_rows[0]?.[idx] ?? ""}>
                      {preview.sample_rows[0]?.[idx] ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        size="sm"
                        value={mapping[col] ?? SKIP}
                        onChange={(e) => setMapping((cur) => ({ ...cur, [col]: e.target.value }))}
                      >
                        <option value={SKIP}>— skip —</option>
                        {fields.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name}
                            {f.required ? " *" : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mappedFieldNames.size > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-text-muted">
                Match existing rows on (optional — leave unchecked to always insert new rows)
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {[...mappedFieldNames].map((name) => (
                  <Checkbox
                    key={name}
                    label={name}
                    checked={matchOn.has(name)}
                    onChange={() =>
                      setMatchOn((cur) => {
                        const next = new Set(cur);
                        if (next.has(name)) next.delete(name);
                        else next.add(name);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-muted">If a row fails</span>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
              <input type="radio" className="mt-0.5" checked={onError === "abort"} onChange={() => setOnError("abort")} />
              <span>
                Stop the whole import (default) — nothing is written unless every row succeeds. Large imports commit in
                batches of 2,000 rows, so a failure partway through still leaves earlier batches committed.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
              <input type="radio" className="mt-0.5" checked={onError === "skip"} onChange={() => setOnError("skip")} />
              <span>Skip bad rows and import the rest — failed rows are reported and can be retried after fixing.</span>
            </label>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === "configure" && preview) {
    const mappedPairs = preview.columns.filter((c) => mapping[c] && mapping[c] !== SKIP).map((c) => [c, mapping[c]]);
    return (
      <Modal
        title={`Import into ${table}`}
        subtitle="Review"
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep("map")} disabled={starting}>
              Back
            </Button>
            <Button variant="primary" onClick={start} loading={starting}>
              Start import
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-text">
          <p>
            {preview.row_count_hint !== null ? `${preview.row_count_hint} row${preview.row_count_hint === 1 ? "" : "s"}` : "This file"} will
            be imported into <strong>{table}</strong>.
          </p>
          <div className="rounded-md border border-border p-3">
            <p className="mb-1.5 text-[13px] font-medium text-text-muted">Column mapping</p>
            <ul className="flex flex-col gap-0.5 text-[13px]">
              {mappedPairs.map(([col, field]) => (
                <li key={col} className="font-mono text-text-faint">
                  {col} <span className="text-text-faint">→</span> {field}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[13px] text-text-muted">
            {matchOn.size > 0 ? `Existing rows matched on ${[...matchOn].join(", ")}; everything else is inserted.` : "Every row is inserted — no existing rows will be updated."}
          </p>
          <p className="text-[13px] text-text-muted">
            {onError === "abort" ? "If any row fails, the import stops (batched in groups of 2,000)." : "Bad rows are skipped and reported; the rest still import."}
          </p>
        </div>
      </Modal>
    );
  }

  if (jobId) {
    return <ImportProgress table={table} jobId={jobId} onClose={onClose} onImported={onImported} />;
  }

  return null;
}
