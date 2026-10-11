/**
 * Pre-enrollment security audit (hh 28598 slice d): Kitty key-report
 * codepoints on the input stream.
 *
 * A malicious terminal can put any integer in the shifted-key (group 2) or
 * base-layout (group 3) field of a CSI-u report. `parseKeypress` used to pass
 * those fields to `String.fromCodePoint` unguarded; only the primary
 * codepoint was range-checked. Values above U+10FFFF, surrogates, and
 * non-safe integers throw `RangeError` out of the input path, and under
 * `run()` the uncaught-exception hook panics and exits the app (audit F8).
 * The contract: those sequences do not throw; an invalid shifted or
 * base-layout field is dropped; a valid field still decodes; an invalid
 * primary still returns an empty name.
 *
 * @failure A Kitty CSI-u report with an out-of-range shifted or base-layout
 *   codepoint throws RangeError and kills the app.
 * @level l2
 * @consumer @silvery/ag parseKeypress (hh 28598 F8)
 * @testonly none
 */

import { describe, expect, test } from "vitest"
import { parseKey, parseKeypress } from "@silvery/ag/keys"

const ESC = "\x1b"

describe("Kitty key-report codepoints on untrusted input", () => {
  test.each([
    [`${ESC}[97:1114112u`, "shifted-key field above U+10FFFF"],
    [`${ESC}[97:1:1114112u`, "base-layout field above U+10FFFF"],
    [`${ESC}[97:99999999999999999999999u`, "shifted-key field not a safe integer"],
    [`${ESC}[97:55296u`, "shifted-key field is a surrogate"],
    [`${ESC}[1114112u`, "primary codepoint above U+10FFFF"],
  ])("parseKeypress(%j) does not throw (%s)", (bytes) => {
    expect(() => parseKeypress(bytes)).not.toThrow()
    expect(() => parseKey(bytes)).not.toThrow()
  })

  test("an invalid shifted-key field is dropped; primary still parses", () => {
    const result = parseKeypress(`${ESC}[97:1114112u`)
    expect(result.name).toBe("a")
    expect(result.shiftedKey).toBeUndefined()
  })

  test("a surrogate shifted-key field is dropped; primary still parses", () => {
    const result = parseKeypress(`${ESC}[97:55296u`)
    expect(result.name).toBe("a")
    expect(result.shiftedKey).toBeUndefined()
  })

  test("an invalid base-layout field is dropped; primary still parses", () => {
    const result = parseKeypress(`${ESC}[97:1:1114112u`)
    expect(result.name).toBe("a")
    expect(result.baseLayoutKey).toBeUndefined()
  })

  test("an invalid primary codepoint returns an empty name", () => {
    const result = parseKeypress(`${ESC}[1114112u`)
    expect(result.name).toBe("")
    expect(result.isPrintable).toBe(false)
  })

  test("a valid shifted-key field still decodes", () => {
    const result = parseKeypress(`${ESC}[97:65u`)
    expect(result.name).toBe("a")
    expect(result.shiftedKey).toBe("A")
  })

  test("a valid base-layout field still decodes", () => {
    const result = parseKeypress(`${ESC}[97:65:113u`)
    expect(result.name).toBe("a")
    expect(result.shiftedKey).toBe("A")
    expect(result.baseLayoutKey).toBe("q")
  })
})
