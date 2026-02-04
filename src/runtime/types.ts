/**
 * Core types for the inkx-loop runtime.
 */

import type { TerminalBuffer } from "../buffer.js"
import type { InkxNode } from "../types.js"

/**
 * Dimensions for rendering.
 */
export interface Dims {
  cols: number
  rows: number
}

/**
 * Immutable render output buffer.
 *
 * Contains:
 * - text: Plain text without ANSI codes (for assertions)
 * - ansi: Styled output with ANSI escape codes
 * - nodes: Internal node tree for locator queries
 */
export interface Buffer {
  /** Plain text without ANSI codes */
  readonly text: string
  /** Styled output with ANSI escape codes */
  readonly ansi: string
  /** Internal node tree for locator queries */
  readonly nodes: InkxNode
  /** Raw terminal buffer for diffing */
  readonly _buffer: TerminalBuffer
}

/**
 * Event types from the runtime.
 */
export type Event =
  | {
      type: "key"
      key: string
      ctrl?: boolean
      meta?: boolean
      shift?: boolean
    }
  | { type: "resize"; cols: number; rows: number }
  | { type: "tick"; time: number }
  | { type: "effect"; id: string; result: unknown }
  | { type: "error"; error: Error }

/**
 * Render target interface - abstracts terminal output.
 */
export interface RenderTarget {
  /** Write rendered frame to output */
  write(frame: string): void
  /** Get current dimensions */
  getDims(): Dims
  /** Subscribe to resize events */
  onResize?(handler: (dims: Dims) => void): () => void
}

/**
 * Runtime options for createRuntime().
 */
export interface RuntimeOptions {
  /** Render target (terminal, test mock, etc.) */
  target: RenderTarget
  /** Abort signal for cleanup */
  signal?: AbortSignal
}

/**
 * The runtime kernel interface.
 */
export interface Runtime {
  /** Event stream - yields until disposed */
  events(): AsyncIterable<Event>

  /** Schedule an effect with optional cancellation */
  schedule<T>(effect: () => Promise<T>, opts?: { signal?: AbortSignal }): void

  /** Render a buffer to the target */
  render(buffer: Buffer): void

  /** Get current dimensions */
  getDims(): Dims

  /** Dispose and cleanup - idempotent */
  [Symbol.dispose](): void
}

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Event emitted by a provider, tagged with event type.
 */
export type ProviderEvent<Events extends Record<string, unknown>> = {
  [K in keyof Events]: { type: K; data: Events[K] }
}[keyof Events]

/**
 * Provider interface - unified store + event source.
 *
 * Providers are the building blocks of inkx-loop applications.
 * They encapsulate:
 * - State (Zustand-compatible: getState/subscribe)
 * - Events (AsyncIterable of typed events)
 * - Cleanup (Symbol.dispose)
 *
 * @example
 * ```typescript
 * type TermProvider = Provider<
 *   { cols: number; rows: number },
 *   { key: { input: string; key: Key }; resize: Dims }
 * >;
 * ```
 */
export interface Provider<
  State = unknown,
  Events extends Record<string, unknown> = Record<string, never>,
> {
  /** Get current state (Zustand-compatible) */
  getState(): State

  /** Subscribe to state changes (Zustand-compatible) */
  subscribe(listener: (state: State) => void): () => void

  /** Event stream - yields typed events until disposed */
  events(): AsyncIterable<ProviderEvent<Events>>

  /** Cleanup resources */
  [Symbol.dispose](): void
}

/**
 * Extract the namespaced event type from a providers map.
 *
 * Given { term: TermProvider, sync: SyncProvider }, produces:
 * | { type: 'term:key'; data: { input: string; key: Key } }
 * | { type: 'term:resize'; data: Dims }
 * | { type: 'sync:data'; data: Item[] }
 * | ...
 */
export type NamespacedEvent<
  Providers extends Record<string, Provider<unknown, Record<string, unknown>>>,
> = {
  [P in keyof Providers]: Providers[P] extends Provider<unknown, infer E>
    ? {
        [K in keyof E & string]: {
          type: `${P & string}:${K}`
          data: E[K]
        }
      }[keyof E & string]
    : never
}[keyof Providers]

/**
 * Extract all event keys from a providers map.
 *
 * Given { term: TermProvider, sync: SyncProvider }, produces:
 * 'term:key' | 'term:resize' | 'sync:data' | ...
 */
export type ProviderEventKey<
  Providers extends Record<string, Provider<unknown, Record<string, unknown>>>,
> = NamespacedEvent<Providers>["type"]

/**
 * Get the data type for a specific event key.
 */
export type EventData<
  Providers extends Record<string, Provider<unknown, Record<string, unknown>>>,
  K extends ProviderEventKey<Providers>,
> = Extract<NamespacedEvent<Providers>, { type: K }>["data"]
