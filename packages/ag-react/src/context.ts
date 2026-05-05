/**
 * Silvery React Contexts
 *
 * Provides contexts for:
 * - TermContext: Access to Term instance (for styling/detection)
 * - NodeContext: Access to the current SilveryNode (for useBoxRect)
 * - RuntimeContext: Unified input/app controls (replaces Events/Input/Stdin/App contexts)
 * - StdoutContext: Access to stdout
 * - StderrContext: Access to stderr
 */

import type { Term } from "@silvery/ag-term/ansi"
import { createContext } from "react"
import type { FocusManager } from "@silvery/ag/focus-manager"
import type { Key } from "@silvery/ag/keys"
import type { AgNode } from "@silvery/ag/types"

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
 * Used by useBoxRect() to subscribe to layout changes.
 *
 * Each Box component wraps its children in a NodeContext.Provider
 * with its corresponding SilveryNode.
 */
export const NodeContext = createContext<AgNode | null>(null)

// ============================================================================
// Stdio Context
// ============================================================================

export interface StdoutContextValue {
  /** Standard output stream */
  stdout: NodeJS.WriteStream
  /** Write to stdout */
  write: (data: string) => void
  /**
   * Queue a typed terminal artifact to be flushed after the current rendered
   * frame. Prefer this over raw writeAfterFrame for protocol-owned render
   * artifacts such as terminal images.
   */
  queueFrameArtifact?: (artifact: TerminalFrameArtifact) => void
  /**
   * Queue bytes to be written immediately after the current rendered frame.
   * Escape-sequence components such as terminal images use this so their
   * placements land after the cell buffer paint instead of racing it during
   * React layout effects.
   */
  writeAfterFrame?: (data: string) => void
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

export type TerminalFrameArtifact = {
  readonly kind: "terminal-sequence"
  readonly owner: string
  readonly sequence: string
  readonly zIndex?: number
}

export interface StderrContextValue {
  /** Standard error stream */
  stderr: NodeJS.WriteStream
  /** Write to stderr */
  write: (data: string) => void
}

/**
 * Context for stderr access.
 * Used by useStderr() hook.
 */
export const StderrContext = createContext<StderrContextValue | null>(null)

// ============================================================================
// Runtime Context (typed bidirectional event bus — TEA)
// ============================================================================

/**
 * Base events every runtime provides.
 *
 * Retained for backwards compatibility (legacy `useRuntime<E>()` generic
 * slot). The canonical subscription surface is {@link ChainAppContextValue}
 * — input / paste / focus flow through the apply-chain plugin stores and
 * app-defined events ride on {@link ChainCustomEvents}.
 */
export interface BaseRuntimeEvents {
  /** Keyboard input: [parsedInput, keyMetadata] */
  input: [input: string, key: Key]
  /** Bracketed paste: [pastedText] */
  paste: [text: string]
  /** Terminal window focus change: [isFocused] */
  focus: [focused: boolean]
}

/**
 * Minimal runtime handle — the trimmed RuntimeContextValue exposes only
 * app-lifecycle controls (`exit`, and the opt-in pause / resume pair
 * used by console-mode suspension). Input / paste / focus subscriptions
 * live on {@link ChainAppContextValue}; custom view ↔ runtime events
 * live on {@link ChainCustomEvents} (`chain.events.emit / on`).
 *
 * The generic parameter is retained for source compatibility with
 * callers of `useRuntime<LinkEvents>()`; it has no effect on the type
 * surface below.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface RuntimeContextValue<_E extends BaseRuntimeEvents = BaseRuntimeEvents> {
  /** Exit the application with optional error. */
  exit: (error?: Error) => void
  /** Pause rendering output (used by console suspend). */
  pause?: () => void
  /** Resume rendering after a pause. Forces a full redraw. */
  resume?: () => void
}

/**
 * Context that provides the trimmed runtime handle.
 *
 * When non-null: interactive mode — `useExit()` works. Input / paste /
 * focus subscriptions use `ChainAppContext`.
 *
 * When null: static mode — `useExit()` throws. Hooks subscribe through
 * `ChainAppContext` when present, otherwise no-op.
 */
export const RuntimeContext = createContext<RuntimeContextValue | null>(null)

// ============================================================================
// Chain App Context (TEA Phase 2 — apply-chain plugin stores)
// ============================================================================

/**
 * Minimal key shape forwarded to chain handlers. Kept structural (not
 * imported from @silvery/ag/keys) so this context stays dependency-free;
 * consumers narrow to `Key` at the call site.
 */
export interface ChainKey {
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  super?: boolean
  hyper?: boolean
  alt?: boolean
  eventType?: "press" | "repeat" | "release" | undefined
}

/** Handler registered with the fallback useInput store. */
export type ChainInputHandler = (input: string, key: ChainKey) => void | "exit"

/** Handler registered with the paste store. */
export type ChainPasteHandler = (text: string) => void

/** Handler registered with the terminal focus store. */
export type ChainFocusHandler = (focused: boolean) => void

/** Raw-key observer handler — fires for every input:key op (press/repeat/release/modifier-only). */
export type ChainRawKeyHandler = (input: string, key: ChainKey) => void

/** Handler registered with the custom-events store — payload is app-defined. */
export type ChainCustomEventHandler = (...args: unknown[]) => void

/** Input-fallback store slice exposed by withInputChain. */
export interface ChainInputStore {
  register(handler: ChainInputHandler, active?: boolean): () => void
  setActive(handler: ChainInputHandler, active: boolean): void
}

/** Raw-key observer slice — sees every key event before focus/useInput filters. */
export interface ChainRawKeyObserver {
  register(handler: ChainRawKeyHandler): () => void
}

/** Paste store slice exposed by withPasteChain. */
export interface ChainPasteStore {
  register(handler: ChainPasteHandler): () => void
}

/** Window focus slice exposed alongside the chain for createApp. */
export interface ChainFocusEvents {
  register(handler: ChainFocusHandler): () => void
}

/**
 * Custom-events slice — app-defined view ↔ runtime events (e.g.
 * `link:open` fired by `<Link>` and consumed by km-tui's
 * `useLinkOpen`). Channels are arbitrary strings chosen by the app;
 * payloads are untyped at the bus layer.
 */
export interface ChainCustomEvents {
  on(channel: string, handler: ChainCustomEventHandler): () => void
  emit(channel: string, ...args: unknown[]): void
}

/**
 * Context that exposes the apply-chain plugin stores.
 *
 * Provided by `createApp()` (and `run()` eventually) when an apply-chain
 * runtime is present. Hooks prefer this context; they fall back to
 * {@link RuntimeContext} when the chain is absent (e.g. children inside
 * an `InputBoundary`, which provides its own isolated RuntimeContext but
 * no chain).
 */
export interface ChainAppContextValue {
  readonly input: ChainInputStore
  readonly paste: ChainPasteStore
  readonly focusEvents: ChainFocusEvents
  /**
   * Raw-key observer — sees every `input:key` op (press/repeat/release/
   * modifier-only), unfiltered by focus or useInput. Used by hooks like
   * `useModifierKeys` that need to track sub-press state regardless of
   * whether a focused element consumed the key.
   */
  readonly rawKeys: ChainRawKeyObserver
  /**
   * Custom event bus — replaces the legacy `RuntimeContextValue.on /
   * emit` surface for app-defined channels. Consumers subscribe via
   * `events.on("channel", handler)` and producers fire via
   * `events.emit("channel", …payload)`.
   */
  readonly events: ChainCustomEvents
}

export const ChainAppContext = createContext<ChainAppContextValue | null>(null)

// ============================================================================
// Cache Backend Context (mode-agnostic cache selection)
// ============================================================================

/**
 * Cache backend type — determines where ListView stores cached items.
 * - "terminal": Write to stdout as native scrollback (inline mode)
 * - "virtual": In-memory HistoryBuffer ring buffer (fullscreen + virtualInline)
 * - "retain": Cache items but keep them in the render tree (plain fullscreen
 *   without virtual scrollback — the virtualizer handles windowing)
 */
export type CacheBackend = "terminal" | "virtual" | "retain"

/**
 * Context that provides the cache backend to ListView.
 * Set by the runtime based on rendering mode:
 * - alternateScreen: false (inline) → "terminal"
 * - alternateScreen: true + virtualInline → "virtual"
 * - alternateScreen: true (plain fullscreen) → "retain"
 *
 * Default: "virtual" (safe fallback for test renderers — items unmount as expected)
 */
export const CacheBackendContext = createContext<CacheBackend>("virtual")

// ============================================================================
// Focus Manager Context (tree-based focus system)
// ============================================================================

/**
 * Context for the tree-based focus manager.
 * Provides the FocusManager instance to useFocusable(), useFocusWithin(), and useFocusManager() hooks.
 */
export const FocusManagerContext = createContext<FocusManager | null>(null)

// ============================================================================
// Capability Registry Context
// ============================================================================

/**
 * Minimal capability lookup interface — matches CapabilityRegistry.get().
 * Defined here to avoid a dependency from ag-react → @silvery/create internals.
 */
export interface CapabilityLookup {
  get<T>(key: symbol): T | undefined
}

/**
 * Context for the capability registry (from @silvery/create composition).
 *
 * Provided by createApp() when a capabilityRegistry exists on the app object.
 * Hooks like useSelection() use this to discover interaction features
 * (e.g., SelectionFeature) without coupling to the composition layer.
 *
 * Returns null in simple `run()` or `render()` apps that don't use pipe() composition.
 */
export const CapabilityRegistryContext = createContext<CapabilityLookup | null>(null)
