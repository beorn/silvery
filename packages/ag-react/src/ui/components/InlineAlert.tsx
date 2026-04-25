/**
 * InlineAlert Component — low-urgency inline message
 *
 * Sterling Phase 2b — the lowest-urgency member of the Alert family. Renders
 * as a single inline row with a tone-colored icon and text. No background
 * fill, no dismiss affordance, no modal behavior — just a tone-tinted
 * message embedded in the flow.
 *
 * Urgency escalation is component choice, NOT a `priority` prop (Sterling
 * design-system.md §"Urgency is not a design-system concern"):
 *
 *   <InlineAlert>   low      passive, in-flow
 *   <Banner>        medium   dismissible, fills row width
 *   <Alert>         high     modal, blocks flow
 *
 * Usage:
 * ```tsx
 * <InlineAlert tone="error">Type-check failed in src/app.ts</InlineAlert>
 * <InlineAlert tone="warning" icon="⚠">Deprecated API</InlineAlert>
 * <InlineAlert tone="info" showIcon={false}>Quiet notice</InlineAlert>
 * ```
 */
import React from "react"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { type Variant, variantFgToken, variantIcon } from "./_variant"

// =============================================================================
// Types
// =============================================================================

/** Status variants accepted by `<InlineAlert>`. */
export type InlineAlertVariant = "info" | "success" | "warning" | "error"

export interface InlineAlertProps extends Omit<BoxProps, "children"> {
  /**
   * Sterling status variant. Defaults to `info` — the neutral "heads up"
   * variant for low-urgency messages.
   */
  variant?: InlineAlertVariant
  /** @deprecated Use `variant`. Retained one cycle. */
  tone?: Variant
  /** Message content (text or React nodes). */
  children: React.ReactNode
  /** Whether to render the variant icon prefix (default: true). */
  showIcon?: boolean
  /**
   * Override the default variant icon glyph. Defaults to the shared
   * `VARIANT_ICONS` mapping (same as Toast).
   */
  icon?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Inline low-urgency status message.
 *
 * Pick `<InlineAlert>` when the message is passive context a user can read
 * or ignore without interrupting their task. Escalate to `<Banner>` or
 * `<Alert>` when the message demands action or blocks flow.
 */
export function InlineAlert({
  variant,
  tone,
  children,
  showIcon = true,
  icon,
  ...boxProps
}: InlineAlertProps): React.ReactElement {
  const effectiveVariant: Variant = (variant ?? tone ?? "info") as Variant
  const color = variantFgToken(effectiveVariant)
  const glyph = icon ?? variantIcon(effectiveVariant)

  return (
    <Box flexDirection="row" gap={1} {...boxProps}>
      {showIcon && (
        <Text color={color} bold>
          {glyph}
        </Text>
      )}
      <Text color={color}>{children}</Text>
    </Box>
  )
}
