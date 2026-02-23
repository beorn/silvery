/**
 * Terminal Notification Tests
 *
 * Tests for OSC 9 (iTerm2) and OSC 99 (Kitty) notification escape sequences.
 */

import { describe, expect, test } from "vitest"
import { BEL, notifyITerm2, notifyKitty } from "../src/output.js"

describe("Terminal notifications", () => {
  describe("notifyITerm2", () => {
    test("generates OSC 9 sequence with message", () => {
      const result = notifyITerm2("Task complete")
      expect(result).toBe("\x1b]9;Task complete\x07")
    })

    test("handles empty message", () => {
      const result = notifyITerm2("")
      expect(result).toBe("\x1b]9;\x07")
    })

    test("handles message with special characters", () => {
      const result = notifyITerm2("Build: 100% done!")
      expect(result).toContain("Build: 100% done!")
      expect(result.startsWith("\x1b]9;")).toBe(true)
      expect(result.endsWith("\x07")).toBe(true)
    })
  })

  describe("notifyKitty", () => {
    test("generates OSC 99 sequence with message only", () => {
      const result = notifyKitty("Task complete")
      expect(result).toBe("\x1b]99;i=1:d=0;Task complete\x1b\\")
    })

    test("generates OSC 99 sequence with title", () => {
      const result = notifyKitty("Build finished", { title: "CI" })
      expect(result).toBe("\x1b]99;i=1:d=0;t=t;CI;Build finished\x1b\\")
    })

    test("handles empty title option", () => {
      const result = notifyKitty("Done", { title: "" })
      // Empty title should not add t= parameter
      expect(result).toBe("\x1b]99;i=1:d=0;Done\x1b\\")
    })

    test("handles no options", () => {
      const result = notifyKitty("Done")
      expect(result).not.toContain("t=t")
    })
  })

  describe("BEL constant", () => {
    test("is the BEL character", () => {
      expect(BEL).toBe("\x07")
    })
  })
})
