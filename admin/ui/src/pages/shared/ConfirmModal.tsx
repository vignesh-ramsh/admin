import { useState, type ReactNode } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";

/**
 * A real confirmation dialog for anything destructive — replaces the
 * browser's native confirm(), which every OTHER destructive action in this
 * app already avoided (DeleteRoleModal/ClearScopeModal/PruneModal all use
 * a real Modal). Three call sites still used window.confirm() directly:
 * SchemaEditor's file delete, DataBrowserPage's bulk delete, and
 * RowEditorModal's row delete — normalized onto this shared component.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13.5 }}>{message}</p>
    </Modal>
  );
}
