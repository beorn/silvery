/**
 * Auto-panic circuit-break — caps dump-file writes when panic loops.
 *
 * Regression for the 2026-05-13 overnight bleed: a fixture bug
 * (workspace.panes undefined) made every vitest worker test panic on
 * mount → 1,139 silvery-panic-*.txt files / 5.6 GB / 2h 25m / 100% CPU
 * on a single worker before the user killed it. The panic feature was
 * a safety net; without a circuit-breaker it became a DoS multiplier.
 *
 * What this test pins:
 *   1. After MAX_PANIC_DUMPS_PER_RUN panics in one process, recordPanic
 *      stops calling writeFileSync.
 *   2. The FIRST overage emits a "[silvery] auto-panic circuit-break"
 *      line on stderr naming the dump count + the override env var.
 *   3. SILVERY_AUTO_PANIC_TEST_NO_EXIT=1 prevents the hard process.exit(2)
 *      that fires in production (so the test runner survives).
 *
 * Bead: @km/silvery/auto-panic-circuit-break.
 */

import { existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Text } from "../../src/index.js"
import { _resetPanicCircuitBreaker, run } from "../../packages/ag-term/src/runtime/run"

const DEFAULT_MAX_DUMPS = 10

function createMockStdout(): { writable: NodeJS.WriteStream; written: string[] } {
  const written: string[] = []
  const writable = {
    write(data: string | Uint8Array) {
      written.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
      return true
    },
    isTTY: true,
    columns: 80,
    rows: 24,
    fd: -1,
    on: () => writable,
    off: () => writable,
    once: () => writable,
    emit: () => true,
    removeListener: () => writable,
    addListener: () => writable,
  } as unknown as NodeJS.WriteStream
  return { writable, written }
}

function createMockStdin(): NodeJS.ReadStream {
  const stdin = {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode() {
      return stdin
    },
    resume() {
      return stdin
    },
    pause() {
      return stdin
    },
    setEncoding() {
      return stdin
    },
    read() {
      return null
    },
    on: () => stdin,
    off: () => stdin,
    once: () => stdin,
    removeListener: () => stdin,
    removeAllListeners: () => stdin,
    addListener: () => stdin,
    listenerCount: () => 0,
    listeners: () => [],
  } as unknown as NodeJS.ReadStream
  return stdin
}

function countPanicDumpsCreatedSince(thresholdMs: number): number {
  // silvery-panic-*.txt files in tmpdir whose mtime is >= threshold.
  // Filename format is `silvery-panic-${Date.now()}.txt`, so the
  // timestamp embedded in the name itself is also reliable.
  let count = 0
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith("silvery-panic-") || !name.endsWith(".txt")) continue
      const stampStr = name.slice("silvery-panic-".length, -".txt".length)
      const stamp = Number.parseInt(stampStr, 10)
      if (Number.isFinite(stamp) && stamp >= thresholdMs) count++
    }
  } catch {
    /* tmpdir read failure — surface 0; the stderr assertion is the
     * load-bearing one. */
  }
  return count
}

describe("auto-panic circuit-break", () => {
  let origStderrWrite: typeof process.stderr.write
  let origStdoutWrite: typeof process.stdout.write
  let origExitCode: typeof process.exitCode
  let stderr: string[]
  let testStartMs: number

  beforeEach(() => {
    stderr = []
    origExitCode = process.exitCode
    origStderrWrite = process.stderr.write
    origStdoutWrite = process.stdout.write
    process.exitCode = undefined
    process.stderr.write = ((chunk: unknown) => {
      stderr.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((_chunk: unknown) => true) as typeof process.stdout.write

    // Reset the process-level panic counter so each test starts clean.
    // Without this, earlier tests in the same vitest worker that
    // exercise the panic flow would push us past the threshold.
    _resetPanicCircuitBreaker()

    // Production behavior is process.exit(2) after circuit-break.
    // Tests opt out so the runner survives.
    vi.stubEnv("SILVERY_AUTO_PANIC_TEST_NO_EXIT", "1")

    testStartMs = Date.now()
  })

  afterEach(() => {
    process.stderr.write = origStderrWrite
    process.stdout.write = origStdoutWrite
    process.exitCode = origExitCode
    vi.unstubAllEnvs()
    _resetPanicCircuitBreaker()
  })

  test("caps dump-write at MAX_PANIC_DUMPS_PER_RUN (default 10) when handle.panic loops", async () => {
    const { writable: stdout } = createMockStdout()
    const handle = await run(<Text>ready</Text>, {
      cols: 40,
      rows: 10,
      stdout,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    // Trigger more panics than the cap. Each panic carries a real Error
    // so the `stack` branch in recordPanic exercises the writeFileSync
    // path — the one that bleeds without the gate.
    const TOTAL_PANICS = DEFAULT_MAX_DUMPS + 5
    for (let i = 0; i < TOTAL_PANICS; i++) {
      handle.panic(new Error(`loop iteration ${i}`), { title: "test" })
    }
    await handle.waitUntilExit()

    const visible = stderr.join("")

    // Acceptance #1: circuit-break stderr message appears.
    expect(visible).toContain("[silvery] auto-panic circuit-break")
    expect(visible).toMatch(/\d+ dump\(s\) written/)
    expect(visible).toContain("SILVERY_AUTO_PANIC_MAX_DUMPS")

    // Acceptance #2: dump file count capped at MAX (not TOTAL_PANICS).
    // We allow exactly MAX or fewer — fewer is possible if a write
    // fails or two panics share a millisecond timestamp (Date.now()
    // collision = filename collision = single file).
    const dumpsLanded = countPanicDumpsCreatedSince(testStartMs)
    expect(dumpsLanded).toBeLessThanOrEqual(DEFAULT_MAX_DUMPS)

    // Acceptance #3: exitCode reflects circuit-break (2) for the
    // overage panic, not just 1.
    expect(process.exitCode).toBe(2)
  })

  test("circuit-break message names the override env var", async () => {
    const { writable: stdout } = createMockStdout()
    const handle = await run(<Text>ready</Text>, {
      cols: 40,
      rows: 10,
      stdout,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    // Push exactly enough panics to trip the gate ONCE — the gate
    // should fire on the (MAX+1)th call.
    for (let i = 0; i < DEFAULT_MAX_DUMPS + 1; i++) {
      handle.panic(new Error(`iter ${i}`), { title: "test" })
    }
    await handle.waitUntilExit()

    const visible = stderr.join("")
    expect(visible).toContain("Set SILVERY_AUTO_PANIC_MAX_DUMPS to override")
    expect(visible).toContain(`default: ${DEFAULT_MAX_DUMPS}`)
  })

  test("circuit-break fires only ONCE per process (subsequent panics silently skip dump-write)", async () => {
    const { writable: stdout } = createMockStdout()
    const handle = await run(<Text>ready</Text>, {
      cols: 40,
      rows: 10,
      stdout,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    // 20 panics — circuit-break should trigger at the (MAX+1)th call,
    // then 9 more should be silent re-panics (no further stderr
    // circuit-break lines).
    for (let i = 0; i < 20; i++) {
      handle.panic(new Error(`iter ${i}`), { title: "test" })
    }
    await handle.waitUntilExit()

    const visible = stderr.join("")
    const circuitBreakLines = visible.match(/\[silvery\] auto-panic circuit-break/g) ?? []
    expect(circuitBreakLines.length).toBe(1)
  })

  test("_resetPanicCircuitBreaker brings the counter back to zero", async () => {
    // Trip the gate in the first phase.
    const { writable: stdout } = createMockStdout()
    const handle1 = await run(<Text>ready1</Text>, {
      cols: 40,
      rows: 10,
      stdout,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)
    for (let i = 0; i < DEFAULT_MAX_DUMPS + 2; i++) {
      handle1.panic(new Error(`phase1 ${i}`), { title: "test" })
    }
    await handle1.waitUntilExit()

    const phase1Lines = stderr.join("").match(/\[silvery\] auto-panic circuit-break/g) ?? []
    expect(phase1Lines.length).toBe(1)

    // Reset counter and start a fresh phase. The gate should not fire
    // immediately on the new App's first panic.
    _resetPanicCircuitBreaker()
    stderr.length = 0

    const handle2 = await run(<Text>ready2</Text>, {
      cols: 40,
      rows: 10,
      stdout: createMockStdout().writable,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)
    handle2.panic(new Error("phase2 single"), { title: "test" })
    await handle2.waitUntilExit()

    const phase2Lines = stderr.join("").match(/\[silvery\] auto-panic circuit-break/g) ?? []
    expect(phase2Lines.length).toBe(0)
  })
})
