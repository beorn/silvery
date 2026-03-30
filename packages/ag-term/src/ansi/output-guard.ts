/**
 * Output guard -- intercepts process.stdout/stderr writes in alt screen mode.
 *
 * When active:
 * - stdout: only allows writes from silvery's render pipeline (via writeStdout).
 *   All other stdout writes are suppressed.
 * - stderr: redirected to DEBUG_LOG file if set, otherwise suppressed.
 * - Restores original write methods on dispose.
 *
 * This solves the problem where ANY write to process.stdout or process.stderr
 * outside silvery's render pipeline corrupts the alt screen display. patchConsole
 * only catches console.* methods -- libraries like loggily write to
 * process.stderr.write() directly.
 */

import { openSync, writeSync, closeSync } from "node:fs"

export interface OutputGuard extends Disposable {
  /** Allow a write through stdout (called by silvery's render pipeline) */
  writeStdout(data: string | Uint8Array): boolean
  /** Whether the guard is currently active */
  readonly active: boolean
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
    return true
  } as any

  // Intercept stderr -- redirect to file or buffer
  process.stderr.write = function (chunk: any, ..._args: any[]): boolean {
    const str = typeof chunk === "string" ? chunk : chunk.toString()
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

  function dispose() {
    if (disposed) return
    disposed = true

    process.stdout.write = savedStdoutWrite
    process.stderr.write = savedStderrWrite

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
    dispose,
    [Symbol.dispose]: dispose,
  }
}
