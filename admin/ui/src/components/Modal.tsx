import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { Button, IconButton } from "./Button";

type Size = "sm" | "md" | "lg" | "xl" | "panel-closed" | "panel-open" | "full";

/* Width AND height now each get a floor as well as a ceiling, varying per
   breakpoint — not just the old single always-max-w-N. Mobile (below sm)
   deliberately gets NO min-width/min-height floor on any size: forcing one
   on a narrow phone viewport would just overflow it. The floor only shows
   up from sm/lg upward, and only scales with `size` — sm/md stay exactly
   as tightly content-sized as before (a short ConfirmModal shouldn't grow
   a tall empty box under it), it's lg/xl and up — genuinely content-heavy
   modals — that get a real floor so they don't look like a near-empty box
   when a given row happens to be short on fields.

   `panel-closed`/`panel-open` exist specifically for the Row Preview
   modal's own expand panel (its audit history / child row / file detail
   side panel) — no other caller needs them. Both are a genuinely FIXED
   width (min===max, not a range) computed to match RowEditorRoute's own
   layout exactly: panel-closed = main column (52rem) + dialog padding
   (2×1.25rem); panel-open = that + the gap (1.5rem) + the panel column's
   own fixed width (21rem). Two fixed numbers, not a responsive band or
   `w-fit`, is deliberate: it's the only way to (a) transition smoothly
   between them and (b) guarantee the main column's rendered width is
   bit-for-bit identical in both states — confirmed live, a proportional
   `1fr` column's width visibly reflows/rewraps the instant a shared
   container's max-width changes, which is what "the jump" actually was. */
const SIZES: Record<Size, string> = {
  sm: "w-full max-w-[calc(100vw-2rem)] sm:max-w-md",
  md: "w-full max-w-[calc(100vw-2rem)] sm:max-w-xl",
  lg: "w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl sm:min-w-[28rem]",
  xl: "w-full max-w-[calc(100vw-2rem)] lg:max-w-5xl lg:min-w-[36rem]",
  "panel-closed": "w-full max-w-[calc(100vw-2rem)] lg:w-[54.5rem]",
  "panel-open": "w-full max-w-[calc(100vw-2rem)] lg:w-[77rem]",
  full: "max-w-[calc(100vw-2rem)]",
};

const HEIGHTS: Record<Size, string> = {
  sm: "max-h-[85vh]",
  md: "max-h-[85vh]",
  lg: "max-h-[85vh] sm:min-h-[40vh]",
  xl: "max-h-[88vh] sm:min-h-[50vh]",
  "panel-closed": "max-h-[90vh] sm:min-h-[50vh]",
  "panel-open": "max-h-[92vh] sm:min-h-[60vh]",
  full: "max-h-[92vh]",
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
          "modal-panel-in relative flex flex-col rounded-xl border border-border bg-surface-raised shadow-2xl shadow-black/10",
          (size === "panel-closed" || size === "panel-open") && "transition-[width] duration-200 ease-out",
          SIZES[size],
          HEIGHTS[size],
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
