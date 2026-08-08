import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
  /** Rendered as a sibling of the <input>, INSIDE the same ControlBox —
   *  e.g. a password show/hide toggle. Deliberately routed through the
   *  one shared ControlBox rather than a second, caller-built wrapper box
   *  (ControlBox's own docstring above: two different boxes, even with
   *  matching height classes, have been verified to render at genuinely
   *  different heights). */
  endAdornment?: ReactNode;
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
  { label, hint, error, mono, size = "md", className, id, required, endAdornment, ...rest },
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
          {endAdornment}
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

interface SelectProps {
  label?: string;
  hint?: string;
  error?: string;
  size?: ControlSize;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  /** Same contract as a native <select>'s children — plain <option
   *  value=...>label</option> elements (optionally produced via .map). */
  children: ReactNode;
}

interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/* A native <select>'s OPEN dropdown popup is OS/browser chrome — outside
   this app's paint tree, so nothing here can style the hover/highlight
   color an OS gives its native option list (confirmed: color-scheme and
   <option> background/color both only affect the popup's resting state,
   never its hover/active highlight, which stays whatever blue-ish system
   color the OS itself uses no matter what CSS is set). Combobox already
   solved this the only way that's actually solvable: don't use a native
   select at all — render the trigger and the open list as plain styled
   elements, where hover/active states are ordinary CSS this app fully
   controls. This IS that same pattern, applied to Select, so both look
   and behave identically instead of one being permanently at the mercy
   of the OS. children is read as plain <option> elements (not a new
   `options` prop) so every existing call site needed zero changes. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { label, hint, error, size = "md", className, id, required, disabled, value, onChange, children },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const options = useMemo<SelectOption[]>(
    () =>
      Children.toArray(children)
        .filter(
          (child): child is ReactElement<OptionHTMLAttributes<HTMLOptionElement>> =>
            isValidElement(child) && child.type === "option",
        )
        .map((child) => ({
          value: String(child.props.value ?? ""),
          label: child.props.children,
          disabled: child.props.disabled,
        })),
    [children],
  );
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (v: string) => {
    onChange({ target: { value: v } });
    setOpen(false);
  };

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <div ref={rootRef} className={clsx("relative", className)}>
        <ControlBox size={size} error={error}>
          <button
            ref={ref}
            type="button"
            id={fieldId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-invalid={!!error}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!open) setOpen(true);
                else setActiveIdx((i) => Math.min(i + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!open) setOpen(true);
                else setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!open) setOpen(true);
                else {
                  const opt = options[activeIdx];
                  if (opt && !opt.disabled) commit(opt.value);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className="flex h-full w-full min-w-0 flex-1 cursor-pointer items-center justify-between gap-1.5 bg-transparent px-2.5 text-left text-sm text-text outline-none disabled:cursor-not-allowed disabled:text-text-faint"
          >
            <span className="min-w-0 truncate">{selected?.label}</span>
            <ChevronsUpDown size={14} className="shrink-0 text-text-faint" />
          </button>
        </ControlBox>
        {open && (
          <div
            role="listbox"
            className="scrollbar-thin absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg shadow-black/10"
          >
            {options.map((opt, idx) => (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                disabled={opt.disabled}
                onClick={() => commit(opt.value)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={clsx(
                  "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:text-text-faint",
                  idx === activeIdx ? "bg-accent-50 dark:bg-accent-950/40" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50",
                )}
              >
                <span className="truncate text-text">{opt.label}</span>
                {opt.value === value && <Check size={14} className="shrink-0 text-accent-600" />}
              </button>
            ))}
          </div>
        )}
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
