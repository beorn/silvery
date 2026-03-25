/**
 * @silvery/headless — SelectListState
 *
 * Pure state machine for cursor navigation over a list.
 * No React, no rendering, no side effects.
 *
 * Prototype validating the headless API design (era2b Phase 1).
 */

// =============================================================================
// State
// =============================================================================

export interface SelectListState {
  /** Currently highlighted index (0-based) */
  readonly index: number
  /** Total item count (items themselves are external) */
  readonly count: number
}

// =============================================================================
// Actions
// =============================================================================

export type SelectListAction =
  | { type: "move_down"; isDisabled?: (index: number) => boolean }
  | { type: "move_up"; isDisabled?: (index: number) => boolean }
  | { type: "move_to"; index: number }
  | { type: "move_first"; isDisabled?: (index: number) => boolean }
  | { type: "move_last"; isDisabled?: (index: number) => boolean }
  | { type: "page_down"; pageSize: number }
  | { type: "page_up"; pageSize: number }
  | { type: "set_count"; count: number }

// =============================================================================
// Update
// =============================================================================

export function selectListUpdate(state: SelectListState, action: SelectListAction): SelectListState {
  const { index, count } = state
  if (count === 0) return state

  switch (action.type) {
    case "move_down": {
      const next = findNextEnabled(index, count, 1, action.isDisabled)
      return next === index ? state : { ...state, index: next }
    }

    case "move_up": {
      const next = findNextEnabled(index, count, -1, action.isDisabled)
      return next === index ? state : { ...state, index: next }
    }

    case "move_to": {
      const clamped = clamp(action.index, 0, count - 1)
      return clamped === index ? state : { ...state, index: clamped }
    }

    case "move_first": {
      const next = findNextEnabled(-1, count, 1, action.isDisabled)
      return next === index ? state : { ...state, index: next }
    }

    case "move_last": {
      const next = findNextEnabled(count, count, -1, action.isDisabled)
      return next === index ? state : { ...state, index: next }
    }

    case "page_down": {
      const next = clamp(index + action.pageSize, 0, count - 1)
      return next === index ? state : { ...state, index: next }
    }

    case "page_up": {
      const next = clamp(index - action.pageSize, 0, count - 1)
      return next === index ? state : { ...state, index: next }
    }

    case "set_count": {
      const newCount = Math.max(0, action.count)
      if (newCount === count) return state
      const newIndex = newCount === 0 ? 0 : clamp(index, 0, newCount - 1)
      return { index: newIndex, count: newCount }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSelectListState(opts: { count: number; index?: number }): SelectListState {
  const count = Math.max(0, opts.count)
  const index = count === 0 ? 0 : clamp(opts.index ?? 0, 0, count - 1)
  return { index, count }
}

// =============================================================================
// Helpers
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Find the next enabled index in the given direction.
 * Starts from `from` (exclusive) and walks `direction` steps.
 * Returns `from` if no enabled index is found (no-op).
 */
function findNextEnabled(
  from: number,
  count: number,
  direction: 1 | -1,
  isDisabled?: (index: number) => boolean,
): number {
  if (!isDisabled) {
    const next = from + direction
    return next < 0 || next >= count ? clamp(from, 0, count - 1) : next
  }

  let pos = from + direction
  while (pos >= 0 && pos < count) {
    if (!isDisabled(pos)) return pos
    pos += direction
  }
  // All items in direction are disabled — return clamped original
  return clamp(from, 0, count - 1)
}
