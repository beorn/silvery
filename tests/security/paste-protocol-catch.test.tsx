/**
 * Pre-enrollment security audit (hh 28598 slice e F11): public
 * parseBracketedPaste callers must catch its documented ProtocolError.
 *
 * The parser still throws when PASTE_START is in a chunk and PASTE_END is
 * not. render() (and the xterm/canvas siblings) used to let that throw
 * leave the stdin readable listener and kill the host. Catch and fall
 * through, matching renderer.ts. Parser contract stays throw.
 *
 * @failure A paste start with no end in the same chunk kills render().
 * @level l2
 * @consumer @silvery/ag-react render (hh 28598 F11)
 * @testonly none
 */

import EventEmitter from "node:events"
import React from "react"
import { describe, expect, test } from "vitest"
import { Text } from "../../src/index.js"
import { render } from "../../packages/ag-react/src/render"
import { parseBracketedPaste, PASTE_START } from "../../packages/ag-term/src/bracketed-paste"
import { ProtocolError } from "@silvery/ansi"

function createMockStdout(cols = 40, rows = 6): NodeJS.WriteStream {
  const emitter = new EventEmitter()
  const mock = Object.create(emitter) as NodeJS.WriteStream
  Object.assign(mock, {
    columns: cols,
    rows,
    isTTY: true,
    writable: true,
    fd: 1,
    write: () => true,
    end: () => {},
    destroy: () => {},
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    addListener: emitter.addListener.bind(emitter),
  })
  return mock
}

function createMockStdin(): { stream: NodeJS.ReadStream; push: (chunk: string) => void } {
  const emitter = new EventEmitter()
  let queue: string[] = []
  let readable = false
  const mock = Object.create(emitter)
  Object.assign(mock, {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode(mode: boolean) {
      mock.isRaw = mode
      return mock
    },
    read(): string | null {
      if (queue.length === 0) {
        readable = false
        return null
      }
      return queue.shift() ?? null
    },
    resume() {
      return mock
    },
    pause() {
      return mock
    },
    ref() {
      return mock
    },
    unref() {
      return mock
    },
    setEncoding() {
      return mock
    },
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    addListener: emitter.addListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
    destroy() {
      queue = []
      emitter.removeAllListeners()
    },
  })
  return {
    stream: mock as NodeJS.ReadStream,
    push(chunk: string) {
      queue.push(chunk)
      if (!readable) {
        readable = true
        emitter.emit("readable")
      }
    },
  }
}

const settle = (ms = 40) => new Promise<void>((r) => setTimeout(r, ms))

describe("parseBracketedPaste callers catch ProtocolError (hh 28598 F11)", () => {
  test("parser contract: PASTE_START without PASTE_END still throws", () => {
    expect(() => parseBracketedPaste(`${PASTE_START}abc`)).toThrow(ProtocolError)
  })

  test("render() does not throw when a paste start arrives without an end", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const instance = await render(
      <Text>probe</Text>,
      { stdout, stdin: stdin.stream },
      { alternateScreen: false },
    )
    try {
      await settle()
      expect(() => stdin.push(`${PASTE_START}abc`)).not.toThrow()
      await settle()
    } finally {
      instance.unmount()
    }
  })
})
