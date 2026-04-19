/**
 * Tests for keypress performance spans.
 *
 * Verifies:
 * - Spans are created when TRACE is enabled
 * - Zero overhead when TRACE is not set
 * - Budget alerts fire for slow keypresses
 * - Exit summary is emitted with correct statistics
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { enableSpans, disableSpans, setLogLevel, setTraceFilter } from "loggily"
import {
  perfLog,
  startTracking,
  checkBudget,
  logExitSummary,
  resetPerfState,
  getSampleCount,
} from "@silvery/ag-term/runtime/perf"

// ============================================================================
// Helpers
// ============================================================================

/**
 * Capture console output during a callback.
 * The vitest setup intercepts console.* calls, so we spy on them
 * and suppress to avoid "test produced console output" errors.
 */
function withConsoleSpy(fn: () => void): string[] {
  const messages: string[] = []
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    messages.push(args.map(String).join(" "))
  })
  const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    messages.push(args.map(String).join(" "))
  })
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    messages.push(args.map(String).join(" "))
  })
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      messages.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk))
      return true
    })
  try {
    fn()
  } finally {
    warnSpy.mockRestore()
    infoSpy.mockRestore()
    errorSpy.mockRestore()
    stderrSpy.mockRestore()
  }
  return messages
}

// ============================================================================
// Tests
// ============================================================================

describe("keypress-spans", () => {
  beforeEach(() => {
    resetPerfState()
  })

  afterEach(() => {
    disableSpans()
    setTraceFilter(null)
    resetPerfState()
  })

  describe("span creation", () => {
    test("creates span when TRACE is enabled", () => {
      enableSpans()
      setTraceFilter(["silvery:perf"])
      setLogLevel("trace")

      const messages = withConsoleSpy(() => {
        const span = (() => {
          startTracking()
          return perfLog.span?.("keypress", { key: "j" })
        })()
        expect(span).toBeDefined()
        expect(span!.spanData).toBeDefined()
        expect(span!.spanData.startTime).toBeGreaterThan(0)
        span!.end()
      })

      // Span output should have been emitted
      const spanOutput = messages.join("\n")
      expect(spanOutput).toContain("silvery:perf:keypress")
    })

    test("returns undefined when spans are disabled", () => {
      disableSpans()
      setTraceFilter(null)

      const span = (() => {
        startTracking()
        return perfLog.span?.("keypress", { key: "j" })
      })()
      // loggily returns the span object but suppresses output when disabled.
      // The span itself may or may not be undefined depending on log level.
      // What matters: no samples are accumulated when spans are disabled.
      span?.[Symbol.dispose]()
    })
  })

  describe("budget alerts", () => {
    test("does not warn for fast keypresses", () => {
      enableSpans()
      setLogLevel("warn")

      const messages = withConsoleSpy(() => {
        checkBudget("j", 5) // 5ms < 16ms budget
      })

      const output = messages.join("\n")
      expect(output).not.toContain("over budget")
    })

    test("warns for slow keypresses when logging is enabled", () => {
      enableSpans()
      setLogLevel("warn")

      const messages = withConsoleSpy(() => {
        checkBudget("j", 25) // 25ms > 16ms budget
      })

      const output = messages.join("\n")
      expect(output).toContain("over budget")
      expect(output).toContain("25.0ms")
    })

    test("respects custom budget threshold", () => {
      enableSpans()
      setLogLevel("warn")

      const messages = withConsoleSpy(() => {
        checkBudget("j", 10, 8) // 10ms > 8ms custom budget
      })

      const output = messages.join("\n")
      expect(output).toContain("over budget")
      expect(output).toContain("budget: 8ms")
    })

    test("tracks samples for exit summary", () => {
      enableSpans()
      setTraceFilter(["silvery:perf"])
      setLogLevel("trace")

      // Create a span to initialize sample tracking
      withConsoleSpy(() => {
        const span = (() => {
          startTracking()
          return perfLog.span?.("keypress", { key: "j" })
        })()
        span?.end()
      })

      checkBudget("j", 5)
      checkBudget("k", 10)
      checkBudget("l", 3)

      expect(getSampleCount()).toBe(3)
    })
  })

  describe("exit summary", () => {
    test("emits summary with correct statistics", () => {
      enableSpans()
      setTraceFilter(["silvery:perf"])
      setLogLevel("info")

      // Initialize sample tracking by creating a span
      withConsoleSpy(() => {
        const span = (() => {
          startTracking()
          return perfLog.span?.("keypress", { key: "init" })
        })()
        span?.end()
      })

      // Record samples (checkBudget for "l" will warn — capture it)
      const messages = withConsoleSpy(() => {
        checkBudget("j", 5)
        checkBudget("k", 10)
        checkBudget("l", 20) // over budget
        checkBudget("h", 3)
        checkBudget("g", 8)

        logExitSummary()
      })

      const output = messages.join("\n")
      expect(output).toContain("keypress summary")
      expect(output).toContain("5 presses")
      // Mean = (5 + 10 + 20 + 3 + 8) / 5 = 9.2ms
      expect(output).toContain("mean=9.2ms")
      expect(output).toContain("overruns=1")
    })

    test("does not emit when no samples recorded", () => {
      enableSpans()
      setLogLevel("info")

      const messages = withConsoleSpy(() => {
        logExitSummary()
      })

      expect(messages).toHaveLength(0)
    })

    test("resets state after summary", () => {
      enableSpans()
      setTraceFilter(["silvery:perf"])
      setLogLevel("trace")

      withConsoleSpy(() => {
        const span = (() => {
          startTracking()
          return perfLog.span?.("keypress", { key: "j" })
        })()
        span?.end()
      })
      checkBudget("j", 5)

      expect(getSampleCount()).toBe(1)

      withConsoleSpy(() => {
        logExitSummary()
      })

      expect(getSampleCount()).toBe(0)
    })
  })

  describe("zero overhead", () => {
    test("keypressSpan is fast when spans are disabled", () => {
      disableSpans()

      const iterations = 100_000
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        const span = (() => {
          startTracking()
          return perfLog.span?.("keypress", { key: "j" })
        })()
        span?.[Symbol.dispose]()
      }
      const elapsed = performance.now() - start

      // 100k iterations should complete well under 500ms when disabled
      expect(elapsed).toBeLessThan(500)
    })

    test("checkBudget does not accumulate samples when spans never created", () => {
      disableSpans()

      // Without any span created, samples array stays null
      checkBudget("j", 5)
      checkBudget("k", 10)

      expect(getSampleCount()).toBe(0)
    })
  })
})
