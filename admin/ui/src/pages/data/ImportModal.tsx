import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import type { DataJob, FilerSettingEntry, ImportPreview, ImportRowError, TableSchema } from "../../api/types";
import { call, ApiError } from "../../api/client";
import { uploadFilerFile } from "../../api/filerClient";
import { Button } from "../../components/Button";
import { Checkbox, Select } from "../../components/Field";
import { MultiCombobox } from "../../components/MultiCombobox";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useJobPolling } from "../../hooks/useJobPolling";
import { editableFields } from "./format";

const WAIT_STATUSES = new Set(["PendingReview", "Completed", "CompletedWithErrors", "Failed"]);
const TERMINAL_STATUSES = new Set(["Completed", "CompletedWithErrors", "Failed"]);
const SKIP = "";

type Step = "type" | "upload" | "map" | "progress";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/* Two-phase job now (2026-08-25 design): Queued -> PendingReview is pure
   staging + precheck, nothing written yet — the review UI below (errors,
   Commit/Replace file) renders for that status. Only committing moves it
   into the actual write pass (Running -> a real terminal status), which
   is when onImported() finally fires. `key={pollGen}` on the inner cycle
   is what lets a Commit/Replace/Resume click restart useJobPolling — that
   hook only ever starts on mount, so "poll again" means "mount a new
   instance", not calling some restart method it doesn't have. */
export function ImportProgress(props: { table: string; jobId: string; onClose: () => void; onImported: () => void }) {
  const [pollGen, setPollGen] = useState(0);
  return <ImportProgressCycle key={pollGen} {...props} onAdvance={() => setPollGen((g) => g + 1)} />;
}

function ImportProgressCycle({
  table,
  jobId,
  onClose,
  onImported,
  onAdvance,
}: {
  table: string;
  jobId: string;
  onClose: () => void;
  onImported: () => void;
  onAdvance: () => void;
}) {
  const toast = useToast();
  const [errorRows, setErrorRows] = useState<ImportRowError[] | null>(null);
  const [errorCursor, setErrorCursor] = useState<string | null>(null);
  const [errorTotal, setErrorTotal] = useState<number | null>(null);
  const [loadingMoreErrors, setLoadingMoreErrors] = useState(false);
  const [acting, setActing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const { job } = useJobPolling<DataJob>(
    () => call<DataJob>("get_data_job", { job_id: jobId }, { method: "GET" }),
    (j) => WAIT_STATUSES.has(j.status),
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
    if (job?.status === "PendingReview" || job?.status === "CompletedWithErrors") {
      call<{ rows: ImportRowError[]; next_cursor: string | null; total: number }>(
        "list_import_row_errors",
        { job_id: jobId, limit: 50 },
        { method: "GET" },
      )
        .then((res) => {
          setErrorRows(res.rows);
          setErrorCursor(res.next_cursor);
          setErrorTotal(res.total);
        })
        .catch(() => {
          /* best-effort — the summary counts still tell the story */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const loadMoreErrors = async () => {
    if (!errorCursor) return;
    setLoadingMoreErrors(true);
    try {
      const res = await call<{ rows: ImportRowError[]; next_cursor: string | null; total: number }>(
        "list_import_row_errors",
        { job_id: jobId, after: errorCursor, limit: 50 },
        { method: "GET" },
      );
      setErrorRows((cur) => [...(cur ?? []), ...res.rows]);
      setErrorCursor(res.next_cursor);
      setErrorTotal(res.total);
    } catch {
      /* best-effort — the loaded rows and summary counts still tell the story */
    } finally {
      setLoadingMoreErrors(false);
    }
  };

  const formatRawData = (raw: Record<string, unknown>): string =>
    Object.entries(raw)
      .map(([k, v]) => `${k}=${v === null || v === undefined ? "" : String(v)}`)
      .join(", ");

  const commit = async () => {
    setActing(true);
    try {
      await call("commit_import", { job_id: jobId });
      onAdvance();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start the import");
    } finally {
      setActing(false);
    }
  };

  const doReplace = async () => {
    if (!replaceFile) return;
    setActing(true);
    try {
      const uploaded = await uploadFilerFile(replaceFile, { private: true });
      await call("replace_import_file", { job_id: jobId, file: uploaded.file_id });
      onAdvance();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to replace the file");
    } finally {
      setActing(false);
    }
  };

  const resume = async () => {
    setActing(true);
    try {
      await call("resume_import", { job_id: jobId });
      onAdvance();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to resume");
    } finally {
      setActing(false);
    }
  };

  const total = job?.stats?.total ?? null;
  const succeeded = job?.stats?.succeeded ?? 0;
  const failed = job?.stats?.failed ?? 0;
  const pct = total ? Math.min(100, Math.round(((succeeded + failed) / total) * 100)) : null;
  const canResume = job && (job.status === "CompletedWithErrors" || (job.status === "Failed" && total !== null));
  const allClear = job?.status === "PendingReview" && failed === 0;

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

            {allClear ? (
              <div className="flex items-center gap-2 rounded-md border border-success/30 bg-gradient-to-r from-success-bg to-success-bg/10 px-3 py-2.5 text-sm font-medium text-success">
                <CheckCircle2 size={16} className="shrink-0" />
                All {total} row{total === 1 ? "" : "s"} passed validation — ready to commit.
              </div>
            ) : job.status === "PendingReview" ? (
              <p className="text-[13px] text-text-muted">
                {total !== null ? `${total} row${total === 1 ? "" : "s"} staged` : "File staged"} — {failed} failed
                precheck (bad cells or unresolved references). Review below, then commit or replace the file.
              </p>
            ) : (
              <p className="text-[13px] text-text-muted">
                {succeeded + failed}
                {total !== null ? ` of ${total}` : ""} rows processed — {succeeded} succeeded, {failed} failed.
              </p>
            )}

            {job.status === "Failed" && (
              <p className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {job.error || "Import failed."}
              </p>
            )}

            {errorRows && errorRows.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-text-faint">
                  Showing {errorRows.length}
                  {errorTotal !== null ? ` of ${errorTotal}` : ""} failed row{errorTotal === 1 ? "" : "s"}.
                </p>
                <div className="scrollbar-thin max-h-72 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-surface-raised text-text-muted">
                      <tr>
                        <th className="border-b border-border px-3 py-1.5 text-left font-medium">Row</th>
                        <th className="border-b border-border px-3 py-1.5 text-left font-medium">Data</th>
                        <th className="border-b border-border px-3 py-1.5 text-left font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorRows.map((r) => (
                        <tr key={r.id} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-1.5 align-top font-mono text-text-faint">#{r.row_number}</td>
                          <td
                            className="max-w-[220px] truncate px-3 py-1.5 align-top font-mono text-text-faint"
                            title={formatRawData(r.raw_data)}
                          >
                            {formatRawData(r.raw_data)}
                          </td>
                          <td className="px-3 py-1.5 align-top text-danger">{r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {errorCursor && (
                  <Button variant="secondary" size="sm" onClick={loadMoreErrors} loading={loadingMoreErrors}>
                    Load more
                  </Button>
                )}
              </div>
            )}

            {job.status === "PendingReview" &&
              (!replacing ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" onClick={commit} loading={acting}>
                      Commit import
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setReplacing(true)} disabled={acting}>
                      Replace file
                    </Button>
                  </div>
                  {failed > 0 && "on_error" in job.settings && job.settings.on_error === "abort" && (
                    <p className="text-xs text-text-faint">
                      These {failed} row{failed === 1 ? "" : "s"} will fail the same way on commit (nothing gets written) —
                      replace the file to fix them, or switch to a new import without Atomic instead.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <label className="text-[13px] font-medium text-text-muted">Replacement file (CSV or Excel)</label>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                    className="cursor-pointer text-sm text-text file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-action file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg hover:file:brightness-95"
                  />
                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" onClick={doReplace} loading={acting} disabled={!replaceFile}>
                      Upload &amp; restage
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setReplacing(false)} disabled={acting}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}

            {canResume && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={<RotateCcw size={13} />} onClick={resume} loading={acting}>
                  Resume
                </Button>
                <p className="text-xs text-text-faint">Retries the still-failing rows as-is — start a new import to fix bad source data.</p>
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
  const fieldOptions = useMemo(() => fields.map((f) => ({ value: f.name, label: f.name + (f.required ? " *" : "") })), [fields]);

  const [step, setStep] = useState<Step>("type");

  // Step 1: type + match-on + atomicity — decided before any file exists.
  const [importType, setImportType] = useState<"insert" | "update" | "upsert">("insert");
  const [matchOn, setMatchOn] = useState<string[]>([]);
  const [atomic, setAtomic] = useState(true);

  // Step 2: file + null handling.
  const [file, setFile] = useState<File | null>(null);
  const [nullOnEmpty, setNullOnEmpty] = useState(false);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileToken, setFileToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Step 3: column mapping.
  const [mapping, setMapping] = useState<Record<string, string>>({}); // file column -> field name, "" = skip

  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    call<FilerSettingEntry[]>("list_filer_settings", {}, { method: "GET" })
      .then((rows) => {
        const v = rows.find((r) => r.key === "filer_max_upload_bytes")?.value;
        if (typeof v === "number") setMaxUploadBytes(v);
        else if (typeof v === "string" && v) setMaxUploadBytes(Number(v));
      })
      .catch(() => {
        /* best-effort — the upload itself still enforces the real limit server-side */
      });
  }, []);

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

  const mappedCount = useMemo(
    () => new Set(Object.values(mapping).filter((v) => v !== SKIP)).size,
    [mapping],
  );

  const start = async () => {
    if (!fileToken || !preview || mappedCount === 0) return;
    setStarting(true);
    try {
      const columnMapping: Record<string, string> = {};
      for (const col of preview.columns) {
        if (mapping[col] && mapping[col] !== SKIP) columnMapping[col] = mapping[col];
      }
      const created = await call<DataJob>("start_import", {
        table,
        file: fileToken,
        column_mapping: columnMapping,
        on_error: atomic ? "abort" : "skip",
        import_type: importType,
        match_on: importType !== "insert" && matchOn.length > 0 ? matchOn : null,
        null_on_empty: nullOnEmpty,
      });
      setJobId(created.id);
      setStep("progress");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start import");
    } finally {
      setStarting(false);
    }
  };

  if (step === "type") {
    return (
      <Modal
        title={`Import into ${table}`}
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep("upload")}
              disabled={importType !== "insert" && matchOn.length === 0}
            >
              Next
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Import type"
            value={importType}
            onChange={(e) => {
              const v = e.target.value as "insert" | "update" | "upsert";
              setImportType(v);
              if (v === "insert") setMatchOn([]);
            }}
          >
            <option value="insert">Insert</option>
            <option value="update">Update</option>
            <option value="upsert">Upsert</option>
          </Select>

          {importType !== "insert" && (
            <MultiCombobox label="Match on" value={matchOn} onChange={setMatchOn} options={fieldOptions} placeholder="Search fields…" />
          )}

          <Checkbox label="Atomic (all or nothing)" checked={atomic} onChange={(e) => setAtomic(e.target.checked)} />
        </div>
      </Modal>
    );
  }

  if (step === "upload") {
    return (
      <Modal
        title={`Import into ${table}`}
        onClose={onClose}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep("type")} disabled={uploading}>
              Back
            </Button>
            <Button variant="primary" onClick={doUpload} loading={uploading} disabled={!file}>
              Load file
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-text-muted">File (CSV or Excel)</label>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="cursor-pointer text-sm text-text file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-action file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg hover:file:brightness-95"
            />
            {maxUploadBytes !== null && <p className="text-xs text-text-faint">Max file size: {formatBytes(maxUploadBytes)}</p>}
          </div>
          <Checkbox
            label="Replace the value if sheet contains empty value"
            checked={nullOnEmpty}
            onChange={(e) => setNullOnEmpty(e.target.checked)}
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
            <Button variant="secondary" onClick={() => setStep("upload")} disabled={starting}>
              Back
            </Button>
            <Button variant="primary" onClick={start} loading={starting} disabled={mappedCount === 0}>
              Start import
            </Button>
          </>
        }
      >
        <div className="scrollbar-thin max-h-96 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-raised text-[13px] text-text-muted">
              <tr>
                <th className="border-b border-border px-3 py-2 text-left font-medium">File column</th>
                <th className="border-b border-border px-3 py-2 text-left font-medium">Maps to</th>
              </tr>
            </thead>
            <tbody>
              {preview.columns.map((col) => (
                <tr key={col} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-[13px] text-text">{col}</td>
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
      </Modal>
    );
  }

  if (jobId) {
    return <ImportProgress table={table} jobId={jobId} onClose={onClose} onImported={onImported} />;
  }

  return null;
}
