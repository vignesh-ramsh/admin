import type { ReactNode } from "react";
import { EmptyState as AgniEmptyState } from "./agni/feedback/EmptyState";
import { Progress } from "./agni/feedback/Progress";

/**
 * Thin adapters over the copied AgniUI feedback components — keeps this
 * app's existing Loading/EmptyState/ErrorState signatures so no call site
 * needed touching.
 */

export function Loading({ message = "Loading…" }: { message?: string }) {
  return (
    <div style={{ padding: "32px 24px", maxWidth: 320, margin: "0 auto" }}>
      <Progress indeterminate label={message} />
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  message,
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return <AgniEmptyState title={title} message={message} action={action} />;
}

export function ErrorState({ title = "Something went wrong", message }: { title?: string; message?: string }) {
  return (
    <AgniEmptyState
      icon="ph-warning-circle"
      title={title}
      message={message}
      style={{
        borderColor: "var(--status-error)",
        background: "var(--status-error-soft)",
      }}
    />
  );
}
