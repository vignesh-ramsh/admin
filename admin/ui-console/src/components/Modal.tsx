import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { Button, IconButton } from "./Button";

type Size = "sm" | "md" | "lg" | "xl" | "full";

const SIZES: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[calc(100vw-2rem)]",
};

export function Modal({
  title,
  subtitle,
  onClose,
  size = "md",
  children,
  footer,
  scrollBody = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
  /** Default true: the body scrolls as one region. Set false when the
   *  content manages its own internal scroll region(s) — e.g. a
   *  side-by-side layout where one column should scroll independently of
   *  the other, rather than the whole modal scrolling together. */
  scrollBody?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:pt-[10vh]">
      <div className="modal-backdrop-in fixed inset-0 bg-neutral-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          "modal-panel-in relative flex w-full max-h-[80vh] flex-col rounded-xl border border-border bg-surface-raised shadow-2xl shadow-black/10",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="modal-title" className="truncate text-[15px] font-semibold text-text">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Close" icon={<X size={17} />} onClick={onClose} className="shrink-0" />
        </div>
        <div
          className={clsx(
            "px-5 py-4",
            scrollBody ? "scrollbar-thin flex-1 overflow-y-auto" : "flex min-h-0 flex-1 flex-col overflow-hidden",
          )}
        >
          {children}
        </div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-text-muted">{message}</div>
    </Modal>
  );
}
