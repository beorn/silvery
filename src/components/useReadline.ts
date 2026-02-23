/**
 * useReadline Hook
 *
 * This hook lives in components/ because it's tightly coupled to ReadlineInput.
 * It manages readline state (cursor position, history, kill ring) that ReadlineInput renders.
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
import { useInput } from "../hooks/index.js"

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
// Kill Ring
// =============================================================================

/** Global kill ring shared across all readline instances */
const killRing: string[] = []
const MAX_KILL_RING_SIZE = 10

function addToKillRing(text: string): void {
  if (!text) return
  killRing.unshift(text)
  if (killRing.length > MAX_KILL_RING_SIZE) {
    killRing.pop()
  }
}

// =============================================================================
// Word Boundary Helpers
// =============================================================================

/** Find the start of the previous word (for Alt+B, Ctrl+W) */
function findPrevWordStart(value: string, cursor: number): number {
  let pos = cursor
  // Skip any spaces before cursor
  while (pos > 0 && /\s/.test(value[pos - 1] ?? "")) pos--
  // Skip non-space characters (the word itself)
  while (pos > 0 && !/\s/.test(value[pos - 1] ?? "")) pos--
  return pos
}

/** Find the end of the next word (for Alt+F, Alt+D) */
function findNextWordEnd(value: string, cursor: number): number {
  let pos = cursor
  // Skip any spaces after cursor
  while (pos < value.length && /\s/.test(value[pos] ?? "")) pos++
  // Skip non-space characters (the word itself)
  while (pos < value.length && !/\s/.test(value[pos] ?? "")) pos++
  return pos
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

  // Track last yank position for Alt+Y cycling
  const yankStateRef = useRef<{
    lastYankIndex: number
    yankStart: number
    yankEnd: number
  } | null>(null)

  const updateState = useCallback(
    (newValue: string, newCursor: number) => {
      const next = { value: newValue, cursor: newCursor }
      stateRef.current = next
      setState(next)
      onChange?.(newValue)
      yankStateRef.current = null
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
      // Read fresh state from mutable ref — NOT from render closure.
      // Multiple events between renders all see the latest value/cursor.
      const { value, cursor } = stateRef.current

      // Let parent handle Enter/Escape/vertical arrows unless explicitly enabled
      if (key.return && !handleEnter) return
      if (key.return && handleEnter) {
        onSubmit?.(value)
        return
      }
      if (key.escape && !handleEscape) return
      if ((key.upArrow || key.downArrow) && !handleVerticalArrows) return

      // Helper for cursor-only moves (syncs ref immediately)
      const moveCursor = (newCursor: number) => {
        stateRef.current = { value, cursor: newCursor }
        setState({ value, cursor: newCursor })
        yankStateRef.current = null
      }

      // =======================================================================
      // Cursor Movement
      // =======================================================================

      // Ctrl+A: Move to beginning
      if (key.ctrl && input === "a") {
        moveCursor(0)
        return
      }

      // Ctrl+E: Move to end
      if (key.ctrl && input === "e") {
        moveCursor(value.length)
        return
      }

      // Ctrl+B or Left: Move cursor left
      if ((key.ctrl && input === "b") || key.leftArrow) {
        if (cursor > 0) moveCursor(cursor - 1)
        return
      }

      // Ctrl+F or Right: Move cursor right
      if ((key.ctrl && input === "f") || key.rightArrow) {
        if (cursor < value.length) moveCursor(cursor + 1)
        return
      }

      // Alt+B: Move cursor back one word
      if (key.meta && input === "b") {
        moveCursor(findPrevWordStart(value, cursor))
        return
      }

      // Alt+F: Move cursor forward one word
      if (key.meta && input === "f") {
        moveCursor(findNextWordEnd(value, cursor))
        return
      }

      // =======================================================================
      // Kill Operations (add to kill ring)
      // =======================================================================

      // Ctrl+W: Delete word backwards
      if (key.ctrl && input === "w") {
        if (cursor === 0) return
        const newCursor = findPrevWordStart(value, cursor)
        const killed = value.slice(newCursor, cursor)
        addToKillRing(killed)
        const newValue = value.slice(0, newCursor) + value.slice(cursor)
        updateState(newValue, newCursor)
        return
      }

      // Alt+Backspace: Same as Ctrl+W
      if (key.meta && key.backspace) {
        if (cursor === 0) return
        const newCursor = findPrevWordStart(value, cursor)
        const killed = value.slice(newCursor, cursor)
        addToKillRing(killed)
        const newValue = value.slice(0, newCursor) + value.slice(cursor)
        updateState(newValue, newCursor)
        return
      }

      // Alt+D: Delete word forwards
      if (key.meta && input === "d") {
        if (cursor >= value.length) return
        const newEnd = findNextWordEnd(value, cursor)
        const killed = value.slice(cursor, newEnd)
        addToKillRing(killed)
        const newValue = value.slice(0, cursor) + value.slice(newEnd)
        updateState(newValue, cursor)
        return
      }

      // Ctrl+U: Delete to beginning
      if (key.ctrl && input === "u") {
        if (cursor === 0) return
        const killed = value.slice(0, cursor)
        addToKillRing(killed)
        const newValue = value.slice(cursor)
        updateState(newValue, 0)
        return
      }

      // Ctrl+K: Delete to end
      if (key.ctrl && input === "k") {
        if (cursor >= value.length) return
        const killed = value.slice(cursor)
        addToKillRing(killed)
        const newValue = value.slice(0, cursor)
        updateState(newValue, cursor)
        return
      }

      // =======================================================================
      // Yank Operations
      // =======================================================================

      // Ctrl+Y: Yank (paste from kill ring)
      if (key.ctrl && input === "y") {
        if (killRing.length === 0) return
        const text = killRing[0] ?? ""
        const newValue = value.slice(0, cursor) + text + value.slice(cursor)
        const newCursor = cursor + text.length
        const next = { value: newValue, cursor: newCursor }
        stateRef.current = next
        setState(next)
        onChange?.(newValue)
        // Track yank state for Alt+Y cycling
        yankStateRef.current = {
          lastYankIndex: 0,
          yankStart: cursor,
          yankEnd: newCursor,
        }
        return
      }

      // Alt+Y: Cycle through kill ring (only after Ctrl+Y)
      if (key.meta && input === "y") {
        const yankState = yankStateRef.current
        if (!yankState || killRing.length <= 1) return
        // Cycle to next kill ring entry
        const nextIndex = (yankState.lastYankIndex + 1) % killRing.length
        const text = killRing[nextIndex] ?? ""
        // Replace the previously yanked text
        const before = value.slice(0, yankState.yankStart)
        const after = value.slice(yankState.yankEnd)
        const newValue = before + text + after
        const newCursor = yankState.yankStart + text.length
        const next = { value: newValue, cursor: newCursor }
        stateRef.current = next
        setState(next)
        onChange?.(newValue)
        yankStateRef.current = {
          lastYankIndex: nextIndex,
          yankStart: yankState.yankStart,
          yankEnd: newCursor,
        }
        return
      }

      // =======================================================================
      // Character Operations
      // =======================================================================

      // Ctrl+T: Transpose characters
      if (key.ctrl && input === "t") {
        // Transpose the two characters before cursor, move cursor forward
        if (cursor < 2) return
        const newValue = value.slice(0, cursor - 2) + value[cursor - 1] + value[cursor - 2] + value.slice(cursor)
        updateState(newValue, cursor)
        return
      }

      // Ctrl+D: Delete char at cursor (or EOF if empty)
      if (key.ctrl && input === "d") {
        if (value.length === 0) {
          onEOF?.()
          return
        }
        if (cursor >= value.length) return
        const newValue = value.slice(0, cursor) + value.slice(cursor + 1)
        updateState(newValue, cursor)
        return
      }

      // Ctrl+H or Backspace: Delete char before cursor
      if (key.ctrl && input === "h") {
        if (cursor > 0) {
          const newValue = value.slice(0, cursor - 1) + value.slice(cursor)
          updateState(newValue, cursor - 1)
        }
        return
      }

      // Backspace or Delete key
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          const newValue = value.slice(0, cursor - 1) + value.slice(cursor)
          updateState(newValue, cursor - 1)
        }
        return
      }

      // =======================================================================
      // Regular Character Input
      // =======================================================================

      // Regular character input (printable ASCII)
      if (input.length === 1 && input >= " ") {
        const newValue = value.slice(0, cursor) + input + value.slice(cursor)
        updateState(newValue, cursor + 1)
      }
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
