/**
 * ModalDialog Component
 *
 * Reusable modal dialog with consistent styling: double border, title bar,
 * optional footer, and solid background that covers board content.
 *
 * Moved from km-tui shared-components to silvery for reuse across apps.
 *
 * Usage:
 * ```tsx
 * <ModalDialog title="Settings" width={60} footer="ESC to close">
 *   <Text>Dialog content here</Text>
 * </ModalDialog>
 *
 * <ModalDialog title="Help" hotkey="?" titleRight={<Text>1/3</Text>}>
 *   <Text>Help content</Text>
 * </ModalDialog>
 * ```
 */
import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface ModalDialogProps {
  /** Border color (default: $border). Cyan is reserved for text input focus rings. */
  borderColor?: string
  /** Dialog title (rendered bold in titleColor or borderColor) */
  title?: string
  /** Title color override (default: $primary). Separate from border for independent styling. */
  titleColor?: string
  /** Title alignment (default: center) */
  titleAlign?: "center" | "flex-start" | "flex-end"
  /** Toggle hotkey character (e.g., "?" for help). Renders [X] prefix in title. */
  hotkey?: string
  /** Content to render on the right side of the title bar (e.g., hotkey indicator, match count) */
  titleRight?: React.ReactNode
  /** Dialog width */
  width?: number
  /** Dialog height (optional, omit for auto-height) */
  height?: number
  /** Footer hint text (rendered dimColor at bottom) */
  footer?: React.ReactNode
  /** Footer alignment (default: center) */
  footerAlign?: "center" | "flex-start" | "flex-end"
  /** Called when ESC is pressed (optional convenience handler) */
  onClose?: () => void
  /** Whether to create a focus scope (default: true, for future focus system integration) */
  focusScope?: boolean
  /** Dialog children */
  children: React.ReactNode
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a dialog title with a hotkey prefix.
 *
 * If the hotkey letter appears in the title (case-insensitive), highlights it inline:
 *   hotkey="D", title="Details" -> [D]etails
 * If the hotkey is not found in the title, prepends it:
 *   hotkey="?", title="Help" -> [?] Help
 *
 * Brackets are dim, the hotkey letter is bold/bright.
 */
export function formatTitleWithHotkey(
  title: string,
  hotkey: string,
  color?: string,
): React.ReactElement {
  const idx = title.toLowerCase().indexOf(hotkey.toLowerCase())
  if (idx >= 0 && hotkey.length === 1 && hotkey.toLowerCase() !== hotkey.toUpperCase()) {
    // Letter found in title — highlight it inline: prefix + [X] + rest
    const before = title.slice(0, idx)
    const matched = title[idx]
    const after = title.slice(idx + 1)
    return (
      <Text color={color} bold>
        {before}
        <Text dimColor bold={false}>
          [
        </Text>
        <Text bold>{matched}</Text>
        <Text dimColor bold={false}>
          ]
        </Text>
        {after}
      </Text>
    )
  }
  // Hotkey not in title (or symbol) — prepend [X] Title
  return (
    <Text color={color} bold>
      <Text dimColor bold={false}>
        [
      </Text>
      <Text bold>{hotkey}</Text>
      <Text dimColor bold={false}>
        ]
      </Text>{" "}
      {title}
    </Text>
  )
}

// =============================================================================
// Component
// =============================================================================

/**
 * Reusable modal dialog with consistent styling.
 *
 * Features:
 * - Solid raised background (covers board content)
 * - Double border (configurable color). Cyan reserved for focus rings.
 * - Horizontal padding (2), vertical padding (1)
 * - Title: bold, colored, with spacer below
 * - Footer: centered, dimColor, with spacer above
 */
export function ModalDialog({
  borderColor = "$border",
  title,
  titleColor,
  titleAlign = "center",
  hotkey,
  titleRight,
  width,
  height,
  footer,
  footerAlign = "center",
  onClose: _onClose,
  focusScope: _focusScope = true,
  children,
}: ModalDialogProps): React.ReactElement {
  const effectiveTitleColor = titleColor ?? "$primary"
  // When titleRight is provided, use space-between layout for the title bar
  const effectiveTitleAlign = titleRight ? "space-between" : titleAlign

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="double"
      borderColor={borderColor}
      backgroundColor={"$surface-bg"}
      paddingX={2}
      paddingY={1}
    >
      {title && (
        <Box flexShrink={0} flexDirection="column">
          <Box justifyContent={effectiveTitleAlign}>
            {hotkey ? (
              formatTitleWithHotkey(title, hotkey, effectiveTitleColor)
            ) : (
              <Text color={effectiveTitleColor} bold>
                {title}
              </Text>
            )}
            {titleRight}
          </Box>
          <Text> </Text>
        </Box>
      )}
      {/* Content area - flexGrow pushes footer to bottom, overflow hidden prevents title displacement */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {children}
      </Box>
      {/* Footer with spacer line above */}
      {footer && (
        <>
          <Text> </Text>
          <Box justifyContent={footerAlign}>
            {typeof footer === "string" ? <Text dimColor>{footer}</Text> : footer}
          </Box>
        </>
      )}
    </Box>
  )
}
