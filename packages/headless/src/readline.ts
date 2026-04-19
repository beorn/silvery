/**
 * @silvery/headless — ReadlineState
 *
 * Pure state machine for text editing with readline keybindings.
 * Kill ring is part of state — no global mutation.
 * No React, no rendering, no side effects.
 *
 * Prototype validating the headless API design (era2b Phase 1).
 */

// =============================================================================
// State
// =============================================================================

export interface ReadlineState {
  /** Current text value */
  readonly value: string
  /** Cursor position (0 = before first char, length = after last) */
  readonly cursor: number
  /** Kill ring — most recent kill at index 0 */
  readonly killRing: readonly string[]
  /** Yank cycling state — null when no yank in progress */
  readonly yankState: YankState | null
}

export interface YankState {
  readonly lastYankIndex: number
  readonly yankStart: number
  readonly yankEnd: number
}

const MAX_KILL_RING_SIZE = 10

// =============================================================================
// Actions
// =============================================================================

export type ReadlineAction =
  // Cursor movement
  | { type: "move_left" }
  | { type: "move_right" }
  | { type: "move_word_left" }
  | { type: "move_word_right" }
  | { type: "move_start" }
  | { type: "move_end" }
  // Character editing
  | { type: "insert"; text: string }
  | { type: "delete_back" }
  | { type: "delete_forward" }
  | { type: "transpose" }
  // Kill operations
  | { type: "kill_word_back" }
  | { type: "kill_word_forward" }
  | { type: "kill_to_start" }
  | { type: "kill_to_end" }
  // Yank operations
  | { type: "yank" }
  | { type: "yank_cycle" }
  // Bulk
  | { type: "set_value"; value: string; cursor?: number }
  | { type: "clear" }

// =============================================================================
// Update
// =============================================================================

export function readlineUpdate(state: ReadlineState, action: ReadlineAction): ReadlineState {
  const { value, cursor, killRing, yankState } = state

  switch (action.type) {
    // =========================================================================
    // Cursor Movement
    // =========================================================================

    case "move_left":
      return cursor > 0 ? { ...state, cursor: cursor - 1, yankState: null } : resetYank(state)

    case "move_right":
      return cursor < value.length
        ? { ...state, cursor: cursor + 1, yankState: null }
        : resetYank(state)

    case "move_word_left": {
      const pos = findPrevWordStart(value, cursor)
      return pos === cursor ? resetYank(state) : { ...state, cursor: pos, yankState: null }
    }

    case "move_word_right": {
      const pos = findNextWordEnd(value, cursor)
      return pos === cursor ? resetYank(state) : { ...state, cursor: pos, yankState: null }
    }

    case "move_start":
      return cursor === 0 ? resetYank(state) : { ...state, cursor: 0, yankState: null }

    case "move_end":
      return cursor === value.length
        ? resetYank(state)
        : { ...state, cursor: value.length, yankState: null }

    // =========================================================================
    // Character Editing
    // =========================================================================

    case "insert":
      return {
        ...state,
        value: value.slice(0, cursor) + action.text + value.slice(cursor),
        cursor: cursor + action.text.length,
        yankState: null,
      }

    case "delete_back":
      return cursor > 0
        ? {
            ...state,
            value: value.slice(0, cursor - 1) + value.slice(cursor),
            cursor: cursor - 1,
            yankState: null,
          }
        : resetYank(state)

    case "delete_forward":
      return cursor < value.length
        ? {
            ...state,
            value: value.slice(0, cursor) + value.slice(cursor + 1),
            yankState: null,
          }
        : resetYank(state)

    case "transpose":
      if (cursor < 2) return resetYank(state)
      return {
        ...state,
        value:
          value.slice(0, cursor - 2) + value[cursor - 1] + value[cursor - 2] + value.slice(cursor),
        yankState: null,
      }

    // =========================================================================
    // Kill Operations
    // =========================================================================

    case "kill_word_back": {
      if (cursor === 0) return resetYank(state)
      const pos = findPrevWordStart(value, cursor)
      const killed = value.slice(pos, cursor)
      return {
        ...state,
        value: value.slice(0, pos) + value.slice(cursor),
        cursor: pos,
        killRing: pushKillRing(killRing, killed),
        yankState: null,
      }
    }

    case "kill_word_forward": {
      if (cursor >= value.length) return resetYank(state)
      const pos = findNextWordEnd(value, cursor)
      const killed = value.slice(cursor, pos)
      return {
        ...state,
        value: value.slice(0, cursor) + value.slice(pos),
        killRing: pushKillRing(killRing, killed),
        yankState: null,
      }
    }

    case "kill_to_start": {
      if (cursor === 0) return resetYank(state)
      const killed = value.slice(0, cursor)
      return {
        ...state,
        value: value.slice(cursor),
        cursor: 0,
        killRing: pushKillRing(killRing, killed),
        yankState: null,
      }
    }

    case "kill_to_end": {
      if (cursor >= value.length) return resetYank(state)
      const killed = value.slice(cursor)
      return {
        ...state,
        value: value.slice(0, cursor),
        killRing: pushKillRing(killRing, killed),
        yankState: null,
      }
    }

    // =========================================================================
    // Yank Operations
    // =========================================================================

    case "yank": {
      if (killRing.length === 0) return state
      const text = killRing[0]!
      const newCursor = cursor + text.length
      return {
        ...state,
        value: value.slice(0, cursor) + text + value.slice(cursor),
        cursor: newCursor,
        yankState: { lastYankIndex: 0, yankStart: cursor, yankEnd: newCursor },
      }
    }

    case "yank_cycle": {
      if (!yankState || killRing.length <= 1) return state
      const nextIndex = (yankState.lastYankIndex + 1) % killRing.length
      const text = killRing[nextIndex]!
      const newValue = value.slice(0, yankState.yankStart) + text + value.slice(yankState.yankEnd)
      const newCursor = yankState.yankStart + text.length
      return {
        ...state,
        value: newValue,
        cursor: newCursor,
        yankState: {
          lastYankIndex: nextIndex,
          yankStart: yankState.yankStart,
          yankEnd: newCursor,
        },
      }
    }

    // =========================================================================
    // Bulk Operations
    // =========================================================================

    case "set_value":
      return {
        ...state,
        value: action.value,
        cursor: action.cursor ?? action.value.length,
        yankState: null,
      }

    case "clear":
      return { ...state, value: "", cursor: 0, yankState: null }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createReadlineState(opts?: {
  value?: string
  cursor?: number
  killRing?: readonly string[]
}): ReadlineState {
  const value = opts?.value ?? ""
  return {
    value,
    cursor: opts?.cursor ?? value.length,
    killRing: opts?.killRing ?? [],
    yankState: null,
  }
}

// =============================================================================
// ReadlineContext — shared kill ring across instances
// =============================================================================

export interface ReadlineContext {
  /** Update a readline state with a shared kill ring */
  update(state: ReadlineState, action: ReadlineAction): ReadlineState
  /** Current shared kill ring (read-only snapshot) */
  readonly killRing: readonly string[]
}

export function createReadlineContext(): ReadlineContext {
  let sharedKillRing: readonly string[] = []

  return {
    update(state: ReadlineState, action: ReadlineAction): ReadlineState {
      // Inject shared kill ring before update
      const stateWithSharedRing =
        state.killRing === sharedKillRing ? state : { ...state, killRing: sharedKillRing }
      const next = readlineUpdate(stateWithSharedRing, action)
      // Sync shared kill ring from result
      if (next.killRing !== sharedKillRing) {
        sharedKillRing = next.killRing
      }
      return next
    },
    get killRing() {
      return sharedKillRing
    },
  }
}

// =============================================================================
// Helpers
// =============================================================================

function resetYank(state: ReadlineState): ReadlineState {
  return state.yankState === null ? state : { ...state, yankState: null }
}

function pushKillRing(ring: readonly string[], text: string): readonly string[] {
  if (!text) return ring
  const next = [text, ...ring]
  if (next.length > MAX_KILL_RING_SIZE) next.length = MAX_KILL_RING_SIZE
  return next
}

function findPrevWordStart(value: string, cursor: number): number {
  let pos = cursor
  while (pos > 0 && /\s/.test(value[pos - 1] ?? "")) pos--
  while (pos > 0 && !/\s/.test(value[pos - 1] ?? "")) pos--
  return pos
}

function findNextWordEnd(value: string, cursor: number): number {
  let pos = cursor
  while (pos < value.length && /\s/.test(value[pos] ?? "")) pos++
  while (pos < value.length && !/\s/.test(value[pos] ?? "")) pos++
  return pos
}
