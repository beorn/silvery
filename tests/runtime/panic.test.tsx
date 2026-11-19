/**
 * @reach fs-walk <fixture-only: recordAppCrash cases list their own temporary SILVERY_DUMP_DIR>
 * Panic and process-crash records: handle.panic, usePanic, and recordAppCrash (#31167).
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import React, { useEffect, useLayoutEffect } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Box, Text, useRuntime } from "../../src/index.js"
import { createApp, recordAppCrash } from "../../src/runtime.js"
import { run, usePanic } from "../../packages/ag-term/src/runtime/run"
import { createTerm } from "../../packages/ag-term/src/index"

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

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
    // Force writeSync() paths to fall back to writable.write(), so tests
    // don't leak terminal protocol bytes to the real test runner stdout.
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

type MockStdin = NodeJS.ReadStream & {
  armLateInput(data: string, delayMs?: number): void
  readonly readLog: string[]
  readonly rawModes: boolean[]
}

function createMockStdin(): MockStdin {
  const pending: string[] = []
  const readLog: string[] = []
  const rawModes: boolean[] = []
  const stdin = {
    isTTY: true,
    isRaw: false,
    fd: 0,
    armLateInput(data: string, delayMs = 5) {
      setTimeout(() => pending.push(data), delayMs)
    },
    get readLog() {
      return readLog
    },
    get rawModes() {
      return rawModes
    },
    setRawMode(raw: boolean) {
      rawModes.push(raw)
      stdin.isRaw = raw
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
      const next = pending.shift() ?? null
      if (next !== null) readLog.push(next)
      return next
    },
    on: () => stdin,
    off: () => stdin,
    once: () => stdin,
    removeListener: () => stdin,
    removeAllListeners: () => stdin,
    addListener: () => stdin,
    listenerCount: () => 0,
    listeners: () => [],
  } as unknown as MockStdin
  return stdin
}

function PanicOnMount() {
  const panic = usePanic()

  useEffect(() => {
    panic(new Error("subagent invariant failed"), {
      title: "silvercode",
      details: ["session f9eb64dc-d982-4a46-9a8e-da5fd882ac5f"],
      exitCode: 42,
    })
  }, [panic])

  return (
    <Box>
      <Text>running</Text>
    </Box>
  )
}

describe("panic()", () => {
  let origStderrWrite: typeof process.stderr.write
  let origStdoutWrite: typeof process.stdout.write
  let origExitCode: typeof process.exitCode
  let stderr: string[]

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
  })

  afterEach(() => {
    process.stderr.write = origStderrWrite
    process.stdout.write = origStdoutWrite
    process.exitCode = origExitCode
  })

  test("handle.panic exits fullscreen and prints a copyable diagnostic to stderr", async () => {
    const { writable: stdout, written } = createMockStdout()
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

    handle.panic("resume failed", {
      title: "silvercode",
      details: "subagent activity invariant failed",
      exitCode: 42,
    })
    await handle.waitUntilExit()

    const visible = stderr.join("")
    expect(written.join("")).toContain("\x1b[?1049l")
    expect(visible).toContain("silvercode: resume failed")
    expect(visible).toContain("subagent activity invariant failed")
    expect(process.exitCode).toBe(42)
  })

  test("usePanic exits fullscreen and prints after alt-screen cleanup", async () => {
    const { writable: stdout, written } = createMockStdout()
    const handle = await run(<PanicOnMount />, {
      cols: 40,
      rows: 10,
      stdout,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    await handle.waitUntilExit()
    await settle()

    const visible = stderr.join("")
    expect(written.join("")).toContain("\x1b[?1049l")
    expect(visible).toContain("silvercode: subagent invariant failed")
    expect(visible).toContain("session f9eb64dc-d982-4a46-9a8e-da5fd882ac5f")
    expect(process.exitCode).toBe(42)
  })

  test("panic drains late terminal input before resolving", async () => {
    const { writable: stdout } = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>ready</Text>, {
      cols: 40,
      rows: 10,
      stdout,
      stdin,
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    } as never)

    const lateModeReplies = "\x1b[?1021;0$y\x1b[?1022;0$y\x1b[?1023;0$y"
    stdin.armLateInput(lateModeReplies, 35)
    handle.panic("boom", { title: "silvercode" })
    await handle.waitUntilExit()

    expect(stdin.readLog).toContain(lateModeReplies)
    expect(stdin.rawModes.at(-1)).toBe(false)
  })
})

/**
 * recordAppCrash is how a process entry's one crash handler (loggily installCrashHandler) reaches every live app
 * (ADR-0031 decision 3, #31167). silvery registers no process listener of its own.
 */
describe("recordAppCrash()", () => {
  let origStderrWrite: typeof process.stderr.write
  let origStdoutWrite: typeof process.stdout.write
  let origExitCode: typeof process.exitCode
  let log: string[]
  let dumpDir: string
  const handles: Array<{ unmount(): void }> = []

  beforeEach(() => {
    log = []
    origExitCode = process.exitCode
    origStderrWrite = process.stderr.write
    origStdoutWrite = process.stdout.write
    process.exitCode = undefined
    process.stderr.write = ((chunk: unknown) => {
      log.push(`err:${typeof chunk === "string" ? chunk : String(chunk)}`)
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((_chunk: unknown) => true) as typeof process.stdout.write
    dumpDir = mkdtempSync(join(tmpdir(), "silvery-crash-test-"))
    vi.stubEnv("SILVERY_DUMP_DIR", dumpDir)
  })

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.unmount()
    process.stderr.write = origStderrWrite
    process.stdout.write = origStdoutWrite
    process.exitCode = origExitCode
    vi.unstubAllEnvs()
    rmSync(dumpDir, { recursive: true, force: true }) // raw-delete-allow: the SILVERY_DUMP_DIR this test made with mkdtempSync
  })

  /** A terminal whose writes land in the shared log, so stdout and stderr order is one sequence. */
  function loggedStdout(tag: string): NodeJS.WriteStream {
    const { writable } = createMockStdout()
    writable.write = ((data: string | Uint8Array) => {
      log.push(`${tag}:${typeof data === "string" ? data : Buffer.from(data).toString("utf8")}`)
      return true
    }) as typeof writable.write
    return writable
  }

  const options = (stdout: NodeJS.WriteStream) =>
    ({
      cols: 40,
      rows: 10,
      stdout,
      stdin: createMockStdin(),
      guardOutput: true,
      kitty: false,
      textSizing: false,
      widthDetection: false,
    }) as never

  const PENDING = Symbol("pending")
  const stillPending = async (promise: Promise<unknown>, ms = 80) =>
    (await Promise.race([promise.then(() => "settled"), settle(ms).then(() => PENDING)])) ===
    PENDING

  test("records, restores, then reports; adds no process listener; the stopped app never paints or finishes", async () => {
    const before = {
      uncaught: process.listeners("uncaughtException"),
      unhandled: process.listeners("unhandledRejection"),
    }
    let runtime: ReturnType<typeof useRuntime> = null
    function Probe() {
      runtime = useRuntime()
      return <Text>ready</Text>
    }
    const handle = await run(<Probe />, options(loggedStdout("out")))
    handles.push(handle)
    expect(process.listeners("uncaughtException")).toEqual(before.uncaught)
    expect(process.listeners("unhandledRejection")).toEqual(before.unhandled)

    recordAppCrash(new Error("process boom"))

    const restore = log.findIndex((line) => line.startsWith("out:") && line.includes("\x1b[?1049l"))
    const report = log.findIndex(
      (line) => line.startsWith("err:") && line.includes("process crash: process boom"),
    )
    expect(restore).toBeGreaterThanOrEqual(0)
    expect(report).toBeGreaterThan(restore)
    expect(readdirSync(dumpDir).filter((name) => name.startsWith("silvery-panic-"))).toHaveLength(1)
    expect(process.exitCode).toBe(1)

    // Crash-stopped: a resume, a pause and a second call write nothing; normal completion never arrives.
    const settledLength = log.length
    runtime!.resume?.()
    runtime!.pause?.()
    recordAppCrash(new Error("second call"))
    expect(await stillPending(handle.waitUntilExit())).toBe(true)
    expect(log.slice(settledLength)).toEqual([])
    expect(readdirSync(dumpDir)).toHaveLength(1)
  })

  test("an already-waiting and a later frame consumer stay pending after the crash", async () => {
    const app = createApp(() => () => ({}))
    const handle = await app.run(<Text>frames</Text>, options(loggedStdout("out")))
    handles.push(handle)
    const frames = handle[Symbol.asyncIterator]()
    const waiting = frames.next()

    recordAppCrash(new Error("frame boom"))

    const settledLength = log.length
    expect(await stillPending(waiting)).toBe(true)
    expect(await stillPending(frames.next())).toBe(true)
    expect(await stillPending(handle.waitUntilExit())).toBe(true)
    expect(log.slice(settledLength)).toEqual([])
  })

  test("one call records and restores every live app, and a throwing stage still restores each app", async () => {
    const first = await run(<Text>one</Text>, options(loggedStdout("one")))
    const second = await run(<Text>two</Text>, options(loggedStdout("two")))
    handles.push(first, second)

    // A record stage that genuinely throws: reading the error's stack fails inside recordPanic.
    const hostile = new Error("hostile")
    Object.defineProperty(hostile, "stack", {
      get() {
        throw new Error("stack getter boom")
      },
    })
    expect(() => recordAppCrash(hostile)).toThrow("stack getter boom")

    for (const tag of ["one", "two"]) {
      expect(log.some((line) => line.startsWith(`${tag}:`) && line.includes("\x1b[?1049l"))).toBe(
        true,
      )
    }
    // Both apps are now crash-stopped: a later call is a no-op for each.
    const settledLength = log.length
    recordAppCrash(new Error("after"))
    expect(log.slice(settledLength)).toEqual([])
  })

  test("an owner callback that throws before the terminal reset does not abandon the reset or the report", async () => {
    const stdin = createMockStdin()
    const handle = await run(<Text>owner</Text>, {
      ...(options(loggedStdout("out")) as object),
      stdin,
    } as never)
    handles.push(handle)
    // A genuinely throwing owner stage: cleanup stops consuming stdin before it resets the terminal.
    Object.assign(stdin, {
      removeAllListeners() {
        throw new Error("stdin owner boom")
      },
    })

    expect(() => recordAppCrash(new Error("owner crash"))).toThrow("stdin owner boom")

    const restore = log.findIndex((line) => line.startsWith("out:") && line.includes("\x1b[?1049l"))
    const report = log.findIndex(
      (line) => line.startsWith("err:") && line.includes("process crash: owner crash"),
    )
    expect(restore).toBeGreaterThanOrEqual(0)
    expect(report).toBeGreaterThan(restore)
    expect(readdirSync(dumpDir).filter((name) => name.startsWith("silvery-panic-"))).toHaveLength(1)
    expect(process.exitCode).toBe(1)
  })

  test("two live apps: each gets its own record and restore", async () => {
    const first = await run(<Text>one</Text>, options(loggedStdout("one")))
    const second = await run(<Text>two</Text>, options(loggedStdout("two")))
    handles.push(first, second)

    recordAppCrash(new Error("shared boom"), { title: "worker" })

    for (const tag of ["one", "two"]) {
      expect(log.some((line) => line.startsWith(`${tag}:`) && line.includes("\x1b[?1049l"))).toBe(
        true,
      )
    }
    expect(
      log.filter((line) => line.startsWith("err:") && line.includes("worker: shared boom")),
    ).toHaveLength(2)
    expect(readdirSync(dumpDir)).toHaveLength(2)
  })

  // Both terminal setups: an app that owns its Modes (the crash cleanup disposes them, and a disposed Modes drops
  // writes) and an injected Term, which the entries pass (dutiful: createTerm()) and whose Modes the crash cleanup
  // leaves live. Only the second shows a missing startup guard as a mode enable after the report (@dev/review2).
  const startupOptions = (setup: string, stdout: NodeJS.WriteStream) => {
    const base = options(stdout) as unknown as {
      stdin: NodeJS.ReadStream
      cols: number
      rows: number
    }
    return setup === "injected Term"
      ? ({
          ...base,
          term: createTerm({
            stdout,
            stdin: base.stdin,
            cols: base.cols,
            rows: base.rows,
          } as never),
        } as never)
      : (base as never)
  }
  for (const setup of ["app-owned Modes", "injected Term"]) {
    test(`a crash while startup awaits the Kitty probe: no later mode enable, paint or startup completion (${setup})`, async () => {
      const started = Promise.resolve(
        createApp(() => () => ({})).run(<Text>probe</Text>, {
          ...(startupOptions(setup, loggedStdout("out")) as object),
          alternateScreen: true,
          kitty: true,
          mouse: true,
        } as never),
      )
      await settle(30)
      // Startup is parked on the probe: its query is out, the 200 ms answer window is still open.
      expect(log.some((line) => line.startsWith("out:") && line.includes("\x1b[?u"))).toBe(true)

      const beforeCrash = log.length
      recordAppCrash(new Error("probe boom"))
      const settledLength = log.length

      expect(log.some((line) => line.startsWith("out:") && line.includes("\x1b[?1049l"))).toBe(true)
      // The probe window closes inside this wait; startup must not resume past it.
      expect(await stillPending(started, 400)).toBe(true)
      expect(log.slice(settledLength)).toEqual([])
      // An injected Term enables mouse tracking before the probe: the restore turns it off, and nothing after the
      // crash call turns it on again.
      const lastEnable = log.findLastIndex((line) => line.includes("\x1b[?1003h"))
      expect(lastEnable).toBeLessThan(beforeCrash)
      if (lastEnable >= 0) {
        expect(
          log
            .slice(beforeCrash)
            .some((line) => line.startsWith("out:") && line.includes("\x1b[?1003l")),
        ).toBe(true)
      }
    })

    test(`a crash during the first render: no protocol enable, no paint, startup never completes (${setup})`, async () => {
      function CrashOnMount() {
        useLayoutEffect(() => {
          recordAppCrash(new Error("mount boom"))
        }, [])
        return <Text>mount</Text>
      }
      const started = Promise.resolve(
        createApp(() => () => ({})).run(<CrashOnMount />, {
          ...(startupOptions(setup, loggedStdout("out")) as object),
          alternateScreen: true,
          mouse: true,
        } as never),
      )

      expect(await stillPending(started, 150)).toBe(true)
      const restore = log.findIndex(
        (line) => line.startsWith("out:") && line.includes("\x1b[?1049l"),
      )
      // The report is recordAppCrash's last write: nothing follows it.
      const report = log.findIndex(
        (line) => line.startsWith("err:") && line.includes("process crash: mount boom"),
      )
      expect(restore).toBeGreaterThanOrEqual(0)
      expect(report).toBeGreaterThan(restore)
      expect(log.slice(report + 1)).toEqual([])
      expect(log.some((line) => line.includes("\x1b[?1003h"))).toBe(false)
    })
  }

  test("with no live app it is a no-op", () => {
    const exitCode = process.exitCode
    recordAppCrash(new Error("nobody home"))
    expect(log).toEqual([])
    expect(readdirSync(dumpDir)).toEqual([])
    expect(process.exitCode).toBe(exitCode)
  })
})
