/**
 * Verify that legacy terminals normalize shifted punctuation → base key + shift.
 *
 * Legacy terminals send the result character (e.g. `?` for Shift+`/`) without
 * a shift modifier flag. Kitty protocol sends the base codepoint + shift.
 * parseKey() should normalize legacy input so keybindings like `shift-/` match
 * on both protocols.
 */

import { describe, test, expect } from "vitest"
import { parseKey } from "@silvery/ag/keys"

// All US QWERTY shifted punctuation pairs: [shiftedChar, baseChar]
const SHIFTED_PAIRS: [string, string][] = [
  ["!", "1"],
  ["@", "2"],
  ["#", "3"],
  ["$", "4"],
  ["%", "5"],
  ["^", "6"],
  ["&", "7"],
  ["*", "8"],
  ["(", "9"],
  [")", "0"],
  ["_", "-"],
  ["+", "="],
  ["~", "`"],
  ["{", "["],
  ["}", "]"],
  ["|", "\\"],
  [":", ";"],
  ['"', "'"],
  ["<", ","],
  [">", "."],
  ["?", "/"],
]

describe("shifted punctuation normalization", () => {
  describe("legacy terminals: shifted char → base + shift", () => {
    for (const [shifted, base] of SHIFTED_PAIRS) {
      test(`'${shifted}' normalizes to '${base}' + shift`, () => {
        // Legacy terminal sends the shifted character directly
        const [input, key] = parseKey(shifted)
        expect(input).toBe(base)
        expect(key.shift).toBe(true)
      })
    }
  })

  describe("base characters are NOT normalized", () => {
    const BASE_CHARS = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
      "-",
      "=",
      "`",
      "[",
      "]",
      "\\",
      ";",
      "'",
      ",",
      ".",
      "/",
    ]

    for (const ch of BASE_CHARS) {
      test(`'${ch}' is not shifted`, () => {
        const [input, key] = parseKey(ch)
        expect(input).toBe(ch)
        expect(key.shift).toBe(false)
      })
    }
  })

  describe("Kitty protocol: already sends base + shift, no double-normalization", () => {
    // Kitty CSI u format: ESC [ codepoint ; modifiers u
    // modifier 2 = shift
    test("Kitty shift+/ sends base codepoint 47 + shift modifier", () => {
      const seq = "\x1b[47;2u" // codepoint 47 = '/', modifier 2 = shift
      const [input, key] = parseKey(seq)
      expect(input).toBe("/")
      expect(key.shift).toBe(true)
    })

    test("Kitty shift+; sends base codepoint 59 + shift modifier", () => {
      const seq = "\x1b[59;2u" // codepoint 59 = ';', modifier 2 = shift
      const [input, key] = parseKey(seq)
      expect(input).toBe(";")
      expect(key.shift).toBe(true)
    })

    test("Kitty shift+1 sends base codepoint 49 + shift modifier", () => {
      const seq = "\x1b[49;2u" // codepoint 49 = '1', modifier 2 = shift
      const [input, key] = parseKey(seq)
      expect(input).toBe("1")
      expect(key.shift).toBe(true)
    })
  })

  describe("does not affect non-punctuation", () => {
    test("lowercase letters are unaffected", () => {
      const [input, key] = parseKey("a")
      expect(input).toBe("a")
      expect(key.shift).toBe(false)
    })

    test("uppercase letters get shift via existing detection", () => {
      const [input, key] = parseKey("A")
      // Uppercase letters keep the uppercase char and get shift=true
      expect(input).toBe("A")
      expect(key.shift).toBe(true)
    })

    test("space is unaffected", () => {
      const [input, key] = parseKey(" ")
      expect(input).toBe(" ")
      expect(key.shift).toBe(false)
    })
  })
})
