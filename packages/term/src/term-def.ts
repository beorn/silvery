/**
 * TermDef Resolution
 *
 * Converts TermDef (minimal render config) into resolved values for rendering.
 * Handles auto-detection of events from stdin, dimension defaults, etc.
 */

import type { ColorLevel, Term } from "@silvery/ansi"
import type { Event, TermDef } from "@silvery/tea/types"

// ============================================================================
// Resolved TermDef
// ============================================================================

/**
 * Resolved values from a TermDef, ready for use by the render system.
 */
export interface ResolvedTermDef {
  /** Output stream (may be mock for static rendering) */
  stdout: NodeJS.WriteStream | null

  /** Width in columns */
  width: number

  /** Height in rows */
  height: number

  /** Color level (null = no colors) */
  colors: ColorLevel | null

  /** Event source (null = static mode) */
  events: AsyncIterable<Event> | null

  /** Whether this is static mode (no events = render until stable) */
  isStatic: boolean
}

// ============================================================================
// Resolution Logic
// ============================================================================

/**
 * Default dimensions when not detectable.
 */
const DEFAULT_WIDTH = 80
const DEFAULT_HEIGHT = 24

/**
 * Check if a value is a Term instance (duck typing).
 */
export function isTerm(value: unknown): value is Term {
  // Term can be a callable Proxy (typeof === 'function') or object
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj.hasCursor === "function" &&
    typeof obj.hasInput === "function" &&
    typeof obj.hasColor === "function" &&
    typeof obj.write === "function"
  )
}

/**
 * Check if a value is a TermDef (not a Term).
 */
export function isTermDef(value: unknown): value is TermDef {
  if (!value || typeof value !== "object") return false
  // TermDef doesn't have hasCursor method
  const obj = value as Record<string, unknown>
  return typeof obj.hasCursor !== "function"
}

/**
 * Resolve a TermDef into concrete values.
 *
 * @param def - TermDef to resolve
 * @returns Resolved values ready for rendering
 */
export function resolveTermDef(def: TermDef): ResolvedTermDef {
  // Resolve dimensions
  const width = def.width ?? def.stdout?.columns ?? DEFAULT_WIDTH
  const height = def.height ?? def.stdout?.rows ?? DEFAULT_HEIGHT

  // Resolve colors
  let colors: ColorLevel | null = null
  if (def.colors === true) {
    // Auto-detect from stdout
    colors = detectColorLevel(def.stdout)
  } else if (def.colors === false || def.colors === null) {
    colors = null
  } else if (def.colors) {
    colors = def.colors
  } else {
    // Default: auto-detect
    colors = detectColorLevel(def.stdout)
  }

  // Resolve events
  let events: AsyncIterable<Event> | null = null
  if (def.events) {
    // Explicit events provided
    events = def.events
  } else if (def.stdin) {
    // Auto-create events from stdin
    events = createInputEvents(def.stdin)
  }

  return {
    stdout: def.stdout ?? null,
    width,
    height,
    colors,
    events,
    isStatic: events === null,
  }
}

/**
 * Resolve a Term instance into ResolvedTermDef.
 *
 * @param term - Term instance
 * @returns Resolved values
 */
export function resolveFromTerm(term: Term): ResolvedTermDef {
  return {
    stdout: term.stdout,
    width: term.cols ?? DEFAULT_WIDTH,
    height: term.rows ?? DEFAULT_HEIGHT,
    colors: term.hasColor(),
    // Term instances always have interactive capabilities
    events: createInputEvents(term.stdin),
    isStatic: false,
  }
}

// ============================================================================
// Color Detection
// ============================================================================

/**
 * Detect color level from stdout stream.
 */
function detectColorLevel(stdout?: NodeJS.WriteStream): ColorLevel | null {
  // Check environment variables
  if (process.env.NO_COLOR !== undefined) {
    return null
  }

  if (process.env.FORCE_COLOR !== undefined) {
    const level = Number.parseInt(process.env.FORCE_COLOR, 10)
    if (level === 0) return null
    if (level === 1) return "basic"
    if (level === 2) return "256"
    if (level >= 3) return "truecolor"
    return "basic"
  }

  // Check COLORTERM for truecolor
  if (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit") {
    return "truecolor"
  }

  // Check if TTY
  if (!stdout?.isTTY) {
    return null
  }

  // Check TERM for 256 color support
  const term = process.env.TERM ?? ""
  if (term.includes("256color") || term.includes("256")) {
    return "256"
  }

  // Default to basic if TTY
  return "basic"
}

// ============================================================================
// Input Events
// ============================================================================

/**
 * Create an async iterable of input events from a stdin stream.
 *
 * This enables interactive mode by providing a source of keyboard events.
 */
export function createInputEvents(stdin: NodeJS.ReadStream): AsyncIterable<Event> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<Event> {
      const buffer: Event[] = []
      let resolveNext: ((value: IteratorResult<Event>) => void) | null = null
      let done = false

      // Set up stdin reading
      const handleData = (chunk: Buffer | string) => {
        const data = typeof chunk === "string" ? chunk : chunk.toString("utf8")

        // Convert raw input to key events
        // This is simplified - real implementation would parse ANSI sequences
        for (const char of data) {
          const event: Event = {
            type: "key",
            key: char,
            ctrl: char.charCodeAt(0) < 32 && char !== "\r" && char !== "\n" && char !== "\t",
          }

          if (resolveNext) {
            resolveNext({ value: event, done: false })
            resolveNext = null
          } else {
            buffer.push(event)
          }
        }
      }

      const handleEnd = () => {
        done = true
        if (resolveNext) {
          resolveNext({ value: undefined as unknown as Event, done: true })
          resolveNext = null
        }
      }

      // Only set up if stdin supports raw mode
      if (stdin.isTTY && typeof stdin.setRawMode === "function") {
        stdin.setEncoding("utf8")
        stdin.on("data", handleData)
        stdin.on("end", handleEnd)
      }

      return {
        next(): Promise<IteratorResult<Event>> {
          // Return buffered event if available
          const buffered = buffer.shift()
          if (buffered) {
            return Promise.resolve({ value: buffered, done: false })
          }

          // If done, return done
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as Event,
              done: true,
            })
          }

          // Wait for next event
          return new Promise((resolve) => {
            resolveNext = resolve
          })
        },

        return(): Promise<IteratorResult<Event>> {
          done = true
          stdin.off("data", handleData)
          stdin.off("end", handleEnd)
          return Promise.resolve({
            value: undefined as unknown as Event,
            done: true,
          })
        },
      }
    },
  }
}
