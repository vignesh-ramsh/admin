import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { FilerFileRow } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Banner } from "../../components/agni/feedback/Banner";
import { useToast } from "../../components/Toast";
import { IconDownload, IconFile, IconCopy, IconCheck } from "../../layout/icons";
import { formatBytes, statusTone, isImage } from "./filerUtils";
import { formatWhen } from "../shared/datetime";
import "./filer.css";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      title="Copy to clipboard"
      aria-label="Copy to clipboard"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

const UNAVAILABLE_REASON: Record<string, string> = {
  pending: "This file is still being scanned and isn't previewable yet.",
  infected: "This file was flagged by the antivirus scan and can't be previewed or downloaded.",
  deleted: "This file has been deleted and is pending permanent removal.",
};

export function FilePreviewModal({
  file,
  onClose,
  onDeleted,
}: {
  file: FilerFileRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const servable = file.url !== null;

  const doDelete = async () => {
    setDeleting(true);
    try {
      await call("delete_filer_file", { file_id: file.file_id });
      toast.success(`Deleted "${file.original_filename}".`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed", "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={file.original_filename}
      onClose={onClose}
      wide
      style={{ maxWidth: 920 }}
      footer={
        confirmingDelete ? (
          <>
            <span className="muted" style={{ marginRight: "auto", fontSize: 13 }}>
              Delete this file? It's queued for permanent removal, not gone instantly.
            </span>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} loading={deleting}>
              Confirm delete
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="danger"
              style={{ marginRight: "auto" }}
              disabled={file.status === "deleted"}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" disabled={!servable} onClick={() => window.open(file.url!, "_blank", "noopener,noreferrer")}>
              <IconDownload /> Download
            </Button>
          </>
        )
      }
    >
      <div className="file-preview-layout">
        <div className="file-preview-layout__info">
          <div className="file-meta-card">
            <div className="file-meta-card__head">
              <IconFile size={18} />
              <span>Identity</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">File ID</span>
              <span className="file-meta-row__value mono">{file.file_id}</span>
              <CopyButton value={file.file_id} />
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Content type</span>
              <span className="file-meta-row__value mono">{file.content_type}</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Size</span>
              <span className="file-meta-row__value">{formatBytes(file.size_bytes)}</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Checksum</span>
              <span className="file-meta-row__value mono" style={{ fontSize: 11 }}>
                {file.checksum.slice(0, 16)}…
              </span>
              <CopyButton value={file.checksum} />
            </div>
          </div>

          <div className="file-meta-card">
            <div className="file-meta-card__head">
              <i className="ph ph-hard-drives" aria-hidden="true" />
              <span>Storage</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Provider</span>
              <span className="file-meta-row__value">{file.storage}</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Path</span>
              <span className="file-meta-row__value mono">{file.path}</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Visibility</span>
              <span className="file-meta-row__value">
                <Badge tone={file.private ? "warning" : "neutral"}>{file.private ? "Private" : "Public"}</Badge>
              </span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Status</span>
              <span className="file-meta-row__value">
                <Badge tone={statusTone(file.status)} dot>
                  {file.status}
                </Badge>
              </span>
            </div>
          </div>

          <div className="file-meta-card">
            <div className="file-meta-card__head">
              <i className="ph ph-clock-counter-clockwise" aria-hidden="true" />
              <span>History</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Uploaded by</span>
              <span className="file-meta-row__value">{file.created_by || <span className="muted">—</span>}</span>
            </div>
            <div className="file-meta-row">
              <span className="file-meta-row__label">Uploaded at</span>
              <span className="file-meta-row__value">{formatWhen(file.created_at)}</span>
            </div>
            {file.deleted_at && (
              <div className="file-meta-row">
                <span className="file-meta-row__label">Deleted at</span>
                <span className="file-meta-row__value">{formatWhen(file.deleted_at)}</span>
              </div>
            )}
          </div>

          {!servable && (
            <Banner tone="warning">{UNAVAILABLE_REASON[file.status] ?? "This file isn't currently available."}</Banner>
          )}
        </div>

        <div className="file-preview-layout__preview">
          {!servable ? (
            <div className="file-preview-empty">
              <IconFile size={40} />
              <span className="muted">No preview available</span>
            </div>
          ) : isImage(file.content_type) ? (
            <div className="file-preview-image">
              <img src={file.url!} alt={file.original_filename} />
            </div>
          ) : file.content_type === "application/pdf" ? (
            <iframe src={file.url!} title={file.original_filename} className="file-preview-pdf" />
          ) : (
            <div className="file-preview-empty">
              <IconFile size={40} />
              <span className="muted">No inline preview for {file.content_type}</span>
              <span className="muted" style={{ fontSize: 12 }}>Use Download instead.</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
