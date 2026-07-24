import { useState, type ReactNode } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Download, File as FileIcon, Copy, Check } from "lucide-react";
import { call, ApiError } from "../../api/client";
import { Modal, ConfirmModal } from "../../components/Modal";
import { Button, IconButton } from "../../components/Button";
import { Badge, StatusBadge } from "../../components/Badge";
import { LoadingBlock, EmptyState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../shared/datetime";
import { formatBytes, isImageType, isTextType } from "./filerUtils";
import type { FilesOutletContext } from "./FilerFilesTab";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3.5 py-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-faint">{title}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-text">{children}</span>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="shrink-0 text-[13px] text-text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[12px] text-text" title={value}>
          {value}
        </span>
        <IconButton
          label={`Copy ${label}`}
          icon={copied ? <Check size={13} /> : <Copy size={13} />}
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        />
      </span>
    </div>
  );
}

const UNAVAILABLE_REASON: Record<string, string> = {
  pending: "This file is still being scanned and isn't previewable yet.",
  infected: "This file was flagged by the antivirus scan and can't be previewed or downloaded.",
  deleted: "This file has been deleted and is pending permanent removal.",
};

export function FilePreviewRoute() {
  const navigate = useNavigate();
  const { fileId } = useParams<{ fileId: string }>();
  const { rows, loading, reload } = useOutletContext<FilesOutletContext>();
  const toast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const close = () => navigate("/files/browse");
  const file = rows.find((r) => r.file_id === fileId);

  if (!file) {
    if (loading) {
      return (
        <Modal title="Loading…" onClose={close}>
          <LoadingBlock label="Loading file…" />
        </Modal>
      );
    }
    return (
      <Modal title="File not found" onClose={close}>
        <EmptyState title="File not found" description="It may have been deleted, or is outside the current filters/page." bordered={false} />
      </Modal>
    );
  }

  const servable = file.url !== null;

  const doDelete = async () => {
    setDeleting(true);
    try {
      await call("delete_filer_file", { file_id: file.file_id });
      toast.success(`Deleted "${file.original_filename}".`);
      reload();
      close();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (confirmingDelete) {
    return (
      <ConfirmModal
        title="Delete file"
        message={`Delete "${file.original_filename}"? It's queued for permanent removal, not gone instantly.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    );
  }

  return (
    <Modal
      title={file.original_filename}
      subtitle={file.content_type}
      size="xl"
      onClose={close}
      footer={
        <>
          <Button variant="danger" className="mr-auto" disabled={file.status === "deleted"} onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          <Button variant="primary" icon={<Download size={14} />} disabled={!servable} onClick={() => window.open(file.url!, "_blank", "noopener,noreferrer")}>
            Download
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        {/* Preview — larger, leading column. */}
        <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-border bg-neutral-50 p-3 dark:bg-neutral-900/40 lg:min-h-[440px]">
          {!servable ? (
            <div className="flex flex-col items-center gap-2 text-text-faint">
              <FileIcon size={36} />
              <span className="text-[13px]">No preview available</span>
            </div>
          ) : isImageType(file.content_type) ? (
            <img src={file.url!} alt={file.original_filename} className="max-h-[280px] max-w-full rounded object-contain lg:max-h-[440px]" />
          ) : file.content_type === "application/pdf" ? (
            <iframe src={file.url!} title={file.original_filename} className="h-[280px] w-full rounded border-0 lg:h-[440px]" />
          ) : isTextType(file.content_type) ? (
            <iframe src={file.url!} title={file.original_filename} className="h-[280px] w-full rounded border border-border bg-surface lg:h-[440px]" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center text-text-faint">
              <FileIcon size={36} />
              <span className="text-[13px]">No inline preview for {file.content_type}</span>
              <span className="text-xs">Use Download instead.</span>
            </div>
          )}
        </div>

        {/* Metadata — one grouped card with dividers instead of three
            separately-bordered boxes, matching the rest of the app's
            "Record metadata" pattern. */}
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          <Section title="Identity">
            <CopyField label="File ID" value={file.file_id} />
            <Row label="Size">{formatBytes(file.size_bytes)}</Row>
            <CopyField label="Checksum" value={file.checksum} />
          </Section>

          <Section title="Storage">
            <Row label="Provider">{file.storage}</Row>
            <Row label="Path">{file.path}</Row>
            <Row label="Visibility">
              <Badge tone={file.private ? "warning" : "neutral"}>{file.private ? "Private" : "Public"}</Badge>
            </Row>
            <Row label="Status">
              <StatusBadge status={file.status} />
            </Row>
          </Section>

          <Section title="History">
            <Row label="Uploaded by">{file.created_by || "—"}</Row>
            <Row label="Uploaded at">{formatDateTime(file.created_at)}</Row>
            {file.deleted_at && <Row label="Deleted at">{formatDateTime(file.deleted_at)}</Row>}
          </Section>

          {!servable && (
            <div className="px-3.5 py-3">
              <div className="rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-warning">
                {UNAVAILABLE_REASON[file.status] ?? "This file isn't currently available."}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
