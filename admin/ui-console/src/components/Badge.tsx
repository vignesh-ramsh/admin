import clsx from "clsx";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  accent: "bg-accent-100 text-accent-700 dark:bg-accent-900/50 dark:text-accent-300",
};

export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-5",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  clean: "success",
  success: "success",
  ok: "success",
  inactive: "neutral",
  pending: "warning",
  locked: "danger",
  infected: "danger",
  failed: "danger",
  deleted: "danger",
  skipped: "neutral",
};

/** Maps a common status string to a sensible badge tone by convention. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-text-faint">—</span>;
  const tone = STATUS_TONE[status.toLowerCase()] ?? "neutral";
  return (
    <Badge tone={tone} dot>
      {status}
    </Badge>
  );
}
