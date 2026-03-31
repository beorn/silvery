/**
 * Tests for the scheduler's writeOutput option — routes render output
 * through a custom function instead of stdout.write().
 *
 * These tests verify the writeOutput wiring by testing the clear() method,
 * which writes a simple ANSI sequence without requiring a full node tree.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/scheduler-write-output.test.ts
 */
import { describe, expect, test } from "vitest"
import { RenderScheduler } from "@silvery/ag-term/scheduler"
import type { AgNode } from "@silvery/ag/types"

/** Minimal mock stdout. */
function createMockStdout() {
  const chunks: string[] = []
  const mock = {
    columns: 40,
    rows: 10,
    isTTY: false,
    write(data: string) {
      chunks.push(data)
      return true
    },
    on() {
      return mock
    },
    off() {
      return mock
    },
  }
  return { stream: mock as unknown as NodeJS.WriteStream, chunks }
}

describe("scheduler writeOutput option", () => {
  test("clear() routes through writeOutput when provided", () => {
    const customChunks: string[] = []
    const stdout = createMockStdout()

    const scheduler = new RenderScheduler({
      stdout: stdout.stream,
      root: {} as AgNode, // clear() doesn't use root
      writeOutput: (data: string) => {
        customChunks.push(data)
        return true
      },
    })

    scheduler.clear()

    // clear() writes ANSI clear screen sequence through writeOutput
    expect(customChunks.length).toBe(1)
    expect(customChunks[0]).toContain("\x1b[2J")
    // stdout.write should NOT have been called
    expect(stdout.chunks).toHaveLength(0)

    scheduler.dispose()
  })

  test("clear() writes to stdout.write when writeOutput not provided", () => {
    const stdout = createMockStdout()

    const scheduler = new RenderScheduler({
      stdout: stdout.stream,
      root: {} as AgNode,
    })

    scheduler.clear()

    // stdout.write should have been called
    expect(stdout.chunks.length).toBe(1)
    expect(stdout.chunks[0]).toContain("\x1b[2J")

    scheduler.dispose()
  })
})
