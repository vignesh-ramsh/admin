import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

export const CONTROL_CLASS =
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

export type ControlSize = "sm" | "md";

/* Redundant, deliberately not just relying on the h-8/h-9 utility classes
   below: verified live that a <select>/<input> pair with the IDENTICAL
   h-9 class can render at genuinely different heights depending on
   surrounding layout/paint timing (a <select> reliably resolves it, a
   plain <input> sometimes doesn't until something else forces a reflow) —
   an inline style has the highest cascade precedence there is, short of
   another inline style or an !important rule, so it's immune to whatever
   timing/cascade quirk causes that. Kept in sync with h-8/h-9 by hand
   (2rem/2.25rem — Tailwind's own 0.25rem spacing unit × 8/9). */
export const CONTROL_HEIGHT: Record<ControlSize, string> = { sm: "2rem", md: "2.25rem" };

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
  /** "sm" (h-8) for a dense toolbar/inline-editor context, "md" (h-9, the
   *  default) everywhere else — one real API instead of the ad-hoc
   *  `className="!h-8"` override 15+ call sites used to hand-roll.
   *  Shadows the native HTML `size` attribute (character-width count) —
   *  never used anywhere in this codebase, and this component doesn't
   *  forward it through anyway. */
  size?: ControlSize;
}

/* The ONE box every control below renders through — TextInput and Select
   NEVER style their own <input>/<select> directly, both go through this
   exact same wrapper (border/background/height/focus-ring). Two DIFFERENT
   leaf tags, each with their own separately-authored className string,
   were verified live to sometimes end up at genuinely different rendered
   heights even with matching h-8/h-9 classes AND a matching inline height
   style on each. Routing both through one shared component removes any
   possibility of that by construction: there is only one place this box's
   JSX is written, so there is nothing for the two controls to diverge on.
   overflow-hidden is a hard backstop — whatever's inside physically cannot
   make this box taller than its own explicit height, no matter what.

   Deliberately takes NO className/style from callers — see TextInput and
   Select below for why. It is always a plain, non-flex-item block sized
   by its own parent's width (block width:auto fills the containing
   block), never a flex item with a caller-controlled flex-basis. */
function ControlBox({ size, error, children }: { size: ControlSize; error?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        "flex items-stretch overflow-hidden rounded-md border bg-surface transition-colors focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/25",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-neutral-100 dark:has-[:disabled]:bg-neutral-900",
        size === "sm" ? "h-8" : "h-9",
        error ? "border-danger" : "border-border-strong",
      )}
      style={{ height: CONTROL_HEIGHT[size] }}
    >
      {children}
    </div>
  );
}

/* The `className` every consumer passes (widths like w-48/flex-1/min-w-0)
   applies to THIS outer div, never to ControlBox directly — confirmed
   live that a flex item with `flex-basis: 0%` (Tailwind's flex-1)
   that is ITSELF a flex container with an explicit inline height
   renders at its CONTENT height (~19px) instead of its declared height
   (32px) in this browser, even though nothing beats an inline style in
   the cascade — toggling flex-basis between 0% and auto on the exact
   broken element flipped its measured height between 19px and 32px with
   nothing else changed. Since ControlBox is itself a flex container
   (for stretching its input/select child) as well as being a flex ITEM
   in whatever row it sits in, it's exactly the shape that bug needs.
   Giving the caller's className to a plain intermediary div instead
   means ControlBox is never itself the flex item — it's always a normal
   block child sized to 100% of this div's width via ordinary block flow,
   so the bug has no flex item to attach to, regardless of what layout
   utility a future call site passes in. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, mono, size = "md", className, id, required, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <div className={className}>
        <ControlBox size={size} error={error}>
          <input
            ref={ref}
            id={fieldId}
            className={clsx(
              "h-full w-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-text placeholder:text-text-faint outline-none disabled:cursor-not-allowed disabled:text-text-faint",
              mono && "font-mono text-[13px]",
            )}
            aria-invalid={!!error}
            {...rest}
          />
        </ControlBox>
      </div>
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

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  size?: ControlSize;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, size = "md", className, id, required, children, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <div className={className}>
        <ControlBox size={size} error={error}>
          <select
            ref={ref}
            id={fieldId}
            className="h-full w-full min-w-0 flex-1 cursor-pointer bg-transparent px-2.5 pr-8 text-sm text-text outline-none disabled:cursor-not-allowed disabled:text-text-faint"
            aria-invalid={!!error}
            {...rest}
          >
            {children}
          </select>
        </ControlBox>
      </div>
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
