/**
 * TextArea Component
 *
 * Multi-line text input with word wrapping, scrolling, and cursor movement.
 * Uses useBoxRect for width-aware word wrapping and VirtualList-style
 * scroll tracking to keep the cursor visible.
 *
 * Built on useTextArea hook — use the hook directly for custom rendering.
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
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { useBoxRect } from "../../hooks/useLayout"
import { useFocusable } from "../../hooks/useFocusable"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useTextArea } from "./useTextArea"
import type { WrappedLine } from "@silvery/create/text-cursor"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"

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
  /** Key to trigger submit: "ctrl+enter" (default), "enter", or "meta+enter" */
  submitKey?: "ctrl+enter" | "enter" | "meta+enter"
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether input is focused/active (overrides focus system) */
  isActive?: boolean
  /** Visible height in rows (required) */
  height: number
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
  /** Number of context lines to keep visible above/below cursor when scrolling (default: 1) */
  scrollMargin?: number
  /** When true, ignore all input and dim the text */
  disabled?: boolean
  /** Maximum number of characters allowed */
  maxLength?: number
  /** Border style (e.g., "round", "single") — wraps input in bordered Box */
  borderStyle?: string
  /** Border color when unfocused (default: "$border-default") */
  borderColor?: string
  /** Border color when focused (default: "$border-focus") */
  focusBorderColor?: string
  /** Test ID for focus system identification */
  testID?: string
  /**
   * Called when an arrow key is pressed AT the buffer boundary (where the key
   * would otherwise be a no-op or clamp). Enables cross-widget focus handoff
   * for composite editors.
   *
   * - `"top"` fires when Up is pressed at `cursorRow === 0`
   * - `"bottom"` fires when Down is pressed at `cursorRow === lastRow`
   * - `"left"` fires when Left is pressed at the start of the buffer
   * - `"right"` fires when Right is pressed at the end of the buffer
   *
   * Return `true` to consume the key (cursor doesn't move). Return `false` or
   * omit the handler to let the TextArea clamp the cursor normally.
   *
   * Not fired when Shift is held (shift+arrow extends selection instead).
   */
  onEdge?: (edge: "top" | "bottom" | "left" | "right") => boolean
}

/** Selection range as [start, end) character offsets */
export { type TextAreaSelection } from "./useTextArea"

export interface TextAreaHandle {
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
  /** Set value programmatically (cursor moves to end) */
  setValue: (value: string) => void
  /** Set cursor position (character offset). Clamped to value length, scrolls to keep visible. */
  setCursor: (offset: number) => void
  /** Get the current selection range, or null if no selection */
  getSelection: () => import("./useTextArea").TextAreaSelection | null
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
    scrollMargin = 1,
    disabled,
    maxLength,
    borderStyle: borderStyleProp,
    borderColor: borderColorProp = "$border-default",
    focusBorderColor = "$border-focus",
    testID,
    onEdge,
  },
  ref,
) {
  // Focus system integration: prop overrides hook.
  // When testID is set, the component participates in the focus tree and
  // isActive derives from focus state. Without testID, default to true
  // for backward compatibility.
  const { focused } = useFocusable()
  const isActive = isActiveProp ?? (testID ? focused : true)

  const { width: parentWidth } = useBoxRect()

  // When borderStyle is set, TextArea renders a Box with border + paddingX.
  // useBoxRect reads from the parent's NodeContext, so we must subtract
  // border (1+1) and padding (1+1) to get the actual content area width.
  const contentWidth = borderStyleProp ? Math.max(1, parentWidth - 4) : parentWidth

  const ta = useTextArea({
    value: controlledValue,
    defaultValue,
    onChange,
    onSubmit,
    submitKey,
    isActive,
    height,
    wrapWidth: contentWidth,
    scrollMargin,
    disabled,
    maxLength,
    onEdge,
  })

  // Imperative handle
  useImperativeHandle(ref, () => ({
    clear: ta.clear,
    getValue: () => ta.value,
    setValue: ta.setValue,
    setCursor: ta.setCursor,
    getSelection: ta.getSelection,
  }))

  // Click-to-position: map mouse click to cursor offset
  const wrappedLinesRef = useRef<WrappedLine[]>(ta.wrappedLines)
  wrappedLinesRef.current = ta.wrappedLines
  const scrollOffsetRef = useRef(ta.scrollOffset)
  scrollOffsetRef.current = ta.scrollOffset

  const handleMouseDown = useCallback(
    (e: SilveryMouseEvent) => {
      if (e.button !== 0) return
      const rect = e.currentTarget.scrollRect
      if (!rect) return

      const lines = wrappedLinesRef.current
      const scroll = scrollOffsetRef.current

      const relativeY = e.clientY - rect.y
      const row = relativeY + scroll
      const clampedRow = Math.min(Math.max(0, row), lines.length - 1)
      const wl = lines[clampedRow]
      if (!wl) return

      const relativeX = e.clientX - rect.x
      const col = Math.min(Math.max(0, relativeX), wl.line.length)
      const offset = Math.min(Math.max(0, wl.startOffset + col), ta.value.length)
      ta.setCursor(offset)
    },
    [ta],
  )

  // =========================================================================
  // Rendering
  // =========================================================================

  const showPlaceholder = !ta.value && placeholder

  const borderProps = borderStyleProp
    ? {
        borderStyle: borderStyleProp as any,
        borderColor: isActive ? focusBorderColor : borderColorProp,
        paddingX: 1 as const,
      }
    : {}

  // Cursor positioning — declared as a Box prop (`cursorOffset`) so the
  // layout phase resolves the absolute terminal coordinates synchronously
  // before the scheduler emits the cursor ANSI. This avoids the React-effect
  // chain that the legacy `useCursor` hook used (`useScrollRect` →
  // `useLayoutEffect` → `setCursorState`), which produced stale-null reads
  // on the very first frame after a conditional mount. See bead
  // `km-silvery.view-as-layout-output` (Phase 2).
  //
  // Border + padding offsets here are intentionally absent — the layout
  // phase pulls them from `borderStyle` / `padding*` on the same Box and
  // applies them automatically (see `computeCursorRect` in
  // `@silvery/ag/layout-signals`). Components only declare the
  // content-area-relative cursor position.
  //
  // Hide hardware cursor when selection is active (cursor is shown as part
  // of selection rendering).
  const cursorOffset = {
    col: ta.cursorCol,
    row: ta.visibleCursorRow,
    visible: isActive && !disabled && !ta.selection,
  }

  if (showPlaceholder) {
    return (
      <Box
        focusable
        testID={testID}
        flexDirection="column"
        height={height}
        cursorOffset={cursorOffset}
        {...borderProps}
      >
        <Text color="$fg-muted">{placeholder}</Text>
      </Box>
    )
  }

  return (
    <Box
      focusable
      testID={testID}
      key={ta.scrollOffset}
      flexDirection="column"
      height={height}
      cursorOffset={cursorOffset}
      {...borderProps}
      onMouseDown={handleMouseDown}
    >
      {ta.visibleLines.map((wl, i) => {
        const absoluteRow = ta.scrollOffset + i
        const isCursorRow = absoluteRow === ta.cursorRow
        const lineStart = wl.startOffset
        const lineEnd = lineStart + wl.line.length

        // Check if this line has any selection overlap
        const hasSelectionOnLine =
          ta.selection && lineStart < ta.selection.end && lineEnd > ta.selection.start

        if (disabled) {
          return (
            <Text key={absoluteRow} color="$fg-muted">
              {wl.line || " "}
            </Text>
          )
        }

        if (hasSelectionOnLine) {
          // Compute selection overlap on this line (in line-local coordinates)
          const selStart = Math.max(0, ta.selection!.start - lineStart)
          const selEnd = Math.min(wl.line.length, ta.selection!.end - lineStart)

          const before = wl.line.slice(0, selStart)
          const selected = wl.line.slice(selStart, selEnd)
          const after = wl.line.slice(selEnd)

          return (
            <Text key={absoluteRow}>
              {before}
              <Text inverse>
                {selected || (selEnd === wl.line.length && isCursorRow ? " " : "")}
              </Text>
              {after}
            </Text>
          )
        }

        if (!isCursorRow) {
          return <Text key={absoluteRow}>{wl.line || " "}</Text>
        }

        const beforeCursor = wl.line.slice(0, ta.cursorCol)
        const atCursor = wl.line[ta.cursorCol] ?? " "
        const afterCursor = wl.line.slice(ta.cursorCol + 1)

        // Active: plain text (real cursor handles it). Inactive: fake cursor.
        const cursorEl = isActive ? (
          <Text>{atCursor}</Text>
        ) : cursorStyle === "block" ? (
          <Text inverse>{atCursor}</Text>
        ) : (
          <Text underline>{atCursor}</Text>
        )

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
