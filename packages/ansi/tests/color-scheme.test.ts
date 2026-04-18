/**
 * Tests for Mode 2031 color scheme detection.
 */

import { describe, expect, it, vi } from "vitest"
import {
  createBgModeDetector,
  parseBgModeResponse,
  ENABLE_BG_MODE_REPORTING,
  DISABLE_BG_MODE_REPORTING,
} from "../src/color-scheme.ts"

// =============================================================================
// parseBgModeResponse
// =============================================================================

describe("parseBgModeResponse", () => {
  it("parses dark scheme response", () => {
    expect(parseBgModeResponse("\x1b[?2031;1n")).toBe("dark")
  })

  it("parses light scheme response", () => {
    expect(parseBgModeResponse("\x1b[?2031;2n")).toBe("light")
  })

  it("returns null for unrelated input", () => {
    expect(parseBgModeResponse("hello")).toBeNull()
    expect(parseBgModeResponse("\x1b[?2031h")).toBeNull()
    expect(parseBgModeResponse("\x1b[?1049h")).toBeNull()
  })

  it("extracts response from mixed input", () => {
    // Response may arrive with other data in the same chunk
    expect(parseBgModeResponse("junk\x1b[?2031;1nmore")).toBe("dark")
    expect(parseBgModeResponse("\x1b[?25h\x1b[?2031;2n")).toBe("light")
  })
})

// =============================================================================
// createBgModeDetector
// =============================================================================

describe("createBgModeDetector", () => {
  function createMockTerminal() {
    const written: string[] = []
    const handlers = new Set<(data: string) => void>()

    return {
      written,
      write: (data: string) => written.push(data),
      onData: (handler: (data: string) => void) => {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      /** Simulate terminal sending data back */
      send: (data: string) => {
        for (const handler of handlers) handler(data)
      },
    }
  }

  it("starts with unknown scheme", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })
    expect(detector.scheme).toBe("unknown")
  })

  it("detects dark scheme from Mode 2031 response", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    detector.start()
    expect(terminal.written).toContain(ENABLE_BG_MODE_REPORTING)

    // Simulate terminal responding with dark mode
    terminal.send("\x1b[?2031;1n")
    expect(detector.scheme).toBe("dark")
  })

  it("detects light scheme from Mode 2031 response", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    detector.start()
    terminal.send("\x1b[?2031;2n")
    expect(detector.scheme).toBe("light")
  })

  it("falls back to macOS detection when no 2031 response", async () => {
    vi.useFakeTimers()

    const terminal = createMockTerminal()
    const fallback = vi.fn(() => "dark" as const)
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
      fallback,
      timeoutMs: 100,
    })

    detector.start()

    // No terminal response — timeout triggers fallback
    expect(detector.scheme).toBe("unknown")
    await vi.advanceTimersByTimeAsync(100)
    expect(fallback).toHaveBeenCalled()
    expect(detector.scheme).toBe("dark")

    vi.useRealTimers()
  })

  it("does not call fallback when 2031 responds before timeout", async () => {
    vi.useFakeTimers()

    const terminal = createMockTerminal()
    const fallback = vi.fn(() => "dark" as const)
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
      fallback,
      timeoutMs: 200,
    })

    detector.start()
    terminal.send("\x1b[?2031;2n") // light response before timeout

    await vi.advanceTimersByTimeAsync(200)
    expect(fallback).not.toHaveBeenCalled()
    expect(detector.scheme).toBe("light")

    vi.useRealTimers()
  })

  it("subscribes to scheme changes", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    const changes: string[] = []
    detector.subscribe((scheme) => changes.push(scheme))

    detector.start()
    terminal.send("\x1b[?2031;1n") // dark
    terminal.send("\x1b[?2031;2n") // change to light
    terminal.send("\x1b[?2031;1n") // change back to dark

    expect(changes).toEqual(["dark", "light", "dark"])
  })

  it("does not notify when scheme stays the same", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    const changes: string[] = []
    detector.subscribe((scheme) => changes.push(scheme))

    detector.start()
    terminal.send("\x1b[?2031;1n") // dark
    terminal.send("\x1b[?2031;1n") // still dark — no change notification

    expect(changes).toEqual(["dark"])
  })

  it("unsubscribe removes listener", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    const changes: string[] = []
    const unsub = detector.subscribe((scheme) => changes.push(scheme))

    detector.start()
    terminal.send("\x1b[?2031;1n") // dark
    unsub()
    terminal.send("\x1b[?2031;2n") // light — should not be received

    expect(changes).toEqual(["dark"])
  })

  it("dispose sends disable sequence", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    detector.start()
    terminal.written.length = 0 // clear

    detector[Symbol.dispose]()
    expect(terminal.written).toContain(DISABLE_BG_MODE_REPORTING)
  })

  it("stop sends disable sequence and cleans up", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    const changes: string[] = []
    detector.subscribe((scheme) => changes.push(scheme))

    detector.start()
    terminal.send("\x1b[?2031;1n")
    expect(changes).toEqual(["dark"])

    detector.stop()
    expect(terminal.written).toContain(DISABLE_BG_MODE_REPORTING)

    // No more notifications after stop
    terminal.send("\x1b[?2031;2n")
    expect(changes).toEqual(["dark"])
  })

  it("works with using pattern", () => {
    const terminal = createMockTerminal()
    {
      using detector = createBgModeDetector({
        write: terminal.write,
        onData: terminal.onData,
      })
      detector.start()
      terminal.send("\x1b[?2031;2n")
      expect(detector.scheme).toBe("light")
    }
    // After scope exit, disable should have been sent
    expect(terminal.written.filter((s) => s === DISABLE_BG_MODE_REPORTING)).toHaveLength(1)
  })

  it("ignores data after stop", () => {
    const terminal = createMockTerminal()
    const detector = createBgModeDetector({
      write: terminal.write,
      onData: terminal.onData,
    })

    detector.start()
    detector.stop()

    // Sending data after stop should not throw or change scheme
    terminal.send("\x1b[?2031;1n")
    // scheme stays "unknown" because we stopped before receiving any response
    expect(detector.scheme).toBe("unknown")
  })

  it("constants match expected escape sequences", () => {
    expect(ENABLE_BG_MODE_REPORTING).toBe("\x1b[?2031h")
    expect(DISABLE_BG_MODE_REPORTING).toBe("\x1b[?2031l")
  })
})
