/**
 * Silvery React Contexts
 *
 * Provides contexts for:
 * - TermContext: Access to Term instance (for styling/detection)
 * - NodeContext: Access to the current SilveryNode (for useContentRect)
 * - RuntimeContext: Unified input/app controls (replaces Events/Input/Stdin/App contexts)
 * - StdoutContext: Access to stdout
 */

import type { Term } from "@silvery/ansi"
import { createContext } from "react"
import type { FocusManager } from "@silvery/tea/focus-manager"
import type { Key } from "@silvery/tea/keys"
import type { TeaNode } from "@silvery/tea/types"

// ============================================================================
// Term Context
// ============================================================================

/**
 * Context that provides access to the Term instance.
 * Used by useTerm() hook to access terminal capabilities and styling.
 */
export const TermContext = createContext<Term | null>(null)

// ============================================================================
// Node Context
// ============================================================================

/**
 * Context that provides access to the current SilveryNode.
 * Used by useContentRect() to subscribe to layout changes.
 *
 * Each Box component wraps its children in a NodeContext.Provider
 * with its corresponding SilveryNode.
 */
export const NodeContext = createContext<TeaNode | null>(null)

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
  /**
   * Reset inline cursor state in the output phase.
   * Used by useScrollback on resize to clear cursor tracking before
   * re-emitting frozen items at the new width.
   */
  resetInlineCursor?: () => void
  /**
   * Get inline cursor row relative to render region start. -1 if unknown.
   * Used by useScrollback to position frozen items at the render region start.
   */
  getInlineCursorRow?: () => number
  /**
   * Promote frozen content to scrollback via the output phase.
   * Instead of writing directly to stdout (which causes flicker),
   * this passes the content to the output phase which writes frozen content
   * + live content in a single target.write() — no blanking, no cursor desync.
   */
  promoteScrollback?: (frozenContent: string, frozenLineCount: number) => void
}

/**
 * Context for stdout access.
 * Used by useStdout() hook.
 */
export const StdoutContext = createContext<StdoutContextValue | null>(null)

// ============================================================================
// Runtime Context (typed bidirectional event bus — TEA)
// ============================================================================

/**
 * Base events every runtime provides.
 * Apps extend this to add custom events (e.g., BoardEvents adds "op").
 */
export interface BaseRuntimeEvents {
  /** Keyboard input: [parsedInput, keyMetadata] */
  input: [input: string, key: Key]
  /** Bracketed paste: [pastedText] */
  paste: [text: string]
}

/**
 * Extract handler function type from an event map entry.
 */
type EventHandler<Args extends unknown[]> = (...args: Args) => void

/**
 * Typed bidirectional event bus + app lifecycle controls.
 *
 * Replaces EventsContext, InputContext, StdinContext, and AppContext with
 * a single typed interface. Components never see stdin or raw mode.
 *
 * Generic parameter E extends BaseRuntimeEvents — all runtimes provide
 * at least "input" and "paste" events. Apps can extend with custom events:
 *
 * ```tsx
 * interface BoardEvents extends BaseRuntimeEvents {
 *   op: [BoardOp]
 * }
 * const rt = useRuntime<BoardEvents>()
 * rt?.on("input", handler)              // runtime → view
 * rt?.emit("op", { type: "cursor_down" }) // view → runtime
 * ```
 *
 * Present in interactive mode (run/render/createApp/test renderer).
 * Absent (null) in static mode (renderStatic).
 */
export interface RuntimeContextValue<E extends BaseRuntimeEvents = BaseRuntimeEvents> {
  /** Subscribe to a typed event. Returns cleanup function. */
  on<K extends string & keyof E>(event: K, handler: EventHandler<E[K] extends unknown[] ? E[K] : never>): () => void
  /** Emit a typed event (view → runtime). */
  emit<K extends string & keyof E>(event: K, ...args: E[K] extends unknown[] ? E[K] : never): void
  /** Exit the application with optional error. */
  exit: (error?: Error) => void
  /** Pause rendering output (for screen switching). */
  pause?: () => void
  /** Resume rendering after pause. */
  resume?: () => void
}

/**
 * Context that provides the typed runtime event bus.
 *
 * When non-null: interactive mode — useInput works, components can subscribe
 * to events via rt.on() and emit via rt.emit().
 *
 * When null: static mode — useInput throws (by design), use useRuntime()
 * for components that need to work in both modes.
 */
export const RuntimeContext = createContext<RuntimeContextValue | null>(null)

// ============================================================================
// Focus Manager Context (tree-based focus system)
// ============================================================================

/**
 * Context for the tree-based focus manager.
 * Provides the FocusManager instance to useFocusable(), useFocusWithin(), and useFocusManager() hooks.
 */
export const FocusManagerContext = createContext<FocusManager | null>(null)
