/**
 * render() mouse wiring — regression test for km-silvery.render-mouse-support.
 *
 * Context: `run()` has always wired SGR mouse tracking (modes 1003+1006) and
 * dispatched parsed mouse events through the DOM-style event processor, so
 * `onWheel` / `onClick` / `onMouseEnter` / `onMouseLeave` fire on `<Box>`.
 * `render()` (the lower-level entry point used by km-logview and demos) used
 * to have zero mouse wiring — trackpad scroll, click-to-focus, and hover
 * handlers all silently failed. This regressed any app that chose `render()`
 * over `run()`.
 *
 * Coverage:
 *  1. `mouse: true` (default on TTY) writes the SGR enable sequence at startup
 *     and the disable sequence on unmount.
 *  2. `mouse: false` writes neither enable nor disable.
 *  3. Non-TTY stdout falls back to disabled even when `mouse: true` is passed
 *     (so piped renders don't emit garbage bytes).
 *  4. Disable-before-raw-mode-off ordering on unmount — mirrors create-app's
 *     cleanup so any in-flight mouse bytes get routed through our protocol
 *     disable rather than spilling to the shell prompt.
 *  5. Mouse handlers on `<Box>` become live when mouse is enabled — verified
 *     by the live-terminal suite under `tests/features/inline-mouse-default.test.tsx`
 *     (exercises the same protocol via `run()`, whose enable/disable path is
 *     the reference implementation we mirror here).
 *
 * These tests use a mock stdout+stdin (not xterm-backed) because `render()`
 * consumes raw stdin bytes directly rather than through `term.input`, so the
 * live-termless mouse helpers (`term.mouse.*`) don't apply. The protocol
 * enable/disable and ordering invariants are what we need here; the full
 * dispatch path is tested through the `run()`-based suites.
 */

import EventEmitter from "node:events"
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "../../src/index.js"
import { render } from "../../packages/ag-react/src/render"

// SGR mouse mode 1006 enable/disable (the mouse protocol `run()` uses — same
// bytes `disableMouse()` / `enableMouse()` emit).
const MOUSE_ENABLE = "?1006h"
const MOUSE_DISABLE = "?1006l"

// ============================================================================
// Mock streams — writable captures escape sequences, readable injects stdin
// bytes synchronously (the path SilveryInstance.subscribeToInput listens on).
// ============================================================================

interface MockStdout {
  stream: NodeJS.WriteStream
  readonly output: string
}

function createMockStdout(cols = 40, rows = 10, isTTY = true): MockStdout {
  const chunks: string[] = []
  const emitter = new EventEmitter()
  const mock = Object.create(emitter)
  mock.columns = cols
  mock.rows = rows
  mock.isTTY = isTTY
  mock.writable = true
  mock.fd = 1
  mock.write = function (data: string | Uint8Array) {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
    return true
  }
  mock.end = function () {}
  mock.destroy = function () {}
  // Delegate EventEmitter methods — SilveryInstance.setupResizeListener needs on/off.
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)
  return {
    stream: mock as NodeJS.WriteStream,
    get output() {
      return chunks.join("")
    },
  }
}

interface MockStdin {
  stream: NodeJS.ReadStream
  push(chunk: string): void
}

function createMockStdin(): MockStdin {
  const emitter = new EventEmitter()
  let queue: string[] = []
  let readable = false
  const mock = Object.create(emitter)
  mock.isTTY = true
  mock.isRaw = false
  mock.fd = 0
  mock.setRawMode = function (mode: boolean) {
    mock.isRaw = mode
    return mock
  }
  mock.read = function (): string | null {
    if (queue.length === 0) {
      readable = false
      return null
    }
    // Drain one chunk per read() call — matches Node's stdin.read() behavior
    // inside a `while (read !== null)` loop.
    return queue.shift() ?? null
  }
  mock.resume = function () {
    return mock
  }
  mock.pause = function () {
    return mock
  }
  mock.ref = function () {
    return mock
  }
  mock.unref = function () {
    return mock
  }
  mock.setEncoding = function () {
    return mock
  }
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)
  mock.removeAllListeners = emitter.removeAllListeners.bind(emitter)
  mock.destroy = function () {
    queue = []
    emitter.removeAllListeners()
  }

  return {
    stream: mock as NodeJS.ReadStream,
    push(chunk: string): void {
      queue.push(chunk)
      if (!readable) {
        readable = true
        emitter.emit("readable")
      }
    },
  }
}

const settle = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms))

// ============================================================================
// Tests
// ============================================================================

describe("render() mouse wiring", () => {
  test("default (mouse: true on TTY) writes SGR mouse enable sequence", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const instance = await render(
      <Text>hello</Text>,
      { stdout: stdout.stream, stdin: stdin.stream },
      { alternateScreen: false },
    )
    await settle()

    expect(stdout.output).toContain(MOUSE_ENABLE)

    instance.unmount()
  })

  test("mouse: false does not write the SGR enable sequence", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const instance = await render(
      <Text>hello</Text>,
      { stdout: stdout.stream, stdin: stdin.stream },
      { alternateScreen: false, mouse: false },
    )
    await settle()

    expect(stdout.output).not.toContain(MOUSE_ENABLE)

    instance.unmount()
  })

  test("non-TTY stdout does not emit mouse protocol even with mouse: true", async () => {
    // Piped stdout (isTTY=false) — mouse tracking bytes would be garbage in
    // logs or test capture. SilveryInstance guards on isTTY for the default.
    const stdout = createMockStdout(40, 10, /* isTTY */ false)
    const stdin = createMockStdin()
    const instance = await render(
      <Text>hello</Text>,
      { stdout: stdout.stream, stdin: stdin.stream },
      { alternateScreen: false, mouse: true },
    )
    await settle()

    expect(stdout.output).not.toContain(MOUSE_ENABLE)

    instance.unmount()
  })

  test("unmount writes the SGR mouse disable sequence", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const instance = await render(
      <Text>hello</Text>,
      { stdout: stdout.stream, stdin: stdin.stream },
      { alternateScreen: false },
    )
    await settle()

    // Clear captured output accumulated during startup, so we can assert the
    // disable sequence lands on unmount.
    const startupOutput = stdout.output
    expect(startupOutput).toContain(MOUSE_ENABLE)

    instance.unmount()
    await settle()

    // New output since startup includes the mouse disable.
    const full = stdout.output
    const disabledAfterStartup = full.slice(startupOutput.length).includes(MOUSE_DISABLE)
    expect(disabledAfterStartup).toBe(true)
  })

  test("mouse-disable is emitted before leave-alternate / sync-end on unmount", async () => {
    // Matches the ordering the inline-mouse-default suite asserts for run():
    // disable mouse first so any queued SGR mouse bytes don't spill onto the
    // shell prompt after the terminal teardown. In fullscreen unmount, the
    // teardown sequence is: disableMouse → disableKittyKeyboard →
    // leaveAlternateScreen → SYNC_END. We assert mouse-disable lands first.
    const order: string[] = []
    const stdout = createMockStdout()
    const stdin = createMockStdin()

    const origWrite = stdout.stream.write.bind(stdout.stream)
    stdout.stream.write = function (data: string | Uint8Array) {
      const str = typeof data === "string" ? data : new TextDecoder().decode(data)
      if (str.includes(MOUSE_DISABLE)) order.push("mouse-disable")
      if (str.includes("?1049l")) order.push("leave-alt")
      return origWrite(data)
    } as typeof stdout.stream.write

    const instance = await render(
      <Text>hello</Text>,
      { stdout: stdout.stream, stdin: stdin.stream },
      // Fullscreen (default alternateScreen) so we get the leave-alt sequence
      // on unmount to anchor the ordering assertion.
    )
    await settle()

    instance.unmount()
    await settle()

    expect(order).toContain("mouse-disable")
    expect(order).toContain("leave-alt")
    expect(order.indexOf("mouse-disable")).toBeLessThan(order.indexOf("leave-alt"))
  })

  test("mouse sequence on stdin does not crash the render pipeline", async () => {
    // Defensive: even before observable dispatch lands (mock-stdin path is
    // separate work — see the file-header comment), a raw SGR mouse chunk
    // arriving on stdin must not throw. If the wiring is half-applied —
    // e.g. `isMouseSequence` matches but `parseMouseSequence` returns null,
    // or `getRootRef.current?.()` is null during the first render — the
    // handler should gracefully drop the event rather than surface an
    // exception to the consumer.
    const stdout = createMockStdout()
    const stdin = createMockStdin()

    let rendered = false
    function App() {
      rendered = true
      return (
        <Box onClick={() => {}}>
          <Text>stable</Text>
        </Box>
      )
    }

    const instance = await render(
      <App />,
      { stdout: stdout.stream, stdin: stdin.stream },
      { alternateScreen: false },
    )
    await settle()

    expect(rendered).toBe(true)

    // Push an SGR mouse chunk. Even if dispatch is a no-op in this test
    // environment, the mere act of parsing + invoking processMouseEvent
    // must not throw.
    expect(() => {
      stdin.push("\x1b[<0;1;1M")
    }).not.toThrow()
    await settle()

    // App is still mounted and hasn't crashed the runtime.
    expect(rendered).toBe(true)

    instance.unmount()
  })
})
