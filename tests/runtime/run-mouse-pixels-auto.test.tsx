import EventEmitter from "node:events"
import React from "react"
import { describe, expect, test } from "vitest"
import { Text } from "../../src/index.js"
import { createTerminalProfile } from "@silvery/ansi"
import { run } from "../../packages/ag-term/src/runtime/run"

function createMockTTY(): {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  output: () => string
} {
  const stdinEmitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const chunks: string[] = []
  let raw = false

  const stdin = Object.assign(stdinEmitter, {
    isTTY: true,
    get isRaw() {
      return raw
    },
    setRawMode(next: boolean) {
      raw = next
      return stdin
    },
    resume() {},
    pause() {},
    setEncoding() {},
  }) as unknown as NodeJS.ReadStream

  const stdout = Object.assign(stdoutEmitter, {
    isTTY: true,
    columns: 100,
    rows: 24,
    write(data: string | Uint8Array) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data)
      chunks.push(text)
      if (text.includes("\x1b[14t")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[4;384;800t"))
      }
      if (text.includes("\x1b[18t")) {
        queueMicrotask(() => stdinEmitter.emit("data", "\x1b[8;24;100t"))
      }
      return true
    },
  }) as unknown as NodeJS.WriteStream

  return { stdin, stdout, output: () => chunks.join("") }
}

describe("run() SGR-Pixels mouse default", () => {
  test("mouse=true auto-enables SGR-Pixels when cell-size probing succeeds", async () => {
    const { stdin, stdout, output } = createMockTTY()
    const handle = await run(<Text>hello</Text>, {
      stdin,
      stdout,
      profile: createTerminalProfile(),
      mouse: true,
    })

    expect(output()).toContain("\x1b[?1003h\x1b[?1006h\x1b[?1016h")
    handle.unmount()
  })
})
