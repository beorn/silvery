/**
 * OSC 52 Clipboard Tests
 */

import { Writable } from "node:stream"
import { describe, expect, test } from "vitest"
import { copyToClipboard, parseClipboardResponse, requestClipboard } from "../src/clipboard.js"

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

describe("OSC 52 Clipboard", () => {
  describe("copyToClipboard", () => {
    test("generates correct OSC 52 sequence with base64 encoded text", () => {
      const stdout = createMockStdout()
      copyToClipboard(stdout, "hello")
      // "hello" in base64 is "aGVsbG8="
      expect(stdout.written).toBe("\x1b]52;c;aGVsbG8=\x07")
    })

    test("handles empty string", () => {
      const stdout = createMockStdout()
      copyToClipboard(stdout, "")
      // "" in base64 is ""
      expect(stdout.written).toBe("\x1b]52;c;\x07")
    })

    test("handles unicode text", () => {
      const stdout = createMockStdout()
      copyToClipboard(stdout, "日本語")
      const expected = Buffer.from("日本語").toString("base64")
      expect(stdout.written).toBe(`\x1b]52;c;${expected}\x07`)
    })

    test("handles multiline text", () => {
      const stdout = createMockStdout()
      const text = "line 1\nline 2\nline 3"
      copyToClipboard(stdout, text)
      const expected = Buffer.from(text).toString("base64")
      expect(stdout.written).toBe(`\x1b]52;c;${expected}\x07`)
    })
  })

  describe("requestClipboard", () => {
    test("generates correct OSC 52 query sequence", () => {
      const stdout = createMockStdout()
      requestClipboard(stdout)
      expect(stdout.written).toBe("\x1b]52;c;?\x07")
    })
  })

  describe("parseClipboardResponse", () => {
    test("decodes base64 content from OSC 52 response", () => {
      const base64 = Buffer.from("hello world").toString("base64")
      const input = `\x1b]52;c;${base64}\x07`
      expect(parseClipboardResponse(input)).toBe("hello world")
    })

    test("returns null for non-clipboard input", () => {
      expect(parseClipboardResponse("regular text")).toBeNull()
    })

    test("returns null for empty string", () => {
      expect(parseClipboardResponse("")).toBeNull()
    })

    test("returns null for other OSC sequences", () => {
      expect(parseClipboardResponse("\x1b]0;window title\x07")).toBeNull()
    })

    test("decodes unicode content", () => {
      const base64 = Buffer.from("日本語").toString("base64")
      const input = `\x1b]52;c;${base64}\x07`
      expect(parseClipboardResponse(input)).toBe("日本語")
    })

    test("handles empty clipboard content", () => {
      const input = "\x1b]52;c;\x07"
      expect(parseClipboardResponse(input)).toBe("")
    })

    test("handles ST (ESC backslash) terminator as well as BEL", () => {
      const base64 = Buffer.from("test").toString("base64")
      const input = `\x1b]52;c;${base64}\x1b\\`
      expect(parseClipboardResponse(input)).toBe("test")
    })

    test("returns null when response contains query marker instead of data", () => {
      // The query sequence itself should not be parsed as a response
      const input = "\x1b]52;c;?\x07"
      expect(parseClipboardResponse(input)).toBeNull()
    })
  })
})
