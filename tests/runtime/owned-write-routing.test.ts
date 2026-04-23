/**
 * Owned-write routing regression tests — Pro review 2026-04-22, finding P0-1.
 *
 * When `term.output.activate()` monkey-patches `process.stdout.write`, any
 * silvery-owned write (mode toggle, `term.write`, probe query via InputOwner)
 * that still reaches for the captured `stdout.write` closure lands in the
 * patched sink and can be suppressed. The fix: every owned write flows
 * through the `ownedWrite` router in `createNodeTerm` which consults the
 * Output owner's `active()` signal and routes through `output.write(...)` —
 * which bypasses the sink — when active.
 */

import { describe, expect, test } from "vitest"
import { createTerm } from "@silvery/ag-term"
import { Writable } from "node:stream"

/**
 * Node-term requires `stdout === process.stdout` to construct a real Output
 * owner (see `getOutput` in ansi/term.ts). Use a PassThrough-style writable
 * temporarily swapped in place so we can observe what reaches it once
 * `output.activate()` has patched the global.
 */
function swapStdoutWrite(capture: (s: string) => void): () => void {
  const original = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = ((
    chunk: string | Uint8Array,
  ): boolean => {
    const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
    capture(s)
    return true
  }) as typeof process.stdout.write
  return () => {
    process.stdout.write = original as typeof process.stdout.write
  }
}

describe("ownedWrite routing — mode toggles survive output.activate()", () => {
  test("term.modes.altScreen(true) after output.activate() reaches the terminal (not suppressed)", () => {
    // stdout must be process.stdout for the real Output owner to attach.
    const captured: string[] = []
    const restore = swapStdoutWrite((s) => captured.push(s))

    try {
      using term = createTerm()
      const output = term.output
      expect(output, "real Output owner required").toBeDefined()
      if (!output) return

      // Activate output — this patches process.stdout.write into Output's
      // sink. A "bare" write to the swapped stdout would be dropped/counted.
      output.activate({ bufferStderr: true })

      // Write a mode toggle. Pre-fix, `createModes({ write: (s) => stdout.write(s) })`
      // captured the pre-activate stdout at construction, so this landed in
      // the sink. Post-fix, modes writes through ownedWrite which sees
      // output.active() and routes through output.write() — which bypasses
      // the sink and reaches the swapped stdout directly.
      const before = captured.length
      term.modes.altScreen(true)
      const altScreenAnsi = captured.slice(before).join("")

      expect(altScreenAnsi, "mode ANSI should reach the swapped stdout").toMatch(/\[\?1049h/)

      // Flip it off for cleanup so we're not left in alt screen.
      term.modes.altScreen(false)
      output.deactivate()
    } finally {
      restore()
    }
  })

  test("term.write() after output.activate() reaches the terminal (not suppressed)", () => {
    const captured: string[] = []
    const restore = swapStdoutWrite((s) => captured.push(s))

    try {
      using term = createTerm()
      if (!term.output) return
      term.output.activate({ bufferStderr: true })

      const before = captured.length
      term.write("owned payload\n")
      const written = captured.slice(before).join("")

      expect(written).toContain("owned payload")

      term.output.deactivate()
    } finally {
      restore()
    }
  })

  test("foreign process.stdout.write IS still suppressed after output.activate()", () => {
    // The complementary contract: ownedWrite routes OWN writes through
    // output.write (bypass sink), but anything that calls process.stdout.write
    // directly still lands in the sink (suppressed). This is the whole point
    // of Output's guard.
    const captured: string[] = []
    const restore = swapStdoutWrite((s) => captured.push(s))

    try {
      using term = createTerm()
      if (!term.output) return
      term.output.activate({ bufferStderr: true })

      const before = captured.length
      // Someone else (a foreign library) writes to stdout directly:
      process.stdout.write("foreign payload\n")
      const written = captured.slice(before).join("")

      expect(written, "foreign writes must not reach the terminal during alt-screen").toBe("")
      expect(term.output.suppressedCount).toBeGreaterThan(0)

      term.output.deactivate()
    } finally {
      restore()
    }
  })
})
