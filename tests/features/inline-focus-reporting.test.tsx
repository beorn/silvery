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
 * Fix: inline mode defaults focusReporting to false (same as mouse).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { EventEmitter } from "node:events"
import { Text } from "../../src/index.js"
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

    // Should NOT enable focus reporting in inline mode
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
})
