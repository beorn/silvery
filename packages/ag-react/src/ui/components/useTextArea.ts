/**
 * useTextArea Hook
 *
 * Headless multi-line text editing hook with word wrapping, scrolling,
 * cursor movement, selection, and kill ring. Extracted from TextArea
 * so custom UIs can reuse the editing logic without the default rendering.
 *
 * TextArea itself uses this hook internally.
 *
 * Usage:
 * ```tsx
 * function CustomEditor() {
 *   const { width } = useBoxRect()
 *   const ta = useTextArea({ height: 10, wrapWidth: width })
 *
 *   // ta.value, ta.cursor, ta.wrappedLines, ta.selection, etc.
 *   // ta.clear(), ta.setValue(), ta.getSelection()
 *   // Input handling is done automatically via useInput.
 *
 *   return <MyCustomRendering {...ta} />
 * }
 * ```
 *
 * Supported shortcuts (same as TextArea component):
 * - Arrow keys: Move cursor (clears selection)
 * - Shift+Arrow: Extend selection
 * - Shift+Home/End: Select to line boundaries
 * - Ctrl+Shift+Arrow: Word-wise selection
 * - Ctrl+A: Select all text
 * - Ctrl+E: End of line
 * - Home/End: Beginning/end of line
 * - Alt+B/F: Move by word (wraps across lines)
 * - Ctrl+W, Alt+Backspace: Delete word backwards (kill ring)
 * - Alt+D: Delete word forwards (kill ring)
 * - Ctrl+K: Kill to end of line (kill ring)
 * - Ctrl+U: Kill to beginning of line (kill ring)
 * - Ctrl+Y: Yank (paste from kill ring)
 * - Alt+Y: Cycle through kill ring (after Ctrl+Y)
 * - Ctrl+T: Transpose characters
 * - PageUp/PageDown: Scroll by viewport height
 * - Backspace/Delete: Delete characters (or selected text)
 * - Enter: Insert newline (replaces selection, or submit with submitKey)
 * - Typing with selection: Replaces selected text
 */
import { useCallback, useMemo, useRef, useState } from "react"
import { useInput } from "../../hooks/useInput"
import {
  addToKillRing,
  findNextWordEnd,
  findPrevWordStart,
  handleReadlineKey,
  type YankState,
} from "../../hooks/readline-ops"
import { cursorToRowCol, getWrappedLines } from "@silvery/create/text-cursor"
import type { WrappedLine } from "@silvery/create/text-cursor"

// =============================================================================
// Types
// =============================================================================

/** Selection range as [start, end) character offsets */
export interface TextAreaSelection {
  start: number
  end: number
}

export interface UseTextAreaOptions {
  /** Current value (controlled) */
  value?: string
  /** Initial value (uncontrolled) */
  defaultValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Called on submit (Ctrl+Enter by default, or Enter if submitKey="enter") */
  onSubmit?: (value: string) => void
  /** Key to trigger submit: "ctrl+enter" (default), "enter", or "meta+enter" */
  submitKey?: "ctrl+enter" | "enter" | "meta+enter"
  /** Whether input is active (receives keystrokes) */
  isActive?: boolean
  /** Visible height in rows (for scroll clamping and PageUp/PageDown) */
  height: number
  /** Wrap width in columns (typically from useBoxRect) */
  wrapWidth: number
  /** Number of context lines to keep visible above/below cursor when scrolling (default: 1) */
  scrollMargin?: number
  /** When true, ignore all input */
  disabled?: boolean
  /** Maximum number of characters allowed */
  maxLength?: number
}

export interface UseTextAreaResult {
  /** Current text value */
  value: string
  /** Cursor position (character offset) */
  cursor: number
  /** Cursor row in wrapped lines (0-indexed) */
  cursorRow: number
  /** Cursor column in current wrapped line (0-indexed) */
  cursorCol: number
  /** Visible cursor row relative to scroll offset */
  visibleCursorRow: number
  /** Current scroll offset (first visible row) */
  scrollOffset: number
  /** Wrapped lines for the current value and width */
  wrappedLines: WrappedLine[]
  /** Visible lines (wrappedLines sliced by scrollOffset and height) */
  visibleLines: WrappedLine[]
  /** Current selection range, or null if no selection */
  selection: TextAreaSelection | null
  /** Selection anchor position (where shift-select started), or null */
  selectionAnchor: number | null
  /** Clear the input */
  clear: () => void
  /** Set value programmatically (cursor moves to end) */
  setValue: (value: string) => void
  /** Get the current selection range, or null if no selection */
  getSelection: () => TextAreaSelection | null
  /** Set cursor position (character offset) and scroll to keep it visible */
  setCursor: (offset: number) => void
}

// =============================================================================
// Helpers
// =============================================================================

/** Ensure scroll offset keeps the cursor row visible with margin context lines */
export function clampScroll(
  cursorRow: number,
  currentScroll: number,
  viewportHeight: number,
  totalLines: number,
  margin: number,
): number {
  if (viewportHeight <= 0) return 0
  // Effective margin: disabled when content fits in viewport, and clamped so
  // the cursor can still reach the first/last row.
  const effectiveMargin =
    totalLines <= viewportHeight ? 0 : Math.min(margin, Math.floor((viewportHeight - 1) / 2))
  let scroll = currentScroll
  if (cursorRow < scroll + effectiveMargin) {
    scroll = cursorRow - effectiveMargin
  }
  if (cursorRow >= scroll + viewportHeight - effectiveMargin) {
    scroll = cursorRow - viewportHeight + 1 + effectiveMargin
  }
  return Math.max(0, Math.min(scroll, Math.max(0, totalLines - viewportHeight)))
}

// =============================================================================
// Hook
// =============================================================================

export function useTextArea({
  value: controlledValue,
  defaultValue = "",
  onChange,
  onSubmit,
  submitKey = "ctrl+enter",
  isActive = true,
  height,
  wrapWidth: rawWrapWidth,
  scrollMargin = 1,
  disabled,
  maxLength,
}: UseTextAreaOptions): UseTextAreaResult {
  const isControlled = controlledValue !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const [cursor, setCursor] = useState(defaultValue.length)
  const [scrollOffset, setScrollOffset] = useState(0)
  const stickyXRef = useRef<number | null>(null)

  const yankStateRef = useRef<YankState | null>(null)

  // Selection: anchor is where the selection started, cursor is the moving end.
  // When anchor is non-null, the selected range is [min(anchor, cursor), max(anchor, cursor)).
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  const selectionAnchorRef = useRef<number | null>(null)
  selectionAnchorRef.current = selectionAnchor

  const value = isControlled ? (controlledValue ?? "") : uncontrolledValue
  const wrapWidth = Math.max(1, rawWrapWidth)

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
      const totalLines = getWrappedLines(text, wrapWidth).length
      const newScroll = clampScroll(row, scrollRef.current, height, totalLines, scrollMargin)
      if (newScroll !== scrollRef.current) {
        setScrollOffset(newScroll)
      }
    },
    [wrapWidth, height, scrollMargin],
  )

  const updateValue = useCallback(
    (newValue: string, newCursor: number) => {
      // Enforce maxLength: allow deletions (shorter) but reject insertions beyond limit
      if (
        maxLength !== undefined &&
        newValue.length > maxLength &&
        newValue.length > stateRef.current.value.length
      ) {
        return
      }
      stateRef.current.value = newValue
      stateRef.current.cursor = newCursor
      if (!isControlled) {
        setUncontrolledValue(newValue)
      }
      setCursorAndScroll(newCursor, newValue)
      onChange?.(newValue)
      yankStateRef.current = null
    },
    [isControlled, maxLength, onChange, setCursorAndScroll],
  )

  /** Get the selection range as [start, end), or null if no selection */
  const getSelectionRange = useCallback((): TextAreaSelection | null => {
    const anchor = selectionAnchorRef.current
    if (anchor === null) return null
    const cur = stateRef.current.cursor
    if (anchor === cur) return null
    return { start: Math.min(anchor, cur), end: Math.max(anchor, cur) }
  }, [])

  /** Delete the selected text and return the new value and cursor position */
  const deleteSelection = useCallback((): { newValue: string; newCursor: number } | null => {
    const sel = getSelectionRange()
    if (!sel) return null
    const v = stateRef.current.value
    return { newValue: v.slice(0, sel.start) + v.slice(sel.end), newCursor: sel.start }
  }, [getSelectionRange])

  /** Move cursor with shift: extends selection. Without shift: clears selection. */
  const moveCursor = useCallback(
    (newCursor: number, text: string, shift: boolean) => {
      if (shift) {
        // Start or extend selection
        if (selectionAnchorRef.current === null) {
          const anchor = stateRef.current.cursor
          setSelectionAnchor(anchor)
          selectionAnchorRef.current = anchor
        }
      } else {
        // Clear selection
        if (selectionAnchorRef.current !== null) {
          setSelectionAnchor(null)
          selectionAnchorRef.current = null
        }
      }
      setCursorAndScroll(newCursor, text)
    },
    [setCursorAndScroll],
  )

  /** Replace selection (if any) with new text, or insert at cursor */
  const replaceSelectionWith = useCallback(
    (insertText: string) => {
      const sel = getSelectionRange()
      const { value } = stateRef.current
      if (sel) {
        const newValue = value.slice(0, sel.start) + insertText + value.slice(sel.end)
        const newCursor = sel.start + insertText.length
        setSelectionAnchor(null)
        selectionAnchorRef.current = null
        updateValue(newValue, newCursor)
        return true
      }
      return false
    },
    [getSelectionRange, updateValue],
  )

  const wrappedLines = useMemo(() => getWrappedLines(value, wrapWidth), [value, wrapWidth])

  const { row: cursorRow, col: cursorCol } = useMemo(
    () => cursorToRowCol(value, clampedCursor, wrapWidth),
    [value, clampedCursor, wrapWidth],
  )

  // =========================================================================
  // Input handling
  // =========================================================================

  useInput(
    (input, key) => {
      if (disabled) return

      const { value, cursor } = stateRef.current
      const lines = getWrappedLines(value, wrapWidth)
      const { row: cRow, col: cCol } = cursorToRowCol(value, cursor, wrapWidth)
      const hasSelection =
        selectionAnchorRef.current !== null && selectionAnchorRef.current !== cursor

      // Helper: clear selection state
      const clearSelection = () => {
        if (selectionAnchorRef.current !== null) {
          setSelectionAnchor(null)
          selectionAnchorRef.current = null
        }
      }

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
      if (submitKey === "meta+enter" && key.return && key.meta) {
        onSubmit?.(value)
        return
      }

      // =================================================================
      // Ctrl+A: Select all
      // =================================================================
      if (key.ctrl && input === "a") {
        stickyXRef.current = null
        setSelectionAnchor(0)
        selectionAnchorRef.current = 0
        setCursorAndScroll(value.length, value)
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Enter (newline) — replaces selection if active
      // =================================================================
      if (key.return && submitKey !== "enter") {
        stickyXRef.current = null
        if (hasSelection) {
          replaceSelectionWith("\n")
        } else {
          updateValue(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1)
        }
        return
      }

      // =================================================================
      // Shift+Arrow: extend selection
      // Ctrl+Shift+Arrow: word-wise selection
      // =================================================================

      // Shift+Left / Ctrl+Shift+Left
      if (key.leftArrow && key.shift) {
        stickyXRef.current = null
        const target = key.ctrl ? findPrevWordStart(value, cursor) : Math.max(0, cursor - 1)
        moveCursor(target, value, true)
        yankStateRef.current = null
        return
      }

      // Shift+Right / Ctrl+Shift+Right
      if (key.rightArrow && key.shift) {
        stickyXRef.current = null
        const target = key.ctrl
          ? findNextWordEnd(value, cursor)
          : Math.min(value.length, cursor + 1)
        moveCursor(target, value, true)
        yankStateRef.current = null
        return
      }

      // Shift+Up
      if (key.upArrow && key.shift) {
        if (cRow > 0) {
          const targetX = stickyXRef.current ?? cCol
          stickyXRef.current = targetX
          const targetLine = lines[cRow - 1]
          if (targetLine) {
            moveCursor(
              targetLine.startOffset + Math.min(targetX, targetLine.line.length),
              value,
              true,
            )
          }
        }
        yankStateRef.current = null
        return
      }

      // Shift+Down
      if (key.downArrow && key.shift) {
        if (cRow < lines.length - 1) {
          const targetX = stickyXRef.current ?? cCol
          stickyXRef.current = targetX
          const targetLine = lines[cRow + 1]
          if (targetLine) {
            moveCursor(
              targetLine.startOffset + Math.min(targetX, targetLine.line.length),
              value,
              true,
            )
          }
        }
        yankStateRef.current = null
        return
      }

      // Shift+Home
      if (key.home && key.shift) {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (currentLine) moveCursor(currentLine.startOffset, value, true)
        yankStateRef.current = null
        return
      }

      // Shift+End
      if (key.end && key.shift) {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (currentLine) moveCursor(currentLine.startOffset + currentLine.line.length, value, true)
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: Up/Down with stickyX (non-shift: collapse selection)
      // =================================================================
      if (key.upArrow) {
        if (cRow > 0) {
          const targetX = stickyXRef.current ?? cCol
          stickyXRef.current = targetX
          const targetLine = lines[cRow - 1]
          if (targetLine) {
            moveCursor(
              targetLine.startOffset + Math.min(targetX, targetLine.line.length),
              value,
              false,
            )
          }
        } else {
          clearSelection()
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
            moveCursor(
              targetLine.startOffset + Math.min(targetX, targetLine.line.length),
              value,
              false,
            )
          }
        } else {
          clearSelection()
        }
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: Ctrl+Home/End (document start/end)
      // =================================================================
      if (key.ctrl && key.home) {
        stickyXRef.current = null
        moveCursor(0, value, false)
        yankStateRef.current = null
        return
      }

      if (key.ctrl && key.end) {
        stickyXRef.current = null
        moveCursor(value.length, value, false)
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: Home/End (beginning/end of wrapped line)
      // Note: Ctrl+A is now select-all, Ctrl+E still goes to end of line
      // =================================================================
      if (key.home) {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (currentLine) moveCursor(currentLine.startOffset, value, false)
        yankStateRef.current = null
        return
      }

      if (key.end || (key.ctrl && input === "e")) {
        stickyXRef.current = null
        const currentLine = lines[cRow]
        if (currentLine) moveCursor(currentLine.startOffset + currentLine.line.length, value, false)
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
          moveCursor(targetLine.startOffset + Math.min(cCol, targetLine.line.length), value, false)
        }
        yankStateRef.current = null
        return
      }

      if (key.pageDown) {
        stickyXRef.current = null
        const targetLine = lines[Math.min(lines.length - 1, cRow + height)]
        if (targetLine) {
          moveCursor(targetLine.startOffset + Math.min(cCol, targetLine.line.length), value, false)
        }
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Multi-line: Ctrl+K/U (kill to end/beginning of wrapped line)
      // =================================================================
      if (key.ctrl && input === "k") {
        stickyXRef.current = null
        clearSelection()
        const currentLine = lines[cRow]
        if (!currentLine) return
        const lineEnd = currentLine.startOffset + currentLine.line.length
        if (cursor < lineEnd) {
          addToKillRing(value.slice(cursor, lineEnd))
          updateValue(value.slice(0, cursor) + value.slice(lineEnd), cursor)
        } else if (cursor < value.length) {
          addToKillRing(value.slice(cursor, cursor + 1))
          updateValue(value.slice(0, cursor) + value.slice(cursor + 1), cursor)
        }
        return
      }

      if (key.ctrl && input === "u") {
        stickyXRef.current = null
        clearSelection()
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
      // Backspace/Delete with selection: delete selection
      // =================================================================
      if ((key.backspace || key.delete) && hasSelection) {
        stickyXRef.current = null
        const del = deleteSelection()
        if (del) {
          clearSelection()
          updateValue(del.newValue, del.newCursor)
        }
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Character input with selection: replace selection
      // Use key.text (actual typed char, e.g. ':' for Shift+;) rather than
      // the keybinding-normalized `input` (';' for Shift+;). See keys.ts:1120-1127.
      // =================================================================
      const typedChar = key.text ?? input
      if (hasSelection && typedChar.length >= 1 && typedChar >= " ") {
        stickyXRef.current = null
        replaceSelectionWith(typedChar)
        yankStateRef.current = null
        return
      }

      // =================================================================
      // Shared readline operations (cursor, word, kill ring, yank, etc.)
      // Non-shift movement/editing clears selection.
      // =================================================================
      const result = handleReadlineKey(input, key, value, cursor, yankStateRef.current)
      if (result) {
        stickyXRef.current = null
        // Any readline operation clears selection
        clearSelection()
        if (result.value === value && result.cursor === cursor) {
          yankStateRef.current = result.yankState
          return
        }
        if (result.value !== value) {
          // Enforce maxLength for readline insertions
          if (
            maxLength !== undefined &&
            result.value.length > maxLength &&
            result.value.length > value.length
          ) {
            yankStateRef.current = result.yankState
            return
          }
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
  // Computed output
  // =========================================================================

  const visibleCursorRow = cursorRow - scrollOffset
  const selection =
    selectionAnchor !== null && selectionAnchor !== clampedCursor
      ? {
          start: Math.min(selectionAnchor, clampedCursor),
          end: Math.max(selectionAnchor, clampedCursor),
        }
      : null

  const visibleLines = wrappedLines.slice(scrollOffset, scrollOffset + height)

  const clear = useCallback(() => {
    updateValue("", 0)
    setScrollOffset(0)
    setSelectionAnchor(null)
  }, [updateValue])

  const setValue = useCallback(
    (v: string) => {
      updateValue(v, v.length)
      setSelectionAnchor(null)
    },
    [updateValue],
  )

  const setCursorFn = useCallback(
    (offset: number) => {
      const clamped = Math.min(Math.max(0, offset), stateRef.current.value.length)
      setSelectionAnchor(null)
      selectionAnchorRef.current = null
      setCursorAndScroll(clamped, stateRef.current.value)
    },
    [setCursorAndScroll],
  )

  return {
    value,
    cursor: clampedCursor,
    cursorRow,
    cursorCol,
    visibleCursorRow,
    scrollOffset,
    wrappedLines,
    visibleLines,
    selection,
    selectionAnchor,
    clear,
    setValue,
    getSelection: getSelectionRange,
    setCursor: setCursorFn,
  }
}
