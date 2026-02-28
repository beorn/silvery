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
  isTextSizingEnabled,
  writeTextToBuffer,
  createMeasurer,
  runWithMeasurer,
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
  const disabled = createMeasurer({ textSizingEnabled: false })
  const enabled = createMeasurer({ textSizingEnabled: true })

  test("returns 1 for PUA when text sizing disabled", () => {
    // U+E0B0 = Powerline separator
    expect(disabled.graphemeWidth("\uE0B0")).toBe(1)
  })

  test("returns 2 for PUA when text sizing enabled", () => {
    expect(enabled.graphemeWidth("\uE0B0")).toBe(2)
  })

  test("returns 2 for nerdfont icon (U+F001) when text sizing enabled", () => {
    expect(enabled.graphemeWidth("\uF001")).toBe(2)
  })

  test("returns 1 for ASCII when text sizing enabled", () => {
    expect(enabled.graphemeWidth("A")).toBe(1)
  })

  test("returns 2 for CJK when text sizing enabled (unchanged)", () => {
    // CJK characters should still be 2
    expect(enabled.graphemeWidth("\u4e00")).toBe(2)
  })

  test("returns 0 for zero-width characters when text sizing enabled", () => {
    // Combining diaeresis
    expect(enabled.graphemeWidth("\u0308")).toBe(0)
  })

  test("default module-level graphemeWidth returns 1 for PUA (text sizing off by default)", () => {
    expect(graphemeWidth("\uE0B0")).toBe(1)
  })
})

// ============================================================================
// displayWidth() with text sizing
// ============================================================================

describe("displayWidth with text sizing", () => {
  const disabled = createMeasurer({ textSizingEnabled: false })
  const enabled = createMeasurer({ textSizingEnabled: true })

  test("accounts for PUA when text sizing enabled", () => {
    // "X" (1) + PUA (2) + "Y" (1) = 4
    const text = "X\uE0B0Y"
    expect(enabled.displayWidth(text)).toBe(4)
  })

  test("does not account for PUA when text sizing disabled", () => {
    // "X" (1) + PUA (1) + "Y" (1) = 3
    const text = "X\uE0B0Y"
    expect(disabled.displayWidth(text)).toBe(3)
  })

  test("handles string with only PUA characters", () => {
    // Two PUA chars, each 2-wide = 4
    expect(enabled.displayWidth("\uE0B0\uF001")).toBe(4)
  })

  test("handles mixed ASCII and PUA", () => {
    // "FAMILY" (6) + " " (1) + PUA (2) + " " (1) + "SPRINT" (6) = 16
    expect(enabled.displayWidth("FAMILY \uE0B0 SPRINT")).toBe(16)
  })
})

// ============================================================================
// setTextSizingEnabled / isTextSizingEnabled
// ============================================================================

describe("text sizing state", () => {
  test("defaults to disabled (module-level)", () => {
    expect(isTextSizingEnabled()).toBe(false)
  })

  test("createMeasurer respects textSizingEnabled flag", () => {
    const m = createMeasurer({ textSizingEnabled: true })
    expect(m.textSizingEnabled).toBe(true)
  })

  test("separate measurers have independent caches", () => {
    // Two measurers with different settings measure differently
    const disabled = createMeasurer({ textSizingEnabled: false })
    const enabled = createMeasurer({ textSizingEnabled: true })

    const text = "\uE0B0test"
    const widthDisabled = disabled.displayWidth(text)
    const widthEnabled = enabled.displayWidth(text)

    expect(widthEnabled).toBeGreaterThan(widthDisabled)
  })
})

// ============================================================================
// Buffer rendering: PUA chars wrapped in OSC 66
// ============================================================================

describe("output phase: OSC 66 wrapping", () => {
  const textSizingMeasurer = createMeasurer({ textSizingEnabled: true })
  const defaultMeasurer = createMeasurer({ textSizingEnabled: false })

  /**
   * Write text to buffer using a specific measurer for grapheme width.
   * This is needed because writeTextToBuffer uses the module-level default
   * (text sizing disabled). For tests that need PUA as wide, we write cells manually.
   */
  function writeTextWithMeasurer(
    buffer: TerminalBuffer,
    x: number,
    y: number,
    text: string,
    measurer: ReturnType<typeof createMeasurer>,
  ): void {
    let col = x
    // Simple segmentation by code points for test purposes
    for (const char of [...text]) {
      const width = measurer.graphemeWidth(char)
      if (width === 2) {
        buffer.setCell(col, y, { char, fg: null, bg: null, attrs: {}, wide: true, continuation: false })
        buffer.setCell(col + 1, y, { char: "", fg: null, bg: null, attrs: {}, wide: false, continuation: true })
        col += 2
      } else if (width === 1) {
        buffer.setCell(col, y, { char, fg: null, bg: null, attrs: {}, wide: false, continuation: false })
        col += 1
      }
    }
  }

  test("wraps PUA char in OSC 66 when text sizing enabled", () => {
    const buffer = new TerminalBuffer(10, 1)
    // With text sizing, PUA is 2-wide: cell 0=A, cell 1=PUA(wide), cell 2=continuation, cell 3=B
    writeTextWithMeasurer(buffer, 0, 0, "A\uE0B0B", textSizingMeasurer)

    // Scoped measurer provides text sizing awareness to all module-level functions
    const output = runWithMeasurer(textSizingMeasurer, () => outputPhase(null, buffer))

    // Output should contain OSC 66 wrapping for the PUA character
    const expected = textSized("\uE0B0", 2)
    expect(output).toContain(expected)
    expect(output).toContain("A")
    expect(output).toContain("B")
  })

  test("does not wrap PUA char when text sizing disabled", () => {
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
    const buffer = new TerminalBuffer(10, 1)
    // CJK character (naturally wide) -- same with or without text sizing
    writeTextToBuffer(buffer, 0, 0, "\u4e00")

    const output = runWithMeasurer(textSizingMeasurer, () => outputPhase(null, buffer))

    // CJK is wide but not PUA -- should not have OSC 66
    expect(output).not.toContain("\x1b]66;")
    expect(output).toContain("\u4e00")
  })

  // PUA wide-char incremental rendering — uses module-local measurer
  test("wraps PUA in incremental diff output", () => {
    // Create prev buffer with different content
    const prev = new TerminalBuffer(10, 1)
    writeTextToBuffer(prev, 0, 0, "XXXX")

    // Create next buffer with PUA (text sizing)
    const next = new TerminalBuffer(10, 1)
    writeTextWithMeasurer(next, 0, 0, "A\uE0B0B", textSizingMeasurer)

    const output = runWithMeasurer(textSizingMeasurer, () => outputPhase(prev, next))

    // The incremental diff output should also wrap PUA in OSC 66
    const expected = textSized("\uE0B0", 2)
    expect(output).toContain(expected)
  })

  test("PUA char is stored as wide in buffer when text sizing enabled", () => {
    const buffer = new TerminalBuffer(10, 1)
    writeTextWithMeasurer(buffer, 0, 0, "A\uE0B0B", textSizingMeasurer)

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
