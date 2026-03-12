/**
 * useRuntime — access the typed runtime event bus.
 *
 * Returns RuntimeContextValue<E> in interactive mode, or null in static mode.
 * Use this for components that need to work in both modes.
 *
 * Generic parameter E extends BaseRuntimeEvents — type-safe access to
 * custom events defined by the app's runtime.
 *
 * @example
 * ```tsx
 * // Base usage (input + paste events)
 * function StatusBar() {
 *   const rt = useRuntime()
 *   if (!rt) return <Text>Static mode</Text>
 *   return <Text>Interactive mode</Text>
 * }
 *
 * // Typed app events (view → runtime bidirectional bus)
 * interface BoardEvents extends BaseRuntimeEvents {
 *   op: [BoardOp]
 * }
 * function BoardView() {
 *   const rt = useRuntime<BoardEvents>()
 *   rt?.emit("op", { type: "cursor_down" })
 * }
 * ```
 */

import { useContext } from "react"
import { RuntimeContext, type BaseRuntimeEvents, type RuntimeContextValue } from "../context"

/**
 * Access the runtime event bus, or null if in static mode.
 *
 * Use this for components that work in both static and interactive modes.
 * For input-only components, prefer useInput() which throws a clear error
 * when called outside a runtime.
 */
export function useRuntime<
  E extends BaseRuntimeEvents = BaseRuntimeEvents,
>(): RuntimeContextValue<E> | null {
  return useContext(RuntimeContext) as RuntimeContextValue<E> | null
}
