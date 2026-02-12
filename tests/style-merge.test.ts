/**
 * Tests for style layering system.
 *
 * Tests cover:
 * - Category-based style merging (mergeStyles)
 * - SGR 4:x parsing (underline styles)
 * - SGR 58 parsing (underline color)
 * - Output phase SGR emission
 * - Inverse transform behavior
 */

import { describe, expect, test } from "vitest"
import { type Color, type Style, TerminalBuffer } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { type MergeStylesOptions, mergeStyles } from "../src/pipeline/render-text.js"
import { parseAnsiText } from "../src/unicode.js"

describe("Style Layering", () => {
  describe("mergeStyles", () => {
    test("overlay fg/bg replaces base", () => {
      const base: Style = {
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
        attrs: {},
      }
      const overlay: Partial<Style> = {
        fg: { r: 255, g: 0, b: 0 },
        bg: { r: 0, g: 255, b: 0 },
        attrs: {},
      }
      const result = mergeStyles(base, overlay)
      expect(result.fg).toEqual({ r: 255, g: 0, b: 0 })
      expect(result.bg).toEqual({ r: 0, g: 255, b: 0 })
    })

    test("preserves decorations when overlay changes fg/bg", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: {
          underline: true,
          underlineStyle: "curly",
          strikethrough: true,
        },
      }
      const overlay: Partial<Style> = {
        fg: { r: 255, g: 255, b: 0 },
        bg: { r: 0, g: 0, b: 0 },
        attrs: {},
      }
      const result = mergeStyles(base, overlay)
      // Decorations preserved
      expect(result.attrs.underline).toBe(true)
      expect(result.attrs.underlineStyle).toBe("curly")
      expect(result.attrs.strikethrough).toBe(true)
      // Colors from overlay
      expect(result.fg).toEqual({ r: 255, g: 255, b: 0 })
      expect(result.bg).toEqual({ r: 0, g: 0, b: 0 })
    })

    test("preserves underlineColor through layers", () => {
      const base: Style = {
        fg: null,
        bg: null,
        underlineColor: { r: 255, g: 0, b: 0 },
        attrs: { underline: true },
      }
      const overlay: Partial<Style> = {
        fg: { r: 0, g: 0, b: 0 },
        bg: { r: 255, g: 255, b: 0 },
        attrs: {},
      }
      const result = mergeStyles(base, overlay)
      // Underline color preserved
      expect(result.underlineColor).toEqual({ r: 255, g: 0, b: 0 })
    })

    test("preserves emphasis (bold, dim, italic) by default", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: { bold: true, dim: true, italic: true },
      }
      const overlay: Partial<Style> = {
        fg: { r: 255, g: 0, b: 0 },
        attrs: {},
      }
      const result = mergeStyles(base, overlay)
      expect(result.attrs.bold).toBe(true)
      expect(result.attrs.dim).toBe(true)
      expect(result.attrs.italic).toBe(true)
    })

    test("preserveDecorations=false allows overlay to clear decorations", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: {
          underline: true,
          underlineStyle: "curly",
          strikethrough: true,
        },
      }
      // Overlay explicitly sets underline to false
      const overlay: Partial<Style> = {
        fg: { r: 255, g: 255, b: 0 },
        attrs: {
          underline: false,
          underlineStyle: false,
          strikethrough: false,
        },
      }
      const result = mergeStyles(base, overlay, { preserveDecorations: false })
      // Decorations cleared by overlay
      expect(result.attrs.underline).toBe(false)
      expect(result.attrs.underlineStyle).toBe(false)
      expect(result.attrs.strikethrough).toBe(false)
    })

    test("preserveDecorations=false: overlay undefined falls back to base", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: { underline: true, underlineStyle: "curly" },
      }
      const overlay: Partial<Style> = {
        fg: { r: 255, g: 0, b: 0 },
        attrs: {},
      }
      const result = mergeStyles(base, overlay, { preserveDecorations: false })
      // When overlay doesn't specify, falls back to base
      expect(result.attrs.underline).toBe(true)
      expect(result.attrs.underlineStyle).toBe("curly")
    })

    test("preserveEmphasis=false allows overlay to clear emphasis", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: { bold: true, dim: true, italic: true },
      }
      const overlay: Partial<Style> = {
        attrs: { bold: false, dim: false, italic: false },
      }
      const result = mergeStyles(base, overlay, { preserveEmphasis: false })
      // Emphasis cleared by overlay
      expect(result.attrs.bold).toBe(false)
      expect(result.attrs.dim).toBe(false)
      expect(result.attrs.italic).toBe(false)
    })

    test("preserveEmphasis=false: overlay undefined falls back to base", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: { bold: true, italic: true },
      }
      const overlay: Partial<Style> = {
        attrs: {},
      }
      const result = mergeStyles(base, overlay, { preserveEmphasis: false })
      // When overlay doesn't specify, falls back to base
      expect(result.attrs.bold).toBe(true)
      expect(result.attrs.italic).toBe(true)
    })

    test("inverse is NOT inherited from base", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: { inverse: true },
      }
      const overlay: Partial<Style> = {
        attrs: {},
      }
      const result = mergeStyles(base, overlay)
      // Inverse not inherited (it's a transform, not a style)
      expect(result.attrs.inverse).toBeUndefined()
    })

    test("overlay underlineStyle takes precedence", () => {
      const base: Style = {
        fg: null,
        bg: null,
        attrs: { underline: true, underlineStyle: "single" },
      }
      const overlay: Partial<Style> = {
        attrs: { underlineStyle: "dashed" },
      }
      const result = mergeStyles(base, overlay)
      expect(result.attrs.underlineStyle).toBe("dashed")
      expect(result.attrs.underline).toBe(true)
    })
  })

  describe("parseAnsiText - SGR 4:x (underline styles)", () => {
    test("parses SGR 4:1 as single underline", () => {
      const segments = parseAnsiText("\x1b[4:1mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("single")
      expect(segments[0]?.underline).toBe(true)
    })

    test("parses SGR 4:2 as double underline", () => {
      const segments = parseAnsiText("\x1b[4:2mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("double")
    })

    test("parses SGR 4:3 as curly underline", () => {
      const segments = parseAnsiText("\x1b[4:3mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("curly")
    })

    test("parses SGR 4:4 as dotted underline", () => {
      const segments = parseAnsiText("\x1b[4:4mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("dotted")
    })

    test("parses SGR 4:5 as dashed underline", () => {
      const segments = parseAnsiText("\x1b[4:5mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("dashed")
    })

    test("parses SGR 4:0 as no underline", () => {
      const segments = parseAnsiText("\x1b[4:0mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe(false)
    })

    test("parses plain SGR 4 as single underline", () => {
      const segments = parseAnsiText("\x1b[4mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("single")
      expect(segments[0]?.underline).toBe(true)
    })

    test("parses SGR 24 as underline off", () => {
      const segments = parseAnsiText("\x1b[4munder\x1b[24moff\x1b[0m")
      expect(segments[0]?.underline).toBe(true)
      expect(segments[1]?.underline).toBe(false)
      expect(segments[1]?.underlineStyle).toBe(false)
    })
  })

  describe("parseAnsiText - SGR 58 (underline color)", () => {
    test("parses SGR 58;5;N (256-color underline)", () => {
      const segments = parseAnsiText("\x1b[58;5;196mtext\x1b[0m")
      expect(segments[0]?.underlineColor).toBe(196)
    })

    test("parses SGR 58;2;r;g;b (RGB underline color)", () => {
      const segments = parseAnsiText("\x1b[58;2;255;128;0mtext\x1b[0m")
      // RGB stored as packed value with 0x1000000 marker
      const packed = segments[0]?.underlineColor
      expect(packed).toBeDefined()
      expect((packed! >> 16) & 0xff).toBe(255) // r
      expect((packed! >> 8) & 0xff).toBe(128) // g
      expect(packed! & 0xff).toBe(0) // b
    })

    test("parses SGR 58:2::r:g:b (colon format RGB)", () => {
      const segments = parseAnsiText("\x1b[58:2::255:0:0mtext\x1b[0m")
      const packed = segments[0]?.underlineColor
      expect(packed).toBeDefined()
      expect((packed! >> 16) & 0xff).toBe(255) // r
      expect((packed! >> 8) & 0xff).toBe(0) // g
      expect(packed! & 0xff).toBe(0) // b
    })

    test("parses combined curly + color", () => {
      const segments = parseAnsiText("\x1b[4:3;58;2;255;0;0mtext\x1b[0m")
      expect(segments[0]?.underlineStyle).toBe("curly")
      const packed = segments[0]?.underlineColor
      expect((packed! >> 16) & 0xff).toBe(255)
    })
  })

  describe("Output phase SGR emission", () => {
    test("emits SGR 4:x for underline styles", () => {
      const buffer = new TerminalBuffer(5, 1)
      buffer.setCell(0, 0, {
        char: "A",
        fg: null,
        bg: null,
        underlineColor: null,
        attrs: { underlineStyle: "curly" },
        wide: false,
        continuation: false,
      })
      const output = outputPhase(null, buffer, "inline")
      // Should contain 4:3 for curly underline
      expect(output).toContain("4:3")
    })

    test("emits SGR 58 for underline color", () => {
      const buffer = new TerminalBuffer(5, 1)
      buffer.setCell(0, 0, {
        char: "A",
        fg: null,
        bg: null,
        underlineColor: { r: 255, g: 0, b: 0 },
        attrs: { underline: true },
        wide: false,
        continuation: false,
      })
      const output = outputPhase(null, buffer, "inline")
      // Should contain 58;2;255;0;0 for red underline color
      expect(output).toContain("58;2;255;0;0")
    })

    test("emits both style and color together", () => {
      const buffer = new TerminalBuffer(5, 1)
      buffer.setCell(0, 0, {
        char: "A",
        fg: null,
        bg: null,
        underlineColor: { r: 0, g: 255, b: 0 },
        attrs: { underlineStyle: "dashed" },
        wide: false,
        continuation: false,
      })
      const output = outputPhase(null, buffer, "inline")
      expect(output).toContain("4:5") // dashed
      expect(output).toContain("58;2;0;255;0") // green
    })

    test("inverse emits SGR 7 (terminal handles swap)", () => {
      const buffer = new TerminalBuffer(5, 1)
      buffer.setCell(0, 0, {
        char: "A",
        fg: { r: 255, g: 0, b: 0 }, // red fg
        bg: { r: 0, g: 255, b: 0 }, // green bg
        underlineColor: null,
        attrs: { inverse: true },
        wide: false,
        continuation: false,
      })
      const output = outputPhase(null, buffer, "inline")
      // Colors stay as-is; SGR 7 tells the terminal to swap them
      expect(output).toContain("38;2;255;0;0") // fg = red (original)
      expect(output).toContain("48;2;0;255;0") // bg = green (original)
      expect(output).toContain(";7") // SGR 7 for reverse video
    })
  })
})
