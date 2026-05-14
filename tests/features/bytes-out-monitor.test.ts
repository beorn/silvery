/**
 * Tests for createBytesOutMonitor — backs the SILVERY_STRICT=bytes_out slug.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/bytes-out-monitor.test.ts
 */
import { describe, expect, test } from "vitest"
import { createBytesOutMonitor } from "@silvery/ag-term/bytes-out-monitor"

interface CapturedLog {
  level: "warn" | "error"
  msg: string
  data?: unknown
}

function makeHarness() {
  const logs: CapturedLog[] = []
  const files: Array<{ path: string; contents: string }> = []
  const snapshots: string[] = []
  let clock = 1_700_000_000_000 // arbitrary fixed epoch
  return {
    logs,
    files,
    snapshots,
    advance(ms: number) {
      clock += ms
    },
    now() {
      return clock
    },
    logger: {
      warn: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "warn", msg: m, data })
      },
      error: (msg: string | (() => string), data?: unknown) => {
        const m = typeof msg === "function" ? msg() : msg
        logs.push({ level: "error", msg: m, data })
      },
    },
    writeFile(path: string, contents: string) {
      files.push({ path, contents })
    },
    writeHeapSnapshot(path: string) {
      snapshots.push(path)
      return path
    },
  }
}

describe("createBytesOutMonitor", () => {
  test("does not trip below threshold", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    // 100 KB/s for 10s — well below 1 MB/s threshold.
    for (let i = 0; i < 20; i++) {
      m.recordWrite(i, 50_000) // 50 KB per frame
      h.advance(500) // 2 frames per second → 100 KB/s
    }

    expect(h.logs).toHaveLength(0)
    expect(m.lastTrip).toBeNull()
    m.dispose()
  })

  test("WARN trips at sustained 1 MB/s over 10s window", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    // 1 MB/s sustained: 200 KB every 200 ms = 1 MB/s — for 10 s.
    for (let i = 0; i < 50; i++) {
      m.recordWrite(i, 200_000)
      h.advance(200)
    }

    const warn = h.logs.find((l) => l.level === "warn")
    expect(warn).toBeDefined()
    expect(warn!.msg).toContain("WARN render-out sustained")
    expect(warn!.msg).toContain("MB/s exceeds 1 MB/s")
    expect(m.lastTrip?.kind).toBe("warn")
    expect(m.lastTrip?.snapshotPath).toBeUndefined()

    // Frame-summary file written, header + entries.
    const summary = h.files.find((f) => f.path.includes("bytes-out-warn"))
    expect(summary).toBeDefined()
    expect(summary!.contents).toMatch(/^# frameNum\tts\tbytes/)

    // No heap snapshot at WARN.
    expect(h.snapshots).toHaveLength(0)

    m.dispose()
  })

  test("PANIC trips at burst 100 MB/s over 2s window and writes heap snapshot", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    // 100 MB/s burst: 10 MB every 100 ms = 100 MB/s — for 2 s = 20 frames.
    for (let i = 0; i < 20; i++) {
      m.recordWrite(i, 10_000_000) // 10 MB per frame
      h.advance(100)
    }

    const panic = h.logs.find((l) => l.level === "error")
    expect(panic).toBeDefined()
    expect(panic!.msg).toContain("PANIC render-out burst")
    expect(panic!.msg).toContain("MB/s exceeds 100 MB/s")

    expect(m.lastTrip?.kind).toBe("panic")
    expect(m.lastTrip?.snapshotPath).toBeDefined()
    expect(m.lastTrip!.snapshotPath).toMatch(/silvery-firehose-.*\.heapsnapshot$/)

    // Frame-summary file written.
    const summary = h.files.find((f) => f.path.includes("bytes-out-panic"))
    expect(summary).toBeDefined()

    // Heap snapshot was attempted.
    expect(h.snapshots).toHaveLength(1)
    expect(h.snapshots[0]).toMatch(/silvery-firehose-/)

    m.dispose()
  })

  test("skipHeapSnapshot option suppresses snapshot at PANIC but still dumps summary", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      skipHeapSnapshot: true,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    for (let i = 0; i < 20; i++) {
      m.recordWrite(i, 10_000_000)
      h.advance(100)
    }

    expect(m.lastTrip?.kind).toBe("panic")
    expect(m.lastTrip?.snapshotPath).toBeUndefined()
    expect(h.snapshots).toHaveLength(0)
    // Summary still produced.
    expect(h.files.find((f) => f.path.includes("bytes-out-panic"))).toBeDefined()

    m.dispose()
  })

  test("WARN respects 10s cooldown — no double-trip", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    // First sustained period — trips.
    for (let i = 0; i < 50; i++) {
      m.recordWrite(i, 200_000)
      h.advance(200)
    }
    const firstWarnCount = h.logs.filter((l) => l.level === "warn").length
    expect(firstWarnCount).toBe(1)

    // Continue for half the cooldown window — must not re-trip.
    for (let i = 50; i < 75; i++) {
      m.recordWrite(i, 200_000)
      h.advance(200)
    }
    expect(h.logs.filter((l) => l.level === "warn").length).toBe(firstWarnCount)

    // After cooldown expires AND sustained-rate continues, a second trip is allowed.
    for (let i = 75; i < 150; i++) {
      m.recordWrite(i, 200_000)
      h.advance(200)
    }
    expect(h.logs.filter((l) => l.level === "warn").length).toBeGreaterThan(firstWarnCount)

    m.dispose()
  })

  test("frame summaries dump retains the last 100 frames", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    // Drive a WARN to force a dump.
    for (let i = 0; i < 50; i++) {
      m.recordWrite(i, 200_000)
      h.advance(200)
    }
    const summary = h.files.find((f) => f.path.includes("bytes-out-warn"))!
    const lines = summary.contents.trim().split("\n")
    // Header + at most FRAME_HISTORY (100) data lines.
    expect(lines.length).toBeLessThanOrEqual(1 + 100)
    expect(lines[0]).toMatch(/^# frameNum\tts\tbytes$/)

    m.dispose()
  })

  test("evicts entries older than 60s to keep memory bounded", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1_000_000, // unreachable — we just want recordWrite to run without tripping
      panicMbPerSec: 1_000_000,
      snapshotDir: "/tmp/test",
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    // 600 frames at 100ms intervals → 60 seconds of history.
    for (let i = 0; i < 600; i++) {
      m.recordWrite(i, 1_000)
      h.advance(100)
    }
    // Advance well past eviction horizon, then record once more.
    h.advance(120_000)
    m.recordWrite(600, 1_000)
    // After eviction, only the freshest record survives.
    expect(m.snapshotFrames().length).toBe(1)

    m.dispose()
  })

  test("dispose() makes recordWrite a no-op", () => {
    const h = makeHarness()
    const m = createBytesOutMonitor({
      warnMbPerSec: 1,
      panicMbPerSec: 100,
      logger: h.logger,
      now: () => h.now(),
      writeFile: h.writeFile,
      writeHeapSnapshot: h.writeHeapSnapshot,
    })

    m.recordWrite(0, 1_000_000)
    h.advance(1000)
    m.dispose()
    m.recordWrite(1, 999_000_000_000)
    expect(h.logs).toHaveLength(0)
    expect(m.snapshotFrames()).toHaveLength(0)
  })
})
