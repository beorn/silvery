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
export { selectListUpdate, createSelectListState, type SelectListState, type SelectListAction } from "./select-list"

// Readline — text editing with cursor, kill ring, history
export { readlineUpdate, createReadlineState, type ReadlineState, type ReadlineAction } from "./readline"

// React integration
export { useSelectList, useReadline } from "./react"
