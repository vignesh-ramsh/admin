import { useState } from "react";
import { call, ApiError } from "../../api/client";
import type { FilerFileRow } from "../../api/types";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Banner } from "../../components/agni/feedback/Banner";
import { useToast } from "../../components/Toast";
import { IconDownload, IconFile } from "../../layout/icons";
import { formatBytes, statusTone, isImage } from "./filerUtils";
import "./filer.css";

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
          <dl className="file-meta">
            <dt>File ID</dt>
            <dd className="mono">{file.file_id}</dd>
            <dt>Content type</dt>
            <dd className="mono">{file.content_type}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(file.size_bytes)}</dd>
            <dt>Storage</dt>
            <dd>{file.storage}</dd>
            <dt>Visibility</dt>
            <dd>
              <Badge tone={file.private ? "warning" : "neutral"}>{file.private ? "Private" : "Public"}</Badge>
            </dd>
            <dt>Status</dt>
            <dd>
              <Badge tone={statusTone(file.status)} dot>
                {file.status}
              </Badge>
            </dd>
            <dt>Checksum</dt>
            <dd className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{file.checksum}</dd>
            <dt>Uploaded by</dt>
            <dd>{file.created_by || <span className="muted">—</span>}</dd>
            <dt>Uploaded at</dt>
            <dd>{new Date(file.created_at).toLocaleString()}</dd>
            {file.deleted_at && (
              <>
                <dt>Deleted at</dt>
                <dd>{new Date(file.deleted_at).toLocaleString()}</dd>
              </>
            )}
          </dl>

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
