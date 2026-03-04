/**
 * Badge Component
 *
 * A small inline label for status display.
 *
 * Usage:
 * ```tsx
 * <Badge label="Active" variant="success" />
 * <Badge label="Warning" variant="warning" />
 * <Badge label="Custom" color="magenta" />
 * ```
 */
import React from "react"
import { Text } from "./Text.js"

// =============================================================================
// Types
// =============================================================================

export interface BadgeProps {
  /** Badge text */
  label: string
  /** Color variant */
  variant?: "default" | "primary" | "success" | "warning" | "error"
  /** Custom color (overrides variant) */
  color?: string
}

// =============================================================================
// Constants
// =============================================================================

const VARIANT_COLORS: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "$fg",
  primary: "$primary",
  success: "$success",
  warning: "$warning",
  error: "$error",
}

// =============================================================================
// Component
// =============================================================================

export function Badge({ label, variant = "default", color }: BadgeProps): React.ReactElement {
  const resolvedColor = color ?? VARIANT_COLORS[variant]

  return (
    <Text color={resolvedColor} bold>
      {" "}
      {label}{" "}
    </Text>
  )
}
