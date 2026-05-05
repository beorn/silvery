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
  /** Color for the repeated divider character. Defaults to "$border-default". */
  color?: string
  /** Title text centered in divider */
  title?: string
  /** Color for the centered title. Defaults to inherited foreground. */
  titleColor?: string
  /** Whether the centered title is bold. Defaults to true. */
  titleBold?: boolean
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
  color = "$border-default",
  title,
  titleColor,
  titleBold = true,
  width: widthProp,
}: DividerProps): React.ReactElement {
  // LAYOUT_READ_AT_RENDER: divider builds a string of repeated fill characters,
  // which requires the parent's resolved cell width at render time. Without a
  // dedicated "fill remaining row" layout primitive, this is genuinely (c) per
  // the use-layout-rect-callers audit — the consumer may pass `width` to opt
  // out, but the auto-fill path needs the post-layout width signal.
  const { width: contentWidth } = useBoxRect()
  const totalWidth = widthProp ?? (contentWidth > 0 ? contentWidth : DEFAULT_WIDTH)

  if (!title) {
    return (
      <Box>
        <Text color={color}>{char.repeat(totalWidth)}</Text>
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
      <Text color={color}>{char.repeat(leftLen)}</Text>
      <Text color={titleColor} bold={titleBold}>
        {titleWithPad}
      </Text>
      <Text color={color}>{char.repeat(rightLen)}</Text>
    </Box>
  )
}
