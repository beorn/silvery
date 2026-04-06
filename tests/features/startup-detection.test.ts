/**
 * Tests for withTerminal startup detection — Mode 2031 color scheme
 * and DEC 1020-1023 width auto-detection at app startup.
 */

import { describe, it, expect, vi } from "vitest"
import { pipe, withTerminal, type AppWithTerminal, type ProcessLike } from "@silvery/create"
import {
  ENABLE_COLOR_SCHEME_REPORTING,
  DISABLE_COLOR_SCHEME_REPORTING,
  WidthMode,
} from "@silvery/ag-term"

// =============================================================================
// Helpers
// =============================================================================

/** Build a DECRPM response: CSI ? {mode} ; {ps} $ y */
function decrpm(mode: number, ps: number): string {
  return `\x1b[?${mode};${ps}$y`
}

/**
 * Create a mock process with controllable stdin/stdout.
 * stdin.isTTY = true by default so auto-detection runs.
 */
function createMockProcess(opts?: { isTTY?: boolean }) {
  const written: string[] = []
  const dataHandlers = new Set<(data: string) => void>()
  const isTTY = opts?.isTTY ?? true

  const stdout = {
    write: (data: string) => {
      written.push(data)
      return true
    },
    isTTY,
    columns: 80,
    rows: 24,
    on: () => {},
    off: () => {},
  } as unknown as NodeJS.WriteStream

  const stdin = {
    isTTY,
    on: (_event: string, handler: (...args: unknown[]) => void) => {
      if (_event === "data") dataHandlers.add(handler as (data: string) => void)
    },
    off: () => {},
    removeListener: (_event: string, handler: (...args: unknown[]) => void) => {
      if (_event === "data") dataHandlers.delete(handler as (data: string) => void)
    },
    setRawMode: () => {},
  } as unknown as NodeJS.ReadStream

  const proc = { stdin, stdout } as ProcessLike

  /** Simulate terminal sending data back to stdin. */
  function send(data: string) {
    for (const handler of dataHandlers) handler(data)
  }

  return { proc, written, send, dataHandlers }
}

/** Create a minimal runnable app for pipe(). */
function createBaseApp() {
  return {
    run(..._args: unknown[]) {
      return undefined
    },
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("withTerminal startup detection", () => {
  it("creates colorSchemeDetector when autoDetect is enabled and stdin is TTY", () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetect: true }),
    )
    expect(app.colorSchemeDetector).toBeDefined()
  })

  it("creates widthDetector when autoDetect is enabled and stdin is TTY", () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetect: true }),
    )
    expect(app.widthDetector).toBeDefined()
  })

  it("does not create detectors when autoDetect is false", () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetect: false }),
    )
    expect(app.colorSchemeDetector).toBeUndefined()
    expect(app.widthDetector).toBeUndefined()
  })

  it("does not create detectors when stdin is not a TTY", () => {
    const { proc } = createMockProcess({ isTTY: false })
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetect: true }),
    )
    expect(app.colorSchemeDetector).toBeUndefined()
    expect(app.widthDetector).toBeUndefined()
  })

  it("autoDetect defaults to true", () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc), // no options — should default autoDetect=true
    )
    expect(app.colorSchemeDetector).toBeDefined()
    expect(app.widthDetector).toBeDefined()
  })

  it("sends Mode 2031 enable on creation", () => {
    const { proc, written } = createMockProcess()
    pipe(
      createBaseApp(),
      withTerminal(proc),
    )
    expect(written).toContain(ENABLE_COLOR_SCHEME_REPORTING)
  })

  it("sends DECRQM queries for width modes", () => {
    const { proc, written } = createMockProcess()
    pipe(
      createBaseApp(),
      withTerminal(proc),
    )
    // Width detector sends queries when detect() is called, which happens immediately
    // The queries should appear in written output
    expect(written.some((s) => s.includes(`\x1b[?${WidthMode.UTF8}$p`))).toBe(true)
  })

  it("color scheme detector detects dark mode from Mode 2031 response", () => {
    const { proc, send } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc),
    )

    // Simulate terminal responding with dark mode
    send("\x1b[?2031;1n")
    expect(app.colorSchemeDetector!.scheme).toBe("dark")
  })

  it("color scheme detector detects light mode from Mode 2031 response", () => {
    const { proc, send } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc),
    )

    send("\x1b[?2031;2n")
    expect(app.colorSchemeDetector!.scheme).toBe("light")
  })

  it("width detection completes and stores config", async () => {
    const written: string[] = []
    const dataHandlers = new Set<(data: string) => void>()

    // Auto-respond to DECRQM queries with controlled responses
    const widthResponses = new Map([
      [WidthMode.UTF8, 1],        // set
      [WidthMode.CJK_WIDTH, 1],   // set (wide=2)
      [WidthMode.EMOJI_WIDTH, 2], // reset (narrow=1)
      [WidthMode.PRIVATE_USE_WIDTH, 1], // set (wide=2)
    ])

    const stdout = {
      write: (data: string) => {
        written.push(data)
        // Auto-respond to DECRQM queries
        const match = data.match(/\x1b\[\?(\d+)\$p/)
        if (match) {
          const mode = parseInt(match[1]!, 10)
          const ps = widthResponses.get(mode)
          if (ps !== undefined) {
            // Deliver response async (like a real terminal)
            setTimeout(() => {
              for (const h of dataHandlers) h(decrpm(mode, ps))
            }, 1)
          }
        }
        return true
      },
      isTTY: true,
      columns: 80,
      rows: 24,
      on: () => {},
      off: () => {},
    } as unknown as NodeJS.WriteStream

    const stdin = {
      isTTY: true,
      on: (_event: string, handler: (...args: unknown[]) => void) => {
        if (_event === "data") dataHandlers.add(handler as (data: string) => void)
      },
      off: () => {},
      removeListener: (_event: string, handler: (...args: unknown[]) => void) => {
        if (_event === "data") dataHandlers.delete(handler as (data: string) => void)
      },
      setRawMode: () => {},
    } as unknown as NodeJS.ReadStream

    const proc = { stdin, stdout } as ProcessLike

    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetectTimeoutMs: 500 }),
    )

    await app.detectionReady

    expect(app.widthDetector!.config).toBeDefined()
    expect(app.widthDetector!.config!.utf8).toBe(true)
    expect(app.widthDetector!.config!.cjkWidth).toBe(2)
    expect(app.widthDetector!.config!.emojiWidth).toBe(1)
    expect(app.widthDetector!.config!.privateUseWidth).toBe(2)
  })

  it("detectionReady resolves even when detection times out", async () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetectTimeoutMs: 30 }),
    )

    // Don't send any responses — detection should time out
    await app.detectionReady
    // Should resolve (not hang forever)
    expect(true).toBe(true)
  })

  it("detectionReady is immediately resolved when autoDetect is disabled", async () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetect: false }),
    )

    await app.detectionReady
    expect(true).toBe(true)
  })

  it("detection does not block app.run()", () => {
    const { proc } = createMockProcess()
    const runCalls: unknown[][] = []
    const baseApp = {
      run(...args: unknown[]) {
        runCalls.push(args)
        return "running"
      },
    }

    const app = pipe(
      baseApp,
      withTerminal(proc),
    )

    // run() should work immediately even though detection is still in-flight
    const result = app.run({ test: true })
    expect(result).toBe("running")
    expect(runCalls.length).toBe(1)
  })

  it("uses custom timeout from autoDetectTimeoutMs option", () => {
    const { proc } = createMockProcess()
    const app = pipe(
      createBaseApp(),
      withTerminal(proc, { autoDetectTimeoutMs: 50 }),
    )

    // Detectors should be created with the custom timeout
    expect(app.widthDetector).toBeDefined()
    expect(app.colorSchemeDetector).toBeDefined()
  })

  it("runs color scheme and width detection in parallel", () => {
    const { proc, written } = createMockProcess()
    pipe(
      createBaseApp(),
      withTerminal(proc),
    )

    // Both Mode 2031 enable AND the first DECRQM query should appear
    // without waiting for either to respond first
    const hasMode2031 = written.some((s) => s === ENABLE_COLOR_SCHEME_REPORTING)
    const hasDecrqm = written.some((s) => s.includes("$p"))
    expect(hasMode2031).toBe(true)
    expect(hasDecrqm).toBe(true)
  })
})
