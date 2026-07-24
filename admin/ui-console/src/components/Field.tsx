import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

const CONTROL_CLASS =
  "w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-text placeholder:text-text-faint transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-text-faint dark:disabled:bg-neutral-900";

export function FieldShell({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  inline,
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", inline && "flex-row items-center gap-2.5")}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-text-muted">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, mono, className, id, required, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <input
        ref={ref}
        id={fieldId}
        className={clsx(CONTROL_CLASS, "h-9", mono && "font-mono text-[13px]", error && "border-danger", className)}
        aria-invalid={!!error}
        {...rest}
      />
    </FieldShell>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, mono, className, id, required, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={clsx(CONTROL_CLASS, "py-2 leading-relaxed", mono && "font-mono text-[13px]", error && "border-danger", className)}
        aria-invalid={!!error}
        {...rest}
      />
    </FieldShell>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, required, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <select
        ref={ref}
        id={fieldId}
        className={clsx(CONTROL_CLASS, "h-9 cursor-pointer bg-surface pr-8", error && "border-danger", className)}
        aria-invalid={!!error}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});

export function Checkbox({
  label,
  className,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <label htmlFor={fieldId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text">
      <input
        id={fieldId}
        type="checkbox"
        className={clsx(
          "h-4 w-4 cursor-pointer rounded border-border-strong text-accent-600 focus:ring-2 focus:ring-accent-500/25 accent-[var(--accent-600)]",
          className,
        )}
        {...rest}
      />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("inline-flex items-center gap-2 text-sm text-text", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent-600" : "bg-neutral-300 dark:bg-neutral-700",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      {label}
    </label>
  );
}
