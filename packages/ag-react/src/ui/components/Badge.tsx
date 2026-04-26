/**
 * Badge Component
 *
 * A small inline label for status display.
 *
 * Variant surface (Sterling Phase 2b):
 *   - `error` | `warning` | `success` | `info` — status variants (what's happening)
 *   - `accent` — emphasis / brand (preferred over legacy `primary`)
 *   - `destructive` — intent alias for `error` (semantic correctness without
 *     palette sprawl; see design-system.md §"Intent vs role")
 *   - `primary` — legacy synonym for `accent`, accepted during Phase 2b/2c
 *   - `default` — base foreground
 *
 * Usage:
 * ```tsx
 * <Badge label="Active" variant="success" />
 * <Badge label="Delete" variant="destructive" />
 * <Badge label="New" variant="accent" />
 * <Badge label="Custom" color="magenta" />
 * ```
 */
import React from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

/**
 * Variant values — Sterling statuses plus the `destructive` intent alias.
 * `primary` stays as a legacy synonym for `accent` while km-tui finishes
 * migrating; it resolves to the same Sterling token.
 */
export type BadgeVariant =
  | "default"
  | "accent"
  | "error"
  | "warning"
  | "success"
  | "info"
  | "destructive"
  | "primary"

export interface BadgeProps extends Omit<TextProps, "children"> {
  /** Badge text */
  label: string
  /**
   * Sterling variant. Accepts status roles (`error`/`warning`/`success`/`info`),
   * the accent emphasis role, or the `destructive` intent alias. Legacy
   * `primary` stays as a synonym during Phase 2b/2c.
   */
  variant?: BadgeVariant
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Variant → Sterling flat token mapping. `destructive` aliases to `error` per
 * D1 (intent lives at the component layer, not as a Theme field).
 */
const VARIANT_COLORS: Record<BadgeVariant, string> = {
  default: "$fg",
  accent: "$fg-accent",
  primary: "$fg-accent",
  error: "$fg-error",
  destructive: "$fg-error",
  warning: "$fg-warning",
  success: "$fg-success",
  info: "$fg-info",
}

// =============================================================================
// Component
// =============================================================================

export function Badge({
  label,
  variant = "default",
  color,
  ...rest
}: BadgeProps): React.ReactElement {
  const resolvedColor = color ?? VARIANT_COLORS[variant]

  return (
    <Text color={resolvedColor} bold {...rest}>
      {" "}
      {label}{" "}
    </Text>
  )
}
