/**
 * Stream privacy — stdin/stdout must NOT be reachable via cast.
 *
 * Phase A3 of km-silvery.pro-review-p1: the public `Term` interface already
 * excluded stdin/stdout, but they remained as enumerable own properties on
 * the termBase underlying object, so `(term as any).stdin` worked. Now the
 * streams live under Symbol-keyed own properties; only `getInternalStreams`
 * (which imports the symbols from term-internal) can read them.
 */

import { describe, expect, test } from "vitest"
import { createTerm } from "@silvery/ag-term"
import {
  getInternalStreams,
  STDIN_SYMBOL,
  STDOUT_SYMBOL,
} from "@silvery/ag-term/runtime/term-internal"

describe("stream privacy at runtime", () => {
  test("node-backed term hides stdin/stdout behind Symbol keys", () => {
    using term = createTerm()
    // Casts can't reach them.
    expect((term as unknown as Record<string, unknown>).stdin).toBeUndefined()
    expect((term as unknown as Record<string, unknown>).stdout).toBeUndefined()
    // Symbol-keyed accessor still works for silvery's own adapters.
    const streams = getInternalStreams(term)
    expect(streams.stdin).toBeDefined()
    expect(streams.stdout).toBeDefined()
  })

  test("headless term exposes process streams via the symbol accessor", () => {
    using term = createTerm({ cols: 80, rows: 24 })
    expect((term as unknown as Record<string, unknown>).stdin).toBeUndefined()
    expect((term as unknown as Record<string, unknown>).stdout).toBeUndefined()
    const streams = getInternalStreams(term)
    expect(streams.stdin).toBe(process.stdin)
    expect(streams.stdout).toBe(process.stdout)
  })

  test("symbol keys are not enumerable via Object.keys / for-in", () => {
    using term = createTerm({ cols: 80, rows: 24 })
    const keys = Object.keys(term as unknown as object)
    expect(keys).not.toContain("stdin")
    expect(keys).not.toContain("stdout")
    // Reflect.ownKeys on the underlying object would still include the
    // symbols — that's the expected internal handshake between factories
    // and `getInternalStreams`, not a leak.
    expect(typeof STDIN_SYMBOL).toBe("symbol")
    expect(typeof STDOUT_SYMBOL).toBe("symbol")
  })
})
