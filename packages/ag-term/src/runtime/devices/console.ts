/**
 * Console — single-owner console.* interceptor for a silvery session.
 *
 * Captures `console.log/info/warn/error/debug` during alt-screen rendering so
 * stray log output doesn't corrupt the TUI display. Entries are buffered and
 * can be replayed to the normal streams on exit (so the operator sees what
 * would have been printed) or rendered live inside the app via the `<Console>`
 * component (which reads `subscribe` + `getSnapshot`).
 *
 * Mirrors the other sub-owners in shape: constructed cheaply at term creation,
 * does nothing until `capture()` is called, `Symbol.dispose` is idempotent.
 *
 * ## Lifecycle
 *
 * One Console per Term. Capture is opt-in (`term.console.capture({suppress:true})`)
 * because hoisting it unconditionally at term creation would silently swallow
 * any log output from the caller's own setup code. `restore()` undoes the
 * patch; `dispose()` restores + clears subscribers.
 *
 * ## Relation to Output
 *
 * `Output` patches `process.stdout.write` / `process.stderr.write` / `console.*`
 * during alt-screen to suppress foreign writes and redirect stderr to
 * `DEBUG_LOG`. `Console` patches `console.*` alone to *capture* entries for
 * display + replay. They are complementary:
 *
 * - Output's console patch is a sink (write to DEBUG_LOG or drop).
 * - Console's patch is a tap (record for later use AND optionally forward).
 *
 * Call order matters: activate Console *before* Output, so the tap records the
 * entry before Output's sink drops it. `restore()` them in reverse order.
 */

import { signal, type ReadSignal } from "@silvery/signals"

import type { ConsoleEntry, ConsoleMethod } from "../../ansi/types"

/**
 * Aggregate counts of captured console output by severity.
 */
export interface ConsoleStats {
  total: number
  errors: number
  warnings: number
}

/**
 * Options for `console.capture()`.
 */
export interface ConsoleCaptureOptions {
  /**
   * Suppress forwarding to the original console methods.
   * Use in TUI / alt-screen mode where the raw output would corrupt the display.
   * Default: false.
   */
  suppress?: boolean
  /**
   * Store full entries in memory (default: true).
   * Set false for count-only mode — `getSnapshot()` returns empty, but
   * `getStats()` still tracks counts. Avoids unbounded memory growth for
   * long-running sessions where you only care about warning/error badges.
   */
  capture?: boolean
}

/**
 * Console — single-owner console.* capture + replay for a silvery session.
 *
 * Constructed lazily by `createTerm()` (no patching until `capture()`).
 * `subscribe` + `getSnapshot` are shaped for React's `useSyncExternalStore` —
 * each change produces a new array reference.
 */
export interface Console extends Disposable {
  /**
   * Start patching `console.log/info/warn/error/debug`. Idempotent — calling
   * while already capturing is a no-op (options are ignored on re-entry;
   * `restore()` then `capture()` again to change behaviour).
   */
  capture(options?: ConsoleCaptureOptions): void

  /**
   * Restore original console methods. Idempotent. Subscribers survive; you can
   * `capture()` again without re-subscribing. `dispose()` is the terminal
   * variant that also clears subscribers.
   */
  restore(): void

  /**
   * Whether `capture()` is currently active — a `ReadSignal<boolean>`.
   * Call `console.capturing()` to read; subscribe via
   * `effect(() => console.capturing())`. The owner writes it internally from
   * `capture()` / `restore()`.
   */
  readonly capturing: ReadSignal<boolean>

  /**
   * Reactive list of captured entries. Returns a frozen array reference that
   * changes each time a new entry arrives (so alien-signals / React identity
   * checks fire). Empty frozen array when `capture=false` was passed.
   *
   * Read synchronously with `entries()` or subscribe with
   * `effect(() => entries())`. React: `useSignal(console.entries)`.
   */
  readonly entries: ReadSignal<readonly ConsoleEntry[]>

  /** Aggregate counts. Tracked even when `capture=false`. */
  getStats(): ConsoleStats

  /**
   * Replay captured entries to explicit streams (typically `process.stdout` +
   * `process.stderr` after exiting alt-screen). Entries whose stream was
   * `'stderr'` go to the stderr stream; the rest go to stdout. Does not clear
   * entries — call this alongside `dispose()` at TUI exit.
   */
  replay(stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream): void

  dispose(): void
  [Symbol.dispose](): void
}

const METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"]
const STDERR_METHODS = new Set<ConsoleMethod>(["error", "warn"])
const EMPTY_ENTRIES: readonly ConsoleEntry[] = Object.freeze([])

/**
 * Create a Console owner for the given `console` global. Starts in the
 * restored (non-capturing) state — call `capture()` to begin intercepting.
 *
 * Default target is the ambient `console` global, which is what every app
 * wants; tests can pass a stub.
 */
export function createConsole(target: globalThis.Console = globalThis.console): Console {
  let disposed = false
  // Reactive `capturing` — written only by capture()/restore(), read by the
  // public `capturing` ReadSignal.
  const _capturing = signal<boolean>(false)
  let suppress = false
  let captureEntries = true

  // Buffer the authoritative ConsoleEntry[] for replay(). The reactive
  // `entries` signal holds the SAME data wrapped in a frozen array with a
  // fresh reference on every push — so alien-signals/React identity checks
  // fire and subscribers re-render.
  const buffer: ConsoleEntry[] = []
  const _entries = signal<readonly ConsoleEntry[]>(EMPTY_ENTRIES)
  const stats: ConsoleStats = { total: 0, errors: 0, warnings: 0 }

  // Originals captured once the first `capture()` is called, then reused so
  // nested capture/restore cycles always restore to the same baseline.
  const originals = new Map<ConsoleMethod, globalThis.Console[ConsoleMethod]>()

  function install() {
    for (const method of METHODS) {
      if (!originals.has(method)) {
        // Store the method as-is (no .bind) so `restore()` puts back an
        // identity-equal reference. Invocation uses `.call(target, …)`.
        originals.set(method, target[method])
      }
      const original = originals.get(method)!
      target[method] = (...args: unknown[]) => {
        stats.total++
        if (method === "error") stats.errors++
        else if (method === "warn") stats.warnings++

        if (captureEntries) {
          const entry: ConsoleEntry = {
            method,
            args,
            stream: STDERR_METHODS.has(method) ? "stderr" : "stdout",
          }
          buffer.push(entry)
          // Fresh reference so alien-signals equality check fires; Object.freeze
          // so subscribers can't mutate the array they read.
          _entries(Object.freeze(buffer.slice()))
        }

        if (!suppress) original.call(target, ...args)
      }
    }
  }

  function uninstall() {
    for (const method of METHODS) {
      const original = originals.get(method)
      if (original) target[method] = original
    }
  }

  function capture(options?: ConsoleCaptureOptions): void {
    if (disposed) return
    if (_capturing()) return
    _capturing(true)
    suppress = options?.suppress ?? false
    captureEntries = options?.capture ?? true
    install()
  }

  function restore(): void {
    if (!_capturing()) return
    _capturing(false)
    uninstall()
  }

  function replay(stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream): void {
    for (const entry of buffer) {
      const stream = entry.stream === "stderr" ? stderr : stdout
      const line =
        entry.args
          .map((a) =>
            typeof a === "string"
              ? a
              : a instanceof Error
                ? `${a.name}: ${a.message}`
                : safeJsonStringify(a),
          )
          .join(" ") + "\n"
      stream.write(line)
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    restore()
  }

  return {
    capture,
    restore,
    capturing: _capturing as ReadSignal<boolean>,
    entries: _entries as ReadSignal<readonly ConsoleEntry[]>,
    getStats() {
      return { ...stats }
    },
    replay,
    dispose,
    [Symbol.dispose]: dispose,
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
