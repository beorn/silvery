/**
 * Divider Component
 *
 * A horizontal separator line with optional centered title.
 *
 * Usage:
 * ```tsx
 * <Divider />
 * <Divider title="Section" />
 * <Divider char="=" width={40} />
 * ```
 */
import React from "react"
import { useBoxRect } from "../../hooks/useLayout"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

export interface DividerProps {
  /** Character to repeat (default: "─") */
  char?: string
  /** Title text centered in divider */
  title?: string
  /** Width (default: 100% via useBoxRect) */
  width?: number
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CHAR = "─"
const DEFAULT_WIDTH = 40

// =============================================================================
// Component
// =============================================================================

export function Divider({
  char = DEFAULT_CHAR,
  title,
  width: widthProp,
}: DividerProps): React.ReactElement {
  const { width: contentWidth } = useBoxRect()
  const totalWidth = widthProp ?? (contentWidth > 0 ? contentWidth : DEFAULT_WIDTH)

  if (!title) {
    return (
      <Box>
        <Text color="$border">{char.repeat(totalWidth)}</Text>
      </Box>
    )
  }

  // Title with surrounding lines: "───── Title ─────"
  const titleWithPad = ` ${title} `
  const remaining = Math.max(0, totalWidth - titleWithPad.length)
  const leftLen = Math.floor(remaining / 2)
  const rightLen = remaining - leftLen

  return (
    <Box>
      <Text color="$border">{char.repeat(leftLen)}</Text>
      <Text bold>{titleWithPad}</Text>
      <Text color="$border">{char.repeat(rightLen)}</Text>
    </Box>
  )
}
