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
import { useCallback, useImperativeHandle, forwardRef, useState, useEffect } from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"
import { useReadline } from "./useReadline"
import { useFocusable } from "@silvery/react/hooks/useFocusable"
import { useCursor } from "@silvery/react/hooks/useCursor"

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
    promptColor = "$warning",
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

  // Use readline hook
  const readline = useReadline({
    initialValue: isControlled ? (controlledValue ?? "") : defaultValue,
    onChange: useCallback(
      (newValue: string) => {
        onChange?.(newValue)
      },
      [onChange],
    ),
    isActive,
    handleEnter: !!onSubmit,
    onSubmit,
    onEOF,
  })

  // Sync controlled value to readline
  const [lastControlledValue, setLastControlledValue] = useState(controlledValue)
  useEffect(() => {
    if (isControlled && controlledValue !== lastControlledValue) {
      readline.setValue(controlledValue ?? "")
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
  useCursor({
    col: prompt.length + displayBeforeCursor.length,
    row: 0,
    visible: isActive,
  })

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
      >
        {inputContent}
        {showUnderline && <Text dimColor>{"─".repeat(underlineWidth)}</Text>}
      </Box>
    )
  }

  return (
    <Box focusable testID={testID} flexDirection="column">
      {inputContent}
      {showUnderline && <Text dimColor>{"─".repeat(underlineWidth)}</Text>}
    </Box>
  )
})
