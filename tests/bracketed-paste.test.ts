/**
 * Bracketed Paste Mode Tests
 */

import { Writable } from "node:stream"
import { describe, expect, test } from "vitest"
import {
  PASTE_END,
  PASTE_START,
  disableBracketedPaste,
  enableBracketedPaste,
  parseBracketedPaste,
} from "../src/bracketed-paste.js"

/** Create a mock stdout that captures writes */
function createMockStdout(): NodeJS.WriteStream & { written: string } {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  }) as NodeJS.WriteStream & { written: string }

  Object.defineProperty(stream, "written", {
    get: () => chunks.join(""),
  })

  return stream
}

describe("Bracketed Paste", () => {
  describe("constants", () => {
    test("PASTE_START is the correct escape sequence", () => {
      expect(PASTE_START).toBe("\x1b[200~")
    })

    test("PASTE_END is the correct escape sequence", () => {
      expect(PASTE_END).toBe("\x1b[201~")
    })
  })

  describe("enableBracketedPaste", () => {
    test("writes DEC private mode 2004 enable sequence", () => {
      const stdout = createMockStdout()
      enableBracketedPaste(stdout)
      expect(stdout.written).toBe("\x1b[?2004h")
    })
  })

  describe("disableBracketedPaste", () => {
    test("writes DEC private mode 2004 disable sequence", () => {
      const stdout = createMockStdout()
      disableBracketedPaste(stdout)
      expect(stdout.written).toBe("\x1b[?2004l")
    })
  })

  describe("parseBracketedPaste", () => {
    test("extracts pasted content from bracketed sequence", () => {
      const input = `${PASTE_START}hello world${PASTE_END}`
      const result = parseBracketedPaste(input)
      expect(result).toEqual({ type: "paste", content: "hello world" })
    })

    test("returns null when no paste markers present", () => {
      expect(parseBracketedPaste("regular input")).toBeNull()
    })

    test("returns null for empty string", () => {
      expect(parseBracketedPaste("")).toBeNull()
    })

    test("handles empty paste content", () => {
      const input = `${PASTE_START}${PASTE_END}`
      const result = parseBracketedPaste(input)
      expect(result).toEqual({ type: "paste", content: "" })
    })

    test("handles multiline paste content", () => {
      const pasted = "line 1\nline 2\nline 3"
      const input = `${PASTE_START}${pasted}${PASTE_END}`
      const result = parseBracketedPaste(input)
      expect(result).toEqual({ type: "paste", content: pasted })
    })

    test("handles paste with special characters", () => {
      const pasted = "tabs\there and\nnewlines\r\nand unicode: 日本語"
      const input = `${PASTE_START}${pasted}${PASTE_END}`
      const result = parseBracketedPaste(input)
      expect(result).toEqual({ type: "paste", content: pasted })
    })

    test("returns null when only start marker present (incomplete paste)", () => {
      const input = `${PASTE_START}partial content without end`
      expect(parseBracketedPaste(input)).toBeNull()
    })

    test("returns null when only end marker present", () => {
      const input = `some content${PASTE_END}`
      expect(parseBracketedPaste(input)).toBeNull()
    })

    test("extracts content when paste markers are surrounded by other input", () => {
      const input = `prefix${PASTE_START}pasted text${PASTE_END}suffix`
      const result = parseBracketedPaste(input)
      expect(result).toEqual({ type: "paste", content: "pasted text" })
    })
  })
})
