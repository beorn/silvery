/**
 * TextArea Component
 *
 * Multi-line text input with word wrapping, scrolling, and cursor movement.
 * Uses useContentRect for width-aware word wrapping and VirtualList-style
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
import { forwardRef, useImperativeHandle } from "react"
import { useContentRect } from "@silvery/react/hooks/useLayout"
import { useFocusable } from "@silvery/react/hooks/useFocusable"
import { useCursor } from "@silvery/react/hooks/useCursor"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"
import { useTextArea } from "./useTextArea"

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
  /** Border color when unfocused (default: "$border") */
  borderColor?: string
  /** Border color when focused (default: "$focusborder") */
  focusBorderColor?: string
  /** Test ID for focus system identification */
  testID?: string
}

/** Selection range as [start, end) character offsets */
export { type TextAreaSelection } from "./useTextArea"

export interface TextAreaHandle {
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
  /** Set value programmatically */
  setValue: (value: string) => void
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
    borderColor: borderColorProp = "$border",
    focusBorderColor = "$focusborder",
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

  const { width } = useContentRect()

  const ta = useTextArea({
    value: controlledValue,
    defaultValue,
    onChange,
    onSubmit,
    submitKey,
    isActive,
    height,
    wrapWidth: width,
    scrollMargin,
    disabled,
    maxLength,
  })

  // Imperative handle
  useImperativeHandle(ref, () => ({
    clear: ta.clear,
    getValue: () => ta.value,
    setValue: ta.setValue,
    getSelection: ta.getSelection,
  }))

  // =========================================================================
  // Rendering
  // =========================================================================

  // Hide hardware cursor when selection is active (cursor shown as part of selection rendering)
  useCursor({
    col: ta.cursorCol,
    row: ta.visibleCursorRow,
    visible: isActive && !disabled && !ta.selection,
  })

  const showPlaceholder = !ta.value && placeholder

  const borderProps = borderStyleProp
    ? {
        borderStyle: borderStyleProp as any,
        borderColor: isActive ? focusBorderColor : borderColorProp,
        paddingX: 1 as const,
      }
    : {}

  if (showPlaceholder) {
    return (
      <Box
        focusable
        testID={testID}
        flexDirection="column"
        height={height}
        justifyContent="center"
        alignItems="center"
        {...borderProps}
      >
        <Text dimColor>{placeholder}</Text>
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
      {...borderProps}
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
            <Text key={absoluteRow} dimColor>
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
