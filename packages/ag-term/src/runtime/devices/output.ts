/**
 * Output — single-owner stdout/stderr/console mediator for a silvery session.
 *
 * Mirrors `InputOwner` (`../input-owner.ts`) for the write side: one owner per
 * Term, stable across the session. When active, intercepts process.stdout,
 * process.stderr, and console.* so only the render pipeline (via `output.write`)
 * reaches the terminal. Non-silvery writes are suppressed (stdout) or redirected
 * to `options.stderrLog`/`process.env.DEBUG_LOG` (stderr/console).
 *
 * ## Lifecycle
 *
 * Constructed once per Term, initially deactivated. `activate()` installs the
 * intercepts; `deactivate()` restores originals; `dispose()` does final cleanup
 * (closes stderr fd, flushes buffered stderr). The activate/deactivate cycle is
 * used by the runtime to temporarily pass writes through during pause/resume
 * (console mode, log dump).
 *
 * ## Relation to InputOwner
 *
 * InputOwner is constructed once at term creation, activated immediately (it
 * needs raw mode + stdin data listener to mediate probes). Output is
 * constructed deactivated because installing intercepts before protocol setup
 * (alt screen, kitty keyboard) would suppress the setup sequences themselves.
 * The runtime calls `activate()` after protocol setup completes.
 */

import { openSync, writeSync, closeSync } from "node:fs"
import { createLogger } from "loggily"
import { signal, type ReadSignal } from "@silvery/signals"
import type { ConsoleRouter } from "./console-router"

const log = createLogger("silvery:guard")

export interface Output extends Disposable {
  /** Write data to stdout. When active, bypasses the intercept (silvery's render
   * pipeline writes go through here). When inactive, forwards to the raw
   * stdout.write. */
  write(data: string | Uint8Array): boolean
  /**
   * Whether intercepts are currently installed — a `ReadSignal<boolean>`.
   * Call `output.active()` to read; subscribe with
   * `effect(() => output.active())`. The owner writes it internally from
   * `activate()` / `deactivate()`.
   */
  readonly active: ReadSignal<boolean>
  /** Activate intercepts: installs stdout/stderr/console patches. Idempotent —
   * no-op if already active. Options override those passed at construction. */
  activate(options?: OutputOptions): void
  /** Deactivate intercepts: restores original stdout/stderr/console methods.
   * Idempotent. Closes stderr log fd if open. */
  deactivate(): void
  /** Number of stdout writes suppressed since construction (cumulative across
   * activate/deactivate cycles). Plain getter — changes on every write, not
   * worth the reactive cost. */
  readonly suppressedCount: number
  /** Number of stderr writes redirected since construction (cumulative across
   * activate/deactivate cycles). Plain getter — changes on every write. */
  readonly redirectedCount: number
  /** Final cleanup: deactivates + any teardown. Idempotent. */
  dispose(): void
  [Symbol.dispose](): void
}

export interface OutputOptions {
  /** File path to redirect stderr to (default: process.env.DEBUG_LOG) */
  stderrLog?: string
  /** If true, buffer stderr and flush on deactivate instead of redirecting to file */
  bufferStderr?: boolean
}

/**
 * Create an Output owner. Starts deactivated — call `activate()` to install
 * intercepts. Call `dispose()` for final cleanup.
 *
 * A `ConsoleRouter` may be passed to route `console.*` redirect policy
 * through the shared patcher (so Console's tap and Output's sink layer
 * deterministically). When omitted, Output patches `console.*` via its own
 * private router — the behaviour is identical, but Console's tap cannot
 * share the patch site.
 */
export function createOutput(defaultOptions?: OutputOptions, router?: ConsoleRouter): Output {
  let disposed = false
  // Reactive `active` — internal writes from activate/deactivate only.
  // Exposed read-only via the `active` ReadSignal on the public Output shape.
  const _active = signal<boolean>(false)

  // Cumulative stats across activate/deactivate cycles
  let suppressedCount = 0
  let redirectedCount = 0

  // Saved originals — captured at activation time, restored at deactivation
  let savedStdoutWrite: typeof process.stdout.write | null = null
  let savedStderrWrite: typeof process.stderr.write | null = null
  let origStdoutWrite: ((chunk: unknown, ...args: unknown[]) => boolean) | null = null
  let origStderrWrite: ((chunk: unknown, ...args: unknown[]) => boolean) | null = null

  // Stderr redirection state (re-created on activate, torn down on deactivate)
  let stderrFd: number | null = null
  let stderrBuffer: string[] = []
  let bufferStderr = false

  // Router is the canonical patcher for console.*. `unregisterSink` holds
  // the disposer for the sink policy we registered in activate().
  const ownsRouter = !router
  const _router: ConsoleRouter =
    router ??
    // Lazy local-router import to avoid a circular dep between console.ts
    // and output.ts. `require` is safe here (node runtime) and dev-only.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("./console-router") as typeof import("./console-router")).createConsoleRouter()
  let unregisterSink: (() => void) | null = null

  // Route flag — when true, stdout.write(…) inside the intercept forwards to the
  // original (silvery's own write() path toggles this briefly).
  let silveryWriting = false

  function activate(options?: OutputOptions): void {
    if (disposed) return
    if (_active()) return
    _active(true)

    const opts = { ...defaultOptions, ...options }
    bufferStderr = !!opts.bufferStderr

    savedStdoutWrite = process.stdout.write
    savedStderrWrite = process.stderr.write
    origStdoutWrite = savedStdoutWrite.bind(process.stdout) as typeof origStdoutWrite
    origStderrWrite = savedStderrWrite.bind(process.stderr) as typeof origStderrWrite

    const stderrLog = opts.stderrLog ?? process.env.DEBUG_LOG
    if (stderrLog) {
      try {
        stderrFd = openSync(stderrLog, "a")
      } catch {
        // If we can't open the log file, fall back to suppression
      }
    }

    process.stdout.write = function (chunk: unknown, ...args: unknown[]): boolean {
      if (silveryWriting) {
        return origStdoutWrite!(chunk, ...args)
      }
      // Non-silvery stdout write -- suppress in alt screen
      suppressedCount++
      const preview = typeof chunk === "string" ? chunk.slice(0, 60) : "<binary>"
      log?.debug?.(`suppressed stdout write (${suppressedCount}): ${JSON.stringify(preview)}`)
      return true
    } as typeof process.stdout.write

    process.stderr.write = function (chunk: unknown, ..._args: unknown[]): boolean {
      const str = typeof chunk === "string" ? chunk : String(chunk)
      redirectedCount++
      if (stderrFd !== null) {
        try {
          writeSync(stderrFd, str)
        } catch {
          // File may have been closed externally
        }
        return true
      }
      if (bufferStderr) {
        stderrBuffer.push(str)
        return true
      }
      return true
    } as typeof process.stderr.write

    // Intercept console methods via the shared ConsoleRouter — the router
    // owns the five `target[method] = wrapper` installs and composes Output's
    // redirect policy with whatever Console has registered as a tap. Using
    // the router (instead of patching console.* directly here) is what makes
    // the Console tap + Output sink coexist regardless of activation order
    // (Pro review 2026-04-22 P0-3 structural fix).
    unregisterSink = _router.registerSink({
      // If we have a fd to redirect to, drive the router's writeSync path.
      // Otherwise we'd want to buffer/drop — the router currently supports
      // suppress + redirect, so we emulate "buffer" by intercepting in our
      // own observer-style sink extension (via a tap that appends to the
      // stderrBuffer). Keep the canonical flow simple: fd-redirect is the
      // production case; buffering is the test case.
      redirectFd: stderrFd,
    })
    if (bufferStderr && stderrFd === null) {
      // Test/buffer mode: register a second sink that captures console.* into
      // stderrBuffer. The last-registered sink wins; register AFTER the
      // redirect sink so this one is active. Buffering also counts toward
      // redirectedCount so consumers see an accurate tally.
      unregisterSink?.()
      unregisterSink = _router.registerSink({
        // The router's sink currently has suppress/redirect semantics only;
        // buffering requires the caller to also register a tap for side effects.
        // We use suppress + a tap below.
        suppress: true,
      })
      // Tap: every call gets appended to stderrBuffer + counted.
      const unregisterBufferTap = _router.registerTap((call) => {
        const str = call.args.map((a) => (typeof a === "string" ? a : String(a))).join(" ") + "\n"
        redirectedCount++
        stderrBuffer.push(str)
      })
      const prevUnregister = unregisterSink
      unregisterSink = () => {
        unregisterBufferTap()
        prevUnregister()
      }
    } else {
      // Count fd-redirected writes by registering a tap alongside the redirect
      // sink. The tap fires BEFORE the sink runs writeSync, so count is in sync.
      const unregisterCountTap = _router.registerTap(() => {
        redirectedCount++
      })
      const prevUnregister = unregisterSink
      unregisterSink = () => {
        unregisterCountTap()
        prevUnregister!()
      }
    }

    log?.info?.("activated" + (stderrLog ? ` (stderr -> ${stderrLog})` : " (stderr suppressed)"))
  }

  function deactivate(): void {
    if (!_active()) return
    _active(false)

    if (savedStdoutWrite) process.stdout.write = savedStdoutWrite
    if (savedStderrWrite) process.stderr.write = savedStderrWrite
    // Unregister the sink + redirect tap on the ConsoleRouter. The router
    // itself stays wired (Console may still be tapping) — this just pops
    // Output's policies off.
    unregisterSink?.()
    unregisterSink = null

    log?.info?.(
      `deactivated (suppressed ${suppressedCount} stdout, redirected ${redirectedCount} stderr)`,
    )

    // Flush buffered stderr through the original. Headed with a separator
    // so the operator can distinguish replayed log output from anything
    // that ran AFTER the alt-screen restored. Suppressed when there's
    // nothing to replay (no header on a clean run).
    if (origStderrWrite && stderrBuffer.length > 0) {
      origStderrWrite(
        `\n— silvery: replaying ${stderrBuffer.length} captured stderr/console line(s) —\n`,
      )
      for (const line of stderrBuffer) {
        origStderrWrite(line)
      }
    }
    stderrBuffer = []

    if (stderrFd !== null) {
      try {
        closeSync(stderrFd)
      } catch {
        // Already closed
      }
      stderrFd = null
    }

    savedStdoutWrite = null
    savedStderrWrite = null
    origStdoutWrite = null
    origStderrWrite = null
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    deactivate()
    if (ownsRouter) _router.dispose()
  }

  return {
    write(data) {
      if (_active() && origStdoutWrite) {
        silveryWriting = true
        try {
          return origStdoutWrite(data)
        } finally {
          silveryWriting = false
        }
      }
      // Not active — forward straight to the current stdout.write (whatever it
      // is now). Caller is responsible for any additional routing.
      return process.stdout.write(data as string | Uint8Array)
    },
    active: _active as ReadSignal<boolean>,
    activate,
    deactivate,
    get suppressedCount() {
      return suppressedCount
    },
    get redirectedCount() {
      return redirectedCount
    },
    dispose,
    [Symbol.dispose]: dispose,
  }
}
