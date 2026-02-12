/**
 * TextArea Component
 *
 * Multi-line text input with word wrapping, scrolling, and cursor movement.
 * Uses useContentRect for width-aware word wrapping and VirtualList-style
 * scroll tracking to keep the cursor visible.
 *
 * Usage:
 * ```tsx
 * const [value, setValue] = useState('')
 * <TextArea
 *   value={value}
 *   onChange={setValue}
 *   onSubmit={(val) => console.log('Submitted:', val)}
 *   height={10}
 *   placeholder="Type here..."
 * />
 * ```
 *
 * Supported shortcuts:
 * - Arrow keys: Move cursor
 * - Home/End: Beginning/end of line
 * - Ctrl+A/E: Beginning/end of line
 * - Ctrl+K: Kill to end of line
 * - Ctrl+U: Kill to beginning of line
 * - PageUp/PageDown: Scroll by viewport height
 * - Backspace/Delete: Delete characters
 * - Enter: Insert newline (or submit with submitKey="enter")
 */
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useContentRect } from "../hooks/useLayout.js"
import { useInput } from "../hooks/useInput.js"
import { wrapText } from "../unicode.js"
import { Box } from "./Box.js"
import { Text } from "./Text.js"

// =============================================================================
// Types
// =============================================================================

export interface TextAreaProps {
  /** Current value (controlled) */
  value?: string
  /** Initial value (uncontrolled) */
  defaultValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Called on submit (Ctrl+Enter by default, or Enter if submitKey="enter") */
  onSubmit?: (value: string) => void
  /** Key to trigger submit: "ctrl+enter" (default) or "enter" */
  submitKey?: "ctrl+enter" | "enter"
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether input is focused/active */
  isActive?: boolean
  /** Visible height in rows (required) */
  height: number
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
}

export interface TextAreaHandle {
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
  /** Set value programmatically */
  setValue: (value: string) => void
}

// =============================================================================
// Internal: text model
// =============================================================================

/** Convert a flat cursor position to row/col in wrapped lines */
function cursorToRowCol(text: string, cursor: number, wrapWidth: number): { row: number; col: number } {
  if (wrapWidth <= 0) return { row: 0, col: 0 }

  const logicalLines = text.split("\n")
  let charsSeen = 0
  let row = 0

  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li]!
    const wrapped = wrapText(line, wrapWidth, false)
    const lines = wrapped.length === 0 ? [""] : wrapped

    for (let wi = 0; wi < lines.length; wi++) {
      const wLine = lines[wi]!
      const lineLen = wLine.length
      const isLastWrappedLine = wi === lines.length - 1

      if (isLastWrappedLine) {
        const endOfLogical = charsSeen + lineLen
        if (cursor <= endOfLogical) {
          return { row, col: cursor - charsSeen }
        }
        charsSeen = endOfLogical + 1 // +1 for \n
      } else {
        if (cursor <= charsSeen + lineLen) {
          return { row, col: cursor - charsSeen }
        }
        charsSeen += lineLen
      }
      row++
    }
  }

  return { row: Math.max(0, row - 1), col: 0 }
}

/** Get all wrapped display lines with their character offsets */
function getWrappedLines(text: string, wrapWidth: number): { line: string; startOffset: number }[] {
  if (wrapWidth <= 0) return [{ line: "", startOffset: 0 }]

  const logicalLines = text.split("\n")
  const result: { line: string; startOffset: number }[] = []
  let offset = 0

  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li]!
    const wrapped = wrapText(line, wrapWidth, false)
    const lines = wrapped.length === 0 ? [""] : wrapped

    for (const wLine of lines) {
      result.push({ line: wLine, startOffset: offset })
      offset += wLine.length
    }
    offset++ // for \n
  }

  return result
}

/** Ensure scroll offset keeps the cursor row visible */
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

export const TextArea = forwardRef<TextAreaHandle, TextAreaProps>(function TextArea(
  {
    value: controlledValue,
    defaultValue = "",
    onChange,
    onSubmit,
    submitKey = "ctrl+enter",
    placeholder = "",
    isActive = true,
    height,
    cursorStyle = "block",
  },
  ref,
) {
  const isControlled = controlledValue !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const [cursor, setCursor] = useState(defaultValue.length)
  const [scrollOffset, setScrollOffset] = useState(0)

  const value = isControlled ? (controlledValue ?? "") : uncontrolledValue
  const { width } = useContentRect()
  const wrapWidth = Math.max(1, width)

  // Clamp cursor when controlled value shrinks (e.g., parent resets to "").
  // Without this, cursor stays at a position past the end of the text,
  // and cursorToRowCol falls through to the default {row: 0, col: 0}.
  const clampedCursor = Math.min(cursor, value.length)
  if (clampedCursor !== cursor) {
    setCursor(clampedCursor)
  }

  // Mutable ref for synchronous reads in the event handler.
  // Without this, rapid keypresses between React renders all read the same
  // stale closure state and overwrite each other (e.g. "abcdef" → "bdf").
  const stateRef = useRef({ value, cursor: clampedCursor })
  stateRef.current.value = value
  stateRef.current.cursor = clampedCursor

  // Helper to update cursor and scroll together (avoids stale scroll)
  const scrollRef = useRef(scrollOffset)
  scrollRef.current = scrollOffset

  const setCursorAndScroll = useCallback(
    (newCursor: number, text: string) => {
      // Update cursor ref synchronously for rapid event handling
      stateRef.current.cursor = newCursor
      setCursor(newCursor)
      const { row } = cursorToRowCol(text, newCursor, wrapWidth)
      const newScroll = clampScroll(row, scrollRef.current, height)
      if (newScroll !== scrollRef.current) {
        setScrollOffset(newScroll)
      }
    },
    [wrapWidth, height],
  )

  const updateValue = useCallback(
    (newValue: string, newCursor: number) => {
      // Update ref synchronously so the next event in the same batch sees fresh state
      stateRef.current.value = newValue
      stateRef.current.cursor = newCursor

      if (!isControlled) {
        setUncontrolledValue(newValue)
      }
      setCursorAndScroll(newCursor, newValue)
      onChange?.(newValue)
    },
    [isControlled, onChange, setCursorAndScroll],
  )

  const wrappedLines = useMemo(() => getWrappedLines(value, wrapWidth), [value, wrapWidth])

  const { row: cursorRow, col: cursorCol } = useMemo(
    () => cursorToRowCol(value, clampedCursor, wrapWidth),
    [value, clampedCursor, wrapWidth],
  )

  // Imperative handle
  useImperativeHandle(ref, () => ({
    clear: () => {
      updateValue("", 0)
      setScrollOffset(0)
    },
    getValue: () => value,
    setValue: (v: string) => {
      updateValue(v, v.length)
    },
  }))

  useInput(
    (input, key) => {
      // Read fresh state from mutable ref — NOT from render closure.
      // Multiple events between renders all see the latest value/cursor.
      const { value, cursor } = stateRef.current
      const lines = getWrappedLines(value, wrapWidth)
      const { row: cRow, col: cCol } = cursorToRowCol(value, cursor, wrapWidth)

      // =====================================================================
      // Submit
      // =====================================================================
      if (submitKey === "ctrl+enter" && key.return && key.ctrl) {
        onSubmit?.(value)
        return
      }
      if (submitKey === "enter" && key.return && !key.ctrl) {
        onSubmit?.(value)
        return
      }

      // =====================================================================
      // Enter (newline) — only when submitKey is not "enter"
      // =====================================================================
      if (key.return && submitKey !== "enter") {
        const newValue = value.slice(0, cursor) + "\n" + value.slice(cursor)
        updateValue(newValue, cursor + 1)
        return
      }

      // =====================================================================
      // Cursor Movement
      // =====================================================================

      // Left
      if (key.leftArrow || (key.ctrl && input === "b")) {
        if (cursor > 0) setCursorAndScroll(cursor - 1, value)
        return
      }

      // Right
      if (key.rightArrow || (key.ctrl && input === "f")) {
        if (cursor < value.length) setCursorAndScroll(cursor + 1, value)
        return
      }

      // Up
      if (key.upArrow) {
        if (cRow > 0) {
          const targetRow = cRow - 1
          const targetLine = lines[targetRow]
          if (targetLine) {
            const newCol = Math.min(cCol, targetLine.line.length)
            setCursorAndScroll(targetLine.startOffset + newCol, value)
          }
        }
        return
      }

      // Down
      if (key.downArrow) {
        if (cRow < lines.length - 1) {
          const targetRow = cRow + 1
          const targetLine = lines[targetRow]
          if (targetLine) {
            const newCol = Math.min(cCol, targetLine.line.length)
            setCursorAndScroll(targetLine.startOffset + newCol, value)
          }
        }
        return
      }

      // Home / Ctrl+A
      if (key.home || (key.ctrl && input === "a")) {
        const currentLine = lines[cRow]
        if (currentLine) {
          setCursorAndScroll(currentLine.startOffset, value)
        }
        return
      }

      // End / Ctrl+E
      if (key.end || (key.ctrl && input === "e")) {
        const currentLine = lines[cRow]
        if (currentLine) {
          setCursorAndScroll(currentLine.startOffset + currentLine.line.length, value)
        }
        return
      }

      // PageUp
      if (key.pageUp) {
        const targetRow = Math.max(0, cRow - height)
        const targetLine = lines[targetRow]
        if (targetLine) {
          const newCol = Math.min(cCol, targetLine.line.length)
          setCursorAndScroll(targetLine.startOffset + newCol, value)
        }
        return
      }

      // PageDown
      if (key.pageDown) {
        const targetRow = Math.min(lines.length - 1, cRow + height)
        const targetLine = lines[targetRow]
        if (targetLine) {
          const newCol = Math.min(cCol, targetLine.line.length)
          setCursorAndScroll(targetLine.startOffset + newCol, value)
        }
        return
      }

      // =====================================================================
      // Kill Operations
      // =====================================================================

      // Ctrl+K: Kill to end of line
      if (key.ctrl && input === "k") {
        const currentLine = lines[cRow]
        if (!currentLine) return
        const lineEnd = currentLine.startOffset + currentLine.line.length
        if (cursor < lineEnd) {
          const newValue = value.slice(0, cursor) + value.slice(lineEnd)
          updateValue(newValue, cursor)
        } else if (cursor < value.length) {
          const newValue = value.slice(0, cursor) + value.slice(cursor + 1)
          updateValue(newValue, cursor)
        }
        return
      }

      // Ctrl+U: Kill to beginning of line
      if (key.ctrl && input === "u") {
        const currentLine = lines[cRow]
        if (!currentLine) return
        const lineStart = currentLine.startOffset
        if (cursor > lineStart) {
          const newValue = value.slice(0, lineStart) + value.slice(cursor)
          updateValue(newValue, lineStart)
        }
        return
      }

      // =====================================================================
      // Delete Operations
      // =====================================================================

      // Backspace
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          const newValue = value.slice(0, cursor - 1) + value.slice(cursor)
          updateValue(newValue, cursor - 1)
        }
        return
      }

      // Ctrl+D: Delete at cursor
      if (key.ctrl && input === "d") {
        if (cursor < value.length) {
          const newValue = value.slice(0, cursor) + value.slice(cursor + 1)
          updateValue(newValue, cursor)
        }
        return
      }

      // =====================================================================
      // Regular Character Input
      // =====================================================================
      if (input.length >= 1 && input >= " ") {
        const newValue = value.slice(0, cursor) + input + value.slice(cursor)
        updateValue(newValue, cursor + input.length)
      }
    },
    { isActive },
  )

  // =========================================================================
  // Rendering
  // =========================================================================

  const showPlaceholder = !value && placeholder

  if (showPlaceholder) {
    return (
      <Box flexDirection="column" height={height} justifyContent="center" alignItems="center">
        <Text dimColor>{placeholder}</Text>
      </Box>
    )
  }

  const visibleLines = wrappedLines.slice(scrollOffset, scrollOffset + height)

  return (
    <Box key={scrollOffset} flexDirection="column" height={height}>
      {visibleLines.map((wl, i) => {
        const absoluteRow = scrollOffset + i
        const isCursorRow = absoluteRow === cursorRow

        if (!isCursorRow || !isActive) {
          return <Text key={absoluteRow}>{wl.line || " "}</Text>
        }

        // Render line with cursor
        const beforeCursor = wl.line.slice(0, cursorCol)
        const atCursor = wl.line[cursorCol] ?? " "
        const afterCursor = wl.line.slice(cursorCol + 1)

        return (
          <Text key={absoluteRow}>
            {beforeCursor}
            {cursorStyle === "block" ? <Text inverse>{atCursor}</Text> : <Text underline>{atCursor}</Text>}
            {afterCursor}
          </Text>
        )
      })}
    </Box>
  )
})
