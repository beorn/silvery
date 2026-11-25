/**
 * createApp/runtime observability parity.
 *
 * Scheduler already wires the `bytes_out` and `mem` SILVERY_STRICT slugs.
 * Silver Code exercises the newer createApp/run path, so these monitors must
 * exist there too or live dogfood sessions silently miss the tier-1 probes.
 *
 * @failure A frame-tail hover update remains unpainted, or shutdown leaves rendering active.
 * @level l3
 * @consumer createApp/run terminal applications
 * @testonly none
 */

import React, { useEffect, useLayoutEffect, useState } from "react"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import "@termless/test/matchers"

const monitorState = vi.hoisted(() => ({
  bytesOut: [] as Array<{
    recordWrite: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
  mem: [] as Array<{
    tick: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
}))

const savedEnv = vi.hoisted(() => {
  const DEBUG = process.env.DEBUG
  delete process.env.DEBUG
  return { DEBUG }
})

vi.mock("../../packages/ag-term/src/bytes-out-monitor.ts", () => ({
  createBytesOutMonitor: () => {
    const monitor = {
      recordWrite: vi.fn(),
      dispose: vi.fn(),
    }
    monitorState.bytesOut.push(monitor)
    return monitor
  },
}))

vi.mock("../../packages/ag-term/src/mem-monitor.ts", () => ({
  createMemMonitor: () => {
    const monitor = {
      tick: vi.fn(),
      dispose: vi.fn(),
    }
    monitorState.mem.push(monitor)
    return monitor
  },
}))

import { Box, Text } from "../../src/index.js"

function makeWritable() {
  let output = ""
  return {
    writable: {
      write(data: string): void {
        output += data
      },
    },
    get output() {
      return output
    },
  }
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

// Root km's vendor project may preload Silvery through setup files before this
// spec runs. Reset and import the runtime per test so the monitor mocks above
// bind to createApp's imports in both standalone and root-project runs.
async function importRuntime() {
  const [{ run }, { resetStrictCache }] = await Promise.all([
    import("../../packages/ag-term/src/runtime/run"),
    import("../../packages/ag-term/src/strict-mode"),
  ])
  resetStrictCache()
  return { run, resetStrictCache }
}

function UpdatingTraceFixture() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setN(1), 0)
    return () => clearTimeout(t)
  }, [])

  return (
    <Box id="trace-root" flexDirection="column">
      <Text id="trace-line">frame {n}</Text>
    </Box>
  )
}

describe("createApp/run SILVERY_STRICT observability monitors", () => {
  const originalStrict = process.env.SILVERY_STRICT

  beforeEach(() => {
    delete process.env.DEBUG
    monitorState.bytesOut.length = 0
    monitorState.mem.length = 0
    vi.resetModules()
  })

  afterEach(async () => {
    if (originalStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = originalStrict
    if (savedEnv.DEBUG === undefined) delete process.env.DEBUG
    else process.env.DEBUG = savedEnv.DEBUG
    const { resetStrictCache } = await importRuntime()
    resetStrictCache()
  })

  test("bytes_out monitor records frames and disposes on unmount", async () => {
    process.env.SILVERY_STRICT = "bytes_out"
    const { run } = await importRuntime()

    const sink = makeWritable()
    const handle = await run(<Text>observable frame</Text>, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
    })

    expect(monitorState.bytesOut).toHaveLength(1)
    expect(monitorState.bytesOut[0]!.recordWrite).toHaveBeenCalled()
    expect(monitorState.bytesOut[0]!.recordWrite.mock.calls[0]![0]).toBe(1)
    expect(monitorState.bytesOut[0]!.recordWrite.mock.calls[0]![1]).toBeGreaterThan(0)
    expect(monitorState.bytesOut[0]!.recordWrite.mock.calls[0]![2]).toMatchObject({
      reason: "first-render",
      mode: "fullscreen",
      width: expect.any(Number),
      height: expect.any(Number),
      prevWidth: 0,
      prevHeight: 0,
      outputChars: expect.any(Number),
    })
    expect(sink.output.length).toBeGreaterThan(0)

    handle.unmount()
    expect(monitorState.bytesOut[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  test("a hover update after timer-driven layout paints without further input", async () => {
    process.env.SILVERY_STRICT = "2"
    await importRuntime()
    const [{ createApp, useApp }, { createTermless }] = await Promise.all([
      import("../../packages/ag-term/src/runtime/create-app"),
      import("@silvery/test"),
    ])
    type State = { shifted: boolean; entered: boolean; resting: boolean }
    const app = createApp(() => () => ({ shifted: false, entered: false, resting: false }))
    using term = createTermless({ cols: 30, rows: 6 })
    let enterTarget = () => {}
    let enterSpacer = () => {}
    function HoverFixture() {
      const state = useApp<State, State>((s) => s)
      return (
        <Box flexDirection="column">
          {!state.shifted && (
            <Box height={1} onMouseEnter={() => enterSpacer()}>
              <Text>spacer</Text>
            </Box>
          )}
          <Box height={1} onMouseEnter={() => enterTarget()}>
            <Text>hover target</Text>
          </Box>
          <Text>entered {String(state.entered)}</Text>
          <Text>resting {String(state.resting)}</Text>
        </Box>
      )
    }
    const handle = await app.run(<HoverFixture />, {
      term,
      cols: 30,
      rows: 6,
      writable: { write: (data) => term.write(data) },
      mouse: true,
      selection: false,
    })
    enterTarget = () => {
      if (handle.store.getState().shifted) handle.store.setState({ entered: true })
    }
    enterSpacer = () => handle.store.setState({ resting: true })
    try {
      await term.mouse.move(2, 0)
      await vi.waitFor(() => expect(term.screen).toContainText("resting true"), {
        timeout: 2000,
        interval: 20,
      })
      expect(term.screen).toContainText("entered false")
      // Moving content under a resting pointer dispatches enter during the
      // frame's post-paint tail. No input or layout-drain helper follows it.
      setTimeout(() => handle.store.setState({ shifted: true }), 0)
      await vi.waitFor(
        () => {
          expect(handle.store.getState().entered).toBe(true)
          expect(term.screen).toContainText("entered true")
        },
        { timeout: 2000, interval: 20 },
      )
    } finally {
      handle.unmount()
      await handle.waitUntilExit()
    }
  })

  test("mem monitor is constructed at the mem slug and disposes on unmount", async () => {
    process.env.SILVERY_STRICT = "mem"
    const { run } = await importRuntime()

    const sink = makeWritable()
    const handle = await run(<Text>memory probe</Text>, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
    })

    expect(monitorState.mem).toHaveLength(1)
    handle.unmount()
    expect(monitorState.mem[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  test("shutdown joins an awaiting frame without painting its queued successor", async () => {
    process.env.SILVERY_STRICT = "bytes_out"
    await importRuntime()
    const { createApp, useApp } = await import("../../packages/ag-term/src/runtime/create-app")
    const committed: number[] = []
    function ExitFixture() {
      const n = useApp<{ n: number }, number>((s) => s.n)
      useLayoutEffect(() => {
        committed.push(n)
      }, [n])
      return <Text>frame {n}</Text>
    }
    const sink = makeWritable()
    const handle = await createApp(() => () => ({ n: 0 })).run(<ExitFixture />, {
      writable: sink.writable,
      cols: 30,
      rows: 6,
    })
    try {
      handle.store.setState({ n: 1 })
      // The first commit has happened, but its standalone paint still awaits.
      // Request more work and exit in that gap through the public lifecycle.
      queueMicrotask(() => {
        handle.store.setState({ n: 2 })
        handle.unmount()
      })
      await handle.waitUntilExit()
      expect(committed).toContain(1)
      expect(committed).not.toContain(2)
      expect(monitorState.bytesOut[0]!.recordWrite).toHaveBeenCalledTimes(1)
      expect(monitorState.bytesOut[0]!.dispose).toHaveBeenCalledTimes(1)
      const exitedOutput = sink.output
      await settle()
      expect(sink.output).toBe(exitedOutput)
    } finally {
      handle.unmount()
      await handle.waitUntilExit()
    }
  })

  test("per-slug opt-outs suppress monitor construction", async () => {
    process.env.SILVERY_STRICT = "1,!bytes_out,!mem"
    const { run } = await importRuntime()

    const sink = makeWritable()
    const handle = await run(<Text>no probes</Text>, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
    })

    expect(monitorState.bytesOut).toHaveLength(0)
    expect(monitorState.mem).toHaveLength(0)
    handle.unmount()
  })

  test("explicit bytes_out,mem slugs do not retain render-phase node traces", async () => {
    process.env.SILVERY_STRICT = "bytes_out,mem"
    delete process.env.DEBUG
    delete process.env.SILVERY_TRACE_FRAMES
    delete process.env.SILVERY_INSTRUMENT
    delete process.env.SILVERY_CELL_DEBUG
    const { run } = await importRuntime()

    const g = globalThis as {
      __silvery_node_trace?: unknown
      __silvery_content_all?: unknown
      __silvery_content_detail?: unknown
    }
    delete g.__silvery_node_trace
    delete g.__silvery_content_all
    delete g.__silvery_content_detail

    const sink = makeWritable()
    const handle = await run(<UpdatingTraceFixture />, {
      writable: sink.writable,
      cols: 40,
      rows: 6,
    })

    await settle()

    expect(monitorState.bytesOut).toHaveLength(1)
    expect(monitorState.mem).toHaveLength(1)
    expect(g.__silvery_node_trace).toBeUndefined()
    expect(g.__silvery_content_all).toBeUndefined()

    handle.unmount()
  })
})

// ============================================================================
// 31167 A: diagnostic TEXT rides the loggily namespaces, never a fixed /tmp file
// ============================================================================
//
// SILVERY_TRACE=1 and DEBUG=silvery:perf used to append their human text to
// /tmp/silvery-trace.log and /tmp/silvery-perf.log, files no reader, rule or
// capture covers. @cto's ruling (31167, fate A) moves that text onto the
// existing silvery:trace / silvery:perf loggily namespaces under the same flags.
// A fullscreen app owns the terminal, so the ruling only holds if createApp's
// Output owner keeps those records off the screen while the app runs: buffered
// and replayed after the alternate screen is left, or written to DEBUG_LOG.

/** Identity of a retired fixed file: size and mtime, or null while it is absent. */
function fixedFileIdentity(path: string): string | null {
  if (!existsSync(path)) return null
  const stat = statSync(path)
  return `${stat.size}:${stat.mtimeMs}`
}

/** A non-TTY stdin: the app never reads it (`input: false`) and teardown takes the non-TTY path. */
function nonTtyStdin(): NodeJS.ReadStream {
  const stdin: Record<string, unknown> = {
    isTTY: false,
    fd: 0,
    read: () => null,
    listenerCount: () => 0,
    listeners: () => [],
  }
  for (const method of [
    "setRawMode",
    "resume",
    "pause",
    "setEncoding",
    "on",
    "off",
    "once",
    "removeListener",
    "removeAllListeners",
    "addListener",
  ]) {
    stdin[method] = () => stdin
  }
  return stdin as unknown as NodeJS.ReadStream
}

interface GuardedRun {
  /** Messages the loggily writer saw on the requested namespace(s). */
  messages: string[]
  /** What the terminal's stdout received (the frames). */
  stdout: string
  /** Everything that reached stderr or console.* before unmount — what would paint over the app. */
  paintedWhileRunning: string
  /** What reached stderr after unmount (the Output owner's replay on the normal screen). */
  stderrAfterExit: string
}

/**
 * Run a fullscreen app on the REAL process.stdout so createApp engages its
 * default Output owner — the guard every fullscreen TUI runs under — and
 * observe each surface a person would see.
 */
/**
 * loggily's file writer buffers and flushes on a 100 ms timer (or 4096 bytes), with no flush API, so a read
 * taken right after a run can miss the tail. Wait, bounded, for what the caller is about to assert on.
 */
async function readLogWhen(file: string, ready: (text: string) => boolean, ms = 5_000): Promise<string> {
  const end = Date.now() + ms
  for (;;) {
    const text = readFileSync(file, "utf8")
    if (ready(text) || Date.now() > end) return text
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function runGuardedFullscreen(ns: string | string[]): Promise<GuardedRun> {
  // vi.resetModules() ran in beforeEach: import loggily before the runtime so
  // the writer registers on the same instance createApp binds.
  const loggily = await import("loggily")
  const { createApp } = await import("../../packages/ag-term/src/runtime/create-app")
  const messages: string[] = []
  const unsubscribe = loggily.addWriter({ ns }, (_formatted, _level, _namespace, event) => {
    if (event.kind === "log") messages.push(event.message)
  })
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const consoleLines: string[] = []
  const origStdoutWrite = process.stdout.write
  const origStderrWrite = process.stderr.write
  process.stdout.write = ((chunk: unknown) => {
    stdoutChunks.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => {
    stderrChunks.push(String(chunk))
    return true
  }) as typeof process.stderr.write
  // loggily's terminal sink writes log records through console.error/warn.
  const toConsole = (...args: unknown[]) => {
    consoleLines.push(args.map(String).join(" "))
  }
  const errorSpy = vi.spyOn(console, "error").mockImplementation(toConsole)
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(toConsole)
  try {
    const handle = await createApp(() => () => ({})).run(<UpdatingTraceFixture />, {
      stdout: process.stdout,
      stdin: nonTtyStdin(),
      input: false,
      alternateScreen: true,
      mouse: false,
      kitty: false,
      cols: 40,
      rows: 6,
    })
    await settle()
    const paintedWhileRunning = [...stderrChunks, ...consoleLines].join("\n")
    const stderrBeforeExit = stderrChunks.length
    handle.unmount()
    await handle.waitUntilExit()
    return {
      messages,
      stdout: stdoutChunks.join(""),
      paintedWhileRunning,
      stderrAfterExit: stderrChunks.slice(stderrBeforeExit).join(""),
    }
  } finally {
    unsubscribe()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
  }
}

describe("createApp diagnostic text goes to loggily, never a fixed /tmp file (31167 A)", () => {
  const TRACE_FILE = "/tmp/silvery-trace.log"
  const PERF_FILE = "/tmp/silvery-perf.log"
  const DECODED_WRITE = /^\[\d{4}\] \+\d+ms \(\d+b\): /
  const FLAGS = ["SILVERY_TRACE", "DEBUG", "DEBUG_LOG"] as const
  let savedFlags: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedFlags = Object.fromEntries(FLAGS.map((name) => [name, process.env[name]]))
    for (const name of FLAGS) delete process.env[name]
    vi.resetModules()
  })

  afterEach(() => {
    for (const name of FLAGS) {
      if (savedFlags[name] === undefined) delete process.env[name]
      else process.env[name] = savedFlags[name]
    }
  })

  test("SILVERY_TRACE=1: decoded writes are silvery:trace records, held off the running screen", async () => {
    process.env.SILVERY_TRACE = "1"
    const before = fixedFileIdentity(TRACE_FILE)

    const run = await runGuardedFullscreen("silvery:trace")

    // The decoded write log is now the namespace's own text, banners included.
    expect(run.messages).toContain("=== SILVERY TRACE START ===")
    expect(run.messages).toContain("=== RUNTIME.RENDER (initial) ===")
    expect(run.messages.some((m) => m.startsWith("--- doRender #1 "))).toBe(true)
    const decoded = run.messages.filter((m) => DECODED_WRITE.test(m))
    expect(decoded.some((m) => m.includes("⟨"))).toBe(true)
    // The interception still forwards every write: the frame reached the terminal.
    expect(run.stdout).toContain("frame")
    // Nothing of it painted over the running app ...
    expect(run.paintedWhileRunning).not.toContain("SILVERY TRACE START")
    expect(run.paintedWhileRunning).not.toMatch(/\[\d{4}\] \+\d+ms \(\d+b\): /)
    // ... and it is not lost: the owner replays it once the alternate screen is gone.
    expect(run.stderrAfterExit).toContain("silvery: replaying")
    expect(run.stderrAfterExit).toMatch(/\[\d{4}\] \+\d+ms \(\d+b\): /)
    // The retired fixed file is neither created nor grown.
    expect(fixedFileIdentity(TRACE_FILE)).toBe(before)
  })

  test("SILVERY_TRACE=1 with DEBUG_LOG: the trace lands in the caller's file, never on the terminal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "silvery-31167-debug-log-"))
    try {
      const debugLog = join(dir, "app.log")
      process.env.SILVERY_TRACE = "1"
      process.env.DEBUG_LOG = debugLog
      const before = fixedFileIdentity(TRACE_FILE)

      const run = await runGuardedFullscreen("silvery:trace")

      expect(await readLogWhen(debugLog, (text) => /\[\d{4}\] \+\d+ms \(\d+b\): /.test(text))).toMatch(
        /\[\d{4}\] \+\d+ms \(\d+b\): /,
      )
      expect(run.paintedWhileRunning + run.stderrAfterExit).not.toMatch(
        /\[\d{4}\] \+\d+ms \(\d+b\): /,
      )
      expect(fixedFileIdentity(TRACE_FILE)).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true }) // raw-delete-allow: the DEBUG_LOG dir this test made with mkdtempSync
    }
  })

  test("SILVERY_TRACE=1 under an unrelated DEBUG filter: the whole trace still reaches DEBUG_LOG", async () => {
    // The old file got every write whatever DEBUG named. Loggily drops debug
    // records outside DEBUG's namespaces before any sink, and reports the level
    // as debug whenever DEBUG is set, so the trace may lean on neither.
    const dir = mkdtempSync(join(tmpdir(), "silvery-31167-debug-filter-"))
    try {
      const debugLog = join(dir, "app.log")
      process.env.SILVERY_TRACE = "1"
      process.env.DEBUG = "km:*"
      process.env.DEBUG_LOG = debugLog
      const levelBefore = process.env.LOG_LEVEL

      await runGuardedFullscreen("silvery:trace")

      const text = await readLogWhen(
        debugLog,
        (seen) =>
          seen.includes("=== SILVERY TRACE START ===") &&
          seen.includes("=== ALT SCREEN + CLEAR ===") &&
          seen.includes("--- doRender #1 ") &&
          /\[\d{4}\] \+\d+ms \(\d+b\): /.test(seen),
      )
      expect(text).toContain("=== SILVERY TRACE START ===")
      expect(text).toContain("=== ALT SCREEN + CLEAR ===")
      expect(text).toContain("--- doRender #1 ")
      expect(text).toMatch(/\[\d{4}\] \+\d+ms \(\d+b\): /)
      // The trace lowers the level for its own run and hands it back unchanged.
      expect(process.env.LOG_LEVEL).toBe(levelBefore)
    } finally {
      rmSync(dir, { recursive: true, force: true }) // raw-delete-allow: the DEBUG_LOG dir this test made with mkdtempSync
    }
  })

  test("DEBUG=silvery:perf: render timings are silvery:perf records, held off the running screen", async () => {
    process.env.DEBUG = "silvery:perf"
    const before = fixedFileIdentity(PERF_FILE)

    const run = await runGuardedFullscreen("silvery:perf")

    expect(run.messages.some((m) => /^TARGET\.write: \d+ bytes \(paused=false\)$/.test(m))).toBe(
      true,
    )
    expect(run.messages.some((m) => m.startsWith("doRender #1: "))).toBe(true)
    expect(run.messages.some((m) => m.startsWith("STARTUP: initial render done"))).toBe(true)
    expect(run.paintedWhileRunning).not.toContain("TARGET.write")
    expect(run.paintedWhileRunning).not.toContain("doRender #")
    expect(run.stderrAfterExit).toContain("TARGET.write")
    expect(fixedFileIdentity(PERF_FILE)).toBe(before)
  })

  test("without the flags neither namespace emits and neither fixed file is touched", async () => {
    const beforeTrace = fixedFileIdentity(TRACE_FILE)
    const beforePerf = fixedFileIdentity(PERF_FILE)

    const run = await runGuardedFullscreen(["silvery:trace", "silvery:perf"])

    expect(run.messages).toEqual([])
    expect(run.stdout).toContain("frame")
    expect(fixedFileIdentity(TRACE_FILE)).toBe(beforeTrace)
    expect(fixedFileIdentity(PERF_FILE)).toBe(beforePerf)
  })
})
