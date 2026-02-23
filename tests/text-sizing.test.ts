/**
 * Text Sizing Protocol (OSC 66) Tests
 *
 * Tests for PUA character width handling and OSC 66 wrapping.
 */

import { afterEach, describe, expect, test, vi } from "vitest"
import { TerminalBuffer, createMutableCell } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { textSized, isPrivateUseArea, isTextSizingLikelySupported } from "../src/text-sizing.js"
import {
  graphemeWidth,
  displayWidth,
  setTextSizingEnabled,
  isTextSizingEnabled,
  writeTextToBuffer,
} from "../src/unicode.js"

// ============================================================================
// textSized()
// ============================================================================

describe("textSized", () => {
  test("produces correct OSC 66 sequence with w=2", () => {
    const result = textSized("X", 2)
    expect(result).toBe("\x1b]66;w=2;X\x07")
  })

  test("produces correct OSC 66 sequence with w=1", () => {
    const result = textSized("X", 1)
    expect(result).toBe("\x1b]66;w=1;X\x07")
  })

  test("wraps PUA nerdfont character", () => {
    // U+E0B0 is a Powerline separator
    const char = "\uE0B0"
    const result = textSized(char, 2)
    expect(result).toBe(`\x1b]66;w=2;${char}\x07`)
  })

  test("wraps multi-character text", () => {
    const result = textSized("AB", 3)
    expect(result).toBe("\x1b]66;w=3;AB\x07")
  })
})

// ============================================================================
// isPrivateUseArea()
// ============================================================================

describe("isPrivateUseArea", () => {
  test("identifies BMP PUA start (U+E000)", () => {
    expect(isPrivateUseArea(0xe000)).toBe(true)
  })

  test("identifies BMP PUA end (U+F8FF)", () => {
    expect(isPrivateUseArea(0xf8ff)).toBe(true)
  })

  test("identifies nerdfont range (U+E0B0)", () => {
    expect(isPrivateUseArea(0xe0b0)).toBe(true)
  })

  test("identifies Supplementary PUA-A start (U+F0000)", () => {
    expect(isPrivateUseArea(0xf0000)).toBe(true)
  })

  test("identifies Supplementary PUA-A end (U+FFFFD)", () => {
    expect(isPrivateUseArea(0xffffd)).toBe(true)
  })

  test("identifies Supplementary PUA-B start (U+100000)", () => {
    expect(isPrivateUseArea(0x100000)).toBe(true)
  })

  test("identifies Supplementary PUA-B end (U+10FFFD)", () => {
    expect(isPrivateUseArea(0x10fffd)).toBe(true)
  })

  test("rejects ASCII characters", () => {
    expect(isPrivateUseArea(0x41)).toBe(false) // 'A'
    expect(isPrivateUseArea(0x20)).toBe(false) // space
  })

  test("rejects CJK characters", () => {
    expect(isPrivateUseArea(0x4e00)).toBe(false) // first CJK ideograph
  })

  test("rejects just below BMP PUA", () => {
    expect(isPrivateUseArea(0xdfff)).toBe(false)
  })

  test("rejects just above BMP PUA", () => {
    expect(isPrivateUseArea(0xf900)).toBe(false)
  })
})

// ============================================================================
// isTextSizingLikelySupported()
// ============================================================================

describe("isTextSizingLikelySupported", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore env
    process.env.TERM_PROGRAM = originalEnv.TERM_PROGRAM
    process.env.TERM_PROGRAM_VERSION = originalEnv.TERM_PROGRAM_VERSION
  })

  test("returns true for Ghostty", () => {
    process.env.TERM_PROGRAM = "ghostty"
    process.env.TERM_PROGRAM_VERSION = "1.0.0"
    expect(isTextSizingLikelySupported()).toBe(true)
  })

  test("returns true for Kitty v0.40", () => {
    process.env.TERM_PROGRAM = "kitty"
    process.env.TERM_PROGRAM_VERSION = "0.40.0"
    expect(isTextSizingLikelySupported()).toBe(true)
  })

  test("returns true for Kitty v1.0", () => {
    process.env.TERM_PROGRAM = "kitty"
    process.env.TERM_PROGRAM_VERSION = "1.0.0"
    expect(isTextSizingLikelySupported()).toBe(true)
  })

  test("returns false for Kitty v0.39", () => {
    process.env.TERM_PROGRAM = "kitty"
    process.env.TERM_PROGRAM_VERSION = "0.39.9"
    expect(isTextSizingLikelySupported()).toBe(false)
  })

  test("returns false for iTerm", () => {
    process.env.TERM_PROGRAM = "iTerm.app"
    process.env.TERM_PROGRAM_VERSION = "3.5.0"
    expect(isTextSizingLikelySupported()).toBe(false)
  })

  test("returns false when TERM_PROGRAM is unset", () => {
    delete process.env.TERM_PROGRAM
    delete process.env.TERM_PROGRAM_VERSION
    expect(isTextSizingLikelySupported()).toBe(false)
  })
})

// ============================================================================
// graphemeWidth() with text sizing
// ============================================================================

describe("graphemeWidth with text sizing", () => {
  afterEach(() => {
    setTextSizingEnabled(false)
  })

  test("returns 1 for PUA when text sizing disabled", () => {
    setTextSizingEnabled(false)
    // U+E0B0 = Powerline separator
    expect(graphemeWidth("\uE0B0")).toBe(1)
  })

  test("returns 2 for PUA when text sizing enabled", () => {
    setTextSizingEnabled(true)
    expect(graphemeWidth("\uE0B0")).toBe(2)
  })

  test("returns 2 for nerdfont icon (U+F001) when text sizing enabled", () => {
    setTextSizingEnabled(true)
    expect(graphemeWidth("\uF001")).toBe(2)
  })

  test("returns 1 for ASCII when text sizing enabled", () => {
    setTextSizingEnabled(true)
    expect(graphemeWidth("A")).toBe(1)
  })

  test("returns 2 for CJK when text sizing enabled (unchanged)", () => {
    setTextSizingEnabled(true)
    // CJK characters should still be 2
    expect(graphemeWidth("\u4e00")).toBe(2)
  })

  test("returns 0 for zero-width characters when text sizing enabled", () => {
    setTextSizingEnabled(true)
    // Combining diaeresis
    expect(graphemeWidth("\u0308")).toBe(0)
  })
})

// ============================================================================
// displayWidth() with text sizing
// ============================================================================

describe("displayWidth with text sizing", () => {
  afterEach(() => {
    setTextSizingEnabled(false)
  })

  test("accounts for PUA when text sizing enabled", () => {
    setTextSizingEnabled(true)
    // "X" (1) + PUA (2) + "Y" (1) = 4
    const text = "X\uE0B0Y"
    expect(displayWidth(text)).toBe(4)
  })

  test("does not account for PUA when text sizing disabled", () => {
    setTextSizingEnabled(false)
    // "X" (1) + PUA (1) + "Y" (1) = 3
    const text = "X\uE0B0Y"
    expect(displayWidth(text)).toBe(3)
  })

  test("handles string with only PUA characters", () => {
    setTextSizingEnabled(true)
    // Two PUA chars, each 2-wide = 4
    expect(displayWidth("\uE0B0\uF001")).toBe(4)
  })

  test("handles mixed ASCII and PUA", () => {
    setTextSizingEnabled(true)
    // "FAMILY" (6) + " " (1) + PUA (2) + " " (1) + "SPRINT" (6) = 16
    expect(displayWidth("FAMILY \uE0B0 SPRINT")).toBe(16)
  })
})

// ============================================================================
// setTextSizingEnabled / isTextSizingEnabled
// ============================================================================

describe("text sizing state", () => {
  afterEach(() => {
    setTextSizingEnabled(false)
  })

  test("defaults to disabled", () => {
    expect(isTextSizingEnabled()).toBe(false)
  })

  test("can be enabled", () => {
    setTextSizingEnabled(true)
    expect(isTextSizingEnabled()).toBe(true)
  })

  test("can be disabled after enabling", () => {
    setTextSizingEnabled(true)
    setTextSizingEnabled(false)
    expect(isTextSizingEnabled()).toBe(false)
  })

  test("clears displayWidth cache when toggling", () => {
    // Measure a PUA-containing string while disabled
    const text = "\uE0B0test"
    const widthDisabled = displayWidth(text)

    // Enable and re-measure -- should be different (cached result cleared)
    setTextSizingEnabled(true)
    const widthEnabled = displayWidth(text)

    expect(widthEnabled).toBeGreaterThan(widthDisabled)
  })
})

// ============================================================================
// Buffer rendering: PUA chars wrapped in OSC 66
// ============================================================================

describe("output phase: OSC 66 wrapping", () => {
  afterEach(() => {
    setTextSizingEnabled(false)
  })

  test("wraps PUA char in OSC 66 when text sizing enabled", () => {
    setTextSizingEnabled(true)
    const buffer = new TerminalBuffer(10, 1)
    // Write "A" + PUA (wide) + "B" to the buffer
    // With text sizing, PUA is 2-wide: cell 0=A, cell 1=PUA(wide), cell 2=continuation, cell 3=B
    writeTextToBuffer(buffer, 0, 0, "A\uE0B0B")

    // Full render (no prev buffer)
    const output = outputPhase(null, buffer)

    // Output should contain OSC 66 wrapping for the PUA character
    const expected = textSized("\uE0B0", 2)
    expect(output).toContain(expected)
    expect(output).toContain("A")
    expect(output).toContain("B")
  })

  test("does not wrap PUA char when text sizing disabled", () => {
    setTextSizingEnabled(false)
    const buffer = new TerminalBuffer(10, 1)
    // Without text sizing, PUA is 1-wide: cell 0=A, cell 1=PUA, cell 2=B
    writeTextToBuffer(buffer, 0, 0, "A\uE0B0B")

    const output = outputPhase(null, buffer)

    // Should NOT contain OSC 66 sequences
    expect(output).not.toContain("\x1b]66;")
    expect(output).toContain("A")
    expect(output).toContain("\uE0B0")
    expect(output).toContain("B")
  })

  test("does not wrap non-PUA wide chars (CJK) in OSC 66", () => {
    setTextSizingEnabled(true)
    const buffer = new TerminalBuffer(10, 1)
    // CJK character (naturally wide)
    writeTextToBuffer(buffer, 0, 0, "\u4e00")

    const output = outputPhase(null, buffer)

    // CJK is wide but not PUA -- should not have OSC 66
    expect(output).not.toContain("\x1b]66;")
    expect(output).toContain("\u4e00")
  })

  test("wraps PUA in incremental diff output", () => {
    setTextSizingEnabled(true)
    // Create prev buffer with different content
    const prev = new TerminalBuffer(10, 1)
    writeTextToBuffer(prev, 0, 0, "XXXX")

    // Create next buffer with PUA
    const next = new TerminalBuffer(10, 1)
    writeTextToBuffer(next, 0, 0, "A\uE0B0B")

    const output = outputPhase(prev, next)

    // The incremental diff output should also wrap PUA in OSC 66
    const expected = textSized("\uE0B0", 2)
    expect(output).toContain(expected)
  })

  test("PUA char is stored as wide in buffer when text sizing enabled", () => {
    setTextSizingEnabled(true)
    const buffer = new TerminalBuffer(10, 1)
    writeTextToBuffer(buffer, 0, 0, "A\uE0B0B")

    const cell = createMutableCell()

    // Cell 0: 'A' (normal)
    buffer.readCellInto(0, 0, cell)
    expect(cell.char).toBe("A")
    expect(cell.wide).toBe(false)
    expect(cell.continuation).toBe(false)

    // Cell 1: PUA char (wide)
    buffer.readCellInto(1, 0, cell)
    expect(cell.char).toBe("\uE0B0")
    expect(cell.wide).toBe(true)
    expect(cell.continuation).toBe(false)

    // Cell 2: continuation
    buffer.readCellInto(2, 0, cell)
    expect(cell.char).toBe("")
    expect(cell.continuation).toBe(true)

    // Cell 3: 'B'
    buffer.readCellInto(3, 0, cell)
    expect(cell.char).toBe("B")
    expect(cell.wide).toBe(false)
  })
})
