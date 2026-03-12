/**
 * EditContextDisplay Component
 *
 * Pure rendering component for multi-line text display with scrolling.
 * Consumes the output of useEditContext (value + cursor position) and
 * handles word wrapping, viewport scrolling, and cursor highlighting.
 *
 * Unlike TextArea, this component has NO input handling — the command
 * system handles all input via useEditContext's EditTarget. This is the
 * rendering half of the edit context pattern.
 *
 * Usage:
 * ```tsx
 * const { value, cursor } = useEditContext({ ... })
 * const { width } = useContentRect()
 *
 * <EditContextDisplay
 *   value={value}
 *   cursor={cursor}
 *   height={10}
 *   wrapWidth={width}
 * />
 * ```
 *
 * Scroll logic extracted from TextArea.tsx — same clampScroll pattern
 * that keeps cursor visible within the viewport.
 */
import React, { useMemo, useRef } from "react"
import { cursorToRowCol, getWrappedLines } from "@silvery/tea/text-cursor"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface EditContextDisplayProps {
  /** Current text value (from useEditContext) */
  value: string
  /** Cursor position as character offset (from useEditContext) */
  cursor: number
  /** Visible height in rows. When omitted, renders all lines (no scrolling). */
  height?: number
  /** Width for word wrapping. When omitted, renders without wrapping. */
  wrapWidth?: number
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
  /** Placeholder text when value is empty */
  placeholder?: string
  /** Whether to show the cursor (default: true) */
  showCursor?: boolean
}

// =============================================================================
// Helpers
// =============================================================================

/** Ensure scroll offset keeps the cursor row visible within the viewport. */
function clampScroll(cursorRow: number, currentScroll: number, viewportHeight: number): number {
  if (viewportHeight <= 0) return 0
  let scroll = currentScroll
  if (cursorRow < scroll) {
    scroll = cursorRow
  }
  if (cursorRow >= scroll + viewportHeight) {
    scroll = cursorRow - viewportHeight + 1
  }
  return Math.max(0, scroll)
}

// =============================================================================
// Component
// =============================================================================

export function EditContextDisplay({
  value,
  cursor,
  height,
  wrapWidth,
  cursorStyle = "block",
  placeholder = "",
  showCursor = true,
}: EditContextDisplayProps): React.ReactElement {
  // Scroll offset persists across renders via ref. No useState needed because
  // every cursor/value change triggers a re-render from the parent (props change),
  // and we compute the new scroll synchronously during that render.
  const scrollRef = useRef(0)

  // Effective wrap width: use provided wrapWidth, or a large value for no wrapping
  const effectiveWrapWidth = wrapWidth != null && wrapWidth > 0 ? wrapWidth : 10000

  // Clamp cursor to valid range
  const clampedCursor = Math.min(Math.max(0, cursor), value.length)

  // Compute wrapped lines and cursor position
  const wrappedLines = useMemo(
    () => getWrappedLines(value, effectiveWrapWidth),
    [value, effectiveWrapWidth],
  )

  const { row: cursorRow, col: cursorCol } = useMemo(
    () => cursorToRowCol(value, clampedCursor, effectiveWrapWidth),
    [value, clampedCursor, effectiveWrapWidth],
  )

  // Update scroll offset to keep cursor visible (ref-only, no state)
  const hasViewport = height != null && height > 0
  if (hasViewport) {
    scrollRef.current = clampScroll(cursorRow, scrollRef.current, height)
  }

  // =========================================================================
  // Placeholder
  // =========================================================================

  if (!value && placeholder) {
    if (hasViewport) {
      return (
        <Box flexDirection="column" height={height} justifyContent="center" alignItems="center">
          <Text dimColor>{placeholder}</Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text dimColor>{placeholder}</Text>
      </Box>
    )
  }

  // =========================================================================
  // Determine visible lines
  // =========================================================================

  const currentScroll = hasViewport ? scrollRef.current : 0
  const visibleLines = hasViewport
    ? wrappedLines.slice(currentScroll, currentScroll + height)
    : wrappedLines

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <Box key={currentScroll} flexDirection="column" height={hasViewport ? height : undefined}>
      {visibleLines.map((wl, i) => {
        const absoluteRow = currentScroll + i
        const isCursorRow = absoluteRow === cursorRow && showCursor

        if (!isCursorRow) {
          return <Text key={absoluteRow}>{wl.line || " "}</Text>
        }

        // Render line with cursor highlight
        const beforeCursorText = wl.line.slice(0, cursorCol)
        const atCursor = wl.line[cursorCol] ?? " "
        const afterCursorText = wl.line.slice(cursorCol + 1)

        return (
          <Text key={absoluteRow}>
            {beforeCursorText}
            {cursorStyle === "block" ? (
              <Text inverse>{atCursor}</Text>
            ) : (
              <Text underline>{atCursor}</Text>
            )}
            {afterCursorText}
          </Text>
        )
      })}
    </Box>
  )
}
