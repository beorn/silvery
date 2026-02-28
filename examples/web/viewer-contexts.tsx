/**
 * Context providers for running inkx examples in browser xterm.js
 *
 * Wraps components with the same context hierarchy as the real renderer,
 * allowing examples that use useInput, useApp, etc. to work in the viewer.
 */
import { EventEmitter } from "events"

// Placeholder for future example bridging
// Real implementation would provide:
// - RuntimeContext with on/emit for input events (wired to xterm.onData())
// - TermContext for terminal capabilities
// - FocusManagerContext for focus system

export interface ExampleHost {
  inputEmitter: EventEmitter
  destroy: () => void
}

export function createExampleHost(): ExampleHost {
  const inputEmitter = new EventEmitter()
  return {
    inputEmitter,
    destroy: () => inputEmitter.removeAllListeners(),
  }
}
