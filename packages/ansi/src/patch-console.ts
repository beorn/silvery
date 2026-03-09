/**
 * Console patching with subscribable store for useSyncExternalStore.
 */

import type { ConsoleEntry, ConsoleMethod } from "./types"

/**
 * Aggregate counts of console output by severity.
 */
export interface ConsoleStats {
  total: number
  errors: number
  warnings: number
}

/**
 * A patched console that intercepts methods and accumulates entries.
 * Compatible with React's useSyncExternalStore.
 */
export interface PatchedConsole extends Disposable {
  /** Read current entries (for useSyncExternalStore). Empty when capture=false. */
  getSnapshot(): readonly ConsoleEntry[]

  /** Get aggregate counts (total, errors, warnings). Works in all modes. */
  getStats(): ConsoleStats

  /** Subscribe to changes - called when new entry arrives. Returns unsubscribe function. */
  subscribe(onStoreChange: () => void): () => void

  dispose(): void
  [Symbol.dispose](): void
}

const METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"]

const STDERR_METHODS = new Set<ConsoleMethod>(["error", "warn"])

export interface PatchConsoleOptions {
  /**
   * Suppress original console output when true.
   * Use in TUI mode where you want console output only in a component.
   */
  suppress?: boolean

  /**
   * Store full entries in memory (default: true).
   * Set to false for count-only mode — getSnapshot() returns empty array,
   * but getStats() still tracks counts. Avoids unbounded memory growth.
   */
  capture?: boolean
}

/**
 * Patch console methods to intercept and track output.
 * Returns a disposable that restores original methods.
 *
 * @param console - The console object to patch
 * @param options - Configuration options
 * @param options.suppress - If true, don't call original methods (for TUI mode)
 * @param options.capture - If false, only count entries (no memory storage)
 */
export function patchConsole(console: Console, options?: PatchConsoleOptions): PatchedConsole {
  const suppress = options?.suppress ?? false
  const capture = options?.capture ?? true

  // Entry storage (only when capture=true)
  const entries: ConsoleEntry[] = []
  // Snapshot must be a new reference on each change for useSyncExternalStore
  // (React uses Object.is to detect changes — same reference = no re-render)
  let snapshot: readonly ConsoleEntry[] = entries
  const EMPTY: readonly ConsoleEntry[] = Object.freeze([])

  // Stats (always tracked)
  const stats: ConsoleStats = { total: 0, errors: 0, warnings: 0 }

  const subscribers = new Set<() => void>()

  // Save original methods
  const originals = new Map<ConsoleMethod, Console[ConsoleMethod]>()
  for (const method of METHODS) {
    originals.set(method, console[method].bind(console))
  }

  // Batch subscriber notifications to prevent synchronous feedback loops.
  // Without batching, console.debug() during a React render triggers
  // useSyncExternalStore → re-render → more console output → infinite loop.
  let notifyPending = false

  function scheduleNotify() {
    if (notifyPending) return
    notifyPending = true
    queueMicrotask(() => {
      notifyPending = false
      subscribers.forEach((subscriber) => subscriber())
    })
  }

  // Replace with interceptors
  for (const method of METHODS) {
    const original = originals.get(method)!
    console[method] = (...args: unknown[]) => {
      // Update stats
      stats.total++
      if (method === "error") stats.errors++
      else if (method === "warn") stats.warnings++

      // Store entry if capturing
      if (capture) {
        const entry: ConsoleEntry = {
          method,
          args,
          stream: STDERR_METHODS.has(method) ? "stderr" : "stdout",
        }
        entries.push(entry)
        snapshot = entries.slice()
      }

      // Call original unless suppressed (TUI mode)
      if (!suppress) {
        original(...args)
      }

      // Notify subscribers (batched via microtask)
      scheduleNotify()
    }
  }

  function restore() {
    for (const method of METHODS) {
      console[method] = originals.get(method)!
    }
  }

  return {
    getSnapshot(): readonly ConsoleEntry[] {
      return capture ? snapshot : EMPTY
    },

    getStats(): ConsoleStats {
      return { ...stats }
    },

    subscribe(onStoreChange: () => void): () => void {
      subscribers.add(onStoreChange)
      return () => {
        subscribers.delete(onStoreChange)
      }
    },

    dispose() {
      restore()
      subscribers.clear()
    },

    [Symbol.dispose]() {
      this.dispose()
    },
  }
}
