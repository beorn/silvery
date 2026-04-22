/**
 * Tests for the Console device — captures / replays / suppresses console.*
 * during alt-screen rendering.
 *
 * Run: bun vitest run tests/features/console.test.ts
 */
import { describe, expect, test, afterEach } from "vitest"
import { createConsole, type Console } from "@silvery/ag-term/runtime/devices/console"
import { createTerm } from "@silvery/ag-term"

describe("createConsole", () => {
  let owner: Console | null = null

  afterEach(() => {
    if (owner) {
      owner.dispose()
      owner = null
    }
  })

  /** Build a stub console that forwards calls into a local log. */
  function stubConsole() {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const stub: Partial<globalThis.Console> & Record<string, unknown> = {}
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      stub[method] = (...args: unknown[]) => {
        calls.push({ method, args })
      }
    }
    return { stub: stub as globalThis.Console, calls }
  }

  test("is inert before capture()", () => {
    const { stub, calls } = stubConsole()
    owner = createConsole(stub)

    stub.log("hello")
    expect(calls).toEqual([{ method: "log", args: ["hello"] }])
    expect(owner.getSnapshot()).toEqual([])
    expect(owner.getStats()).toEqual({ total: 0, errors: 0, warnings: 0 })
    expect(owner.capturing).toBe(false)
  })

  test("captures console.* once capture() is called", () => {
    const { stub } = stubConsole()
    owner = createConsole(stub)
    owner.capture()

    stub.log("first")
    stub.error("second")
    stub.warn("third")

    expect(owner.capturing).toBe(true)
    const snap = owner.getSnapshot()
    expect(snap).toHaveLength(3)
    expect(snap[0]).toMatchObject({ method: "log", stream: "stdout" })
    expect(snap[1]).toMatchObject({ method: "error", stream: "stderr" })
    expect(snap[2]).toMatchObject({ method: "warn", stream: "stderr" })
    expect(owner.getStats()).toEqual({ total: 3, errors: 1, warnings: 1 })
  })

  test("suppress=true blocks forwarding to the original methods", () => {
    const { stub, calls } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    stub.log("hushed")
    stub.error("also hushed")

    expect(calls).toEqual([])
    expect(owner.getSnapshot()).toHaveLength(2)
  })

  test("suppress=false (default) still forwards to original methods", () => {
    const { stub, calls } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: false })

    stub.log("forwarded")

    expect(calls).toEqual([{ method: "log", args: ["forwarded"] }])
    expect(owner.getSnapshot()).toHaveLength(1)
  })

  test("capture=false keeps stats but drops entries", () => {
    const { stub } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ capture: false, suppress: true })

    stub.log("dropped")
    stub.error("also dropped")

    expect(owner.getSnapshot()).toEqual([])
    expect(owner.getStats()).toEqual({ total: 2, errors: 1, warnings: 0 })
  })

  test("restore() stops capturing but preserves entries + subscribers", () => {
    const { stub, calls } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    stub.log("captured")
    expect(owner.getSnapshot()).toHaveLength(1)

    owner.restore()
    expect(owner.capturing).toBe(false)

    // Post-restore calls go straight to the stub.
    stub.log("after")
    expect(calls).toEqual([{ method: "log", args: ["after"] }])
    // Pre-restore entries still present.
    expect(owner.getSnapshot()).toHaveLength(1)
  })

  test("capture()/restore() cycles reuse the same originals", () => {
    const { stub, calls } = stubConsole()
    owner = createConsole(stub)

    owner.capture({ suppress: true })
    stub.log("round1")
    owner.restore()

    owner.capture({ suppress: true })
    stub.log("round2")
    owner.restore()

    expect(owner.getSnapshot()).toHaveLength(2)
    expect(calls).toEqual([]) // both rounds suppressed

    // After final restore the stub is back to normal forwarding.
    stub.log("after")
    expect(calls).toEqual([{ method: "log", args: ["after"] }])
  })

  test("subscribe fires on new entry (batched via microtask)", async () => {
    const { stub } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    let fires = 0
    const unsub = owner.subscribe(() => {
      fires++
    })

    stub.log("a")
    stub.log("b")
    stub.log("c")

    // Synchronously no fires (batched).
    expect(fires).toBe(0)

    // After microtask, one fire.
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(fires).toBe(1)

    unsub()
    stub.log("d")
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(fires).toBe(1)
  })

  test("getSnapshot returns a new array reference on new entry", () => {
    const { stub } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    const before = owner.getSnapshot()
    stub.log("a")
    const after = owner.getSnapshot()

    // New reference — important for useSyncExternalStore's Object.is check.
    expect(after).not.toBe(before)
    expect(after).toHaveLength(1)
  })

  test("replay() writes captured entries to explicit streams", () => {
    const { stub } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    stub.log("stdout line")
    stub.error("stderr line")
    stub.warn("warning")

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    const fakeStdout = {
      write: (s: string) => {
        stdoutChunks.push(s)
        return true
      },
    } as unknown as NodeJS.WriteStream
    const fakeStderr = {
      write: (s: string) => {
        stderrChunks.push(s)
        return true
      },
    } as unknown as NodeJS.WriteStream

    owner.replay(fakeStdout, fakeStderr)

    expect(stdoutChunks).toEqual(["stdout line\n"])
    expect(stderrChunks).toEqual(["stderr line\n", "warning\n"])
  })

  test("replay() formats non-string args (Error, object, number)", () => {
    const { stub } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    stub.error(new Error("boom"))
    stub.log({ foo: 1 }, 42)

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    const fake = (sink: string[]) =>
      ({ write: (s: string) => (sink.push(s), true) }) as unknown as NodeJS.WriteStream

    owner.replay(fake(stdoutChunks), fake(stderrChunks))

    expect(stderrChunks[0]).toContain("Error: boom")
    expect(stdoutChunks[0]).toContain('{"foo":1}')
    expect(stdoutChunks[0]).toContain("42")
  })

  test("dispose() is idempotent and restores originals", () => {
    const { stub, calls } = stubConsole()
    owner = createConsole(stub)
    owner.capture({ suppress: true })

    owner.dispose()
    owner.dispose() // no throw

    stub.log("post-dispose")
    expect(calls).toEqual([{ method: "log", args: ["post-dispose"] }])
    owner = null
  })

  test("Symbol.dispose is wired", () => {
    const { stub, calls } = stubConsole()
    {
      using local = createConsole(stub)
      local.capture({ suppress: true })
      stub.log("inside")
      expect(local.capturing).toBe(true)
    }
    // Out of scope — dispose ran, stub is restored.
    stub.log("outside")
    expect(calls).toEqual([{ method: "log", args: ["outside"] }])
  })
})

describe("term.console", () => {
  test("createTerm() constructs a Console for Node-backed terms", () => {
    using term = createTerm()
    expect(term.console).toBeDefined()
    expect(term.console!.capturing).toBe(false)
  })

  test("headless terms have no console owner", () => {
    using term = createTerm({ cols: 80, rows: 24 })
    expect(term.console).toBeUndefined()
  })

  test("Term dispose restores console when capturing", () => {
    using term = createTerm()
    // Snapshot AFTER term construction. The Console owner captures originals
    // at its first `capture()` call, so this is the baseline it will restore
    // to. Pre-Term snapshots may differ because vitest's setup wraps console.*.
    const preCaptureLog = globalThis.console.log
    term.console?.capture({ suppress: true })
    expect(globalThis.console.log).not.toBe(preCaptureLog)
    term.console?.restore()
    expect(globalThis.console.log).toBe(preCaptureLog)
  })
})
