/**
 * Inkx React Contexts
 *
 * Provides contexts for:
 * - TermContext: Access to Term instance (for styling/detection)
 * - EventsContext: Access to event stream (for useInput and other hooks)
 * - NodeContext: Access to the current InkxNode (for useContentRect)
 * - AppContext: App-level controls (exit, etc.)
 * - StdioContext: Access to stdin/stdout
 */

import type { EventEmitter } from "node:events"
import type { Term } from "chalkx"
import { createContext } from "react"
import type { FocusManager } from "./focus-manager.js"
import type { Event, InkxNode } from "./types.js"

// ============================================================================
// Term Context
// ============================================================================

/**
 * Context that provides access to the Term instance.
 * Used by useTerm() hook to access terminal capabilities and styling.
 */
export const TermContext = createContext<Term | null>(null)

// ============================================================================
// Events Context
// ============================================================================

/**
 * Context that provides access to the event stream.
 *
 * Events drive interactive mode. When events are present, the render loop
 * runs until exit() is called. When events are absent (null), the render
 * completes when the UI is stable (static mode).
 *
 * Hooks like useInput() subscribe to this context to receive keyboard events.
 * In static mode (events = null), these hooks become no-ops.
 *
 * @example
 * ```tsx
 * // In a component:
 * const events = useContext(EventsContext)
 * if (events) {
 *   // Interactive mode - can subscribe to events
 * } else {
 *   // Static mode - no events available
 * }
 * ```
 */
export const EventsContext = createContext<AsyncIterable<Event> | null>(null)

// ============================================================================
// Node Context
// ============================================================================

/**
 * Context that provides access to the current InkxNode.
 * Used by useContentRect() to subscribe to layout changes.
 *
 * Each Box component wraps its children in a NodeContext.Provider
 * with its corresponding InkxNode.
 */
export const NodeContext = createContext<InkxNode | null>(null)

// ============================================================================
// App Context
// ============================================================================

export interface AppContextValue {
  /** Exit the application with optional error */
  exit: (error?: Error) => void
  /** Pause rendering output (for screen switching). Input still works. */
  pause?: () => void
  /** Resume rendering after pause. Forces a full redraw. */
  resume?: () => void
}

/**
 * Context for app-level controls.
 * Used by useApp() hook.
 */
export const AppContext = createContext<AppContextValue | null>(null)

// ============================================================================
// Stdio Context
// ============================================================================

export interface StdoutContextValue {
  /** Standard output stream */
  stdout: NodeJS.WriteStream
  /** Write to stdout */
  write: (data: string) => void
  /**
   * Notify the scheduler that lines were written to stdout externally.
   * Used by useScrollback to report lines written between renders so that
   * inline mode cursor positioning accounts for the displacement.
   */
  notifyScrollback?: (lines: number) => void
}

/**
 * Context for stdout access.
 * Used by useStdout() hook.
 */
export const StdoutContext = createContext<StdoutContextValue | null>(null)

// ============================================================================
// Stdin Context
// ============================================================================

export interface StdinContextValue {
  /** Standard input stream */
  stdin: NodeJS.ReadStream
  /** Whether raw mode is supported */
  isRawModeSupported: boolean
  /** Set raw mode on stdin */
  setRawMode: (value: boolean) => void
}

/**
 * Context for stdin access.
 * Used by useStdin() hook.
 */
export const StdinContext = createContext<StdinContextValue | null>(null)

// ============================================================================
// Input Context
// ============================================================================

export interface InputContextValue {
  /** Event emitter for input events */
  eventEmitter: EventEmitter
  /** Whether to exit on Ctrl+C */
  exitOnCtrlC: boolean
}

/**
 * Context for input handling.
 * Used by useInput() hook.
 */
export const InputContext = createContext<InputContextValue | null>(null)

// ============================================================================
// Focus Manager Context (tree-based focus system)
// ============================================================================

/**
 * Context for the tree-based focus manager.
 * Provides the FocusManager instance to useFocusable(), useFocusWithin(), and useFocusManager() hooks.
 */
export const FocusManagerContext = createContext<FocusManager | null>(null)
