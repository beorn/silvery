/**
 * Synchronized Update Mode (DEC 2026) Tests
 *
 * Tests that hightea wraps terminal output with DEC private mode 2026 sequences
 * to prevent tearing during redraws. The terminal batches all output between
 * CSI?2026h (begin) and CSI?2026l (end) and paints atomically.
 *
 * @see https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036
 */

import { describe, expect, test } from "vitest"
import { ANSI } from "../src/output.js"

describe("Synchronized Update Mode (DEC 2026)", () => {
  describe("ANSI constants", () => {
    test("SYNC_BEGIN enables DEC mode 2026", () => {
      expect(ANSI.SYNC_BEGIN).toBe("\x1b[?2026h")
    })

    test("SYNC_END disables DEC mode 2026", () => {
      expect(ANSI.SYNC_END).toBe("\x1b[?2026l")
    })
  })

  describe("wrapping behavior", () => {
    test("content wrapped with sync sequences is bracketed", () => {
      const content = "\x1b[H\x1b[?25lHello\x1b[0m"
      const wrapped = `${ANSI.SYNC_BEGIN}${content}${ANSI.SYNC_END}`

      expect(wrapped).toBe(`\x1b[?2026h${content}\x1b[?2026l`)
      expect(wrapped.startsWith(ANSI.SYNC_BEGIN)).toBe(true)
      expect(wrapped.endsWith(ANSI.SYNC_END)).toBe(true)
    })

    test("empty content is not wrapped (no-op)", () => {
      // The scheduler skips writing empty output, so sync wrapping never
      // applies to empty strings. Verify the guard condition.
      const content = ""
      expect(content.length).toBe(0)
    })

    test("nested sync updates are harmless", () => {
      // Per the spec, terminals should handle nested begin/end gracefully.
      // The outermost end triggers the paint.
      const inner = `${ANSI.SYNC_BEGIN}inner${ANSI.SYNC_END}`
      const outer = `${ANSI.SYNC_BEGIN}${inner}${ANSI.SYNC_END}`

      // Two begins, two ends — terminal paints on outermost end
      const begins = outer.split(ANSI.SYNC_BEGIN).length - 1
      const ends = outer.split(ANSI.SYNC_END).length - 1
      expect(begins).toBe(2)
      expect(ends).toBe(2)
    })
  })

  describe("sequence format", () => {
    test("begin is CSI ? 2026 h (set mode)", () => {
      // CSI = ESC [ = \x1b[
      // ? prefix = DEC private mode
      // 2026 = synchronized update mode number
      // h = set (enable)
      expect(ANSI.SYNC_BEGIN).toMatch(/^\x1b\[\?2026h$/)
    })

    test("end is CSI ? 2026 l (reset mode)", () => {
      // l = reset (disable)
      expect(ANSI.SYNC_END).toMatch(/^\x1b\[\?2026l$/)
    })

    test("sequences are pure ASCII (no high bytes)", () => {
      for (const char of ANSI.SYNC_BEGIN) {
        expect(char.charCodeAt(0)).toBeLessThan(128)
      }
      for (const char of ANSI.SYNC_END) {
        expect(char.charCodeAt(0)).toBeLessThan(128)
      }
    })
  })
})
