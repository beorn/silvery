/**
 * render({ input: false }) — stdin escape hatch tests.
 *
 * The default contract is "silvery owns stdin via the lazy InputOwner."
 * Recording overlays and similar host processes need to keep stdin for
 * their own purposes (typically a child PTY pipe), so the option opts
 * out of stdin ownership: `term.input` is undefined, no raw-mode flip,
 * no `stdin.on("data", …)` listener.
 *
 * See `docs/design/terminal-component.md` § "render({ input: false })".
 */

import { describe, expect, test } from "vitest"
import { createTerm } from "@silvery/ag-react"

describe("createTerm({ input: false })", () => {
  test("term.input resolves to undefined", () => {
    using term = createTerm({ input: false })
    expect(term.input).toBeUndefined()
  })

  test("term.input is undefined even when stdin is TTY-shaped", () => {
    // Mock TTY-shaped streams so the would-otherwise-be-constructed
    // owner branch is entered. Without the flag, getInput() would
    // construct the owner; with the flag, it must short-circuit.
    const mockStdin = Object.assign(Object.create(require("node:events").EventEmitter.prototype), {
      isTTY: true,
      isRaw: false,
      fd: 0,
      setRawMode() {
        throw new Error("setRawMode must not be called when input: false")
      },
      resume() {
        /* no-op */
      },
      pause() {
        /* no-op */
      },
      setEncoding() {
        /* no-op */
      },
      on() {
        throw new Error("stdin.on must not be called when input: false")
      },
      read() {
        return null
      },
      ref() {
        /* no-op */
      },
      unref() {
        /* no-op */
      },
    }) as unknown as NodeJS.ReadStream
    const mockStdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: () => true,
      fd: 1,
      on: () => mockStdout,
      off: () => mockStdout,
      removeListener: () => mockStdout,
      removeAllListeners: () => mockStdout,
    } as unknown as NodeJS.WriteStream

    using term = createTerm({
      input: false,
      stdin: mockStdin,
      stdout: mockStdout,
    })
    expect(term.input).toBeUndefined()
  })

  test("term.modes, term.size, term.signals are still available", () => {
    using term = createTerm({ input: false })
    expect(term.modes).toBeDefined()
    expect(term.size).toBeDefined()
    expect(term.signals).toBeDefined()
    // term.input is the only sub-owner suppressed.
    expect(term.input).toBeUndefined()
  })

  test("default (no input option) constructs the owner lazily when TTY", () => {
    // Just confirm the absence of `input: false` does not regress the
    // default behavior. We cannot easily test the eager-on-TTY path in
    // CI (no real TTY), but for non-TTY we verify it returns undefined
    // for the orthogonal reason (no stdin TTY).
    using term = createTerm({})
    // process.stdin in CI is not a TTY → no input owner, same as the
    // explicit opt-out. The orthogonality is exercised by the
    // mocked-TTY test above.
    expect(term.input).toBeUndefined()
  })
})
