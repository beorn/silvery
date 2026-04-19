import { describe, expect, it } from "vitest"
import { captureRegion } from "@silvery/ag-term/buffer-capture"
import { createBuffer, type TerminalBuffer } from "@silvery/ag-term/buffer"

/** Write styled text to a buffer at a position */
function writeText(buffer: TerminalBuffer, x: number, y: number, text: string): void {
  for (let i = 0; i < text.length && x + i < buffer.width; i++) {
    buffer.setCell(x + i, y, { char: text[i]! })
  }
}

/** Write bold text */
function writeBold(buffer: TerminalBuffer, x: number, y: number, text: string): void {
  for (let i = 0; i < text.length && x + i < buffer.width; i++) {
    buffer.setCell(x + i, y, { char: text[i]!, attrs: { bold: true } })
  }
}

/** Write colored text */
function writeColored(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  fg: number,
  bg?: number,
): void {
  for (let i = 0; i < text.length && x + i < buffer.width; i++) {
    buffer.setCell(x + i, y, { char: text[i]!, fg, bg: bg ?? null })
  }
}

describe("captureRegion", () => {
  it("captures plain text from a region", () => {
    const buf = createBuffer(20, 5)
    writeText(buf, 0, 0, "Hello World")
    writeText(buf, 0, 1, "Second Line")

    const result = captureRegion(buf, 0, 0, 20, 2)
    expect(result.plainTextRows).toHaveLength(2)
    expect(result.plainTextRows[0]).toBe("Hello World")
    expect(result.plainTextRows[1]).toBe("Second Line")
  })

  it("captures a sub-region (not starting at 0,0)", () => {
    const buf = createBuffer(20, 5)
    writeText(buf, 0, 0, "AAAA")
    writeText(buf, 5, 1, "INNER")
    writeText(buf, 5, 2, "BLOCK")
    writeText(buf, 0, 3, "DDDD")

    const result = captureRegion(buf, 5, 1, 5, 2)
    expect(result.plainTextRows).toHaveLength(2)
    expect(result.plainTextRows[0]).toBe("INNER")
    expect(result.plainTextRows[1]).toBe("BLOCK")
  })

  it("captures bold text with ANSI codes", () => {
    const buf = createBuffer(20, 3)
    writeBold(buf, 0, 0, "Bold")
    writeText(buf, 4, 0, " plain")

    const result = captureRegion(buf, 0, 0, 10, 1)
    expect(result.rows[0]).toContain("\x1b[1m") // bold on
    expect(result.plainTextRows[0]).toBe("Bold plain")
  })

  it("captures colored text with ANSI codes", () => {
    const buf = createBuffer(20, 3)
    // Red text (color index 1) on blue background (color index 4)
    writeColored(buf, 0, 0, "Color", 1, 4)

    const result = captureRegion(buf, 0, 0, 10, 1)
    // Should have fg and bg codes
    expect(result.rows[0]).toContain("\x1b[")
    expect(result.plainTextRows[0]).toBe("Color")
  })

  it("handles empty region", () => {
    const buf = createBuffer(20, 5)

    const result = captureRegion(buf, 0, 0, 10, 3)
    expect(result.rows).toHaveLength(3)
    expect(result.plainTextRows).toEqual(["", "", ""])
  })

  it("resets style at end of each row", () => {
    const buf = createBuffer(20, 3)
    writeBold(buf, 0, 0, "Bold line 1")
    writeBold(buf, 0, 1, "Bold line 2")

    const result = captureRegion(buf, 0, 0, 20, 2)
    // Each row should have its own style reset (not carry over)
    // Row 0 ends with reset, row 1 starts fresh
    expect(result.rows[0]).toContain("\x1b[1m") // bold on
    expect(result.rows[1]).toContain("\x1b[1m") // bold on (fresh per row)
  })

  it("trims trailing whitespace from plain text", () => {
    const buf = createBuffer(30, 2)
    writeText(buf, 0, 0, "Short")

    const result = captureRegion(buf, 0, 0, 30, 1)
    // Plain text should be trimmed
    expect(result.plainTextRows[0]).toBe("Short")
    // ANSI row should also be trimmed of trailing spaces
    expect(result.rows[0]!.endsWith("     ")).toBe(false)
  })

  it("handles true color (RGB) foreground and background", () => {
    const buf = createBuffer(20, 2)
    for (let i = 0; i < 5; i++) {
      buf.setCell(i, 0, {
        char: "Hello"[i]!,
        fg: { r: 255, g: 100, b: 50 },
        bg: { r: 0, g: 0, b: 128 },
      })
    }

    const result = captureRegion(buf, 0, 0, 10, 1)
    // Should contain true color sequences
    expect(result.rows[0]).toContain("38;2;255;100;50") // fg true color
    expect(result.rows[0]).toContain("48;2;0;0;128") // bg true color
    expect(result.plainTextRows[0]).toBe("Hello")
  })

  it("handles style changes mid-row", () => {
    const buf = createBuffer(20, 2)
    writeText(buf, 0, 0, "plain")
    writeBold(buf, 5, 0, "bold")
    writeText(buf, 9, 0, "plain")

    const result = captureRegion(buf, 0, 0, 14, 1)
    expect(result.plainTextRows[0]).toBe("plainboldplain")
    // Should have bold on and bold off transitions
    const ansi = result.rows[0]!
    expect(ansi).toContain("\x1b[1m") // bold on
    expect(ansi).toContain("\x1b[22m") // bold off (or reset)
  })

  it("captures region matching bufferToStyledText for same area", () => {
    // When capturing the full buffer, result should match bufferToStyledText
    const buf = createBuffer(10, 2)
    writeBold(buf, 0, 0, "Header")
    writeColored(buf, 0, 1, "Body", 2)

    const result = captureRegion(buf, 0, 0, 10, 2)
    // Both rows should have content
    expect(result.plainTextRows[0]).toContain("Header")
    expect(result.plainTextRows[1]).toContain("Body")
    // ANSI rows should have styling
    expect(result.rows[0]).toContain("\x1b[")
    expect(result.rows[1]).toContain("\x1b[")
  })
})
