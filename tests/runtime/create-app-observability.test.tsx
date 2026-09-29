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
