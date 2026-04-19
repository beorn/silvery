/**
 * @silvery/headless — Pure state machines for UI components.
 *
 * No React, no rendering, no side effects.
 * Each machine is a pure (state, action) → state function.
 *
 * @example
 * ```ts
 * import { createSelectListState, selectListUpdate } from "@silvery/headless"
 *
 * let state = createSelectListState({ count: 10 })
 * state = selectListUpdate(state, { type: "move_down" })
 * console.log(state.index) // 1
 * ```
 *
 * @packageDocumentation
 */

// Machine — observable state container
export { createMachine, type Machine, type UpdateFn } from "./machine"

// SelectList — cursor navigation over a list
export {
  selectListUpdate,
  createSelectListState,
  type SelectListState,
  type SelectListAction,
} from "./select-list"

// Readline — text editing with cursor, kill ring, history
export {
  readlineUpdate,
  createReadlineState,
  type ReadlineState,
  type ReadlineAction,
} from "./readline"

// Selection — buffer-level text selection state machine
export {
  terminalSelectionUpdate,
  createTerminalSelectionState,
  normalizeRange,
  extractText,
  findWordBoundary,
  findLineBoundary,
  type TerminalSelectionState,
  type SelectionRange,
  type SelectionPosition,
  type SelectionAction,
  type SelectionEffect,
  type SelectionGranularity,
  type SelectionScope,
  type ExtractTextOptions,
} from "./selection"

// Pointer — gesture disambiguation state machine
export {
  pointerStateUpdate,
  createPointerState,
  createPointerDoubleClickState,
  checkPointerDoubleClick,
  DRAG_THRESHOLD,
  type PointerState,
  type PointerAction,
  type PointerEffect,
  type Position as PointerPosition,
  type PointerDoubleClickState,
} from "./pointer"

// Find — visible-buffer search state machine
export {
  findUpdate,
  createFindState,
  searchBuffer,
  type FindState,
  type FindMatch,
  type FindResult,
  type FindProvider,
  type FindAction,
  type FindEffect,
} from "./find"

// Copy Mode — keyboard-driven selection state machine
export {
  copyModeUpdate,
  createCopyModeState,
  type CopyModeState,
  type CopyModePosition,
  type CopyModeBuffer,
  type CopyModeAction,
  type CopyModeEffect,
} from "./copy-mode"

// React integration
export { useSelectList, useReadline } from "./react"
