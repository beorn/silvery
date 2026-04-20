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
import { type ToneKey, toneFgToken, toneIcon } from "./_tone"

// =============================================================================
// Types
// =============================================================================

export interface InlineAlertProps extends Omit<BoxProps, "children"> {
  /**
   * Sterling tone. `destructive` aliases to `error` at the component layer.
   * Defaults to `info` — the neutral "heads up" tone for low-urgency
   * messages.
   */
  tone?: ToneKey
  /** Message content (text or React nodes). */
  children: React.ReactNode
  /** Whether to render the tone icon prefix (default: true). */
  showIcon?: boolean
  /**
   * Override the default tone icon glyph. Defaults to the shared
   * `TONE_ICONS` mapping (same as Toast).
   */
  icon?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Inline low-urgency tone message.
 *
 * Pick `<InlineAlert>` when the message is passive context a user can read
 * or ignore without interrupting their task. Escalate to `<Banner>` or
 * `<Alert>` when the message demands action or blocks flow.
 */
export function InlineAlert({
  tone = "info",
  children,
  showIcon = true,
  icon,
  ...boxProps
}: InlineAlertProps): React.ReactElement {
  const color = toneFgToken(tone)
  const glyph = icon ?? toneIcon(tone)

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
