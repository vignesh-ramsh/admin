import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-faint">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/25 bg-danger-bg/40 py-12 text-center">
      <AlertTriangle size={20} className="text-danger" />
      <p className="max-w-sm text-sm text-text">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  bordered = true,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Dashed border box (default). Set false when centering inside a table
   *  container that already draws its own border. */
  bordered?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex h-full min-h-[280px] flex-1 flex-col items-center justify-center gap-2 text-center",
        // bg-surface travels with `bordered`: this is the "I'm a standalone
        // placeholder card" case (vs. bordered=false, inline content that
        // inherits whatever surface it's dropped into) — without it, this
        // box sat on the page's canvas color instead of reading as a card
        // like every other panel around it.
        bordered && "rounded-lg border border-dashed border-border bg-surface",
      )}
    >
      {icon && <div className="mb-1 text-text-faint">{icon}</div>}
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
