/**
 * ReadlineInput Component
 *
 * Full readline-style text input with kill ring, word movement, and all shortcuts.
 * Built on useReadline hook.
 *
 * Usage:
 * ```tsx
 * const [value, setValue] = useState('')
 * <ReadlineInput
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
import { Box } from "./Box.js"
import { Text } from "./Text.js"
import { useReadline } from "./useReadline.js"

// =============================================================================
// Types
// =============================================================================

export interface ReadlineInputProps {
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
  /** Whether input is focused/active */
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
}

export interface ReadlineInputHandle {
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

export const ReadlineInput = forwardRef<ReadlineInputHandle, ReadlineInputProps>(function ReadlineInput(
  {
    value: controlledValue,
    defaultValue = "",
    onChange,
    onSubmit,
    onEOF,
    placeholder = "",
    isActive = true,
    prompt = "",
    promptColor = "yellow",
    color,
    cursorStyle = "block",
    showUnderline = false,
    underlineWidth = 40,
    mask,
  },
  ref,
) {
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

  return (
    <Box flexDirection="column">
      <Text color={color}>
        {prompt && <Text color={promptColor}>{prompt}</Text>}
        {showPlaceholder ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <>
            <Text>{displayBeforeCursor}</Text>
            {isActive && cursorStyle === "block" && <Text inverse>{displayAtCursor}</Text>}
            {isActive && cursorStyle === "underline" && <Text underline>{displayAtCursor}</Text>}
            {!isActive && <Text>{displayAtCursor}</Text>}
            <Text>{displayAfterCursor}</Text>
          </>
        )}
        {showPlaceholder && isActive && (cursorStyle === "block" ? <Text inverse> </Text> : <Text underline> </Text>)}
      </Text>
      {showUnderline && <Text dimColor>{"─".repeat(underlineWidth)}</Text>}
    </Box>
  )
})
