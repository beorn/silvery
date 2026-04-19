/**
 * Output guard -- intercepts process.stdout/stderr writes AND console methods
 * in alt screen mode.
 *
 * When active:
 * - stdout: only allows writes from silvery's render pipeline (via writeStdout).
 *   All other stdout writes are suppressed.
 * - stderr: redirected to DEBUG_LOG file if set, otherwise suppressed.
 * - console.log/info/warn/error/debug: redirected same as stderr.
 * - Restores all original methods on dispose.
 *
 * This solves the problem where ANY write to process.stdout, process.stderr,
 * or console.* outside silvery's render pipeline corrupts the alt screen display.
 */

import { openSync, writeSync, closeSync } from "node:fs"
import { createLogger } from "loggily"

const log = createLogger("silvery:guard")

export interface OutputGuard extends Disposable {
  /** Allow a write through stdout (called by silvery's render pipeline) */
  writeStdout(data: string | Uint8Array): boolean
  /** Whether the guard is currently active */
  readonly active: boolean
  /** Number of stdout writes suppressed since activation */
  readonly suppressedCount: number
  /** Number of stderr writes redirected since activation */
  readonly redirectedCount: number
  dispose(): void
  [Symbol.dispose](): void
}

export interface OutputGuardOptions {
  /** File path to redirect stderr to (default: process.env.DEBUG_LOG) */
  stderrLog?: string
  /** If true, buffer stderr and flush on dispose instead of redirecting to file */
  bufferStderr?: boolean
}

export function createOutputGuard(options?: OutputGuardOptions): OutputGuard {
  // Save the original write methods for restoration (exact reference)
  const savedStdoutWrite = process.stdout.write
  const savedStderrWrite = process.stderr.write
  // Bound versions for calling during interception (needs correct `this`)
  const origStdoutWrite = savedStdoutWrite.bind(process.stdout)
  const origStderrWrite = savedStderrWrite.bind(process.stderr)

  // Track whether silvery is currently writing (to allow its output through)
  let silveryWriting = false
  let disposed = false
  let suppressedCount = 0
  let redirectedCount = 0

  // Stderr buffer or file
  const stderrLog = options?.stderrLog ?? process.env.DEBUG_LOG
  let stderrFd: number | null = null
  const stderrBuffer: string[] = []

  if (stderrLog) {
    try {
      stderrFd = openSync(stderrLog, "a")
    } catch {
      // If we can't open the log file, fall back to suppression
    }
  }

  // Intercept stdout -- only allow silvery's own writes
  process.stdout.write = function (chunk: any, ...args: any[]): boolean {
    if (silveryWriting) {
      return origStdoutWrite(chunk, ...args)
    }
    // Non-silvery stdout write -- suppress in alt screen
    suppressedCount++
    const preview = typeof chunk === "string" ? chunk.slice(0, 60) : "<binary>"
    log?.debug?.(`suppressed stdout write (${suppressedCount}): ${JSON.stringify(preview)}`)
    return true
  } as any

  // Intercept stderr -- redirect to file or buffer
  process.stderr.write = function (chunk: any, ..._args: any[]): boolean {
    const str = typeof chunk === "string" ? chunk : chunk.toString()
    redirectedCount++
    if (stderrFd !== null) {
      try {
        writeSync(stderrFd, str)
      } catch {
        // File may have been closed externally
      }
      return true
    }
    if (options?.bufferStderr) {
      stderrBuffer.push(str)
      return true
    }
    // No file, no buffer -- suppress
    return true
  } as any

  // Intercept console methods — they write to stderr in Bun/Node and bypass
  // the process.stderr.write patch (they use internal C++ bindings).
  const savedConsoleLog = console.log
  const savedConsoleInfo = console.info
  const savedConsoleWarn = console.warn
  const savedConsoleError = console.error
  const savedConsoleDebug = console.debug

  function redirectConsole(...args: unknown[]): void {
    const str = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ") + "\n"
    redirectedCount++
    if (stderrFd !== null) {
      try {
        writeSync(stderrFd, str)
      } catch {
        // File may have been closed
      }
      return
    }
    if (options?.bufferStderr) {
      stderrBuffer.push(str)
      return
    }
    // Suppress
  }

  console.log = redirectConsole as typeof console.log
  console.info = redirectConsole as typeof console.info
  console.warn = redirectConsole as typeof console.warn
  console.error = redirectConsole as typeof console.error
  console.debug = redirectConsole as typeof console.debug

  // Log after all intercepts installed so the message goes through the guard
  log?.info?.("activated" + (stderrLog ? ` (stderr -> ${stderrLog})` : " (stderr suppressed)"))

  function dispose() {
    if (disposed) return
    disposed = true

    process.stdout.write = savedStdoutWrite
    process.stderr.write = savedStderrWrite
    console.log = savedConsoleLog
    console.info = savedConsoleInfo
    console.warn = savedConsoleWarn
    console.error = savedConsoleError
    console.debug = savedConsoleDebug

    log?.info?.(
      `deactivated (suppressed ${suppressedCount} stdout, redirected ${redirectedCount} stderr)`,
    )

    // Flush buffered stderr
    for (const line of stderrBuffer) {
      origStderrWrite(line)
    }

    // Close log file
    if (stderrFd !== null) {
      try {
        closeSync(stderrFd)
      } catch {
        // Already closed
      }
      stderrFd = null
    }
  }

  return {
    writeStdout(data) {
      silveryWriting = true
      try {
        return origStdoutWrite(data)
      } finally {
        silveryWriting = false
      }
    },
    get active() {
      return !disposed
    },
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
