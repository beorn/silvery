/**
 * CursorLine Component
 *
 * Renders a single line of text with a visible cursor at a split point.
 * Extracts the duplicated cursor-rendering pattern found across km-tui
 * (inline edit, input box, search bar, etc.) into a reusable primitive.
 *
 * Usage:
 * ```tsx
 * <CursorLine beforeCursor="hel" afterCursor="lo world" />
 * <CursorLine beforeCursor="full text" afterCursor="" />
 * <CursorLine beforeCursor="" afterCursor="start" cursorStyle="underline" />
 * ```
 */
import React, { useCallback } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"

// =============================================================================
// Types
// =============================================================================

export interface CursorLineProps {
  /** Text before the cursor position */
  beforeCursor: string
  /** Text after the cursor position (first char gets cursor highlight) */
  afterCursor: string
  /** Text color */
  color?: string
  /** Whether to show the cursor (default: true) */
  showCursor?: boolean
  /** Cursor style: 'block' (inverse) or 'underline' (default: block) */
  cursorStyle?: "block" | "underline"
  /** Called when the user clicks on the text — provides the character offset at the click position */
  onCursorClick?: (offset: number) => void
}

// =============================================================================
// Component
// =============================================================================

/**
 * Renders a single line with a visible cursor character.
 *
 * The cursor character is `afterCursor[0]` (or a space when afterCursor is
 * empty, indicating the cursor is at the end of the text). The character is
 * rendered with inverse video (block) or underline styling.
 */
export function CursorLine({
  beforeCursor,
  afterCursor,
  color,
  showCursor = true,
  cursorStyle = "block",
  onCursorClick,
}: CursorLineProps): React.ReactElement {
  const totalLength = beforeCursor.length + afterCursor.length

  const handleMouseDown = useCallback(
    (e: SilveryMouseEvent) => {
      if (!onCursorClick || e.button !== 0) return
      const rect = e.currentTarget.scrollRect
      if (!rect) return
      const relativeX = e.x - rect.x
      const offset = Math.min(Math.max(0, relativeX), totalLength)
      onCursorClick(offset)
    },
    [onCursorClick, totalLength],
  )

  const textContent = (() => {
    if (!showCursor)
      return (
        <Text color={color}>
          {beforeCursor}
          {afterCursor}
        </Text>
      )

    const cursorChar = afterCursor[0] ?? " "
    const rest = afterCursor.slice(1)

    return (
      <Text color={color}>
        {beforeCursor}
        {cursorStyle === "block" ? (
          <Text inverse>{cursorChar}</Text>
        ) : (
          <Text underline>{cursorChar}</Text>
        )}
        {rest}
      </Text>
    )
  })()

  if (onCursorClick) {
    return <Box onMouseDown={handleMouseDown}>{textContent}</Box>
  }
  return textContent
}
