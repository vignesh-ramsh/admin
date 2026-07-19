import type { CSSProperties, ReactNode } from "react";
import { Modal as AgniModal } from "./agni/feedback/Modal";

/**
 * Thin adapter over the copied AgniUI Modal (agni/feedback/Modal.tsx) —
 * keeps this app's existing "mount to show, unmount to hide" pattern (no
 * `open` prop anywhere in this app) and `wide` boolean, so no call site
 * needed touching except the two using the old `className="modal--with-
 * audit"` hook, which had no equivalent in AgniUI's Modal (no className
 * prop) — those two now pass `style` directly instead.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  style,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  style?: CSSProperties;
}) {
  return (
    <AgniModal
      open
      title={title}
      onClose={onClose}
      footer={footer}
      size={wide ? "lg" : "md"}
      style={style}
    >
      {children}
    </AgniModal>
  );
}
