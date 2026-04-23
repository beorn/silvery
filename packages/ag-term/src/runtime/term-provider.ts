/**
 * Terminal provider - wraps stdin/stdout as a Provider.
 *
 * This makes the terminal "just another provider" - no special handling needed.
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

import { type Key, parseKey } from "./keys"
import { isMouseSequence, parseMouseSequence, type ParsedMouse } from "../mouse"
import {
  parseBracketedPaste,
  enableBracketedPaste,
  disableBracketedPaste,
} from "../bracketed-paste"
import { enableFocusReporting, disableFocusReporting, parseFocusEvent } from "../focus-reporting"
import type { Dims, Provider, ProviderEvent } from "./types"
import { createSize, type Size } from "./devices/size"
import { watch } from "@silvery/signals"

// ============================================================================
// Input Splitting
// ============================================================================

/**
 * Result of splitting raw input — includes parsed sequences and any
 * trailing incomplete CSI sequence that needs cross-chunk buffering.
 */
interface SplitResult {
  /** Fully parsed key/mouse sequences */
  sequences: string[]
  /** Incomplete CSI sequence at end of chunk (needs next chunk to complete) */
  incomplete: string | null
}

/**
 * Split a raw stdin chunk into individual key sequences.
 *
 * When the OS buffers key repeat events, stdin delivers multiple keystrokes
 * in a single read (e.g., "jjjjj" for held 'j'). parseKey expects one
 * keystroke at a time, so we must split first.
 *
 * When a CSI sequence (ESC [ ...) ends at the chunk boundary without a
 * terminator, it is returned as `incomplete` so the caller can buffer it
 * and prepend to the next chunk. This handles SGR mouse sequences that
 * split across stdin data events (e.g., '\x1b[<0;58;8' + 'M').
 *
 * Strategy:
 * - ESC followed by [ or O starts a multi-byte sequence — consume until terminator
 * - ESC alone or ESC + single char is a 2-byte meta sequence
 * - Everything else is a single byte
 */
function splitRawInput(raw: string): SplitResult {
  const sequences: string[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === "\x1b") {
      // Escape sequence
      if (i + 1 >= raw.length) {
        // Bare ESC at end
        sequences.push("\x1b")
        i++
      } else if (raw[i + 1] === "[") {
        // CSI sequence: ESC [ ... <letter or ~>
        let j = i + 2
        while (j < raw.length && !isCSITerminator(raw[j]!)) j++
        if (j < raw.length) {
          j++ // include terminator
          sequences.push(raw.slice(i, j))
          i = j
        } else {
          // Incomplete CSI — hit end of chunk without finding terminator.
          // Return it as incomplete so caller can buffer for next chunk.
          return { sequences, incomplete: raw.slice(i) }
        }
      } else if (raw[i + 1] === "O") {
        // SS3 sequence: ESC O <letter>
        const end = Math.min(i + 3, raw.length)
        sequences.push(raw.slice(i, end))
        i = end
      } else if (raw[i + 1] === "\x1b") {
        // Double ESC: meta + escape, OR meta + CSI/SS3 sequence
        if (i + 2 < raw.length && raw[i + 2] === "[") {
          // Meta + CSI: ESC ESC [ params terminator (e.g., meta+arrow)
          let j = i + 3
          while (j < raw.length && !isCSITerminator(raw[j]!)) j++
          if (j < raw.length) {
            j++ // include terminator
            sequences.push(raw.slice(i, j))
            i = j
          } else {
            return { sequences, incomplete: raw.slice(i) }
          }
        } else if (i + 2 < raw.length && raw[i + 2] === "O") {
          // Meta + SS3: ESC ESC O letter
          const end = Math.min(i + 4, raw.length)
          sequences.push(raw.slice(i, end))
          i = end
        } else {
          // Plain double ESC (meta+escape)
          sequences.push("\x1b\x1b")
          i += 2
        }
      } else {
        // Meta key: ESC + char
        sequences.push(raw.slice(i, i + 2))
        i += 2
      }
    } else {
      // Single byte (printable char, ctrl code, etc.)
      sequences.push(raw[i]!)
      i++
    }
  }
  return { sequences, incomplete: null }
}

/** CSI sequences end with a letter (A-Z, a-z) or ~ */
function isCSITerminator(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "~"
}

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
   * from `size.cols()` / `size.rows()` and subscribes to changes via
   * `effect(() => size.snapshot())`. When omitted, a private Size owner is
   * constructed and disposed with the provider (backward compatibility for
   * standalone use).
   */
  size?: Size
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a terminal provider from stdin/stdout.
 *
 * The provider:
 * - Exposes terminal dimensions as state
 * - Yields keyboard and resize events
 * - Cleans up stdin/stdout listeners on dispose
 */
export function createTermProvider(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  options: TermProviderOptions = {},
): TermProvider {
  // Shared Size owner drives both state and resize events. If the caller
  // didn't inject one, construct a private Size that is disposed alongside
  // the provider. Resize coalescing lives in Size — term-provider has no
  // coalesce logic of its own. See km-silvery.term-sub-owners Phase 5.
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

  // Subscribers
  const listeners = new Set<(state: TermState) => void>()

  // Disposed flag
  let disposed = false

  // Abort controller for cleanup
  const controller = new AbortController()
  const signal = controller.signal

  // Shared stdin cleanup — set by events(), callable from dispose as safety net
  let stdinCleanup: (() => void) | null = null

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

      // Set up stdin for raw mode if TTY
      if (stdin.isTTY) {
        stdin.setRawMode(true)
        stdin.resume()
        stdin.setEncoding("utf8")
      }

      // Queued events
      const queue: ProviderEvent<TermEvents>[] = []
      let eventResolve: (() => void) | null = null

      // Single-key handler: parses one key sequence and enqueues an event.
      // Focus, mouse sequences are detected and parsed separately.
      const onKey = (raw: string) => {
        // Focus events: CSI I (focus-in) / CSI O (focus-out)
        const focusEvent = parseFocusEvent(raw)
        if (focusEvent) {
          queue.push({ type: "focus", data: { focused: focusEvent.type === "focus-in" } })
          return
        }
        if (isMouseSequence(raw)) {
          const parsed = parseMouseSequence(raw)
          if (parsed) {
            queue.push({ type: "mouse", data: parsed })
            return
          }
        }
        const [input, key] = parseKey(raw)
        queue.push({ type: "key", data: { input, key } })
      }

      // Cross-chunk buffer for incomplete CSI sequences.
      // When an SGR mouse sequence (or other CSI) splits across two stdin
      // data events, we buffer the incomplete prefix and prepend it to the
      // next chunk so the sequence can be reassembled.
      let incompleteCSI: string | null = null

      // Input pipeline Stage 1: Terminal Provider — see docs/guide/input-architecture.md
      // Splits multi-char chunks into individual keystrokes.
      // When the OS buffers key repeat events, stdin delivers "jjjjj" as a
      // single read — splitRawInput breaks it into individual keys for onKey.
      const onChunk = (chunk: string) => {
        // Prepend any buffered incomplete CSI from the previous chunk
        if (incompleteCSI !== null) {
          chunk = incompleteCSI + chunk
          incompleteCSI = null
        }

        // Check for bracketed paste before splitting into individual keys.
        // Paste content is delivered as a single event, not individual keystrokes.
        const pasteResult = parseBracketedPaste(chunk)
        if (pasteResult) {
          queue.push({ type: "paste", data: { text: pasteResult.content } })
          if (eventResolve) {
            const resolve = eventResolve
            eventResolve = null
            resolve()
          }
          return
        }

        const { sequences, incomplete } = splitRawInput(chunk)
        for (const raw of sequences) onKey(raw)
        incompleteCSI = incomplete
        if (eventResolve) {
          const resolve = eventResolve
          eventResolve = null
          resolve()
        }
      }

      // Resize events are driven by the injected Size owner, which coalesces
      // SIGWINCH bursts within one 60Hz frame (see runtime/devices/size.ts
      // for the full rationale — bead: km-tui.tab-switch-layout-shift). The
      // provider just re-fires the coalesced geometry onto its event queue.
      const unsubscribeResizeEvent = watch(
        () => size.snapshot(),
        (next) => {
          queue.push({ type: "resize", data: { cols: next.cols, rows: next.rows } })
          if (eventResolve) {
            const resolve = eventResolve
            eventResolve = null
            resolve()
          }
        },
      )

      // Enable bracketed paste for TTY input.
      // Note: focus reporting is NOT enabled here — it's controlled by the
      // focusReporting option in create-app.tsx and run.tsx. Unconditionally
      // enabling it causes CSI I/O sequences to leak to screen in inline mode.
      if (stdin.isTTY) {
        enableBracketedPaste(stdout)
      }

      // Subscribe — track the cleanup function for use by both finally and dispose
      stdin.on("data", onChunk)
      stdinCleanup = () => {
        if (stdin.isTTY) {
          disableBracketedPaste(stdout)
        }
        stdin.off("data", onChunk)
        unsubscribeResizeEvent()
        if (stdin.isTTY) {
          stdin.setRawMode(false)
        }
        // Always pause stdin — on("data") unconditionally sets readableFlowing=true,
        // so we must unconditionally pause to release the event loop reference.
        stdin.pause()
      }

      try {
        while (!disposed && !signal.aborted) {
          // Wait for event
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              eventResolve = resolve
              signal.addEventListener("abort", () => resolve(), { once: true })
            })
          }

          // Check if aborted while waiting
          if (disposed || signal.aborted) break

          // Yield queued events
          while (queue.length > 0) {
            yield queue.shift()!
          }
        }
      } finally {
        if (stdinCleanup) {
          const fn = stdinCleanup
          stdinCleanup = null
          fn()
        }
      }
    },

    [Symbol.dispose](): void {
      if (disposed) return
      disposed = true

      // Abort pending waits
      controller.abort()

      // Stop propagating size changes to provider subscribers.
      unsubscribeSize()

      // Clear listeners
      listeners.clear()

      // Safety net: clean up stdin in case events() generator's finally
      // hasn't run yet (e.g., async .return() propagation is delayed)
      if (stdinCleanup) {
        const fn = stdinCleanup
        stdinCleanup = null
        fn()
      }

      // Dispose the Size we constructed ourselves. An injected Size is
      // owned by the caller (the Term) and lives past the provider.
      if (ownsSize) {
        size[Symbol.dispose]()
      }
    },
  }
}
