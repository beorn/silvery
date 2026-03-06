/**
 * Tests for terminal lifecycle events (suspend/resume, interrupt).
 *
 * These tests verify the escape sequence generation and state management
 * of the terminal lifecycle system. They use mock streams to avoid
 * actually suspending the test process.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  captureTerminalState,
  restoreTerminalState,
  resumeTerminalState,
  performSuspend,
  CTRL_C,
  CTRL_Z,
  type TerminalState,
} from "../src/runtime/terminal-lifecycle.js"

// ============================================================================
// Helpers
// ============================================================================

function createMockStdout() {
  const written: string[] = []
  const emitted: string[] = []
  return {
    fd: -1, // writeSync will fail, triggering the async fallback
    write: vi.fn((data: string) => {
      written.push(data)
      return true
    }),
    emit: vi.fn((event: string) => {
      emitted.push(event)
      return true
    }),
    written,
    emitted,
  } as unknown as NodeJS.WriteStream & { written: string[]; emitted: string[] }
}

function createMockStdin(options: { isTTY?: boolean; isRaw?: boolean } = {}) {
  return {
    isTTY: options.isTTY ?? true,
    isRaw: options.isRaw ?? true,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
  } as unknown as NodeJS.ReadStream & { setRawMode: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> }
}

// ============================================================================
// captureTerminalState
// ============================================================================

describe("captureTerminalState", () => {
  it("captures full state from options", () => {
    const state = captureTerminalState({
      alternateScreen: true,
      cursorHidden: true,
      mouse: true,
      kitty: true,
      kittyFlags: 3,
      bracketedPaste: true,
      rawMode: true,
    })

    expect(state).toEqual({
      rawMode: true,
      alternateScreen: true,
      cursorHidden: true,
      mouseEnabled: true,
      kittyEnabled: true,
      kittyFlags: 3,
      bracketedPaste: true,
    })
  })

  it("uses sensible defaults", () => {
    const state = captureTerminalState({})

    expect(state).toEqual({
      rawMode: true,
      alternateScreen: false,
      cursorHidden: true,
      mouseEnabled: false,
      kittyEnabled: false,
      kittyFlags: 1,
      bracketedPaste: false,
    })
  })

  it("captures partial state", () => {
    const state = captureTerminalState({
      alternateScreen: true,
      mouse: true,
    })

    expect(state.alternateScreen).toBe(true)
    expect(state.mouseEnabled).toBe(true)
    expect(state.kittyEnabled).toBe(false)
    expect(state.bracketedPaste).toBe(false)
  })
})

// ============================================================================
// restoreTerminalState
// ============================================================================

describe("restoreTerminalState", () => {
  it("writes restore sequences via async fallback when fd is invalid", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()

    restoreTerminalState(stdout, stdin)

    // Should have called write (fd=-1 causes writeSync to fail)
    expect(stdout.write).toHaveBeenCalled()
    const output = stdout.written.join("")

    // Verify essential restore sequences are present
    expect(output).toContain("\x1b[0m") // Reset SGR
    expect(output).toContain("\x1b[0 q") // Reset cursor style (DECSCUSR 0)
    expect(output).toContain("\x1b[?25h") // Show cursor
    expect(output).toContain("\x1b[?1049l") // Exit alt screen
    expect(output).toContain("\x1b[?2004l") // Disable bracketed paste
    expect(output).toContain("\x1b[<u") // Disable Kitty keyboard (CSI < u)
  })

  it("disables raw mode on stdin", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin({ isTTY: true, isRaw: true })

    restoreTerminalState(stdout, stdin)

    expect(stdin.setRawMode).toHaveBeenCalledWith(false)
  })

  it("skips raw mode disable when not TTY", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin({ isTTY: false })

    restoreTerminalState(stdout, stdin)

    expect(stdin.setRawMode).not.toHaveBeenCalled()
  })

  it("skips raw mode disable when not in raw mode", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin({ isTTY: true, isRaw: false })

    restoreTerminalState(stdout, stdin)

    expect(stdin.setRawMode).not.toHaveBeenCalled()
  })
})

// ============================================================================
// resumeTerminalState
// ============================================================================

describe("resumeTerminalState", () => {
  it("restores full TUI state", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin({ isTTY: true })

    const state: TerminalState = {
      rawMode: true,
      alternateScreen: true,
      cursorHidden: true,
      mouseEnabled: true,
      kittyEnabled: true,
      kittyFlags: 3,
      bracketedPaste: true,
    }

    resumeTerminalState(state, stdout, stdin)

    // Should re-enable raw mode
    expect(stdin.setRawMode).toHaveBeenCalledWith(true)
    expect(stdin.resume).toHaveBeenCalled()

    // Should have written via async fallback (fd=-1)
    expect(stdout.write).toHaveBeenCalled()
    const output = stdout.written.join("")

    // Verify resume sequences
    expect(output).toContain("\x1b[?1049h") // Enter alt screen
    expect(output).toContain("\x1b[2J\x1b[H") // Clear + home
    expect(output).toContain("\x1b[?25l") // Hide cursor
    expect(output).toContain("\x1b[>3u") // Kitty keyboard (flags=3)
    expect(output).toContain("\x1b[?2004h") // Bracketed paste

    // Mouse tracking sequences
    expect(output).toContain("\x1b[?1000h") // Basic mouse
    expect(output).toContain("\x1b[?1002h") // Button-event mouse
    expect(output).toContain("\x1b[?1006h") // SGR mouse

    // Emit synthetic resize for full redraw
    expect(stdout.emitted).toContain("resize")
  })

  it("skips protocols that were not enabled", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin({ isTTY: true })

    const state: TerminalState = {
      rawMode: true,
      alternateScreen: false,
      cursorHidden: false,
      mouseEnabled: false,
      kittyEnabled: false,
      kittyFlags: 1,
      bracketedPaste: false,
    }

    resumeTerminalState(state, stdout, stdin)

    const output = stdout.written.join("")

    // Should NOT contain protocol-specific sequences
    expect(output).not.toContain("\x1b[?1049h") // No alt screen
    expect(output).not.toContain("\x1b[?25l") // No hide cursor
    expect(output).not.toContain("\x1b[?1000h") // No mouse
    expect(output).not.toContain("\x1b[>") // No kitty keyboard
    expect(output).not.toContain("\x1b[?2004h") // No bracketed paste

    // Should still clear screen
    expect(output).toContain("\x1b[2J\x1b[H")
  })

  it("skips raw mode when not TTY", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin({ isTTY: false })

    const state: TerminalState = {
      rawMode: true,
      alternateScreen: false,
      cursorHidden: false,
      mouseEnabled: false,
      kittyEnabled: false,
      kittyFlags: 1,
      bracketedPaste: false,
    }

    resumeTerminalState(state, stdout, stdin)

    expect(stdin.setRawMode).not.toHaveBeenCalled()
  })
})

// ============================================================================
// performSuspend
// ============================================================================

describe("performSuspend", () => {
  let originalKill: typeof process.kill
  let originalOnce: typeof process.once

  beforeEach(() => {
    originalKill = process.kill
    originalOnce = process.once
  })

  it("restores terminal and sends SIGTSTP", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()

    // Mock process.kill to prevent actual signal
    let sigtstpSent = false
    process.kill = vi.fn((_pid: number, sig?: string | number) => {
      if (sig === "SIGTSTP") sigtstpSent = true
      return true
    })

    // Mock process.once to capture the SIGCONT handler
    let sigcontHandler: (() => void) | null = null
    process.once = vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (event === "SIGCONT") sigcontHandler = handler
      return process
    }) as any

    const state: TerminalState = {
      rawMode: true,
      alternateScreen: true,
      cursorHidden: true,
      mouseEnabled: false,
      kittyEnabled: false,
      kittyFlags: 1,
      bracketedPaste: false,
    }

    const onResume = vi.fn()
    performSuspend(state, stdout, stdin, onResume)

    // Should have disabled raw mode (via restoreTerminalState)
    expect(stdin.setRawMode).toHaveBeenCalledWith(false)

    // Should have sent SIGTSTP
    expect(sigtstpSent).toBe(true)

    // Should have registered SIGCONT handler
    expect(sigcontHandler).not.toBeNull()

    // Simulate resume (SIGCONT)
    // Reset mocks to track resume sequences
    const resumeStdout = createMockStdout()
    const resumeStdin = createMockStdin({ isTTY: true })

    // We can't easily call sigcontHandler with different streams,
    // but we can verify it was registered
    expect(process.once).toHaveBeenCalledWith("SIGCONT", expect.any(Function))

    // Restore
    process.kill = originalKill
    process.once = originalOnce
  })

  it("calls onResume callback after SIGCONT", () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()

    let sigcontHandler: (() => void) | null = null
    process.kill = vi.fn(() => true)
    process.once = vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (event === "SIGCONT") sigcontHandler = handler
      return process
    }) as any

    const state: TerminalState = {
      rawMode: true,
      alternateScreen: false,
      cursorHidden: false,
      mouseEnabled: false,
      kittyEnabled: false,
      kittyFlags: 1,
      bracketedPaste: false,
    }

    const onResume = vi.fn()
    performSuspend(state, stdout, stdin, onResume)

    // Simulate SIGCONT
    expect(sigcontHandler).not.toBeNull()
    sigcontHandler!()

    // onResume should have been called
    expect(onResume).toHaveBeenCalled()

    // Restore
    process.kill = originalKill
    process.once = originalOnce
  })
})

// ============================================================================
// Constants
// ============================================================================

describe("raw byte constants", () => {
  it("CTRL_C is correct", () => {
    expect(CTRL_C).toBe("\x03")
  })

  it("CTRL_Z is correct", () => {
    expect(CTRL_Z).toBe("\x1a")
  })
})

// ============================================================================
// Integration: capture -> restore -> resume round-trip
// ============================================================================

describe("state round-trip", () => {
  it("capture -> restore -> resume preserves protocol state", () => {
    // Capture
    const state = captureTerminalState({
      alternateScreen: true,
      cursorHidden: true,
      mouse: true,
      kitty: true,
      kittyFlags: 5,
      bracketedPaste: true,
      rawMode: true,
    })

    // Restore (simulate suspend)
    const restoreStdout = createMockStdout()
    const restoreStdin = createMockStdin()
    restoreTerminalState(restoreStdout, restoreStdin)

    const restoreOutput = restoreStdout.written.join("")
    // Verify restore disables things
    expect(restoreOutput).toContain("\x1b[?1049l") // Exit alt screen
    expect(restoreOutput).toContain("\x1b[?25h") // Show cursor
    expect(restoreStdin.setRawMode).toHaveBeenCalledWith(false)

    // Resume (simulate SIGCONT)
    const resumeStdout = createMockStdout()
    const resumeStdin = createMockStdin({ isTTY: true })
    resumeTerminalState(state, resumeStdout, resumeStdin)

    const resumeOutput = resumeStdout.written.join("")
    // Verify resume re-enables everything
    expect(resumeOutput).toContain("\x1b[?1049h") // Enter alt screen
    expect(resumeOutput).toContain("\x1b[?25l") // Hide cursor
    expect(resumeOutput).toContain("\x1b[>5u") // Kitty flags=5
    expect(resumeOutput).toContain("\x1b[?1000h") // Mouse
    expect(resumeOutput).toContain("\x1b[?2004h") // Bracketed paste
    expect(resumeStdin.setRawMode).toHaveBeenCalledWith(true)
  })
})
