import React, { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { Box, Text } from "../../src/index.js"
import { run, usePanic } from "../../packages/ag-term/src/runtime/run"

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

function createMockStdin(): NodeJS.ReadStream {
  const stdin = {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode(_raw: boolean) {
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
    await settle()

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
})
