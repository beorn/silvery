/**
 * TextInput Component
 *
 * Simple single-line text input with cursor display.
 * For full readline features (kill ring, word movement), use ReadlineInput.
 *
 * Usage:
 * ```tsx
 * const [value, setValue] = useState('')
 * <TextInput
 *   value={value}
 *   onChange={setValue}
 *   placeholder="Type here..."
 * />
 * ```
 */
import React, {
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react"
import { useInput } from "../hooks/index.js"
import { Box } from "./Box.js"
import { Text } from "./Text.js"

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
  /** Cursor color (default: inverse) */
  cursorColor?: string
  /** Show underline below input */
  showUnderline?: boolean
  /** Underline width (default: 40) */
  underlineWidth?: number
  /** Mask character for passwords */
  mask?: string
}

export interface TextInputHandle {
  /** Focus the input */
  focus: () => void
  /** Clear the input */
  clear: () => void
  /** Get current value */
  getValue: () => string
}

// =============================================================================
// Component
// =============================================================================

export const TextInput = forwardRef<TextInputHandle, TextInputProps>(
  function TextInput(
    {
      value: controlledValue,
      defaultValue = "",
      onChange,
      onSubmit,
      placeholder = "",
      isActive = true,
      prompt = "",
      promptColor = "yellow",
      color,
      cursorColor,
      showUnderline = false,
      underlineWidth = 40,
      mask,
    },
    ref,
  ) {
    // Support both controlled and uncontrolled modes
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
    const [cursor, setCursor] = useState(defaultValue.length)

    const isControlled = controlledValue !== undefined
    const value = isControlled ? controlledValue : uncontrolledValue

    const updateValue = useCallback(
      (newValue: string, newCursor: number) => {
        if (!isControlled) {
          setUncontrolledValue(newValue)
        }
        setCursor(newCursor)
        onChange?.(newValue)
      },
      [isControlled, onChange],
    )

    // Imperative handle for parent control
    useImperativeHandle(ref, () => ({
      focus: () => {
        // No-op in TUI - focus is managed by isActive prop
      },
      clear: () => {
        updateValue("", 0)
      },
      getValue: () => value,
    }))

    // Basic input handling
    useInput(
      (input, key) => {
        // Submit on Enter
        if (key.return) {
          onSubmit?.(value)
          return
        }

        // Cursor movement
        if (key.leftArrow || (key.ctrl && input === "b")) {
          if (cursor > 0) setCursor((c) => c - 1)
          return
        }
        if (key.rightArrow || (key.ctrl && input === "f")) {
          if (cursor < value.length) setCursor((c) => c + 1)
          return
        }

        // Home/End
        if (key.ctrl && input === "a") {
          setCursor(0)
          return
        }
        if (key.ctrl && input === "e") {
          setCursor(value.length)
          return
        }

        // Backspace
        if (key.backspace || key.delete) {
          if (cursor > 0) {
            const newValue = value.slice(0, cursor - 1) + value.slice(cursor)
            updateValue(newValue, cursor - 1)
          }
          return
        }

        // Ctrl+K: Delete to end
        if (key.ctrl && input === "k") {
          const newValue = value.slice(0, cursor)
          updateValue(newValue, cursor)
          return
        }

        // Ctrl+U: Delete to beginning
        if (key.ctrl && input === "u") {
          const newValue = value.slice(cursor)
          updateValue(newValue, 0)
          return
        }

        // Regular character input
        if (input.length === 1 && input >= " ") {
          const newValue = value.slice(0, cursor) + input + value.slice(cursor)
          updateValue(newValue, cursor + 1)
        }
      },
      { isActive },
    )

    // Compute display value (with optional mask)
    const displayValue = mask ? mask.repeat(value.length) : value
    const beforeCursor = displayValue.slice(0, cursor)
    const atCursor = displayValue[cursor] ?? " "
    const afterCursor = displayValue.slice(cursor + 1)
    const showPlaceholder = !value && placeholder

    return (
      <Box flexDirection="column">
        <Text color={color}>
          {prompt && <Text color={promptColor}>{prompt}</Text>}
          {showPlaceholder ? (
            <Text dimColor>{placeholder}</Text>
          ) : (
            <>
              <Text>{beforeCursor}</Text>
              {isActive && (
                <Text inverse={!cursorColor} color={cursorColor}>
                  {atCursor}
                </Text>
              )}
              {!isActive && <Text>{atCursor}</Text>}
              <Text>{afterCursor}</Text>
            </>
          )}
          {showPlaceholder && isActive && <Text inverse> </Text>}
        </Text>
        {showUnderline && <Text dimColor>{"─".repeat(underlineWidth)}</Text>}
      </Box>
    )
  },
)
