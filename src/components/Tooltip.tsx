/**
 * Tooltip Component
 *
 * Shows contextual help text near the target element. In a terminal UI,
 * the tooltip renders inline below the target since there is no floating
 * layer. Visibility is controlled via the `show` prop.
 *
 * Usage:
 * ```tsx
 * <Tooltip content="Delete permanently" show={isFocused}>
 *   <Button label="Delete" onPress={handleDelete} />
 * </Tooltip>
 *
 * // Always visible
 * <Tooltip content="This action cannot be undone" show>
 *   <Text>Dangerous action</Text>
 * </Tooltip>
 * ```
 */
import React from "react"
import { Box } from "./Box.js"
import { Text } from "./Text.js"

// =============================================================================
// Types
// =============================================================================

export interface TooltipProps {
  /** Tooltip text content */
  content: string
  /** Whether the tooltip is visible (default: false) */
  show?: boolean
  /** Tooltip children (target element) */
  children: React.ReactNode
}

// =============================================================================
// Component
// =============================================================================

/**
 * Contextual tooltip that appears below its children.
 *
 * Renders inline below the target element when `show` is true.
 * Tooltip text is rendered in `$mutedfg` with dimColor for subtlety.
 */
export function Tooltip({ content, show = false, children }: TooltipProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {children}
      {show && (
        <Box>
          <Text color="$mutedfg" dimColor>
            {content}
          </Text>
        </Box>
      )}
    </Box>
  )
}
