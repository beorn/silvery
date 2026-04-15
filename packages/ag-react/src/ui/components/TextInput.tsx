/**
 * TextInput Component
 *
 * Full readline-style single-line text input with kill ring, word movement, and
 * all standard shortcuts. Built on useReadline hook.
 *
 * Usage:
 * ```tsx
 * const [value, setValue] = useState('')
 * <TextInput
 *   value={value}
 *   onChange={setValue}
 *   onSubmit={(val) => console.log('Submitted:', val)}
 *   placeholder="Type here..."
 * />
 * ```
 *
 * Supported shortcuts:
 * - Ctrl+A/E: Beginning/end of line
 * - Ctrl+B/F, Left/Right: Move cursor
 * - Alt+B/F: Move by word
 * - Ctrl+W, Alt+Backspace: Delete word backwards (kill)
 * - Alt+D: Delete word forwards (kill)
 * - Ctrl+U/K: Delete to beginning/end (kill)
 * - Ctrl+Y: Yank (paste)
 * - Alt+Y: Cycle kill ring
 * - Ctrl+T: Transpose characters
 */
import { useCallback, useImperativeHandle, forwardRef, useState, useEffect, useRef } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useReadline } from "./useReadline"
import { useFocusable } from "../../hooks/useFocusable"
import { useCursor } from "../../hooks/useCursor"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"

// =============================================================================
// Types
// =============================================================================

export interface TextInputProps {
  /** Current value (controlled) */
  value?: string
  /** Initial value (uncontrolled) */
  defaultValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Called when Enter is pressed */
  onSubmit?: (value: string) => void
  /** Called on Ctrl+D with empty input */
  onEOF?: () => void
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether input is focused/active (overrides focus system) */
  isActive?: boolean
  /** Prompt prefix (e.g., "$ " or "> ") */
  prompt?: string
  /** Prompt color */
  promptColor?: string
  /** Text color */
  color?: string
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
  /** Show underline below input */
  showUnderline?: boolean
  /** Underline width (default: 40) */
  underlineWidth?: number
  /** Mask character for passwords */
  mask?: string
  /** Border style (e.g., "round", "single") — wraps input in bordered Box */
  borderStyle?: string
  /** Border color when unfocused (default: "$border") */
  borderColor?: string
  /** Border color when focused (default: "$focusborder") */
  focusBorderColor?: string
  /** Test ID for focus system identification */
  testID?: string
}

export interface TextInputHandle {
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
  /** Set value programmatically */
  setValue: (value: string) => void
  /** Get kill ring contents */
  getKillRing: () => string[]
}

// =============================================================================
// Component
// =============================================================================

export const TextInput = forwardRef<TextInputHandle, TextInputProps>(function TextInput(
  {
    value: controlledValue,
    defaultValue = "",
    onChange,
    onSubmit,
    onEOF,
    placeholder = "",
    isActive: isActiveProp,
    prompt = "",
    promptColor = "$control",
    color,
    cursorStyle = "block",
    showUnderline = false,
    underlineWidth = 40,
    mask,
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

  // Track whether we're in controlled mode
  const isControlled = controlledValue !== undefined

  // Track value changes that originated from internal editing (keystroke → onChange).
  // When the parent feeds back the SAME value via controlledValue, we skip
  // readline.setValue() since readline already has the correct cursor position.
  // When the parent feeds back a DIFFERENT value (i.e. it transformed or replaced
  // the value inside onChange — e.g. a sigil-replacement rule), we treat that as
  // an external override and sync readline. Without this, parent-driven overrides
  // would silently drop because we'd match "internal" and skip the sync. See
  // km-tui.omnibox-use-silvery for the motivating use case (slippery sigil rule).
  const internalChangeRef = useRef(false)
  const lastEmittedValueRef = useRef<string | null>(null)

  // Use readline hook
  const readline = useReadline({
    initialValue: isControlled ? (controlledValue ?? "") : defaultValue,
    onChange: useCallback(
      (newValue: string) => {
        internalChangeRef.current = true
        lastEmittedValueRef.current = newValue
        onChange?.(newValue)
      },
      [onChange],
    ),
    isActive,
    handleEnter: !!onSubmit,
    onSubmit,
    onEOF,
  })

  // Sync controlled value to readline — only for external changes or parent overrides.
  // Internal changes (from editing) already have correct cursor position, UNLESS the
  // parent's onChange handler transformed the value into something different — in
  // that case we treat it as external and sync the new value into readline.
  const [lastControlledValue, setLastControlledValue] = useState(controlledValue)
  useEffect(() => {
    if (isControlled && controlledValue !== lastControlledValue) {
      const isEchoOfInternalEdit =
        internalChangeRef.current && controlledValue === lastEmittedValueRef.current
      if (isEchoOfInternalEdit) {
        // Parent echoed back exactly what we emitted — readline already has correct state.
        internalChangeRef.current = false
      } else {
        // External change OR parent override — sync readline (cursor goes to end).
        readline.setValue(controlledValue ?? "")
        internalChangeRef.current = false
      }
      setLastControlledValue(controlledValue)
    }
  }, [isControlled, controlledValue, lastControlledValue, readline])

  // Handle Enter separately for onSubmit
  const { value, cursor, clear, setValue, killRing } = readline

  // Imperative handle for parent control
  useImperativeHandle(ref, () => ({
    clear,
    getValue: () => value,
    setValue,
    getKillRing: () => killRing,
  }))

  // Compute display value (with optional mask)
  const displayValue = mask ? mask.repeat(value.length) : value
  const displayBeforeCursor = displayValue.slice(0, cursor)
  const displayAtCursor = displayValue[cursor] ?? " "
  const displayAfterCursor = displayValue.slice(cursor + 1)
  const showPlaceholder = !value && placeholder

  // Always show visual cursor (inverse/underline). When active, the hardware
  // cursor is also positioned via useCursor() for terminal blink support.
  const cursorEl =
    cursorStyle === "underline" ? <Text underline>{displayAtCursor}</Text> : <Text inverse>{displayAtCursor}</Text>

  // Compute border+padding offset for cursor positioning.
  // useCursor reads scrollRect from the parent's NodeContext, but the text
  // content is rendered inside this component's Box (which may have border
  // and padding). We must add those offsets so the terminal cursor aligns
  // with the text content area.
  const borderColOffset = borderStyleProp ? 2 : 0 // border-left(1) + paddingX-left(1)
  const borderRowOffset = borderStyleProp ? 1 : 0 // border-top(1)

  useCursor({
    col: prompt.length + displayBeforeCursor.length + borderColOffset,
    row: borderRowOffset,
    visible: isActive,
  })

  // Click-to-position: map mouse click to cursor offset
  const handleMouseDown = useCallback(
    (e: SilveryMouseEvent) => {
      if (e.button !== 0) return
      const rect = e.currentTarget.scrollRect
      if (!rect) return
      const relativeX = e.clientX - rect.x - prompt.length
      const newCursor = Math.max(0, Math.min(relativeX, value.length))
      readline.setValueWithCursor(value, newCursor)
    },
    [prompt.length, value, readline],
  )

  const inputContent = (
    <Text color={color}>
      {prompt && <Text color={promptColor}>{prompt}</Text>}
      {showPlaceholder ? (
        <>
          {cursorStyle === "underline" ? (
            <Text underline dimColor>
              {placeholder[0]}
            </Text>
          ) : (
            <Text inverse dimColor>
              {placeholder[0]}
            </Text>
          )}
          <Text dimColor>{placeholder.slice(1)}</Text>
        </>
      ) : (
        <>
          <Text>{displayBeforeCursor}</Text>
          {cursorEl}
          <Text>{displayAfterCursor}</Text>
        </>
      )}
    </Text>
  )

  if (borderStyleProp) {
    return (
      <Box
        focusable
        testID={testID}
        flexDirection="column"
        borderStyle={borderStyleProp as any}
        borderColor={isActive ? focusBorderColor : borderColorProp}
        paddingX={1}
        onMouseDown={handleMouseDown}
      >
        {inputContent}
        {showUnderline && <Text dimColor>{"─".repeat(underlineWidth)}</Text>}
      </Box>
    )
  }

  return (
    <Box focusable testID={testID} flexDirection="column" onMouseDown={handleMouseDown}>
      {inputContent}
      {showUnderline && <Text dimColor>{"─".repeat(underlineWidth)}</Text>}
    </Box>
  )
})
