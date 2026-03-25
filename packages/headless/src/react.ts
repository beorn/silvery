/**
 * React integration for @silvery/headless state machines.
 *
 * Bridges pure (state, action) -> state machines to React via useReducer.
 *
 * @example
 * ```tsx
 * const [state, send] = useSelectList({ count: items.length })
 * // state.index is the current cursor position
 * // send({ type: "move_down" }) to navigate
 * ```
 */
import { useReducer, type Dispatch } from "react"
import { selectListUpdate, createSelectListState, type SelectListState, type SelectListAction } from "./select-list"
import { readlineUpdate, createReadlineState, type ReadlineState, type ReadlineAction } from "./readline"

/**
 * React hook for SelectList state machine.
 * Returns [state, send] — same pattern as useReducer.
 */
export function useSelectList(
  options: { count: number; index?: number },
): [SelectListState, Dispatch<SelectListAction>] {
  const [state, dispatch] = useReducer(
    selectListUpdate,
    options,
    (opts) => createSelectListState(opts),
  )
  return [state, dispatch]
}

/**
 * React hook for Readline state machine.
 * Returns [state, send] — same pattern as useReducer.
 */
export function useReadline(
  options?: { initialValue?: string },
): [ReadlineState, Dispatch<ReadlineAction>] {
  const [state, dispatch] = useReducer(
    readlineUpdate,
    options,
    (opts) => createReadlineState({ value: opts?.initialValue }),
  )
  return [state, dispatch]
}
