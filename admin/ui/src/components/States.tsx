import type { ReactNode } from "react";

export function Loading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="state">
      <span className="spinner" />
      <span className="state__msg">{message}</span>
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
  return (
    <div className="state">
      <div className="state__title">{title}</div>
      {message && <div className="state__msg">{message}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message }: { title?: string; message?: string }) {
  return (
    <div className="state state--error">
      <div className="state__title">{title}</div>
      {message && <div className="state__msg">{message}</div>}
    </div>
  );
}
