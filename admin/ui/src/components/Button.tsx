import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button as AgniButton } from "./agni/core/Button";

/**
 * Thin adapter over the copied AgniUI Button (agni/core/Button.tsx) —
 * keeps this app's existing variant/size vocabulary so no call site needed
 * touching, while the real rendering/interaction is AgniUI's own component.
 */
type Variant = "primary" | "secondary" | "danger" | "ghost";

const CATEGORY: Record<Variant, "primary" | "secondary" | "danger" | "ghost"> = {
  primary: "primary",
  secondary: "secondary",
  danger: "danger",
  ghost: "ghost",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <AgniButton
      category={CATEGORY[variant]}
      size={size}
      block={block}
      loading={loading}
      disabled={disabled}
      {...rest}
    >
      {children}
    </AgniButton>
  );
}
