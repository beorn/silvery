/**
 * useReadline Hook
 *
 * This hook lives in components/ because it's tightly coupled to TextInput.
 * It manages readline state (cursor position, history, kill ring) that TextInput renders.
 *
 * Full readline-style line editing for terminal text input.
 * Supports cursor movement, word operations, kill ring, and all standard shortcuts.
 *
 * Shortcuts:
 * - Ctrl+A: Move to beginning of line
 * - Ctrl+E: Move to end of line
 * - Ctrl+B / Left: Move cursor left
 * - Ctrl+F / Right: Move cursor right
 * - Alt+B: Move cursor back one word
 * - Alt+F: Move cursor forward one word
 * - Ctrl+W / Alt+Backspace: Delete word backwards (adds to kill ring)
 * - Alt+D: Delete word forwards (adds to kill ring)
 * - Ctrl+U: Delete to beginning (adds to kill ring)
 * - Ctrl+K: Delete to end (adds to kill ring)
 * - Ctrl+Y: Yank (paste from kill ring)
 * - Alt+Y: Cycle through kill ring (after Ctrl+Y)
 * - Ctrl+T: Transpose characters
 * - Ctrl+H / Backspace: Delete char before cursor
 * - Ctrl+D / Delete: Delete char at cursor (or exit if empty)
 *
 * Note: Alt key detection requires terminal support. Some terminals send
 * ESC followed by the key instead of a proper alt modifier.
 */
import { useCallback, useRef, useState } from "react"
import { useInput } from "@silvery/react/hooks"
import { killRing, addToKillRing, handleReadlineKey, type YankState } from "@silvery/react/hooks/readline-ops"

// =============================================================================
// Types
// =============================================================================

export interface ReadlineState {
  /** Current text value */
  value: string
  /** Cursor position (0 = before first char, value.length = after last char) */
  cursor: number
}

export interface UseReadlineOptions {
  /** Initial value */
  initialValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Whether input is active */
  isActive?: boolean
  /** Handle Enter key (default: false - let parent handle) */
  handleEnter?: boolean
  /** Called when Enter is pressed (requires handleEnter: true) */
  onSubmit?: (value: string) => void
  /** Handle Escape key (default: false - let parent handle) */
  handleEscape?: boolean
  /** Handle Up/Down arrows (default: false - let parent handle for history) */
  handleVerticalArrows?: boolean
  /** Called on Ctrl+D with empty input (default: undefined) */
  onEOF?: () => void
}

export interface UseReadlineResult {
  /** Current text value */
  value: string
  /** Cursor position */
  cursor: number
  /** Text before cursor (for rendering) */
  beforeCursor: string
  /** Text after cursor (for rendering) */
  afterCursor: string
  /** Clear the input */
  clear: () => void
  /** Set value programmatically (cursor moves to end) */
  setValue: (value: string) => void
  /** Set both value and cursor position */
  setValueWithCursor: (value: string, cursor: number) => void
  /** Kill ring contents (for debugging/display) */
  killRing: string[]
}

// =============================================================================
// Hook
// =============================================================================

export function useReadline({
  initialValue = "",
  onChange,
  isActive = true,
  handleEnter = false,
  handleEscape = false,
  handleVerticalArrows = false,
  onEOF,
  onSubmit,
}: UseReadlineOptions = {}): UseReadlineResult {
  const [state, setState] = useState<ReadlineState>({
    value: initialValue,
    cursor: initialValue.length,
  })

  // Mutable ref for synchronous reads in the event handler.
  // Without this, rapid keypresses between React renders all read the same
  // stale closure state and overwrite each other.
  const stateRef = useRef<ReadlineState>({ value: initialValue, cursor: initialValue.length })
  stateRef.current = state

  const yankStateRef = useRef<YankState | null>(null)

  /** Apply a ReadlineKeyResult to state */
  const applyResult = useCallback(
    (result: { value: string; cursor: number; yankState: YankState | null }, prevValue: string) => {
      yankStateRef.current = result.yankState
      if (result.value === prevValue && result.cursor === stateRef.current.cursor) return
      const next = { value: result.value, cursor: result.cursor }
      stateRef.current = next
      setState(next)
      if (result.value !== prevValue) onChange?.(result.value)
    },
    [onChange],
  )

  const clear = useCallback(() => {
    const next = { value: "", cursor: 0 }
    stateRef.current = next
    setState(next)
    onChange?.("")
    yankStateRef.current = null
  }, [onChange])

  const setValue = useCallback(
    (value: string) => {
      const next = { value, cursor: value.length }
      stateRef.current = next
      setState(next)
      onChange?.(value)
      yankStateRef.current = null
    },
    [onChange],
  )

  const setValueWithCursor = useCallback(
    (value: string, cursor: number) => {
      const next = { value, cursor: Math.max(0, Math.min(cursor, value.length)) }
      stateRef.current = next
      setState(next)
      onChange?.(value)
      yankStateRef.current = null
    },
    [onChange],
  )

  useInput(
    (input, key) => {
      const { value, cursor } = stateRef.current

      // Let parent handle Enter/Escape/vertical arrows unless explicitly enabled
      if (key.return && !handleEnter) return
      if (key.return && handleEnter) {
        onSubmit?.(value)
        return
      }
      if (key.escape && !handleEscape) return
      if ((key.upArrow || key.downArrow) && !handleVerticalArrows) return

      // Single-line specific: Ctrl+D on empty input = EOF
      if (key.ctrl && input === "d" && value.length === 0) {
        onEOF?.()
        return
      }

      // Single-line specific: Ctrl+A/E move to beginning/end of entire text
      if (key.ctrl && input === "a") {
        applyResult({ value, cursor: 0, yankState: null }, value)
        return
      }
      if (key.ctrl && input === "e") {
        applyResult({ value, cursor: value.length, yankState: null }, value)
        return
      }

      // Single-line specific: Ctrl+U/K kill to beginning/end of entire text
      if (key.ctrl && input === "u") {
        if (cursor === 0) return
        addToKillRing(value.slice(0, cursor))
        applyResult({ value: value.slice(cursor), cursor: 0, yankState: null }, value)
        return
      }
      if (key.ctrl && input === "k") {
        if (cursor >= value.length) return
        addToKillRing(value.slice(cursor))
        applyResult({ value: value.slice(0, cursor), cursor, yankState: null }, value)
        return
      }

      // Shared readline operations (cursor movement, word ops, kill ring, yank, etc.)
      const result = handleReadlineKey(input, key, value, cursor, yankStateRef.current)
      if (result) applyResult(result, value)
    },
    { isActive },
  )

  return {
    value: state.value,
    cursor: state.cursor,
    beforeCursor: state.value.slice(0, state.cursor),
    afterCursor: state.value.slice(state.cursor),
    clear,
    setValue,
    setValueWithCursor,
    killRing: [...killRing],
  }
}
