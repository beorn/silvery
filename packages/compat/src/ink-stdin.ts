/**
 * Ink compat stdin state: raw mode tracking, bracketed paste mode, event bridging.
 * @internal
 */

import { createContext } from "react"
import EventEmitter from "node:events"

// =============================================================================
// Ink-compatible stdin state
// =============================================================================

/**
 * Context for per-instance stdin management.
 * Tracks raw mode reference counting and stdin ref/unref.
 */
export interface InkStdinState {
  stdin: NodeJS.ReadStream
  isRawModeSupported: boolean
  /** Number of active raw mode subscribers */
  rawModeCount: number
  setRawMode: (value: boolean) => void
  setBracketedPasteMode: (value: boolean) => void
  internal_eventEmitter: EventEmitter
}

export const InkStdinCtx = createContext<InkStdinState>({
  stdin: process.stdin,
  isRawModeSupported: process.stdin.isTTY ?? false,
  rawModeCount: 0,
  setRawMode: () => {},
  setBracketedPasteMode: () => {},
  internal_eventEmitter: new EventEmitter(),
})

/**
 * Create stdin state for a render instance.
 * Implements raw mode reference counting:
 * - First subscriber enables raw mode + refs stdin
 * - Last subscriber disables raw mode + unrefs stdin
 * - Throws if raw mode is not supported (stdin.isTTY is false)
 */
export function createInkStdinState(stdin: NodeJS.ReadStream, stdout?: NodeJS.WriteStream): InkStdinState {
  const isRawModeSupported = stdin.isTTY ?? false
  let rawModeCount = 0
  let bracketedPasteModeEnabledCount = 0
  const internal_eventEmitter = new EventEmitter()
  internal_eventEmitter.setMaxListeners(Infinity)

  const setRawMode = (value: boolean) => {
    if (!isRawModeSupported) {
      throw new Error(
        "Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#nested-ink-rendering",
      )
    }

    if (value) {
      rawModeCount++
      if (rawModeCount === 1) {
        // First subscriber: enable raw mode and ref stdin
        if (stdin.setRawMode) stdin.setRawMode(true)
        if (stdin.ref) stdin.ref()
      }
    } else {
      rawModeCount = Math.max(0, rawModeCount - 1)
      if (rawModeCount === 0) {
        // Last subscriber: disable raw mode and unref stdin
        if (stdin.setRawMode) stdin.setRawMode(false)
        if (stdin.unref) stdin.unref()
      }
    }
  }

  const setBracketedPasteMode = (value: boolean) => {
    const out = stdout ?? process.stdout
    if (!(out as any).isTTY) return

    if (value) {
      if (bracketedPasteModeEnabledCount === 0) {
        out.write("\x1b[?2004h")
      }
      bracketedPasteModeEnabledCount++
    } else {
      if (bracketedPasteModeEnabledCount === 0) return
      if (--bracketedPasteModeEnabledCount === 0) {
        out.write("\x1b[?2004l")
      }
    }
  }

  return {
    stdin,
    isRawModeSupported,
    rawModeCount: 0,
    setRawMode,
    setBracketedPasteMode,
    internal_eventEmitter,
  }
}
