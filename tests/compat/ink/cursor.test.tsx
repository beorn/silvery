/**
 * Ink compat test: cursor management (from ink/test/cursor.tsx)
 * Tests cursor visibility, position tracking, and useStdout/useStderr interaction.
 */
import React, { Suspense, act, useEffect, useState } from "react"
import { test, expect, beforeAll, vi } from "vitest"
import { render, Box, Text, useInput, useCursor, useStdout, useStderr } from "../../../packages/compat/src/ink"
import { ensureDefaultLayoutEngine } from "../../../packages/term/src/layout-engine"
import createStdout, { type FakeStdout } from "./helpers/create-stdout"
import { createStdin, emitReadable } from "./helpers/create-stdin"

const showCursorEscape = "\u001B[?25h"
const hideCursorEscape = "\u001B[?25l"

beforeAll(async () => {
  await ensureDefaultLayoutEngine()
  // Enable React act() environment for Suspense tests
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
})

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const getWriteCalls = (stream: NodeJS.WriteStream): string[] => {
  const writes: string[] = []
  const writeFn = stream.write as ReturnType<typeof vi.fn>
  for (const call of writeFn.mock.calls) {
    writes.push(call[0] as string)
  }
  return writes
}

const waitForCondition = async (condition: () => boolean): Promise<void> => {
  if (condition()) return
  const timeoutMs = 2000
  const intervalMs = 10
  const maxAttempts = Math.ceil(timeoutMs / intervalMs)

  await new Promise<void>((resolve, reject) => {
    let attempts = 0
    const interval = setInterval(() => {
      try {
        if (condition()) {
          clearInterval(interval)
          resolve()
          return
        }
      } catch (error) {
        clearInterval(interval)
        reject(error instanceof Error ? error : new Error("Condition check threw"))
        return
      }
      attempts++
      if (attempts >= maxAttempts) {
        clearInterval(interval)
        reject(new Error(`Condition was not met in ${timeoutMs}ms`))
      }
    }, intervalMs)
  })
}

// ============================================================================
// Suspense / concurrent cursor leak
// ============================================================================

test("cursor position does not leak from suspended concurrent render to fallback", async () => {
  const stdout = createStdout()
  const stdin = createStdin()

  let resolvePromise: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  let suspended = true

  function CursorChild() {
    const { setCursorPosition } = useCursor()
    setCursorPosition({ x: 5, y: 0 }) // Render-phase side effect
    if (suspended) {
      throw promise
    }
    return <Text>loaded</Text>
  }

  function Test() {
    return (
      <Suspense fallback={<Text>loading</Text>}>
        <CursorChild />
      </Suspense>
    )
  }

  await act(async () => {
    render(<Test />, { stdout, stdin })
  })

  const fallbackOutput = getWriteCalls(stdout).join("")
  expect(fallbackOutput).toContain("loading")
  expect(fallbackOutput).not.toContain(showCursorEscape)

  // Cleanup: resolve promise
  suspended = false
  resolvePromise!()
  await act(async () => {
    await delay(50)
  })
})

// ============================================================================
// Cursor remains visible after useStdout/useStderr writes
// ============================================================================

function StdoutWriteApp() {
  const { setCursorPosition } = useCursor()
  const { write } = useStdout()

  setCursorPosition({ x: 2, y: 0 })

  useEffect(() => {
    write("from stdout hook\n")
  }, [write])

  return <Text>Hello</Text>
}

function StderrWriteApp() {
  const { setCursorPosition } = useCursor()
  const { write } = useStderr()

  setCursorPosition({ x: 2, y: 0 })

  useEffect(() => {
    write("from stderr hook\n")
  }, [write])

  return <Text>Hello</Text>
}

test("cursor remains visible after useStdout().write()", async () => {
  const stdout = createStdout()
  const stdin = createStdin()

  const { unmount } = render(<StdoutWriteApp />, { stdout, stdin })
  await delay(50)

  const output = getWriteCalls(stdout).join("")
  const lastShowIndex = output.lastIndexOf(showCursorEscape)
  const lastHideIndex = output.lastIndexOf(hideCursorEscape)

  expect(output).toContain("from stdout hook")
  expect(lastShowIndex).toBeGreaterThan(lastHideIndex)

  unmount()
})

test("cursor remains visible after useStderr().write()", async () => {
  const stdout = createStdout()
  const stdin = createStdin()
  const stderr = createStdout()

  const { unmount } = render(<StderrWriteApp />, { stdout, stderr, stdin })
  await delay(50)

  const output = getWriteCalls(stdout).join("")
  const lastShowIndex = output.lastIndexOf(showCursorEscape)
  const lastHideIndex = output.lastIndexOf(hideCursorEscape)

  const stderrWrites = getWriteCalls(stderr)
  expect(stderrWrites.some((w) => w.includes("from stderr hook"))).toBe(true)
  expect(lastShowIndex).toBeGreaterThan(lastHideIndex)

  unmount()
})

// ============================================================================
// Debug mode: useStdout/useStderr write replays
// ============================================================================

function DebugStdoutWriteApp() {
  const { write } = useStdout()

  useEffect(() => {
    write("from stdout hook\n")
  }, [write])

  return <Text>Hello</Text>
}

function DebugStderrWriteApp() {
  const { write } = useStderr()

  useEffect(() => {
    write("from stderr hook\n")
  }, [write])

  return <Text>Hello</Text>
}

test("debug mode: useStdout().write() replays latest frame", async () => {
  const stdout = createStdout()
  const { unmount } = render(<DebugStdoutWriteApp />, { stdout, debug: true })
  await waitForCondition(() => getWriteCalls(stdout).some((write) => write.includes("from stdout hook\nHello")))

  const writes = getWriteCalls(stdout)
  const hookWrite = writes.find((write) => write.includes("from stdout hook\nHello"))

  expect(hookWrite).toBeTruthy()
  expect(writes).not.toContain("")

  unmount()
})

test("debug mode: useStdout().write() does not leak into stderr", async () => {
  const stdout = createStdout()
  const stderr = createStdout()
  const { unmount } = render(<DebugStdoutWriteApp />, {
    stdout,
    stderr,
    debug: true,
  })
  await waitForCondition(() => getWriteCalls(stdout).some((write) => write.includes("from stdout hook\nHello")))

  const stderrWrites = getWriteCalls(stderr)
  expect(stderrWrites.some((write) => write.includes("from stdout hook\n"))).toBe(false)
  expect(stderrWrites.some((write) => write.includes("Hello"))).toBe(false)
  expect(stderrWrites).not.toContain("")

  unmount()
})

test("debug mode: useStderr().write() replays latest frame without empty writes", async () => {
  const stdout = createStdout()
  const stderr = createStdout()
  const { unmount } = render(<DebugStderrWriteApp />, {
    stdout,
    stderr,
    debug: true,
  })
  await waitForCondition(() => getWriteCalls(stderr).some((write) => write.includes("from stderr hook\n")))
  await waitForCondition(() => getWriteCalls(stdout).length > 1)

  const stdoutWrites = getWriteCalls(stdout)
  const stderrWrites = getWriteCalls(stderr)
  const stdoutWritesAfterInitialRender = stdoutWrites.slice(1)

  expect(stderrWrites.some((write) => write.includes("from stderr hook\n"))).toBe(true)
  expect(stderrWrites.some((write) => write.includes("Hello"))).toBe(false)
  expect(stdoutWritesAfterInitialRender.length).toBeGreaterThan(0)
  expect(stdoutWritesAfterInitialRender.some((write) => write.includes("Hello"))).toBe(true)
  expect(stdoutWritesAfterInitialRender.some((write) => write.includes("from stderr hook\n"))).toBe(false)
  expect(stdoutWrites).not.toContain("")
  expect(stderrWrites).not.toContain("")

  unmount()
})

function DebugStderrWriteAfterRerenderApp() {
  const [text, setText] = useState("Initial")
  const { write } = useStderr()

  useEffect(() => {
    setText("Updated")
  }, [])

  useEffect(() => {
    if (text === "Updated") {
      write("from stderr hook\n")
    }
  }, [text, write])

  return <Text>{text}</Text>
}

function DebugStdoutWriteAfterRerenderApp() {
  const [text, setText] = useState("Initial")
  const { write } = useStdout()

  useEffect(() => {
    setText("Updated")
  }, [])

  useEffect(() => {
    if (text === "Updated") {
      write("from stdout hook\n")
    }
  }, [text, write])

  return <Text>{text}</Text>
}

test("debug mode: useStdout().write() replays rerendered frame", async () => {
  const stdout = createStdout()
  const { unmount } = render(<DebugStdoutWriteAfterRerenderApp />, {
    stdout,
    debug: true,
  })
  await waitForCondition(() => getWriteCalls(stdout).some((write) => write.includes("from stdout hook\nUpdated")))

  const stdoutWrites = getWriteCalls(stdout)

  expect(stdoutWrites.some((write) => write.includes("from stdout hook\nUpdated"))).toBe(true)
  expect(stdoutWrites.some((write) => write.includes("from stdout hook\nInitial"))).toBe(false)
  expect(stdoutWrites).not.toContain("")

  unmount()
})

test("debug mode: useStderr().write() replays rerendered frame", async () => {
  const stdout = createStdout()
  const stderr = createStdout()
  const { unmount } = render(<DebugStderrWriteAfterRerenderApp />, {
    stdout,
    stderr,
    debug: true,
  })
  await waitForCondition(() => getWriteCalls(stderr).some((write) => write.includes("from stderr hook\n")))
  await waitForCondition(() =>
    getWriteCalls(stdout)
      .slice(1)
      .some((write) => write.includes("Updated")),
  )

  const stdoutWrites = getWriteCalls(stdout)
  const stderrWrites = getWriteCalls(stderr)
  const stdoutWritesAfterInitialRender = stdoutWrites.slice(1)

  expect(stderrWrites.some((write) => write.includes("from stderr hook\n"))).toBe(true)
  expect(stderrWrites.some((write) => write.includes("Updated"))).toBe(false)
  expect(stderrWrites.some((write) => write.includes("Initial"))).toBe(false)
  expect(stdoutWritesAfterInitialRender.some((write) => write.includes("Updated"))).toBe(true)
  expect(stdoutWritesAfterInitialRender.some((write) => write.includes("Initial"))).toBe(false)
  expect(stdoutWritesAfterInitialRender.some((write) => write.includes("from stderr hook\n"))).toBe(false)
  expect(stdoutWrites).not.toContain("")
  expect(stderrWrites).not.toContain("")

  unmount()
})
