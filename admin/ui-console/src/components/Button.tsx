import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-300 dark:disabled:bg-accent-900 shadow-sm",
  secondary:
    "bg-surface-raised text-text border border-border-strong hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50",
  ghost: "text-text-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-text disabled:opacity-50",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50 shadow-sm",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        "inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  icon,
  className,
  ...rest
}: { label: string; icon: React.ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-neutral-100 hover:text-text disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
