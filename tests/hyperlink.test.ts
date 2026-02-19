/**
 * Tests for OSC 8 hyperlink support.
 *
 * OSC 8 format:
 *   Open:  \x1b]8;;URL\x1b\\   (or \x1b]8;;URL\x07)
 *   Close: \x1b]8;;\x1b\\      (or \x1b]8;;\x07)
 *
 * These tests verify that:
 * 1. parseAnsiText strips OSC 8 and tracks hyperlink URLs on segments
 * 2. The buffer stores and retrieves hyperlink URLs via a side Map
 * 3. bufferToStyledText emits correct OSC 8 sequences from the buffer
 * 4. hasAnsi detects OSC sequences
 * 5. Hyperlinks survive buffer clone and cell comparison
 */

import { describe, expect, it } from "vitest"
import {
  TerminalBuffer,
  bufferToStyledText,
  cellEquals,
  createMutableCell,
  styleEquals,
  bufferToHTML,
} from "../src/buffer.js"
import { hasAnsi, parseAnsiText, stripAnsi } from "../src/unicode.js"

describe("OSC 8 hyperlinks", () => {
  // ==========================================================================
  // parseAnsiText
  // ==========================================================================

  describe("parseAnsiText", () => {
    it("parses OSC 8 hyperlink with ST terminator", () => {
      const url = "https://example.com"
      const text = `\x1b]8;;${url}\x1b\\click here\x1b]8;;\x1b\\`
      const segments = parseAnsiText(text)

      expect(segments).toHaveLength(1)
      expect(segments[0]!.text).toBe("click here")
      expect(segments[0]!.hyperlink).toBe(url)
    })

    it("parses OSC 8 hyperlink with BEL terminator", () => {
      const url = "https://example.com"
      const text = `\x1b]8;;${url}\x07click here\x1b]8;;\x07`
      const segments = parseAnsiText(text)

      expect(segments).toHaveLength(1)
      expect(segments[0]!.text).toBe("click here")
      expect(segments[0]!.hyperlink).toBe(url)
    })

    it("preserves SGR styles alongside hyperlink", () => {
      const url = "https://example.com"
      // Bold + hyperlink
      const text = `\x1b[1m\x1b]8;;${url}\x1b\\bold link\x1b]8;;\x1b\\\x1b[0m`
      const segments = parseAnsiText(text)

      // Should have segment(s) with both bold and hyperlink
      const linkSegment = segments.find((s) => s.hyperlink === url)
      expect(linkSegment).toBeDefined()
      expect(linkSegment!.text).toBe("bold link")
      expect(linkSegment!.bold).toBe(true)
    })

    it("handles text before and after hyperlink", () => {
      const url = "https://example.com"
      const text = `before \x1b]8;;${url}\x1b\\link\x1b]8;;\x1b\\ after`
      const segments = parseAnsiText(text)

      // "before " - no hyperlink
      const before = segments.find((s) => s.text.includes("before"))
      expect(before).toBeDefined()
      expect(before!.hyperlink).toBeUndefined()

      // "link" - has hyperlink
      const link = segments.find((s) => s.text === "link")
      expect(link).toBeDefined()
      expect(link!.hyperlink).toBe(url)

      // " after" - no hyperlink
      const after = segments.find((s) => s.text.includes("after"))
      expect(after).toBeDefined()
      expect(after!.hyperlink).toBeUndefined()
    })

    it("handles multiple hyperlinks", () => {
      const url1 = "https://one.com"
      const url2 = "https://two.com"
      const text = `\x1b]8;;${url1}\x1b\\first\x1b]8;;\x1b\\ \x1b]8;;${url2}\x1b\\second\x1b]8;;\x1b\\`
      const segments = parseAnsiText(text)

      const first = segments.find((s) => s.text === "first")
      expect(first).toBeDefined()
      expect(first!.hyperlink).toBe(url1)

      const second = segments.find((s) => s.text === "second")
      expect(second).toBeDefined()
      expect(second!.hyperlink).toBe(url2)

      // Space between links should not have hyperlink
      const space = segments.find((s) => s.text === " ")
      expect(space).toBeDefined()
      expect(space!.hyperlink).toBeUndefined()
    })

    it("does not show OSC 8 escape bytes as visible text", () => {
      const url = "https://example.com"
      const text = `\x1b]8;;${url}\x1b\\example.com\x1b]8;;\x1b\\`
      const segments = parseAnsiText(text)

      // Concatenate all segment text
      const plainText = segments.map((s) => s.text).join("")
      expect(plainText).toBe("example.com")
      // Must not contain any escape characters or ]8;; garbage
      expect(plainText).not.toContain("]8;;")
      expect(plainText).not.toContain("\x1b")
    })

    it("handles plain text without hyperlinks (no regression)", () => {
      const segments = parseAnsiText("hello world")
      expect(segments).toHaveLength(1)
      expect(segments[0]!.text).toBe("hello world")
      expect(segments[0]!.hyperlink).toBeUndefined()
    })
  })

  // ==========================================================================
  // hasAnsi
  // ==========================================================================

  describe("hasAnsi", () => {
    it("detects OSC sequences", () => {
      expect(hasAnsi("\x1b]8;;https://example.com\x1b\\text\x1b]8;;\x1b\\")).toBe(true)
    })

    it("still detects SGR sequences", () => {
      expect(hasAnsi("\x1b[31mred\x1b[0m")).toBe(true)
    })

    it("returns false for plain text", () => {
      expect(hasAnsi("plain text")).toBe(false)
    })
  })

  // ==========================================================================
  // stripAnsi (already handles OSC, verify no regression)
  // ==========================================================================

  describe("stripAnsi with OSC 8", () => {
    it("strips OSC 8 sequences", () => {
      const url = "https://example.com"
      const text = `\x1b]8;;${url}\x1b\\click\x1b]8;;\x1b\\`
      expect(stripAnsi(text)).toBe("click")
    })
  })

  // ==========================================================================
  // Buffer hyperlink storage
  // ==========================================================================

  describe("buffer hyperlink storage", () => {
    it("stores and retrieves hyperlink via setCell/getCell", () => {
      const buffer = new TerminalBuffer(40, 5)
      buffer.setCell(0, 0, { char: "a", hyperlink: "https://example.com" })
      const cell = buffer.getCell(0, 0)
      expect(cell.hyperlink).toBe("https://example.com")
    })

    it("stores and retrieves hyperlink via readCellInto", () => {
      const buffer = new TerminalBuffer(40, 5)
      buffer.setCell(0, 0, { char: "a", hyperlink: "https://example.com" })
      const cell = createMutableCell()
      buffer.readCellInto(0, 0, cell)
      expect(cell.hyperlink).toBe("https://example.com")
    })

    it("clears hyperlink when set to undefined", () => {
      const buffer = new TerminalBuffer(40, 5)
      buffer.setCell(0, 0, { char: "a", hyperlink: "https://example.com" })
      buffer.setCell(0, 0, { char: "a" })
      const cell = buffer.getCell(0, 0)
      expect(cell.hyperlink).toBeUndefined()
    })

    it("preserves hyperlink through clone", () => {
      const buffer = new TerminalBuffer(40, 5)
      buffer.setCell(0, 0, { char: "a", hyperlink: "https://example.com" })
      buffer.setCell(1, 0, { char: "b" })

      const clone = buffer.clone()
      expect(clone.getCell(0, 0).hyperlink).toBe("https://example.com")
      expect(clone.getCell(1, 0).hyperlink).toBeUndefined()
    })

    it("clears hyperlinks on buffer.clear()", () => {
      const buffer = new TerminalBuffer(40, 5)
      buffer.setCell(0, 0, { char: "a", hyperlink: "https://example.com" })
      buffer.clear()
      expect(buffer.getCell(0, 0).hyperlink).toBeUndefined()
    })
  })

  // ==========================================================================
  // Cell and style equality
  // ==========================================================================

  describe("equality", () => {
    it("cellEquals detects hyperlink differences", () => {
      const a = { ...createMutableCell(), char: "a", hyperlink: "https://one.com" }
      const b = { ...createMutableCell(), char: "a", hyperlink: "https://two.com" }
      expect(cellEquals(a, b)).toBe(false)
    })

    it("cellEquals matches when hyperlinks are the same", () => {
      const a = { ...createMutableCell(), char: "a", hyperlink: "https://one.com" }
      const b = { ...createMutableCell(), char: "a", hyperlink: "https://one.com" }
      expect(cellEquals(a, b)).toBe(true)
    })

    it("cellEquals matches when both have no hyperlink", () => {
      const a = createMutableCell()
      const b = createMutableCell()
      expect(cellEquals(a, b)).toBe(true)
    })

    it("buffer cellEquals detects hyperlink differences", () => {
      const buf1 = new TerminalBuffer(10, 1)
      const buf2 = new TerminalBuffer(10, 1)
      buf1.setCell(0, 0, { char: "a", hyperlink: "https://one.com" })
      buf2.setCell(0, 0, { char: "a", hyperlink: "https://two.com" })
      expect(buf1.cellEquals(0, 0, buf2)).toBe(false)
    })

    it("styleEquals detects hyperlink differences", () => {
      const a = { fg: null, bg: null, attrs: {}, hyperlink: "https://one.com" }
      const b = { fg: null, bg: null, attrs: {}, hyperlink: "https://two.com" }
      expect(styleEquals(a, b)).toBe(false)
    })

    it("styleEquals matches when hyperlinks are the same", () => {
      const a = { fg: null, bg: null, attrs: {}, hyperlink: "https://one.com" }
      const b = { fg: null, bg: null, attrs: {}, hyperlink: "https://one.com" }
      expect(styleEquals(a, b)).toBe(true)
    })
  })

  // ==========================================================================
  // bufferToStyledText (ANSI output with OSC 8)
  // ==========================================================================

  describe("bufferToStyledText", () => {
    it("emits OSC 8 sequences for hyperlinked cells", () => {
      const buffer = new TerminalBuffer(10, 1)
      const url = "https://example.com"
      // Write "link" with hyperlink at columns 0-3
      for (let i = 0; i < 4; i++) {
        buffer.setCell(i, 0, { char: "link"[i]!, hyperlink: url })
      }

      const output = bufferToStyledText(buffer, { trimTrailingWhitespace: true })
      // Should contain the OSC 8 open, display text, and OSC 8 close
      expect(output).toContain(`\x1b]8;;${url}\x1b\\`)
      expect(output).toContain("link")
      expect(output).toContain("\x1b]8;;\x1b\\") // close
    })

    it("closes hyperlink at end of line", () => {
      const buffer = new TerminalBuffer(4, 1)
      const url = "https://example.com"
      for (let i = 0; i < 4; i++) {
        buffer.setCell(i, 0, { char: "abcd"[i]!, hyperlink: url })
      }

      const output = bufferToStyledText(buffer, { trimTrailingWhitespace: false })
      // The hyperlink close should appear before the end of the line
      const closeOsc = "\x1b]8;;\x1b\\"
      expect(output).toContain(closeOsc)
    })

    it("does not emit OSC 8 for cells without hyperlink", () => {
      const buffer = new TerminalBuffer(10, 1)
      for (let i = 0; i < 5; i++) {
        buffer.setCell(i, 0, { char: "hello"[i]! })
      }

      const output = bufferToStyledText(buffer, { trimTrailingWhitespace: true })
      expect(output).not.toContain("\x1b]8;;")
    })
  })

  // ==========================================================================
  // bufferToHTML
  // ==========================================================================

  describe("bufferToHTML", () => {
    it("emits <a> tag for hyperlinked cells", () => {
      const buffer = new TerminalBuffer(10, 1)
      const url = "https://example.com"
      for (let i = 0; i < 4; i++) {
        buffer.setCell(i, 0, { char: "link"[i]!, hyperlink: url })
      }

      const html = bufferToHTML(buffer)
      expect(html).toContain(`<a href="${url}">`)
      expect(html).toContain("</a>")
      expect(html).toContain("link")
    })
  })

  // ==========================================================================
  // End-to-end: parse -> buffer -> output roundtrip
  // ==========================================================================

  describe("roundtrip", () => {
    it("hyperlink survives parse -> buffer -> styledText cycle", () => {
      const url = "https://example.com"
      const display = "example.com"
      const linked = `\x1b]8;;${url}\x1b\\${display}\x1b]8;;\x1b\\`

      // 1. Parse
      const segments = parseAnsiText(linked)
      expect(segments).toHaveLength(1)
      expect(segments[0]!.text).toBe(display)
      expect(segments[0]!.hyperlink).toBe(url)

      // 2. Write to buffer
      const buffer = new TerminalBuffer(40, 1)
      for (let i = 0; i < display.length; i++) {
        buffer.setCell(i, 0, {
          char: display[i]!,
          hyperlink: segments[0]!.hyperlink,
        })
      }

      // 3. Read back from buffer
      const cell = buffer.getCell(0, 0)
      expect(cell.hyperlink).toBe(url)
      expect(cell.char).toBe("e")

      // 4. Convert to styled text
      const output = bufferToStyledText(buffer, { trimTrailingWhitespace: true })
      expect(output).toContain(`\x1b]8;;${url}\x1b\\`)
      expect(output).toContain(display)
      expect(output).toContain("\x1b]8;;\x1b\\")

      // 5. Strip ANSI to get plain text
      const plain = stripAnsi(output)
      expect(plain).toBe(display)
    })
  })
})
