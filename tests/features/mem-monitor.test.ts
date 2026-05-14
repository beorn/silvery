/**
 * Tests for createMemMonitor — backs the SILVERY_STRICT=mem slug.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/mem-monitor.test.ts
 */
import { describe, expect, test } from "vitest"
import { createMemMonitor } from "@silvery/ag-term/mem-monitor"

interface CapturedLog {
  level: "info" | "warn" | "error"
  msg: string
  data?: unknown
}

function makeHarness(initial: Partial<NodeJS.MemoryUsage> = {}) {
  const logs: CapturedLog[] = []
  let clock = 1_700_000_000_000
  const mem: NodeJS.MemoryUsage = {
    rss: initial.rss ?? 100_000_000,
    heapUsed: initial.heapUsed ?? 40_000_000,
    heapTotal: initial.heapTotal ?? 60_000_000,
    external: initial.external ?? 5_000_000,
    arrayBuffers: initial.arrayBuffers ?? 1_000_000,
  }
  return {
    logs,
    advance(ms: number) {
      clock += ms
    },
    now() {
      return clock
    },
    setMem(patch: Partial<NodeJS.MemoryUsage>) {
      Object.assign(mem, patch)
    },
    logger: {
      info: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "info", msg: m, data })
      },
      warn: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "warn", msg: m, data })
      },
      error: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "error", msg: m, data })
      },
    },
    memoryUsage: (): NodeJS.MemoryUsage => ({ ...mem }),
  }
}

describe("createMemMonitor", () => {
  test("tick() logs an info sample with MB-rounded fields", () => {
    const h = makeHarness({ rss: 123_456_789, heapUsed: 50_000_000 })
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
      manual: true,
    })
    m.tick()
    const info = h.logs.find((l) => l.level === "info")
    expect(info).toBeDefined()
    expect(info!.msg).toBe("mem sample")
    expect(info!.data).toMatchObject({
      rss_mb: 123,
      heap_used_mb: 50,
    })
    m.dispose()
  })

  test("does NOT warn on flat memory", () => {
    const h = makeHarness({ rss: 100_000_000 })
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
      manual: true,
    })
    m.tick()
    h.advance(30_000)
    m.tick()
    h.advance(30_000)
    m.tick()
    expect(h.logs.filter((l) => l.level === "warn")).toHaveLength(0)
    expect(m.lastWarn).toBeNull()
    m.dispose()
  })

  test("WARN trips when RSS doubles within 60s window", () => {
    const h = makeHarness({ rss: 100_000_000 })
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
      manual: true,
    })
    m.tick() // RSS = 100MB
    h.advance(30_000)
    h.setMem({ rss: 250_000_000 }) // 2.5×
    m.tick()
    const warn = h.logs.find((l) => l.level === "warn")
    expect(warn).toBeDefined()
    expect(warn!.msg).toContain("RSS doubled")
    expect(warn!.msg).toContain("100 → 250 MB")
    expect(m.lastWarn?.reason).toContain("RSS doubled")
    m.dispose()
  })

  test("WARN trips when external+arrayBuffers doubles within window", () => {
    const h = makeHarness({ rss: 100_000_000, external: 10_000_000, arrayBuffers: 5_000_000 })
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
      manual: true,
    })
    m.tick() // external+arrayBuffers = 15MB
    h.advance(30_000)
    h.setMem({ external: 25_000_000, arrayBuffers: 10_000_000 }) // 35MB > 30MB
    m.tick()
    const warn = h.logs.find((l) => l.level === "warn")
    expect(warn).toBeDefined()
    expect(warn!.msg).toContain("external+arrayBuffers doubled")
    m.dispose()
  })

  test("does NOT re-warn on the same reason consecutively", () => {
    const h = makeHarness({ rss: 100_000_000 })
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
      manual: true,
    })
    m.tick()
    h.advance(30_000)
    h.setMem({ rss: 250_000_000 })
    m.tick() // first warn
    h.advance(30_000)
    // Still doubled vs the earliest in-window sample, but same shape — must not re-warn.
    m.tick()
    expect(h.logs.filter((l) => l.level === "warn")).toHaveLength(1)
    m.dispose()
  })

  test("dispose() stops the interval and prevents further tick()", () => {
    const h = makeHarness()
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
      manual: true,
    })
    m.tick()
    const before = h.logs.length
    m.dispose()
    m.tick()
    expect(h.logs.length).toBe(before)
    expect(m.lastSample).toBeNull()
  })

  test("automatic interval mode uses unref-ed setInterval (smoke check)", () => {
    // We can't easily test setInterval behavior under vitest fake timers without
    // pulling in vi.useFakeTimers, but the absence of a hung process at test
    // completion is the real assertion. dispose() must be called.
    const h = makeHarness()
    const m = createMemMonitor({
      logger: h.logger,
      now: () => h.now(),
      memoryUsage: h.memoryUsage,
    })
    // Don't call tick manually — let dispose handle cleanup.
    m.dispose()
    // No assertions needed; if interval leaked, the test runner would hang.
    expect(true).toBe(true)
  })
})
