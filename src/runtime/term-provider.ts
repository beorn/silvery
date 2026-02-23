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

import { type Key, parseKey } from "./keys.js"
import { isMouseSequence, parseMouseSequence, type ParsedMouse } from "../mouse.js"
import type { Dims, Provider, ProviderEvent } from "./types.js"

// ============================================================================
// Input Splitting
// ============================================================================

/**
 * Split a raw stdin chunk into individual key sequences.
 *
 * When the OS buffers key repeat events, stdin delivers multiple keystrokes
 * in a single read (e.g., "jjjjj" for held 'j'). parseKey expects one
 * keystroke at a time, so we must split first.
 *
 * Strategy:
 * - ESC followed by [ or O starts a multi-byte sequence — consume until terminator
 * - ESC alone or ESC + single char is a 2-byte meta sequence
 * - Everything else is a single byte
 */
function splitRawInput(raw: string): string[] {
  const result: string[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === "\x1b") {
      // Escape sequence
      if (i + 1 >= raw.length) {
        // Bare ESC at end
        result.push("\x1b")
        i++
      } else if (raw[i + 1] === "[") {
        // CSI sequence: ESC [ ... <letter or ~>
        let j = i + 2
        while (j < raw.length && !isCSITerminator(raw[j]!)) j++
        if (j < raw.length) j++ // include terminator
        result.push(raw.slice(i, j))
        i = j
      } else if (raw[i + 1] === "O") {
        // SS3 sequence: ESC O <letter>
        const end = Math.min(i + 3, raw.length)
        result.push(raw.slice(i, end))
        i = end
      } else {
        // Meta key: ESC + char
        result.push(raw.slice(i, i + 2))
        i += 2
      }
    } else {
      // Single byte (printable char, ctrl code, etc.)
      result.push(raw[i]!)
      i++
    }
  }
  return result
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
  resize: Dims
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
  const { cols = stdout.columns || 80, rows = stdout.rows || 24 } = options

  // Current state
  let state: TermState = { cols, rows }

  // Subscribers
  const listeners = new Set<(state: TermState) => void>()

  // Disposed flag
  let disposed = false

  // Abort controller for cleanup
  const controller = new AbortController()
  const signal = controller.signal

  // Resize handler
  const onResize = () => {
    state = {
      cols: stdout.columns || 80,
      rows: stdout.rows || 24,
    }
    listeners.forEach((l) => l(state))
  }

  // Subscribe to resize
  stdout.on("resize", onResize)

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
      // Mouse sequences are detected and parsed separately.
      const onKey = (raw: string) => {
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

      // stdin handler: splits multi-char chunks into individual keystrokes.
      // When the OS buffers key repeat events, stdin delivers "jjjjj" as a
      // single read — splitRawInput breaks it into individual keys for onKey.
      const onChunk = (chunk: string) => {
        for (const raw of splitRawInput(chunk)) onKey(raw)
        if (eventResolve) {
          const resolve = eventResolve
          eventResolve = null
          resolve()
        }
      }

      // Resize handler for events
      const onResizeEvent = () => {
        const event: ProviderEvent<TermEvents> = {
          type: "resize",
          data: {
            cols: stdout.columns || 80,
            rows: stdout.rows || 24,
          },
        }
        queue.push(event)
        if (eventResolve) {
          const resolve = eventResolve
          eventResolve = null
          resolve()
        }
      }

      // Subscribe
      stdin.on("data", onChunk)
      stdout.on("resize", onResizeEvent)

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
        // Cleanup
        stdin.off("data", onChunk)
        stdout.off("resize", onResizeEvent)

        if (stdin.isTTY) {
          stdin.setRawMode(false)
          stdin.pause()
        }
      }
    },

    [Symbol.dispose](): void {
      if (disposed) return
      disposed = true

      // Abort pending waits
      controller.abort()

      // Remove resize listener
      stdout.off("resize", onResize)

      // Clear listeners
      listeners.clear()
    },
  }
}
