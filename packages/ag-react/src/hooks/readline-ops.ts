/**
 * Shared Readline Operations
 *
 * Pure functions and shared state for readline-style editing, shared
 * across TextInput (via useReadline) and TextArea.
 *
 * - Kill ring: global ring buffer shared across all readline instances
 * - Word boundary helpers: find word start/end positions in a string
 * - handleReadlineKey: pure key→edit-result dispatcher for shared operations
 *
 * Operations handled by handleReadlineKey (identical in single/multi-line):
 *   Cursor: Left/Right, Ctrl+B/F, Alt+B/F (word)
 *   Kill: Ctrl+W, Alt+Backspace, Alt+D
 *   Yank: Ctrl+Y, Alt+Y (cycle)
 *   Char: Ctrl+T (transpose), Ctrl+H, Backspace/Delete, Ctrl+D, regular input
 *
 * NOT handled (context-dependent — callers handle before calling this):
 *   Ctrl+A/E (beginning/end of text vs wrapped line)
 *   Ctrl+K/U (kill to end/beginning of text vs wrapped line)
 *   Home/End, Up/Down, PageUp/PageDown, Enter, Escape
 */
import type { Key } from "@silvery/ag/keys"

// =============================================================================
// Kill Ring
// =============================================================================

/** Maximum entries in the global kill ring */
export const MAX_KILL_RING_SIZE = 10

/** Global kill ring shared across all readline instances */
export const killRing: string[] = []

/** Add text to the front of the kill ring, evicting oldest if full */
export function addToKillRing(text: string): void {
  if (!text) return
  killRing.unshift(text)
  if (killRing.length > MAX_KILL_RING_SIZE) {
    killRing.pop()
  }
}

// =============================================================================
// Word Boundary Helpers
// =============================================================================

function findWordBoundary(value: string, cursor: number, direction: 1 | -1): number {
  let pos = cursor
  const peek = direction > 0 ? (p: number) => value[p] : (p: number) => value[p - 1]
  const inBounds = direction > 0 ? (p: number) => p < value.length : (p: number) => p > 0
  while (inBounds(pos) && /\s/.test(peek(pos) ?? "")) pos += direction
  while (inBounds(pos) && !/\s/.test(peek(pos) ?? "")) pos += direction
  return pos
}

/** Find the start of the previous word (for Alt+B, Ctrl+W) */
export function findPrevWordStart(value: string, cursor: number): number {
  return findWordBoundary(value, cursor, -1)
}

/** Find the end of the next word (for Alt+F, Alt+D) */
export function findNextWordEnd(value: string, cursor: number): number {
  return findWordBoundary(value, cursor, 1)
}

// =============================================================================
// Shared Key Handler
// =============================================================================

/** Yank state for Alt+Y kill-ring cycling */
export interface YankState {
  lastYankIndex: number
  yankStart: number
  yankEnd: number
}

/** Result from handleReadlineKey — new value/cursor plus updated yank state */
export interface ReadlineKeyResult {
  value: string
  cursor: number
  /** null = reset yank state (non-yank op), YankState = yank/cycle was performed */
  yankState: YankState | null
}

/**
 * Process a readline key event and return the new edit state.
 * Returns null if the key was not handled.
 *
 * Handles operations that are identical between single-line and multi-line:
 * cursor movement, word movement, word kill, yank, transpose, delete, char input.
 *
 * Does NOT handle context-dependent operations (callers handle these first):
 * Ctrl+A/E, Ctrl+K/U, Home/End, Up/Down, PageUp/PageDown, Enter, Escape.
 */
export function handleReadlineKey(
  input: string,
  key: Key,
  value: string,
  cursor: number,
  yankState: YankState | null,
): ReadlineKeyResult | null {
  // =========================================================================
  // Cursor Movement
  // =========================================================================

  // Left / Ctrl+B
  if (key.leftArrow || (key.ctrl && input === "b")) {
    return { value, cursor: cursor > 0 ? cursor - 1 : cursor, yankState: null }
  }

  // Right / Ctrl+F
  if (key.rightArrow || (key.ctrl && input === "f")) {
    return { value, cursor: cursor < value.length ? cursor + 1 : cursor, yankState: null }
  }

  // Alt+B: word backwards
  if (key.meta && input === "b") {
    return { value, cursor: findPrevWordStart(value, cursor), yankState: null }
  }

  // Alt+F: word forwards
  if (key.meta && input === "f") {
    return { value, cursor: findNextWordEnd(value, cursor), yankState: null }
  }

  // =========================================================================
  // Kill Operations
  // =========================================================================

  // Ctrl+W: kill word backwards
  if (key.ctrl && input === "w") {
    if (cursor === 0) return { value, cursor, yankState: null }
    const newCursor = findPrevWordStart(value, cursor)
    addToKillRing(value.slice(newCursor, cursor))
    return {
      value: value.slice(0, newCursor) + value.slice(cursor),
      cursor: newCursor,
      yankState: null,
    }
  }

  // Alt+Backspace: same as Ctrl+W
  if (key.meta && key.backspace) {
    if (cursor === 0) return { value, cursor, yankState: null }
    const newCursor = findPrevWordStart(value, cursor)
    addToKillRing(value.slice(newCursor, cursor))
    return {
      value: value.slice(0, newCursor) + value.slice(cursor),
      cursor: newCursor,
      yankState: null,
    }
  }

  // Alt+D: kill word forwards
  if (key.meta && input === "d") {
    if (cursor >= value.length) return { value, cursor, yankState: null }
    const newEnd = findNextWordEnd(value, cursor)
    addToKillRing(value.slice(cursor, newEnd))
    return { value: value.slice(0, cursor) + value.slice(newEnd), cursor, yankState: null }
  }

  // =========================================================================
  // Yank Operations
  // =========================================================================

  // Ctrl+Y: yank from kill ring
  if (key.ctrl && input === "y") {
    if (killRing.length === 0) return { value, cursor, yankState }
    const text = killRing[0] ?? ""
    const newCursor = cursor + text.length
    return {
      value: value.slice(0, cursor) + text + value.slice(cursor),
      cursor: newCursor,
      yankState: { lastYankIndex: 0, yankStart: cursor, yankEnd: newCursor },
    }
  }

  // Alt+Y: cycle through kill ring (only after Ctrl+Y)
  if (key.meta && input === "y") {
    if (!yankState || killRing.length <= 1) return { value, cursor, yankState }
    const nextIndex = (yankState.lastYankIndex + 1) % killRing.length
    const text = killRing[nextIndex] ?? ""
    const newValue = value.slice(0, yankState.yankStart) + text + value.slice(yankState.yankEnd)
    const newCursor = yankState.yankStart + text.length
    return {
      value: newValue,
      cursor: newCursor,
      yankState: { lastYankIndex: nextIndex, yankStart: yankState.yankStart, yankEnd: newCursor },
    }
  }

  // =========================================================================
  // Character Operations
  // =========================================================================

  // Ctrl+T: transpose characters
  if (key.ctrl && input === "t") {
    if (cursor < 2) return { value, cursor, yankState: null }
    return {
      value: value.slice(0, cursor - 2) + value[cursor - 1] + value[cursor - 2] + value.slice(cursor),
      cursor,
      yankState: null,
    }
  }

  // Ctrl+H: delete char before cursor
  if (key.ctrl && input === "h") {
    if (cursor > 0) {
      return {
        value: value.slice(0, cursor - 1) + value.slice(cursor),
        cursor: cursor - 1,
        yankState: null,
      }
    }
    return { value, cursor, yankState: null }
  }

  // Backspace / Delete key
  if (key.backspace || key.delete) {
    if (cursor > 0) {
      return {
        value: value.slice(0, cursor - 1) + value.slice(cursor),
        cursor: cursor - 1,
        yankState: null,
      }
    }
    return { value, cursor, yankState: null }
  }

  // Ctrl+D: delete at cursor
  if (key.ctrl && input === "d") {
    if (cursor < value.length) {
      return { value: value.slice(0, cursor) + value.slice(cursor + 1), cursor, yankState: null }
    }
    return { value, cursor, yankState: null }
  }

  // =========================================================================
  // Regular Character Input
  // =========================================================================

  // Cmd/Super-modified keystrokes (Cmd+K, Cmd+Shift+K, etc.) are almost always
  // app-level shortcuts owned by the host (command palette, save, quit, etc.).
  // Never treat them as text insertion — drop them here so the parent useInput
  // listeners further up the tree can handle them. Bare keys and Shift-only
  // keys still insert normally (shifted punctuation, uppercase, etc.).
  if (key.super) {
    return null
  }

  // Use the actual typed character (key.text) when available, not the normalized
  // keybinding key. E.g., Shift+3 sends '#' but input is normalized to '3'.
  const char = key.text ?? input
  if (char.length >= 1 && char >= " ") {
    return {
      value: value.slice(0, cursor) + char + value.slice(cursor),
      cursor: cursor + char.length,
      yankState: null,
    }
  }

  return null
}
