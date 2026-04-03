/**
 * Terminal Lifecycle Events
 *
 * Handles suspend/resume (Ctrl+Z/SIGCONT) and interrupt (Ctrl+C) for TUI apps.
 * When stdin is in raw mode, the terminal does not generate SIGTSTP/SIGINT for
 * Ctrl+Z/Ctrl+C. This module intercepts the raw bytes and manages the full
 * terminal state save/restore cycle.
 *
 * Inspired by ncurses (endwin/refresh), bubbletea, and Textual.
 *
 * Protocols managed:
 * - Raw mode (stdin)
 * - Alternate screen buffer (DEC private mode 1049)
 * - Cursor visibility (DEC private mode 25)
 * - Mouse tracking (modes 1000, 1002, 1006)
 * - Kitty keyboard protocol (CSI > flags u / CSI < u)
 * - Bracketed paste (DEC private mode 2004)
 * - SGR attributes (reset via CSI 0 m)
 */

import { writeSync } from "node:fs"
import { enableKittyKeyboard, disableKittyKeyboard, enableMouse, disableMouse, resetCursorStyle } from "../output"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for terminal lifecycle event handling.
 */
export interface TerminalLifecycleOptions {
  /** Handle Ctrl+Z by suspending the process. Default: true */
  suspendOnCtrlZ?: boolean
  /** Handle Ctrl+C by exiting the process. Default: true */
  exitOnCtrlC?: boolean
  /** Called before suspend. Return false to prevent. */
  onSuspend?: () => boolean | void
  /** Called after resume from suspend. */
  onResume?: () => void
  /** Called on Ctrl+C. Return false to prevent exit. */
  onInterrupt?: () => boolean | void
}

/**
 * Snapshot of terminal protocol state for save/restore across suspend/resume.
 */
export interface TerminalState {
  rawMode: boolean
  alternateScreen: boolean
  cursorHidden: boolean
  mouseEnabled: boolean
  kittyEnabled: boolean
  kittyFlags: number
  bracketedPaste: boolean
  focusReporting: boolean
}

// ============================================================================
// State Capture
// ============================================================================

/**
 * Capture the current terminal protocol state.
 *
 * This builds a TerminalState from the options passed to run()/createApp(),
 * since terminal state is not directly queryable from the OS.
 */
export function captureTerminalState(opts: {
  alternateScreen?: boolean
  cursorHidden?: boolean
  mouse?: boolean
  kitty?: boolean
  kittyFlags?: number
  bracketedPaste?: boolean
  rawMode?: boolean
  focusReporting?: boolean
}): TerminalState {
  return {
    rawMode: opts.rawMode ?? true,
    alternateScreen: opts.alternateScreen ?? false,
    cursorHidden: opts.cursorHidden ?? true,
    mouseEnabled: opts.mouse ?? false,
    kittyEnabled: opts.kitty ?? false,
    kittyFlags: opts.kittyFlags ?? 11, // DISAMBIGUATE(1) | REPORT_EVENTS(2) | REPORT_ALL_KEYS(8)
    bracketedPaste: opts.bracketedPaste ?? false,
    focusReporting: opts.focusReporting ?? false,
  }
}

// ============================================================================
// Restore (before suspend / on exit)
// ============================================================================

/**
 * Restore terminal to normal state before suspending or exiting.
 *
 * Uses writeSync for reliability during signal handling (async write
 * may not complete before the process suspends).
 *
 * Order matters: disable protocols first, then show cursor, then exit
 * alternate screen, then disable raw mode.
 */
export function restoreTerminalState(stdout: NodeJS.WriteStream, stdin: NodeJS.ReadStream): void {
  // Step 1: Stop consuming stdin — prevent processing of in-flight events
  try {
    stdin.removeAllListeners("data")
    stdin.pause()
  } catch {
    // Ignore — stdin may be closed
  }

  // Step 2: Send all protocol disable sequences
  const sequences = [
    "\x1b[0m", // Reset SGR attributes
    "\x1b[?1004l", // Disable focus reporting
    disableMouse(), // Disable all mouse tracking modes
    disableKittyKeyboard(), // Pop Kitty keyboard protocol
    "\x1b[?2004l", // Disable bracketed paste
    resetCursorStyle(), // Reset cursor shape to terminal default (DECSCUSR 0)
    "\x1b[?25h", // Show cursor
    "\x1b[?1049l", // Exit alternate screen
  ].join("")

  // Use writeSync for reliability during signal handlers — but only when stdout
  // is the real process.stdout. Mock stdouts have fd:1 which bypasses the mock.
  if (stdout === process.stdout) {
    try {
      writeSync((stdout as unknown as { fd: number }).fd, sequences)
    } catch {
      try {
        stdout.write(sequences)
      } catch {
        // Terminal may already be gone (e.g., SSH disconnect)
      }
    }
  } else {
    try {
      stdout.write(sequences)
    } catch {
      // Terminal may already be gone
    }
  }

  // Step 3: Drain in-flight stdin bytes — the terminal may have queued events
  // (Kitty key release, SGR mouse) before processing our disable sequences.
  // Discard them so they don't leak to the shell prompt.
  try {
    stdin.resume()
    while (stdin.read() !== null) {
      // discard buffered data
    }
    stdin.pause()
  } catch {
    // Ignore — best-effort drain
  }

  // Step 4: Disable raw mode on stdin
  if (stdin.isTTY && stdin.isRaw) {
    try {
      stdin.setRawMode(false)
    } catch {
      // Ignore - stdin may already be closed
    }
  }
}

// ============================================================================
// Resume (after SIGCONT)
// ============================================================================

/**
 * Re-enter TUI mode after resuming from suspend (SIGCONT).
 *
 * Restores all protocols that were active before suspend, in the correct
 * order: raw mode first, then alternate screen, then protocols, then
 * trigger a full redraw via synthetic resize.
 */
export function resumeTerminalState(state: TerminalState, stdout: NodeJS.WriteStream, stdin: NodeJS.ReadStream): void {
  // Re-enable raw mode first (needed to receive key input)
  if (state.rawMode && stdin.isTTY) {
    try {
      stdin.setRawMode(true)
      stdin.resume()
    } catch {
      // Ignore - may fail if stdin is closed
    }
  }

  // Build the sequence of escape codes to restore TUI state
  const sequences: string[] = []

  if (state.alternateScreen) {
    sequences.push("\x1b[?1049h") // Enter alternate screen
  }

  // Clear screen and home cursor (always needed after resume to get a clean slate)
  sequences.push("\x1b[2J\x1b[H")

  if (state.cursorHidden) {
    sequences.push("\x1b[?25l") // Hide cursor
  }

  if (state.kittyEnabled) {
    sequences.push(enableKittyKeyboard(state.kittyFlags as 1))
  }

  if (state.mouseEnabled) {
    sequences.push(enableMouse())
  }

  if (state.bracketedPaste) {
    sequences.push("\x1b[?2004h") // Enable bracketed paste
  }

  if (state.focusReporting) {
    sequences.push("\x1b[?1004h") // Enable focus reporting
  }

  // Write all sequences — use writeSync only for real process.stdout
  const joined = sequences.join("")
  if (stdout === process.stdout) {
    try {
      writeSync((stdout as unknown as { fd: number }).fd, joined)
    } catch {
      try {
        stdout.write(joined)
      } catch {
        // Terminal may be gone
      }
    }
  } else {
    try {
      stdout.write(joined)
    } catch {
      // Terminal may be gone
    }
  }

  // Emit synthetic resize to trigger full redraw.
  // The screen was cleared, so the runtime needs to render a complete frame.
  stdout.emit("resize")
}

// ============================================================================
// Suspend Flow
// ============================================================================

/**
 * Execute the full suspend flow: save state, restore terminal, SIGTSTP,
 * and set up SIGCONT handler to resume.
 *
 * @param state - Terminal state snapshot to restore on resume
 * @param stdout - Output stream
 * @param stdin - Input stream
 * @param onResume - Optional callback after resume
 */
export function performSuspend(
  state: TerminalState,
  stdout: NodeJS.WriteStream,
  stdin: NodeJS.ReadStream,
  onResume?: () => void,
): void {
  // Restore terminal to normal
  restoreTerminalState(stdout, stdin)

  // Register one-time SIGCONT handler BEFORE sending SIGTSTP
  process.once("SIGCONT", () => {
    // Re-enter TUI mode
    resumeTerminalState(state, stdout, stdin)
    onResume?.()
  })

  // Actually suspend the process
  process.kill(process.pid, "SIGTSTP")
}

// ============================================================================
// Raw byte constants
// ============================================================================

/** Ctrl+C raw byte (ETX - End of Text) */
export const CTRL_C = "\x03"

/** Ctrl+Z raw byte (SUB - Substitute) */
export const CTRL_Z = "\x1a"
