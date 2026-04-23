/**
 * term.input — Phase 2 of km-silvery.term-sub-owners
 *
 * Verifies the Term sub-owner exposition: createTerm() makes the InputOwner
 * accessible as `term.input` (lazy for Node TTY, undefined elsewhere).
 *
 * The race-safety + termios contract is tested in input-owner.test.ts and
 * input-owner-integration.test.ts; this file just verifies the wire-up.
 */

import { describe, expect, test } from "vitest"
import { createTerm } from "../../packages/ag-term/src/ansi/term"

describe("term.input — Phase 2 wire-up", () => {
  test("headless term has no input sub-owner", () => {
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.input).toBeUndefined()
  })

  test("Node term with non-TTY stdin has no input sub-owner", () => {
    // Force non-TTY: createTerm() with explicit stdin that has isTTY=false.
    const fakeStdin = { isTTY: false } as unknown as NodeJS.ReadStream
    const term = createTerm({ stdin: fakeStdin })
    expect(term.input).toBeUndefined()
  })

  test("Node term with TTY stdin has an input sub-owner with probe + structured events", () => {
    // We can't easily test the real process.stdin (raw mode + listener
    // attachment has process-wide side effects), so simulate a TTY shape.
    // The InputOwner construction validates the contract.
    const fakeStdin = {
      isTTY: true,
      isRaw: false,
      setRawMode: () => {},
      resume: () => {},
      pause: () => {},
      setEncoding: () => {},
      on: () => fakeStdin,
      off: () => fakeStdin,
      removeListener: () => fakeStdin,
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream
    const fakeStdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: () => true,
      on: () => fakeStdout,
      off: () => fakeStdout,
    } as unknown as NodeJS.WriteStream
    const term = createTerm({ stdin: fakeStdin, stdout: fakeStdout })
    expect(term.input).toBeDefined()
    expect(typeof term.input?.probe).toBe("function")
    expect(typeof term.input?.onKey).toBe("function")
    expect(typeof term.input?.onMouse).toBe("function")
    expect(typeof term.input?.onPaste).toBe("function")
    expect(typeof term.input?.onFocus).toBe("function")
  })

  test("input is lazy — same instance across accesses", () => {
    const fakeStdin = {
      isTTY: true,
      isRaw: false,
      setRawMode: () => {},
      resume: () => {},
      pause: () => {},
      setEncoding: () => {},
      on: () => fakeStdin,
      off: () => fakeStdin,
      removeListener: () => fakeStdin,
      listenerCount: () => 0,
    } as unknown as NodeJS.ReadStream
    const fakeStdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: () => true,
      on: () => fakeStdout,
      off: () => fakeStdout,
    } as unknown as NodeJS.WriteStream
    const term = createTerm({ stdin: fakeStdin, stdout: fakeStdout })
    const a = term.input
    const b = term.input
    expect(a).toBe(b)
  })
})
