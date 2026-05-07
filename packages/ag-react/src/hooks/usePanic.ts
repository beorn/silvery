/**
 * usePanic — fatal terminal-visible error hook.
 *
 * Calling the returned function exits the app, lets Silvery restore terminal
 * state, then prints a copyable diagnostic to stderr on the normal screen.
 */

import { useContext } from "react"
import { RuntimeContext, type PanicHandler } from "../context"

/**
 * Returns a function that panics the app.
 * Throws if called outside a runtime (run(), createApp(), test renderer).
 */
export function usePanic(): PanicHandler {
  const rt = useContext(RuntimeContext)
  if (!rt) throw new Error("usePanic must be used within run() or createApp()")
  return rt.panic
}
