/**
 * Tests for Kitty keyboard protocol support.
 *
 * Verifies both parsing (CSI codepoint;modifiers u → Key) and
 * generation (Playwright-style key string → Kitty ANSI sequence).
 */

import { describe, expect, test } from "vitest"
import { parseKeypress, keyToKittyAnsi } from "../src/keys.js"

// Helper: generate a Kitty CSI u sequence
function kittySeq(codepoint: number, modifier?: number, eventType?: number): string {
  const parts = [codepoint]
  if (modifier !== undefined || eventType !== undefined) {
    parts.push(modifier ?? 1)
    if (eventType !== undefined) parts.push(eventType)
  }
  return `\x1b[${parts.join(";")}u`
}

// =============================================================================
// Parsing: CSI codepoint;modifiers u → ParsedKeypress
// =============================================================================

describe("Kitty keyboard protocol parsing", () => {
  test("simple letter (no modifiers)", () => {
    const key = parseKeypress(kittySeq(97)) // 'a'
    expect(key.name).toBe("a")
    expect(key.ctrl).toBe(false)
    expect(key.shift).toBe(false)
    expect(key.meta).toBe(false)
  })

  test("uppercase letter via codepoint", () => {
    const key = parseKeypress(kittySeq(65)) // 'A'
    expect(key.name).toBe("a")
    expect(key.shift).toBe(true)
  })

  test("shift modifier", () => {
    const key = parseKeypress(kittySeq(97, 2)) // shift+a: modifier=2 (shift=1, +1 base)
    expect(key.name).toBe("a")
    expect(key.shift).toBe(true)
    expect(key.ctrl).toBe(false)
  })

  test("ctrl modifier", () => {
    const key = parseKeypress(kittySeq(99, 5)) // ctrl+c: modifier=5 (ctrl=4, +1 base)
    expect(key.name).toBe("c")
    expect(key.ctrl).toBe(true)
    expect(key.shift).toBe(false)
  })

  test("alt modifier", () => {
    const key = parseKeypress(kittySeq(120, 3)) // alt+x: modifier=3 (alt=2, +1 base)
    expect(key.name).toBe("x")
    expect(key.meta).toBe(true)
  })

  test("ctrl+shift modifier", () => {
    const key = parseKeypress(kittySeq(97, 6)) // ctrl+shift+a: modifier=6 (ctrl=4+shift=1, +1)
    expect(key.name).toBe("a")
    expect(key.ctrl).toBe(true)
    expect(key.shift).toBe(true)
  })

  test("super modifier maps to meta", () => {
    const key = parseKeypress(kittySeq(97, 9)) // super+a: modifier=9 (super=8, +1)
    expect(key.name).toBe("a")
    expect(key.meta).toBe(true)
  })

  test("Enter key", () => {
    const key = parseKeypress(kittySeq(13))
    expect(key.name).toBe("return")
  })

  test("Escape key", () => {
    const key = parseKeypress(kittySeq(27))
    expect(key.name).toBe("escape")
  })

  test("Tab key", () => {
    const key = parseKeypress(kittySeq(9))
    expect(key.name).toBe("tab")
  })

  test("Backspace key", () => {
    const key = parseKeypress(kittySeq(127))
    expect(key.name).toBe("backspace")
  })

  test("Shift+Enter", () => {
    const key = parseKeypress(kittySeq(13, 2))
    expect(key.name).toBe("return")
    expect(key.shift).toBe(true)
  })

  test("F1 key", () => {
    const key = parseKeypress(kittySeq(57376))
    expect(key.name).toBe("f1")
  })

  test("F12 key", () => {
    const key = parseKeypress(kittySeq(57387))
    expect(key.name).toBe("f12")
  })

  test("arrow up", () => {
    const key = parseKeypress(kittySeq(57358))
    expect(key.name).toBe("up")
  })

  test("arrow down", () => {
    const key = parseKeypress(kittySeq(57359))
    expect(key.name).toBe("down")
  })

  test("Home key", () => {
    const key = parseKeypress(kittySeq(57354))
    expect(key.name).toBe("home")
  })

  test("End key", () => {
    const key = parseKeypress(kittySeq(57355))
    expect(key.name).toBe("end")
  })

  test("PageUp key", () => {
    const key = parseKeypress(kittySeq(57356))
    expect(key.name).toBe("pageup")
  })

  test("Delete key", () => {
    const key = parseKeypress(kittySeq(57353))
    expect(key.name).toBe("delete")
  })

  test("Insert key", () => {
    const key = parseKeypress(kittySeq(57352))
    expect(key.name).toBe("insert")
  })

  test("printable symbol", () => {
    const key = parseKeypress(kittySeq(33)) // '!'
    expect(key.name).toBe("!")
  })

  test("space key", () => {
    const key = parseKeypress(kittySeq(32)) // space
    expect(key.name).toBe(" ")
  })

  test("event type is ignored (press event)", () => {
    // CSI 97;1:1 u — event_type=1 (press)
    const key = parseKeypress(`\x1b[97;1:1u`)
    expect(key.name).toBe("a")
  })

  test("modifier with shifted codepoint", () => {
    // CSI 97:65;2 u — base=97, shifted=65, modifier=2 (shift)
    const key = parseKeypress(`\x1b[97:65;2u`)
    expect(key.name).toBe("a")
    expect(key.shift).toBe(true)
  })
})

// =============================================================================
// Generation: Playwright-style key → Kitty ANSI sequence
// =============================================================================

describe("keyToKittyAnsi", () => {
  test("single letter", () => {
    expect(keyToKittyAnsi("a")).toBe("\x1b[97u")
  })

  test("Enter key", () => {
    expect(keyToKittyAnsi("Enter")).toBe("\x1b[13u")
  })

  test("Escape key", () => {
    expect(keyToKittyAnsi("Escape")).toBe("\x1b[27u")
  })

  test("ArrowUp", () => {
    expect(keyToKittyAnsi("ArrowUp")).toBe("\x1b[57358u")
  })

  test("ArrowDown", () => {
    expect(keyToKittyAnsi("ArrowDown")).toBe("\x1b[57359u")
  })

  test("Control+c", () => {
    expect(keyToKittyAnsi("Control+c")).toBe("\x1b[99;5u")
  })

  test("Shift+Enter", () => {
    expect(keyToKittyAnsi("Shift+Enter")).toBe("\x1b[13;2u")
  })

  test("Control+Shift+a", () => {
    expect(keyToKittyAnsi("Control+Shift+a")).toBe("\x1b[97;6u")
  })

  test("Alt+x", () => {
    expect(keyToKittyAnsi("Alt+x")).toBe("\x1b[120;3u")
  })

  test("Tab key", () => {
    expect(keyToKittyAnsi("Tab")).toBe("\x1b[9u")
  })

  test("roundtrip: generate then parse", () => {
    const keys = [
      "a",
      "Enter",
      "Escape",
      "ArrowUp",
      "ArrowDown",
      "Tab",
      "Backspace",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Delete",
      "F1",
      "F12",
    ]
    for (const k of keys) {
      const ansi = keyToKittyAnsi(k)
      const parsed = parseKeypress(ansi)
      // Verify the parsed name makes sense (note: Playwright names differ from internal names)
      expect(parsed.name).toBeTruthy()
    }
  })

  test("roundtrip with modifiers", () => {
    const ansi = keyToKittyAnsi("Control+c")
    const parsed = parseKeypress(ansi)
    expect(parsed.name).toBe("c")
    expect(parsed.ctrl).toBe(true)
  })
})
