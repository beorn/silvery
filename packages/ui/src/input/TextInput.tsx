/**
 * React TextInput component for silvery/Ink TUI apps
 */

import React, { useState, useCallback } from "react"
import type { TextInputProps } from "../types.js"

/**
 * Single-line text input component for React TUI apps
 *
 * This is a controlled component that renders the current input state.
 * It does NOT handle keyboard input directly - that's the caller's responsibility
 * (via useInput hook in Ink, or similar).
 *
 * @example
 * ```tsx
 * import { TextInput } from "@silvery/ui/input";
 * import { useInput } from "ink";
 *
 * function MyForm() {
 *   const [value, setValue] = useState("");
 *
 *   useInput((input, key) => {
 *     if (key.backspace || key.delete) {
 *       setValue(v => v.slice(0, -1));
 *     } else if (!key.ctrl && !key.meta && input) {
 *       setValue(v => v + input);
 *     }
 *   });
 *
 *   return <TextInput value={value} onChange={setValue} placeholder="Type here..." />;
 * }
 *
 * // With password masking
 * <TextInput value={password} onChange={setPassword} mask="*" />
 *
 * // With autocomplete
 * <TextInput
 *   value={query}
 *   onChange={setQuery}
 *   autocomplete={["apple", "apricot", "avocado"]}
 * />
 * ```
 */
export function TextInput({
  value,
  onChange,
  placeholder,
  mask,
  autocomplete,
  onAutocomplete,
  onSubmit,
  cursorPosition,
  focused = true,
}: TextInputProps): React.ReactElement {
  // Calculate display value (masked or plain)
  const displayValue = mask ? mask.repeat(value.length) : value

  // Find matching autocomplete suggestion
  const suggestion = getAutocompleteSuggestion(value, autocomplete)

  // Cursor position defaults to end of input
  const cursor = cursorPosition ?? value.length

  // Build the display: value + cursor + suggestion suffix
  const beforeCursor = displayValue.slice(0, cursor)
  const afterCursor = displayValue.slice(cursor)
  const suggestionSuffix = suggestion ? suggestion.slice(value.length) : ""

  // Show placeholder if empty and not focused or no value
  const showPlaceholder = !value && placeholder

  return (
    <span data-silvery-ui-text-input data-focused={focused}>
      {showPlaceholder ? (
        <span data-color="dim">{placeholder}</span>
      ) : (
        <>
          <span>{beforeCursor}</span>
          {focused && (
            <span data-cursor data-inverse>
              {afterCursor[0] || " "}
            </span>
          )}
          <span>{afterCursor.slice(1)}</span>
          {suggestionSuffix && <span data-color="dim">{suggestionSuffix}</span>}
        </>
      )}
    </span>
  )
}

/**
 * Hook for managing text input state with autocomplete support
 *
 * @example
 * ```tsx
 * function SearchInput() {
 *   const { value, displayValue, suggestion, handleInput, acceptSuggestion, clear } =
 *     useTextInput({ autocomplete: ["apple", "banana", "cherry"] });
 *
 *   useInput((input, key) => {
 *     if (key.tab && suggestion) {
 *       acceptSuggestion();
 *     } else {
 *       handleInput(input, key);
 *     }
 *   });
 *
 *   return <Text>{displayValue}</Text>;
 * }
 * ```
 */
export function useTextInput(
  options: {
    initialValue?: string
    mask?: string
    autocomplete?: string[]
    onSubmit?: (value: string) => void
  } = {},
): {
  value: string
  setValue: (value: string) => void
  displayValue: string
  suggestion: string | undefined
  cursorPosition: number
  setCursorPosition: (pos: number) => void
  handleInput: (input: string, key: InputKey) => void
  acceptSuggestion: () => void
  clear: () => void
} {
  const [value, setValue] = useState(options.initialValue ?? "")
  const [cursorPosition, setCursorPosition] = useState(value.length)

  const displayValue = options.mask ? options.mask.repeat(value.length) : value

  const suggestion = getAutocompleteSuggestion(value, options.autocomplete)

  const handleInput = useCallback(
    (input: string, key: InputKey) => {
      if (key.return) {
        options.onSubmit?.(value)
        return
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          setValue((v) => v.slice(0, cursorPosition - 1) + v.slice(cursorPosition))
          setCursorPosition((p) => Math.max(0, p - 1))
        }
        return
      }

      if (key.leftArrow) {
        setCursorPosition((p) => Math.max(0, p - 1))
        return
      }

      if (key.rightArrow) {
        setCursorPosition((p) => Math.min(value.length, p + 1))
        return
      }

      // Ignore control characters
      if (key.ctrl || key.meta || !input) {
        return
      }

      // Insert character at cursor position
      setValue((v) => v.slice(0, cursorPosition) + input + v.slice(cursorPosition))
      setCursorPosition((p) => p + input.length)
    },
    [value, cursorPosition, options.onSubmit],
  )

  const acceptSuggestion = useCallback(() => {
    if (suggestion) {
      setValue(suggestion)
      setCursorPosition(suggestion.length)
    }
  }, [suggestion])

  const clear = useCallback(() => {
    setValue("")
    setCursorPosition(0)
  }, [])

  return {
    value,
    setValue,
    displayValue,
    suggestion,
    cursorPosition,
    setCursorPosition,
    handleInput,
    acceptSuggestion,
    clear,
  }
}

/** Key object type (matches Ink's Key interface) */
interface InputKey {
  return?: boolean
  backspace?: boolean
  delete?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  upArrow?: boolean
  downArrow?: boolean
  tab?: boolean
  escape?: boolean
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
}

/**
 * Find a matching autocomplete suggestion for the current input
 */
function getAutocompleteSuggestion(value: string, autocomplete?: string[]): string | undefined {
  if (!value || !autocomplete?.length) {
    return undefined
  }

  const lowerValue = value.toLowerCase()
  return autocomplete.find((item) => item.toLowerCase().startsWith(lowerValue) && item.length > value.length)
}
