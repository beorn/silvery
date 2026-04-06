/**
 * Text sizing scale tests (OSC 66 s= parameter).
 *
 * Tests for the font scale API:
 * - textScaled() generates correct OSC 66 escape with s= parameter
 * - resetTextScale() generates correct reset escape
 * - Various multiplier values (0.5, 1.0, 1.5, 2.0, 3.0)
 * - Edge cases (very small, very large, integer vs float)
 */
import { describe, expect, test } from "vitest"
import { textScaled, resetTextScale } from "../packages/ag-term/src/text-sizing"

const OSC = "\x1b]"
const BEL = "\x07"

// ============================================================================
// textScaled() — OSC 66 s= escape generation
// ============================================================================

describe("textScaled", () => {
  test("generates OSC 66 with s=2 for double size", () => {
    const result = textScaled(2)
    expect(result).toBe(`${OSC}66;s=2${BEL}`)
  })

  test("generates OSC 66 with s=0.5 for half size", () => {
    const result = textScaled(0.5)
    expect(result).toBe(`${OSC}66;s=0.5${BEL}`)
  })

  test("generates OSC 66 with s=1 for normal size", () => {
    const result = textScaled(1)
    expect(result).toBe(`${OSC}66;s=1${BEL}`)
  })

  test("generates OSC 66 with s=1.5 for 1.5x size", () => {
    const result = textScaled(1.5)
    expect(result).toBe(`${OSC}66;s=1.5${BEL}`)
  })

  test("generates OSC 66 with s=3 for triple size", () => {
    const result = textScaled(3)
    expect(result).toBe(`${OSC}66;s=3${BEL}`)
  })

  test("handles very small scale", () => {
    const result = textScaled(0.25)
    expect(result).toBe(`${OSC}66;s=0.25${BEL}`)
  })

  test("handles very large scale", () => {
    const result = textScaled(10)
    expect(result).toBe(`${OSC}66;s=10${BEL}`)
  })

  test("escape sequence structure: OSC + 66;s=N + BEL", () => {
    const result = textScaled(2)
    // Verify the raw bytes
    expect(result.charCodeAt(0)).toBe(0x1b) // ESC
    expect(result.charCodeAt(1)).toBe(0x5d) // ]
    expect(result).toContain("66;s=")
    expect(result.charCodeAt(result.length - 1)).toBe(0x07) // BEL
  })
})

// ============================================================================
// resetTextScale() — OSC 66 s=1 reset
// ============================================================================

describe("resetTextScale", () => {
  test("generates OSC 66 with s=1", () => {
    const result = resetTextScale()
    expect(result).toBe(`${OSC}66;s=1${BEL}`)
  })

  test("equals textScaled(1)", () => {
    expect(resetTextScale()).toBe(textScaled(1))
  })

  test("has correct escape structure", () => {
    const result = resetTextScale()
    expect(result.startsWith("\x1b]")).toBe(true)
    expect(result.endsWith("\x07")).toBe(true)
  })
})

// ============================================================================
// Integration: textScaled + resetTextScale round-trip
// ============================================================================

describe("scale round-trip", () => {
  test("set and reset produce valid sequence pair", () => {
    const set = textScaled(2)
    const reset = resetTextScale()
    const wrapped = `${set}Hello World${reset}`

    // Should contain the text between scale sequences
    expect(wrapped).toContain("Hello World")
    // Should start with scale-set and end with scale-reset
    expect(wrapped.startsWith(`${OSC}66;s=2${BEL}`)).toBe(true)
    expect(wrapped.endsWith(`${OSC}66;s=1${BEL}`)).toBe(true)
  })

  test("nested scales produce valid sequences", () => {
    const outer = textScaled(2)
    const inner = textScaled(0.5)
    const reset = resetTextScale()
    const nested = `${outer}Big ${inner}small${reset} still big${reset}`

    // Count OSC 66 occurrences
    const osc66Count = (nested.match(/\x1b\]66;/g) || []).length
    expect(osc66Count).toBe(4) // 2 sets + 2 resets
  })
})
