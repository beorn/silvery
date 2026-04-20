/**
 * Banner Component — medium-urgency dismissible row
 *
 * Sterling Phase 2b — the middle tier of the Alert family. Renders as a
 * full-width row with a tinted background (`$bg-<role>-subtle`), tone-colored
 * icon + text, and an optional dismiss affordance.
 *
 * Urgency pairing (Sterling design-system.md §"Urgency is not a design-system
 * concern"):
 *
 *   <InlineAlert>   low      passive, in-flow
 *   <Banner>        medium   dismissible, fills row width    ← this component
 *   <Alert>         high     modal, blocks flow
 *
 * Why "subtle" background (not solid fill): Banners sit in-flow above
 * primary content; a saturated fill would overwhelm the page. The subtle
 * role token reads as "this row carries a tone" without taking visual
 * priority from the content being announced. Escalation to "loud" is what
 * `<Alert>` (modal, solid fill) is for.
 *
 * Usage:
 * ```tsx
 * <Banner tone="warning" onDismiss={close}>Deprecated API — migrate to useBoxRect</Banner>
 * <Banner tone="info">System maintenance at 02:00 UTC</Banner>
 * <Banner tone="error" onDismiss={close} dismissLabel="×">
 *   <Text>Connection lost — <Text underline>retry</Text></Text>
 * </Banner>
 * ```
 */
import React from "react"
import { useInput } from "../../hooks/useInput"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import { type ToneKey, toneSubtleTokens, toneIcon } from "./_tone"

// =============================================================================
// Types
// =============================================================================

export interface BannerProps extends Omit<BoxProps, "children"> {
  /**
   * Sterling tone. `destructive` aliases to `error` at the component layer.
   * Defaults to `info` — the neutral banner tone.
   */
  tone?: ToneKey
  /** Banner content. */
  children: React.ReactNode
  /**
   * When set, renders a dismiss affordance on the right side and calls this
   * callback when the user presses Escape (if focused) or activates the
   * affordance. Omit to make the banner non-dismissible.
   */
  onDismiss?: () => void
  /** Label for the dismiss affordance (default: "dismiss ×"). */
  dismissLabel?: React.ReactNode
  /** Whether to render the tone icon prefix (default: true). */
  showIcon?: boolean
  /** Override the default tone icon glyph. */
  icon?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Dismissible tone banner — medium-urgency message row.
 *
 * Width defaults to "100%" so the banner spans its parent. Consumers that
 * want a narrower banner can set `width` directly; the subtle bg fill will
 * respect the explicit width.
 */
export function Banner({
  tone = "info",
  children,
  onDismiss,
  dismissLabel = "dismiss ×",
  showIcon = true,
  icon,
  ...boxProps
}: BannerProps): React.ReactElement {
  const tokens = toneSubtleTokens(tone)
  const glyph = icon ?? toneIcon(tone)

  // Escape dismisses when a handler is supplied. Scoped to the component via
  // `useInput`'s default active scope; apps that render a Banner outside a
  // focusable region can drive dismissal imperatively via the `onDismiss`
  // callback without depending on key delivery.
  useInput(
    (_input, key) => {
      if (key.escape) onDismiss?.()
    },
    { isActive: Boolean(onDismiss) },
  )

  return (
    <Box
      flexDirection="row"
      backgroundColor={tokens.bg}
      paddingX={2}
      width="100%"
      {...boxProps}
    >
      {showIcon && (
        <Text color={tokens.fg} bold>
          {glyph}{" "}
        </Text>
      )}
      <Text color={tokens.fg}>{children}</Text>
      {onDismiss && (
        <>
          <Box flexGrow={1} />
          <Text color={tokens.fg} dim>
            {dismissLabel}
          </Text>
        </>
      )}
    </Box>
  )
}
