// @ts-nocheck -- vendored from AgniUI, kept as shipped rather than rewritten to this app's stricter tsconfig
import React, { useEffect } from "react";

/* ── Types (mirrored in Modal.d.ts) ── */
export interface ModalProps {
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Action row, e.g. Cancel + Confirm buttons. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Red header icon for destructive confirmations. */
  danger?: boolean;
  closeOnScrim?: boolean;
  style?: React.CSSProperties;
}
/** Centered modal dialog over a scrim (Esc + scrim-click close). */


/**
 * AgniUI · Modal / Dialog
 * Centered dialog over a scrim. Closes on scrim-click + Escape.
 * sizes: sm · md · lg. Pass `footer` for the action row; `danger` tints the header.
 */
export function Modal({
  open = false,
  onClose,
  title,
  children,
  footer = null,
  size = "md",
  danger = false,
  closeOnScrim = true,
  style = {},
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 400, md: 520, lg: 720 };

  return (
    <div
      onClick={() => closeOnScrim && onClose && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "var(--modal-scrim)",
        backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, animation: "agni-fade-in var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div
        role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: widths[size] || widths.md, maxHeight: "calc(100vh - 48px)",
          display: "flex", flexDirection: "column", background: "var(--modal-bg)",
          border: "1px solid var(--border-default)", borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-2xl)", overflow: "hidden",
          animation: "agni-scale-pop var(--dur-normal) var(--ease-spring)", ...style,
        }}
      >
        {title && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
            {danger && <span style={{ width: 30, height: 30, borderRadius: "var(--radius-md)", background: "var(--status-error-soft)", color: "var(--status-error)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}><i className="ph-fill ph-warning" /></span>}
            <span style={{ flex: 1, fontSize: "var(--text-md)", fontWeight: "var(--fw-semibold)", color: "var(--text-primary)" }}>{title}</span>
            <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 17, borderRadius: "var(--radius-sm)", flexShrink: 0 }}><i className="ph ph-x" aria-hidden="true" /></button>
          </div>
        )}
        <div style={{ padding: 20, overflowY: "auto", fontSize: "var(--text-base)", color: "var(--text-secondary)", lineHeight: "var(--leading-normal)" }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border-default)", background: "var(--modal-bg)" }}>{footer}</div>}
      </div>
      <style>{`@keyframes agni-fade-in{from{opacity:0}}@keyframes agni-scale-pop{from{opacity:0;transform:scale(.96) translateY(8px)}}`}</style>
    </div>
  );
}
