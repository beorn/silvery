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
import { useBoxSize } from "../../hooks/useLayout"
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
  /** Width (default: 100% via useBoxSize) */
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

function DividerRule({
  color,
  flexGrow = 1,
}: {
  color: string
  flexGrow?: number
}): React.ReactElement {
  return (
    <Box
      height={1}
      flexGrow={flexGrow}
      flexShrink={1}
      minWidth={0}
      borderStyle="single"
      borderColor={color}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
    />
  )
}

function StringDivider({
  char,
  color,
  title,
  titleColor,
  titleBold,
  totalWidth,
}: {
  char: string
  color: string
  title?: string
  titleColor?: string
  titleBold: boolean
  totalWidth: number
}): React.ReactElement {
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

function MeasuredStringDivider({
  char,
  color,
  title,
  titleColor,
  titleBold,
}: {
  char: string
  color: string
  title?: string
  titleColor?: string
  titleBold: boolean
}): React.ReactElement {
  // LAYOUT_READ_AT_RENDER: custom divider characters still build a string of
  // repeated fill characters, which requires the parent's resolved cell width
  // at render time. The default "─" path uses flex border fillers instead, so
  // common dividers do not subscribe to layout size.
  const { width: contentWidth } = useBoxSize()
  const totalWidth = contentWidth > 0 ? contentWidth : DEFAULT_WIDTH
  return (
    <StringDivider
      char={char}
      color={color}
      title={title}
      titleColor={titleColor}
      titleBold={titleBold}
      totalWidth={totalWidth}
    />
  )
}

export function Divider({
  char = DEFAULT_CHAR,
  color = "$border-default",
  title,
  titleColor,
  titleBold = true,
  width: widthProp,
}: DividerProps): React.ReactElement {
  if (widthProp === undefined && char === DEFAULT_CHAR) {
    if (!title) {
      return (
        <Box width="100%" flexDirection="row" flexShrink={0} minWidth={0}>
          <DividerRule color={color} />
        </Box>
      )
    }

    return (
      <Box width="100%" flexDirection="row" alignItems="center" flexShrink={0} minWidth={0}>
        <DividerRule color={color} />
        <Text color={titleColor} bold={titleBold} flexShrink={0}>
          {` ${title} `}
        </Text>
        <DividerRule color={color} />
      </Box>
    )
  }

  if (widthProp !== undefined) {
    return (
      <StringDivider
        char={char}
        color={color}
        title={title}
        titleColor={titleColor}
        titleBold={titleBold}
        totalWidth={widthProp}
      />
    )
  }

  return (
    <MeasuredStringDivider
      char={char}
      color={color}
      title={title}
      titleColor={titleColor}
      titleBold={titleBold}
    />
  )
}
