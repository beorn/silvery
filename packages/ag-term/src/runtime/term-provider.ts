/**
 * Terminal provider — thin bridge between the Term sub-owners (Size, Input)
 * and the legacy Provider event-stream / state-subscription API surface.
 *
 * Phase A of the term.input migration moved ANSI parsing out of this file
 * into `runtime/input-owner.ts`. When constructed with `{ input }` from a
 * Term, this provider subscribes to `input.onKey/onMouse/onPaste/onFocus`
 * and re-emits as `ProviderEvent<TermEvents>` for callers still on the
 * async-iterable path. Standalone use without an injected Input constructs
 * a private one for the provider's lifetime.
 *
 * @example
 * ```typescript
 * const term = createTermProvider(process.stdin, process.stdout);
 *
 * // State
 * console.log(term.getState()); // { cols: 80, rows: 24 }
 *
 * // Events
 * for await (const event of term.events()) {
 *   if (event.type === 'key') console.log('Key:', event.data.input);
 *   if (event.type === 'resize') console.log('Resize:', event.data);
 * }
 *
 * // Cleanup
 * term[Symbol.dispose]();
 * ```
 */

import type { Key } from "./keys"
import type { ParsedMouse } from "../mouse"
import type { Dims, Provider, ProviderEvent } from "./types"
import { createSize, type Size } from "./devices/size"
import { type InputOwner, createInputOwner } from "./input-owner"
import type { Modes } from "./devices/modes"
import { watch } from "@silvery/signals"

// ============================================================================
// Types
// ============================================================================

/**
 * Terminal state.
 */
export interface TermState {
  cols: number
  rows: number
}

/**
 * Terminal events.
 */
export interface TermEvents {
  key: { input: string; key: Key }
  mouse: ParsedMouse
  paste: { text: string }
  resize: Dims
  focus: { focused: boolean }
  [key: string]: unknown
}

/**
 * Terminal provider type.
 */
export type TermProvider = Provider<TermState, TermEvents>

/**
 * Options for createTermProvider.
 */
export interface TermProviderOptions {
  /** Initial columns (default: from stdout or 80) */
  cols?: number
  /** Initial rows (default: from stdout or 24) */
  rows?: number
  /**
   * Shared Size owner (from Term). When provided, the provider reads dims
   * from `size.cols()` / `size.rows()` and subscribes to changes. When
   * omitted, a private Size owner is constructed and disposed with the
   * provider (backward compatibility for standalone use).
   */
  size?: Size
  /**
   * Shared Input owner (from Term). When provided, the provider's events()
   * re-emits `onKey/onMouse/onPaste/onFocus` events from the owner.
   * When omitted, the provider constructs a private Input owner at events()
   * iteration time and disposes it on cleanup (legacy / standalone path).
   */
  input?: InputOwner
  /**
   * Shared Modes owner (from Term). Threaded down to any internally
   * constructed Input so raw mode + bracketed paste go through a single
   * writer. When `input` is also provided, this option is unused.
   */
  modes?: Modes
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a terminal provider from stdin/stdout.
 *
 * The provider:
 * - Exposes terminal dimensions as state
 * - Yields keyboard, mouse, paste, focus, and resize events
 * - Cleans up listeners on dispose
 */
export function createTermProvider(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  options: TermProviderOptions = {},
): TermProvider {
  const ownsSize = !options.size
  const size: Size =
    options.size ??
    createSize(stdout, {
      cols: options.cols,
      rows: options.rows,
    })

  // Current state — populated from size's signal; kept as a plain object so
  // getState() returns a cheap snapshot without triggering alien-signals
  // subscription.
  let state: TermState = { cols: size.cols(), rows: size.rows() }

  const listeners = new Set<(state: TermState) => void>()

  let disposed = false
  const controller = new AbortController()
  const signal = controller.signal

  // Track an internally constructed Input for cleanup; if the caller injected
  // one we don't own its lifetime.
  let privateInput: InputOwner | null = null

  // Propagate size changes to provider subscribers. Size already coalesces
  // SIGWINCH bursts (16ms window) so every notification here carries the
  // final geometry.
  const unsubscribeSize = watch(
    () => size.snapshot(),
    (next) => {
      state = { cols: next.cols, rows: next.rows }
      listeners.forEach((l) => l(state))
    },
  )

  // Increase max listeners to avoid warnings in apps with many subscribers
  // (e.g., ScrollbackList items each using useTerm for reactive state)
  if (typeof stdout.setMaxListeners === "function") {
    const current = stdout.getMaxListeners?.() ?? 10
    if (current < 50) stdout.setMaxListeners(50)
  }

  return {
    getState(): TermState {
      return state
    },

    subscribe(listener: (state: TermState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async *events(): AsyncGenerator<ProviderEvent<TermEvents>, void, undefined> {
      if (disposed) return

      // Get an Input owner: caller-provided (preferred, lives past this
      // generator) or a private one we construct + dispose. Either way, the
      // owner is the single stdin + raw-mode + bracketed-paste authority.
      const input =
        options.input ??
        (privateInput = createInputOwner(stdin, stdout, {
          modes: options.modes,
        }))

      const queue: ProviderEvent<TermEvents>[] = []
      let eventResolve: (() => void) | null = null
      const nudge = () => {
        if (eventResolve) {
          const resolve = eventResolve
          eventResolve = null
          resolve()
        }
      }

      const unsubKey = input.onKey((e) => {
        queue.push({ type: "key", data: e })
        nudge()
      })
      const unsubMouse = input.onMouse((e) => {
        queue.push({ type: "mouse", data: e })
        nudge()
      })
      const unsubPaste = input.onPaste((e) => {
        queue.push({ type: "paste", data: e })
        nudge()
      })
      const unsubFocus = input.onFocus((e) => {
        queue.push({ type: "focus", data: e })
        nudge()
      })

      // Resize events are driven by the injected Size owner, which coalesces
      // SIGWINCH bursts (see runtime/devices/size.ts).
      const unsubscribeResizeEvent = watch(
        () => size.snapshot(),
        (next) => {
          queue.push({ type: "resize", data: { cols: next.cols, rows: next.rows } })
          nudge()
        },
      )

      try {
        while (!disposed && !signal.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              eventResolve = resolve
              signal.addEventListener("abort", () => resolve(), { once: true })
            })
          }

          if (disposed || signal.aborted) break

          while (queue.length > 0) {
            yield queue.shift()!
          }
        }
      } finally {
        unsubKey()
        unsubMouse()
        unsubPaste()
        unsubFocus()
        unsubscribeResizeEvent()
        if (privateInput) {
          privateInput[Symbol.dispose]()
          privateInput = null
        }
      }
    },

    [Symbol.dispose](): void {
      if (disposed) return
      disposed = true

      controller.abort()
      unsubscribeSize()
      listeners.clear()

      // If events() was never iterated we still own any private input created
      // outside of the generator lifetime. None exists today (the private
      // input is constructed inside events()), but belt-and-suspenders for
      // future changes.
      if (privateInput) {
        privateInput[Symbol.dispose]()
        privateInput = null
      }

      if (ownsSize) {
        size[Symbol.dispose]()
      }
    },
  }
}
