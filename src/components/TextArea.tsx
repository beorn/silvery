/**
 * TextArea Component
 *
 * Multi-line text input with word wrapping, scrolling, and cursor movement.
 * Uses useContentRect for width-aware word wrapping and VirtualList-style
 * scroll tracking to keep the cursor visible.
 *
 * Includes full readline-style editing: word movement, word kill, kill ring
 * (yank/cycle), and character transpose -- shared with TextInput via readline-ops.
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
 * - Alt+B/F: Move by word (wraps across lines)
 * - Ctrl+W, Alt+Backspace: Delete word backwards (kill ring)
 * - Alt+D: Delete word forwards (kill ring)
 * - Ctrl+K: Kill to end of line (kill ring)
 * - Ctrl+U: Kill to beginning of line (kill ring)
 * - Ctrl+Y: Yank (paste from kill ring)
 * - Alt+Y: Cycle through kill ring (after Ctrl+Y)
 * - Ctrl+T: Transpose characters
 * - PageUp/PageDown: Scroll by viewport height
 * - Backspace/Delete: Delete characters
 * - Enter: Insert newline (or submit with submitKey="enter")
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useContentRect } from "../hooks/useLayout.js"
import { useInput } from "../hooks/useInput.js"
import { useFocusable } from "../hooks/useFocusable.js"
import { useCursor } from "../hooks/useCursor.js"
import { addToKillRing, handleReadlineKey, type YankState } from "../hooks/readline-ops.js"
import { cursorToRowCol, getWrappedLines } from "../text-cursor.js"
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
  /** Whether input is focused/active (overrides focus system) */
  isActive?: boolean
  /** Visible height in rows (required) */
  height: number
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
  /** Test ID for focus system identification */
  testID?: string
}

export interface TextAreaHandle {
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
  /** Set value programmatically */
  setValue: (value: string) => void
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
    isActive: isActiveProp,
    height,
    cursorStyle = "block",
    testID,
  },
  ref,
) {
  // Focus system integration: prop overrides hook.
  // When testID is set, the component participates in the focus tree and
  // isActive derives from focus state. Without testID, default to true
  // for backward compatibility.
  const { focused } = useFocusable()
  const isActive = isActiveProp ?? (testID ? focused : true)

  const isControlled = controlledValue !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const [cursor, setCursor] = useState(defaultValue.length)
  const [scrollOffset, setScrollOffset] = useState(0)
  const stickyXRef = useRef<number | null>(null)

  const yankStateRef = useRef<YankState | null>(null)

  const value = isControlled ? (controlledValue ?? "") : uncontrolledValue
  const { width } = useContentRect()
  const wrapWidth = Math.max(1, width)

  // Clamp cursor when controlled value shrinks (e.g., parent resets to "").
  const clampedCursor = Math.min(cursor, value.length)
  if (clampedCursor !== cursor) {
    setCursor(clampedCursor)
  }

  // Mutable ref for synchronous reads in the event handler.
  const stateRef = useRef({ value, cursor: clampedCursor })
  stateRef.current.value = value
  stateRef.current.cursor = clampedCursor

  const scrollRef = useRef(scrollOffset)
  scrollRef.current = scrollOffset

  const setCursorAndScroll = useCallback(
    (newCursor: number, text: string) => {
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
      stateRef.current.value = newValue
      stateRef.current.cursor = newCursor
      if (!isControlled) {
        setUncontrolledValue(newValue)
      }
      setCursorAndScroll(newCursor, newValue)
      onChange?.(newValue)
      yankStateRef.current = null
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
      const { value, cursor } = stateRef.current
      const lines = getWrappedLines(value, wrapWidth)
      const { row: cRow, col: cCol } = cursorToRowCol(value, cursor, wrapWidth)

      // =================================================================
      // Submit
      // =================================================================
      if (submitKey === "ctrl+enter" && key.return && key.ctrl) {
        onSubmit?.(value)
        return
      }
      if (submitKey === "enter" && key.return && !key.ctrl) {
        onSubmit?.(value)
        return
      }

      // =================================================================
      // Enter (newline)
      // =================================================================
      if (key.return && submitKey !== "enter") {
        stickyXRef.current = null
        updateValue(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1)
        return
      }

      // =================================================================
      // Multi-line: Up/Down with stickyX
      // =================================================================
      if (key.upArrow) {
        if (cRow > 0) {
          const targetX = stickyXRef.current ?? cCol
          stickyXRef.current = targetX
          const targetLine = lines[cRow - 1]
          if (targetLine) {
            setCursorAndScroll(targetLine.startOffset + Math.min(targetX, targetLine.line.length), value)
          }
        }
        yankStateRef.current = null
        return
      }

      if (key.downArrow) {
        if (cRow < lines.length - 1) {
          const targetX = stickyXRef.current ?? cCol
          stickyXRef.current = targetX
          const targetLine = lines[cRow + 1]
          if (targetLine) {
            setCursorAndScroll(targetLine.startOffset + Math.min(targetX, targetLine.line.length), value)
          }
        }
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: Home/End, Ctrl+A/E (beginning/end of wrapped line)
      // =================================================================
      if (key.home || (key.ctrl && input === "a")) {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (currentLine) setCursorAndScroll(currentLine.startOffset, value)
        yankStateRef.current = null
        return
      }

      if (key.end || (key.ctrl && input === "e")) {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (currentLine) setCursorAndScroll(currentLine.startOffset + currentLine.line.length, value)
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: PageUp/PageDown
      // =================================================================
      if (key.pageUp) {
        stickyXRef.current = null
        const targetLine = lines[Math.max(0, cRow - height)]
        if (targetLine) {
          setCursorAndScroll(targetLine.startOffset + Math.min(cCol, targetLine.line.length), value)
        }
        yankStateRef.current = null
        return
      }

      if (key.pageDown) {
        stickyXRef.current = null
        const targetLine = lines[Math.min(lines.length - 1, cRow + height)]
        if (targetLine) {
          setCursorAndScroll(targetLine.startOffset + Math.min(cCol, targetLine.line.length), value)
        }
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: Ctrl+K/U (kill to end/beginning of wrapped line)
      // =================================================================
      if (key.ctrl && input === "k") {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (!currentLine) return
        const lineEnd = currentLine.startOffset + currentLine.line.length
        if (cursor < lineEnd) {
          addToKillRing(value.slice(cursor, lineEnd))
          updateValue(value.slice(0, cursor) + value.slice(lineEnd), cursor)
        } else if (cursor < value.length) {
          // At end of line: kill the newline character
          addToKillRing(value.slice(cursor, cursor + 1))
          updateValue(value.slice(0, cursor) + value.slice(cursor + 1), cursor)
        }
        return
      }

      if (key.ctrl && input === "u") {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (!currentLine) return
        const lineStart = currentLine.startOffset
        if (cursor > lineStart) {
          addToKillRing(value.slice(lineStart, cursor))
          updateValue(value.slice(0, lineStart) + value.slice(cursor), lineStart)
        }
        return
      }

      // =================================================================
      // Shared readline operations (cursor, word, kill ring, yank, etc.)
      // =================================================================
      const result = handleReadlineKey(input, key, value, cursor, yankStateRef.current)
      if (result) {
        stickyXRef.current = null
        if (result.value === value && result.cursor === cursor) {
          yankStateRef.current = result.yankState
          return
        }
        if (result.value !== value) {
          stateRef.current.value = result.value
          stateRef.current.cursor = result.cursor
          if (!isControlled) setUncontrolledValue(result.value)
          setCursorAndScroll(result.cursor, result.value)
          onChange?.(result.value)
        } else {
          setCursorAndScroll(result.cursor, value)
        }
        yankStateRef.current = result.yankState
      }
    },
    { isActive },
  )

  // =========================================================================
  // Rendering
  // =========================================================================

  // When active: real terminal cursor at cursor position, plain text rendering.
  // When inactive: fake cursor (inverse/underline) for visual feedback.
  const visibleCursorRow = cursorRow - scrollOffset
  useCursor({
    col: cursorCol,
    row: visibleCursorRow,
    visible: isActive,
  })

  const showPlaceholder = !value && placeholder

  if (showPlaceholder) {
    return (
      <Box focusable testID={testID} flexDirection="column" height={height} justifyContent="center" alignItems="center">
        <Text dimColor>{placeholder}</Text>
      </Box>
    )
  }

  const visibleLines = wrappedLines.slice(scrollOffset, scrollOffset + height)

  return (
    <Box focusable testID={testID} key={scrollOffset} flexDirection="column" height={height}>
      {visibleLines.map((wl, i) => {
        const absoluteRow = scrollOffset + i
        const isCursorRow = absoluteRow === cursorRow

        if (!isCursorRow) {
          return <Text key={absoluteRow}>{wl.line || " "}</Text>
        }

        const beforeCursor = wl.line.slice(0, cursorCol)
        const atCursor = wl.line[cursorCol] ?? " "
        const afterCursor = wl.line.slice(cursorCol + 1)

        // Active: plain text (real cursor handles it). Inactive: fake cursor.
        const cursorEl = isActive
          ? <Text>{atCursor}</Text>
          : cursorStyle === "block"
            ? <Text inverse>{atCursor}</Text>
            : <Text underline>{atCursor}</Text>

        return (
          <Text key={absoluteRow}>
            {beforeCursor}
            {cursorEl}
            {afterCursor}
          </Text>
        )
      })}
    </Box>
  )
})
