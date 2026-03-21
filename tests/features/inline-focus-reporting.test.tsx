/**
 * Inline mode focus reporting default — verifies that inline mode disables
 * focus reporting by default.
 *
 * Focus reporting (CSI ?1004h) causes the terminal to send CSI I / CSI O
 * on focus-in/out. In inline mode, these escape sequences can leak to the
 * screen as "[[I" or "[[O" characters when the input parser doesn't consume
 * them (e.g., when the app receives a focus event between renders). This
 * also causes the input box to jitter up/down as the leaked text adds an
 * extra line.
 *
 * Two fixes:
 * 1. Removed unconditional enableFocusReporting() from TermProvider
 * 2. Inline mode defaults focusReporting to false (timing gap between
 *    enableFocusReporting and TermProvider stdin setup causes leaks)
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { EventEmitter } from "node:events"
import { Box, Text, useTerminalFocused } from "../../src/index.js"
import { run } from "../../packages/term/src/runtime/run"

const FOCUS_ENABLE = "?1004h"
const FOCUS_DISABLE = "?1004l"

/** Create a mock WriteStream that captures output. */
function createMockStdout(cols = 40, rows = 10) {
  const chunks: string[] = []
  const emitter = new EventEmitter()

  const mock = Object.create(emitter)
  mock.columns = cols
  mock.rows = rows
  mock.isTTY = true
  mock.writable = true
  mock.fd = 1
  mock.write = function (data: string | Uint8Array) {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
    return true
  }
  mock.end = function () {}
  mock.destroy = function () {}
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

/** Create a mock ReadStream. */
function createMockStdin() {
  const emitter = new EventEmitter()
  const mock = Object.create(emitter)
  mock.isTTY = true
  mock.isRaw = false
  mock.fd = 0
  mock.setRawMode = function (mode: boolean) {
    mock.isRaw = mode
    return mock
  }
  mock.read = function () {
    return null
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

  return mock as NodeJS.ReadStream
}

describe("inline mode focus reporting default", () => {
  test("fullscreen mode enables focus reporting by default", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      kitty: false,
      mouse: false,
    })

    expect(stdout.output).toContain(FOCUS_ENABLE)
    handle.unmount()
  })

  test("inline mode disables focus reporting by default", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      mode: "inline",
      kitty: false,
      mouse: false,
    })

    // Focus reporting disabled in inline mode: enableFocusReporting() runs
    // before the TermProvider's stdin listener is set up (events() generator
    // starts async). Focus events arriving during this gap leak to screen
    // as "[[I" text. In fullscreen mode, the alternate screen absorbs stray
    // output; in inline mode, it's visible.
    expect(stdout.output).not.toContain(FOCUS_ENABLE)
    handle.unmount()
  })

  test("inline mode with explicit focusReporting: true enables it", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      mode: "inline",
      focusReporting: true,
      kitty: false,
      mouse: false,
    })

    expect(stdout.output).toContain(FOCUS_ENABLE)
    handle.unmount()
  })

  test("focus reporting is enabled after stdin listener is attached (no ESC[I leak)", async () => {
    // Regression: focus reporting was enabled before the input parser's stdin
    // listener was attached. The terminal's immediate CSI I response leaked
    // as raw "[[I" text. Fix: defer focus reporting to after pumpEvents()
    // starts (which synchronously attaches the stdin listener).
    const stdout = createMockStdout()
    const stdin = createMockStdin()

    // Track when stdin "data" listener is attached and when focus enable is written
    let stdinListenerTime = 0
    let focusEnableTime = 0
    const origOn = stdin.on.bind(stdin)
    stdin.on = function (event: string, ...args: any[]) {
      if (event === "data" && !stdinListenerTime) stdinListenerTime = Date.now()
      return origOn(event, ...(args as [any]))
    } as any

    const origWrite = stdout.stream.write.bind(stdout.stream)
    stdout.stream.write = function (data: string | Uint8Array) {
      const str = typeof data === "string" ? data : new TextDecoder().decode(data)
      if (str.includes(FOCUS_ENABLE) && !focusEnableTime) focusEnableTime = Date.now()
      return origWrite(data)
    } as any

    const handle = await run(<Text>hello</Text>, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      focusReporting: true,
      kitty: false,
      mouse: false,
    })
    await settle(50)

    // Both should have fired
    expect(stdinListenerTime).toBeGreaterThan(0)
    expect(focusEnableTime).toBeGreaterThan(0)
    // stdin listener must be attached BEFORE focus reporting is enabled
    expect(stdinListenerTime).toBeLessThanOrEqual(focusEnableTime)
    handle.unmount()
  })
})

// ============================================================================
// useTerminalFocused hook
// ============================================================================

/** Test component that renders focused state as text. */
function FocusDisplay() {
  const focused = useTerminalFocused()
  return (
    <Box>
      <Text>{focused ? "FOCUSED" : "UNFOCUSED"}</Text>
    </Box>
  )
}

const CSI_FOCUS_IN = "\x1b[I"
const CSI_FOCUS_OUT = "\x1b[O"
const settle = (ms = 100) => new Promise((r) => setTimeout(r, ms))

describe("useTerminalFocused hook", () => {
  test("returns true by default (optimistic)", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<FocusDisplay />, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      focusReporting: true,
      kitty: false,
      mouse: false,
    })
    await settle()

    expect(stdout.output).toContain("FOCUSED")
    expect(stdout.output).not.toContain("UNFOCUSED")
    handle.unmount()
  })

  test("updates to false when CSI O (focus-out) is received", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<FocusDisplay />, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      focusReporting: true,
      kitty: false,
      mouse: false,
    })
    await settle()

    // Send focus-out event (CSI O) via stdin
    stdin.emit("data", CSI_FOCUS_OUT)
    await settle()

    expect(stdout.output).toContain("UNFOCUSED")
    handle.unmount()
  })

  test("updates back to true when CSI I (focus-in) follows CSI O", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(<FocusDisplay />, {
      stdout: stdout.stream,
      stdin,
      cols: 40,
      rows: 10,
      focusReporting: true,
      kitty: false,
      mouse: false,
    })
    await settle()

    // Focus out
    stdin.emit("data", CSI_FOCUS_OUT)
    await settle()
    expect(stdout.output).toContain("UNFOCUSED")

    // Focus back in
    stdin.emit("data", CSI_FOCUS_IN)
    await settle()

    // The output accumulates all renders. Find the last occurrence of FOCUSED/UNFOCUSED
    // to verify the final state is correct.
    const lastFocused = stdout.output.lastIndexOf("FOCUSED")
    const lastUnfocused = stdout.output.lastIndexOf("UNFOCUSED")
    // "FOCUSED" appears after "UNFOCUSED" — the final state is focused
    expect(lastFocused).toBeGreaterThan(lastUnfocused)
    handle.unmount()
  })
})
