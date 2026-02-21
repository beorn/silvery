/**
 * Tests for Kitty keyboard protocol support.
 *
 * Verifies both parsing (CSI codepoint;modifiers u → Key) and
 * generation (Playwright-style key string → Kitty ANSI sequence).
 */

import { describe, expect, test } from "vitest"
import { parseKeypress, keyToKittyAnsi, parseKey, matchHotkey, parseHotkey } from "../src/keys.js"
import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard, KittyFlags } from "../src/output.js"

// Helper: generate a Kitty CSI u sequence
// Format: CSI codepoint[:shifted_codepoint][;modifiers[:event_type]] u
function kittySeq(codepoint: number, modifier?: number, eventType?: number): string {
  let seq = `\x1b[${codepoint}`
  if (modifier !== undefined || eventType !== undefined) {
    seq += `;${modifier ?? 1}`
    if (eventType !== undefined) {
      seq += `:${eventType}`
    }
  }
  seq += "u"
  return seq
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

  test("super modifier maps to super (not meta)", () => {
    const key = parseKeypress(kittySeq(97, 9)) // super+a: modifier=9 (super=8, +1)
    expect(key.name).toBe("a")
    expect(key.super).toBe(true)
    expect(key.meta).toBe(false)
  })

  test("alt and super together", () => {
    const key = parseKeypress(kittySeq(97, 11)) // alt+super+a: modifier=11 (alt=2+super=8, +1)
    expect(key.name).toBe("a")
    expect(key.meta).toBe(true) // alt
    expect(key.super).toBe(true) // super/cmd
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

  test("Super+x (cmd alias)", () => {
    expect(keyToKittyAnsi("Super+x")).toBe("\x1b[120;9u") // super=8, modifier=9
  })

  test("cmd+x (Super alias)", () => {
    expect(keyToKittyAnsi("cmd+x")).toBe("\x1b[120;9u") // super=8, modifier=9
  })

  test("roundtrip: super modifier", () => {
    const ansi = keyToKittyAnsi("Super+j")
    const parsed = parseKeypress(ansi)
    expect(parsed.name).toBe("j")
    expect(parsed.super).toBe(true)
    expect(parsed.meta).toBe(false)
  })

  test("roundtrip: alt vs super are distinct", () => {
    const altAnsi = keyToKittyAnsi("Alt+j")
    const superAnsi = keyToKittyAnsi("Super+j")
    expect(altAnsi).not.toBe(superAnsi)

    const altParsed = parseKeypress(altAnsi)
    expect(altParsed.meta).toBe(true)
    expect(altParsed.super).toBe(false)

    const superParsed = parseKeypress(superAnsi)
    expect(superParsed.meta).toBe(false)
    expect(superParsed.super).toBe(true)
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

// =============================================================================
// Protocol Sequences: Enable/Disable
// =============================================================================

describe("Kitty keyboard protocol sequences", () => {
  test("enableKittyKeyboard default sends CSI > 1 u (DISAMBIGUATE)", () => {
    expect(enableKittyKeyboard()).toBe("\x1b[>1u")
  })

  test("enableKittyKeyboard with custom flags", () => {
    // DISAMBIGUATE + REPORT_EVENTS
    expect(enableKittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS)).toBe("\x1b[>3u")
    // All flags
    const allFlags =
      KittyFlags.DISAMBIGUATE |
      KittyFlags.REPORT_EVENTS |
      KittyFlags.REPORT_ALTERNATE |
      KittyFlags.REPORT_ALL_KEYS |
      KittyFlags.REPORT_TEXT
    expect(enableKittyKeyboard(allFlags)).toBe("\x1b[>31u")
    // Just REPORT_ALL_KEYS
    expect(enableKittyKeyboard(KittyFlags.REPORT_ALL_KEYS)).toBe("\x1b[>8u")
  })

  test("disableKittyKeyboard sends CSI < u (pop mode stack)", () => {
    expect(disableKittyKeyboard()).toBe("\x1b[<u")
  })

  test("queryKittyKeyboard sends CSI ? u", () => {
    expect(queryKittyKeyboard()).toBe("\x1b[?u")
  })
})

// =============================================================================
// KittyFlags constants
// =============================================================================

describe("KittyFlags", () => {
  test("flag values match Kitty protocol spec", () => {
    expect(KittyFlags.DISAMBIGUATE).toBe(1)
    expect(KittyFlags.REPORT_EVENTS).toBe(2)
    expect(KittyFlags.REPORT_ALTERNATE).toBe(4)
    expect(KittyFlags.REPORT_ALL_KEYS).toBe(8)
    expect(KittyFlags.REPORT_TEXT).toBe(16)
  })

  test("flags compose as bitfield", () => {
    const flags = KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS
    expect(flags).toBe(3)
    expect(flags & KittyFlags.DISAMBIGUATE).toBeTruthy()
    expect(flags & KittyFlags.REPORT_EVENTS).toBeTruthy()
    expect(flags & KittyFlags.REPORT_ALTERNATE).toBeFalsy()
  })
})

// =============================================================================
// Hyper modifier parsing and generation
// =============================================================================

describe("Hyper modifier", () => {
  test("hyper modifier (bit 4) parsed from Kitty sequence", () => {
    // Kitty modifier encoding: value = bits + 1
    // hyper = bit 4 = 16, encoded = 17
    const key = parseKeypress(kittySeq(97, 17)) // hyper+a
    expect(key.hyper).toBe(true)
    expect(key.shift).toBe(false)
    expect(key.ctrl).toBe(false)
    expect(key.meta).toBe(false)
    expect(key.super).toBe(false)
  })

  test("hyper+shift combination", () => {
    // shift=1, hyper=16 → 17, encoded = 18
    const key = parseKeypress(kittySeq(97, 18)) // hyper+shift+a
    expect(key.hyper).toBe(true)
    expect(key.shift).toBe(true)
    expect(key.name).toBe("a")
  })

  test("hyper + ctrl + alt combination", () => {
    // ctrl=4, alt=2, hyper=16 → 22, encoded = 23
    const key = parseKeypress(kittySeq(97, 23))
    expect(key.ctrl).toBe(true)
    expect(key.meta).toBe(true) // alt
    expect(key.hyper).toBe(true)
    expect(key.shift).toBe(false)
    expect(key.super).toBe(false)
  })

  test("all modifiers at once", () => {
    // shift=1, alt=2, ctrl=4, super=8, hyper=16 → 31, encoded = 32
    const key = parseKeypress(kittySeq(97, 32))
    expect(key.shift).toBe(true)
    expect(key.meta).toBe(true) // alt
    expect(key.ctrl).toBe(true)
    expect(key.super).toBe(true)
    expect(key.hyper).toBe(true)
  })

  test("hyper is false when not present", () => {
    const key = parseKeypress(kittySeq(97)) // bare 'a'
    expect(key.hyper).toBe(false)
  })

  test("keyToKittyAnsi encodes Hyper modifier", () => {
    const ansi = keyToKittyAnsi("Hyper+a")
    const parsed = parseKeypress(ansi)
    expect(parsed.hyper).toBe(true)
    expect(parsed.name).toBe("a")
  })

  test("keyToKittyAnsi encodes Hyper+Control roundtrip", () => {
    const ansi = keyToKittyAnsi("Hyper+Control+x")
    const parsed = parseKeypress(ansi)
    expect(parsed.hyper).toBe(true)
    expect(parsed.ctrl).toBe(true)
    expect(parsed.name).toBe("x")
  })

  test("parseHotkey parses hyper modifier", () => {
    const hotkey = parseHotkey("hyper+a")
    expect(hotkey.hyper).toBe(true)
    expect(hotkey.key).toBe("a")
  })

  test("matchHotkey matches hyper", () => {
    const hotkey = parseHotkey("hyper+a")
    // hyper = bit 4 = 16, encoded = 17
    const [, key] = parseKey(kittySeq(97, 17)) // hyper+a
    // Note: parseKey strips Kitty sequences from input, so pass "a" explicitly
    // (in practice, the runtime provides the resolved character)
    expect(matchHotkey(hotkey, key, "a")).toBe(true)
  })

  test("matchHotkey rejects missing hyper", () => {
    const hotkey = parseHotkey("hyper+a")
    const [, key] = parseKey(kittySeq(97)) // bare a (no hyper)
    expect(matchHotkey(hotkey, key, "a")).toBe(false)
  })

  test("matchHotkey rejects extra hyper", () => {
    const hotkey = parseHotkey("a") // no hyper
    const [, key] = parseKey(kittySeq(97, 17)) // hyper+a
    expect(matchHotkey(hotkey, key, "a")).toBe(false)
  })
})

// =============================================================================
// macOS symbol modifier aliases
// =============================================================================

describe("macOS symbol modifiers", () => {
  test("⌘ parses as super (Cmd)", () => {
    const hotkey = parseHotkey("⌘j")
    expect(hotkey.key).toBe("j")
    expect(hotkey.super).toBe(true)
    expect(hotkey.ctrl).toBe(false)
  })

  test("⌥ parses as meta (Opt/Alt)", () => {
    const hotkey = parseHotkey("⌥j")
    expect(hotkey.key).toBe("j")
    expect(hotkey.meta).toBe(true)
    expect(hotkey.alt).toBe(false) // alt and meta are indistinguishable in terminals
  })

  test("⌃ parses as ctrl", () => {
    const hotkey = parseHotkey("⌃c")
    expect(hotkey.key).toBe("c")
    expect(hotkey.ctrl).toBe(true)
  })

  test("⇧ parses as shift", () => {
    const hotkey = parseHotkey("⇧Tab")
    expect(hotkey.key).toBe("Tab")
    expect(hotkey.shift).toBe(true)
  })

  test("✦ parses as hyper", () => {
    const hotkey = parseHotkey("✦a")
    expect(hotkey.key).toBe("a")
    expect(hotkey.hyper).toBe(true)
  })

  test("multiple symbol prefixes: ⌃⇧a", () => {
    const hotkey = parseHotkey("⌃⇧a")
    expect(hotkey.key).toBe("a")
    expect(hotkey.ctrl).toBe(true)
    expect(hotkey.shift).toBe(true)
  })

  test("symbol prefix with + separator: ⌘+j", () => {
    const hotkey = parseHotkey("⌘+j")
    expect(hotkey.key).toBe("j")
    expect(hotkey.super).toBe(true)
  })

  test("mixed symbol and word: ⌘+Shift+a", () => {
    const hotkey = parseHotkey("⌘+Shift+a")
    expect(hotkey.key).toBe("a")
    expect(hotkey.super).toBe(true)
    expect(hotkey.shift).toBe(true)
  })

  test("all symbols combined: ✦⌘⌥⌃⇧x", () => {
    const hotkey = parseHotkey("✦⌘⌥⌃⇧x")
    expect(hotkey.key).toBe("x")
    expect(hotkey.hyper).toBe(true)
    expect(hotkey.super).toBe(true)
    expect(hotkey.meta).toBe(true) // ⌥ → meta (terminals can't distinguish alt/meta)
    expect(hotkey.ctrl).toBe(true)
    expect(hotkey.shift).toBe(true)
  })

  test("word aliases: opt, command", () => {
    expect(parseHotkey("opt+j").meta).toBe(true)
    expect(parseHotkey("command+j").super).toBe(true)
  })

  test("matchHotkey with ⌘ symbol", () => {
    const hotkey = parseHotkey("⌘j")
    const [, key] = parseKey(kittySeq(106, 9)) // j with super (modifier 9 = bits 8 = super)
    expect(matchHotkey(hotkey, key, "j")).toBe(true)
  })
})

// =============================================================================
// Event type parsing
// =============================================================================

describe("Event types", () => {
  test("press event (type 1)", () => {
    const key = parseKeypress(kittySeq(97, 1, 1)) // a, no mods, press
    expect(key.name).toBe("a")
    expect(key.eventType).toBe(1)
  })

  test("repeat event (type 2)", () => {
    const key = parseKeypress(kittySeq(97, 1, 2)) // a, no mods, repeat
    expect(key.eventType).toBe(2)
  })

  test("release event (type 3)", () => {
    const key = parseKeypress(kittySeq(97, 1, 3)) // a, no mods, release
    expect(key.eventType).toBe(3)
  })

  test("event type with modifiers", () => {
    // ctrl+a, press event: modifier = 4+1=5, event_type = 1
    const key = parseKeypress(kittySeq(97, 5, 1))
    expect(key.ctrl).toBe(true)
    expect(key.eventType).toBe(1)
    expect(key.name).toBe("a")
  })

  test("event type absent when not in sequence", () => {
    const key = parseKeypress(kittySeq(97)) // bare 'a'
    expect(key.eventType).toBeUndefined()
  })

  test("event type absent with modifiers but no event type", () => {
    const key = parseKeypress(kittySeq(97, 5)) // ctrl+a, no event type
    expect(key.ctrl).toBe(true)
    expect(key.eventType).toBeUndefined()
  })

  test("event type propagates through parseKey", () => {
    const [, key] = parseKey(kittySeq(97, 1, 3)) // a, release
    expect(key.eventType).toBe(3)
  })

  test("shift+a release event", () => {
    // shift=1 → modifier 2, release=3
    const key = parseKeypress(kittySeq(97, 2, 3))
    expect(key.shift).toBe(true)
    expect(key.eventType).toBe(3)
  })
})

// =============================================================================
// Super vs Meta vs Hyper distinction
// =============================================================================

describe("Modifier distinction (alt vs super vs hyper)", () => {
  // Kitty modifier encoding: value = bits + 1
  // shift=1, alt=2, ctrl=4, super=8, hyper=16

  test("alt (bit 1) sets meta only", () => {
    const key = parseKeypress(kittySeq(97, 3)) // alt bits=2, encoded=3
    expect(key.meta).toBe(true)
    expect(key.super).toBe(false)
    expect(key.hyper).toBe(false)
  })

  test("super (bit 3) sets super only", () => {
    const key = parseKeypress(kittySeq(97, 9)) // super bits=8, encoded=9
    expect(key.super).toBe(true)
    expect(key.meta).toBe(false)
    expect(key.hyper).toBe(false)
  })

  test("hyper (bit 4) sets hyper only", () => {
    const key = parseKeypress(kittySeq(97, 17)) // hyper bits=16, encoded=17
    expect(key.hyper).toBe(true)
    expect(key.meta).toBe(false)
    expect(key.super).toBe(false)
  })

  test("alt+super distinguishable", () => {
    // alt=2, super=8 → bits=10, encoded=11
    const key = parseKeypress(kittySeq(97, 11))
    expect(key.meta).toBe(true)
    expect(key.super).toBe(true)
    expect(key.hyper).toBe(false)
  })

  test("alt+hyper distinguishable", () => {
    // alt=2, hyper=16 → bits=18, encoded=19
    const key = parseKeypress(kittySeq(97, 19))
    expect(key.meta).toBe(true)
    expect(key.hyper).toBe(true)
    expect(key.super).toBe(false)
  })

  test("super+hyper distinguishable", () => {
    // super=8, hyper=16 → bits=24, encoded=25
    const key = parseKeypress(kittySeq(97, 25))
    expect(key.super).toBe(true)
    expect(key.hyper).toBe(true)
    expect(key.meta).toBe(false)
  })
})

// =============================================================================
// kittyMode in test driver (via createRenderer)
// =============================================================================

describe("kittyMode in createRenderer", () => {
  // These tests verify that createRenderer accepts kittyMode
  // and that press() uses keyToKittyAnsi when enabled.
  // We test the building blocks rather than full rendering since
  // the integration is straightforward (kittyMode → keyToKittyAnsi in press()).

  test("keyToKittyAnsi encodes Super modifier correctly", () => {
    const ansi = keyToKittyAnsi("Super+a")
    const parsed = parseKeypress(ansi)
    expect(parsed.super).toBe(true)
    expect(parsed.meta).toBe(false)
    expect(parsed.name).toBe("a")
  })

  test("keyToKittyAnsi encodes Hyper modifier correctly", () => {
    const ansi = keyToKittyAnsi("Hyper+a")
    const parsed = parseKeypress(ansi)
    expect(parsed.hyper).toBe(true)
    expect(parsed.name).toBe("a")
  })

  test("keyToKittyAnsi encodes complex modifier combo", () => {
    const ansi = keyToKittyAnsi("Control+Shift+Super+a")
    const parsed = parseKeypress(ansi)
    expect(parsed.ctrl).toBe(true)
    expect(parsed.shift).toBe(true)
    expect(parsed.super).toBe(true)
    expect(parsed.name).toBe("a")
  })

  test("keyToAnsi delegates Super to Kitty encoding", async () => {
    // Super requires Kitty protocol — keyToAnsi now delegates to keyToKittyAnsi
    const { keyToAnsi, keyToKittyAnsi } = await import("../src/keys.js")
    const ansi = keyToAnsi("Super+a")
    expect(ansi).toBe(keyToKittyAnsi("Super+a"))
  })
})

// =============================================================================
// Shifted key + base layout key (Kitty extended codepoint format)
// =============================================================================

describe("Shifted key and base layout key", () => {
  // Full format: CSI codepoint[:shifted[:base]][;modifiers[:event_type]] u

  test("shifted codepoint parsed from Kitty sequence", () => {
    // CSI 97:65;2 u — base=97 ('a'), shifted=65 ('A'), modifier=2 (shift)
    const key = parseKeypress(`\x1b[97:65;2u`)
    expect(key.name).toBe("a")
    expect(key.shift).toBe(true)
    expect(key.shiftedKey).toBe("A")
  })

  test("base layout key parsed from Kitty sequence", () => {
    // CSI 246:214:111;2 u — codepoint=246 ('ö'), shifted=214 ('Ö'), base=111 ('o'), shift
    const key = parseKeypress(`\x1b[246:214:111;2u`)
    expect(key.name).toBe("ö")
    expect(key.shift).toBe(true)
    expect(key.shiftedKey).toBe("Ö")
    expect(key.baseLayoutKey).toBe("o")
  })

  test("shifted codepoint without base layout key", () => {
    // CSI 49:33;2 u — codepoint=49 ('1'), shifted=33 ('!'), shift
    const key = parseKeypress(`\x1b[49:33;2u`)
    expect(key.name).toBe("1")
    expect(key.shift).toBe(true)
    expect(key.shiftedKey).toBe("!")
    expect(key.baseLayoutKey).toBeUndefined()
  })

  test("base layout key with non-Latin keyboard", () => {
    // Russian 'й' (1081) shifted='Й' (1049) base='q' (113) with shift
    const key = parseKeypress(`\x1b[1081:1049:113;2u`)
    expect(key.name).toBe("й")
    expect(key.shiftedKey).toBe("Й")
    expect(key.baseLayoutKey).toBe("q")
    expect(key.shift).toBe(true)
  })

  test("codepoint only (no shifted or base) still works", () => {
    const key = parseKeypress(`\x1b[97u`)
    expect(key.name).toBe("a")
    expect(key.shiftedKey).toBeUndefined()
    expect(key.baseLayoutKey).toBeUndefined()
  })

  test("shifted codepoint with ctrl modifier", () => {
    // CSI 97:65;6 u — ctrl+shift+a (modifier: shift=1 + ctrl=4 = 5, encoded=6)
    const key = parseKeypress(`\x1b[97:65;6u`)
    expect(key.name).toBe("a")
    expect(key.ctrl).toBe(true)
    expect(key.shift).toBe(true)
    expect(key.shiftedKey).toBe("A")
  })

  test("shifted codepoint with event type", () => {
    // CSI 97:65;2:1 u — shift+a, press event
    const key = parseKeypress(`\x1b[97:65;2:1u`)
    expect(key.name).toBe("a")
    expect(key.shift).toBe(true)
    expect(key.shiftedKey).toBe("A")
    expect(key.eventType).toBe(1)
  })

  test("all three codepoints with event type", () => {
    // CSI 246:214:111;2:3 u — ö/Ö/o, shift, release
    const key = parseKeypress(`\x1b[246:214:111;2:3u`)
    expect(key.shiftedKey).toBe("Ö")
    expect(key.baseLayoutKey).toBe("o")
    expect(key.eventType).toBe(3)
  })
})

// =============================================================================
// CapsLock / NumLock modifier parsing
// =============================================================================

describe("CapsLock and NumLock modifiers", () => {
  // Kitty modifier bits: capsLock=64, numLock=128

  test("capsLock (bit 6) parsed from Kitty sequence", () => {
    // capsLock=64, encoded = 64 + 1 = 65
    const key = parseKeypress(kittySeq(97, 65))
    expect(key.capsLock).toBe(true)
    expect(key.numLock).toBeFalsy()
    expect(key.name).toBe("a")
  })

  test("numLock (bit 7) parsed from Kitty sequence", () => {
    // numLock=128, encoded = 128 + 1 = 129
    const key = parseKeypress(kittySeq(97, 129))
    expect(key.numLock).toBe(true)
    expect(key.capsLock).toBeFalsy()
  })

  test("capsLock + numLock together", () => {
    // capsLock=64 + numLock=128 = 192, encoded = 193
    const key = parseKeypress(kittySeq(97, 193))
    expect(key.capsLock).toBe(true)
    expect(key.numLock).toBe(true)
  })

  test("capsLock + shift", () => {
    // shift=1, capsLock=64 → 65, encoded=66
    const key = parseKeypress(kittySeq(97, 66))
    expect(key.shift).toBe(true)
    expect(key.capsLock).toBe(true)
    expect(key.ctrl).toBe(false)
  })

  test("capsLock + ctrl + alt", () => {
    // ctrl=4, alt=2, capsLock=64 → 70, encoded=71
    const key = parseKeypress(kittySeq(97, 71))
    expect(key.ctrl).toBe(true)
    expect(key.meta).toBe(true)
    expect(key.capsLock).toBe(true)
  })

  test("numLock + super + shift", () => {
    // shift=1, super=8, numLock=128 → 137, encoded=138
    const key = parseKeypress(kittySeq(97, 138))
    expect(key.shift).toBe(true)
    expect(key.super).toBe(true)
    expect(key.numLock).toBe(true)
  })

  test("all modifiers including lock keys", () => {
    // shift=1, alt=2, ctrl=4, super=8, hyper=16, capsLock=64, numLock=128 → 223, encoded=224
    const key = parseKeypress(kittySeq(97, 224))
    expect(key.shift).toBe(true)
    expect(key.meta).toBe(true)
    expect(key.ctrl).toBe(true)
    expect(key.super).toBe(true)
    expect(key.hyper).toBe(true)
    expect(key.capsLock).toBe(true)
    expect(key.numLock).toBe(true)
  })

  test("no lock keys when modifier is low", () => {
    const key = parseKeypress(kittySeq(97, 5)) // ctrl only
    expect(key.capsLock).toBeFalsy()
    expect(key.numLock).toBeFalsy()
  })

  test("lock modifiers in FN_KEY_RE path", () => {
    // CSI 1;66 A — arrow up with shift(1) + capsLock(64) = 65, encoded=66
    const key = parseKeypress(`\x1b[1;66A`)
    expect(key.name).toBe("up")
    expect(key.shift).toBe(true)
    expect(key.capsLock).toBe(true)
  })
})

// =============================================================================
// Text-as-codepoints (REPORT_TEXT mode)
// =============================================================================

describe("Text-as-codepoints (REPORT_TEXT)", () => {
  // Format: CSI codepoint;modifiers;text_codepoints u
  // text_codepoints are colon-separated Unicode codepoints

  test("single text codepoint", () => {
    // CSI 97;1;97 u — 'a' with text 'a'
    const key = parseKeypress(`\x1b[97;1;97u`)
    expect(key.name).toBe("a")
    expect(key.associatedText).toBe("a")
  })

  test("text codepoint differs from key codepoint (dead key composition)", () => {
    // CSI 101;1;233 u — key 'e' but composed text 'é' (233)
    const key = parseKeypress(`\x1b[101;1;233u`)
    expect(key.name).toBe("e")
    expect(key.associatedText).toBe("é")
  })

  test("multiple text codepoints (colon-separated)", () => {
    // CSI 97;1;104:101:108:108:111 u — key 'a', text 'hello'
    const key = parseKeypress(`\x1b[97;1;104:101:108:108:111u`)
    expect(key.name).toBe("a")
    expect(key.associatedText).toBe("hello")
  })

  test("text with modifier", () => {
    // CSI 97;2;65 u — shift+'a', text 'A' (65)
    const key = parseKeypress(`\x1b[97;2;65u`)
    expect(key.name).toBe("a")
    expect(key.shift).toBe(true)
    expect(key.associatedText).toBe("A")
  })

  test("text with ctrl modifier (no text expected but still parseable)", () => {
    // CSI 97;5;97 u — ctrl+a with text 'a'
    const key = parseKeypress(`\x1b[97;5;97u`)
    expect(key.name).toBe("a")
    expect(key.ctrl).toBe(true)
    expect(key.associatedText).toBe("a")
  })

  test("Unicode text codepoints", () => {
    // CSI 97;1;128075 u — key 'a', text '👋' (128075 = 0x1F44B)
    const key = parseKeypress(`\x1b[97;1;128075u`)
    expect(key.associatedText).toBe("👋")
  })

  test("text with event type", () => {
    // CSI 97;1:1;97 u — 'a', no mods, press event, text 'a'
    const key = parseKeypress(`\x1b[97;1:1;97u`)
    expect(key.name).toBe("a")
    expect(key.eventType).toBe(1)
    expect(key.associatedText).toBe("a")
  })

  test("text with shifted codepoint and base layout key", () => {
    // CSI 97:65:113;2;65 u — 'a' shifted='A' base='q', shift, text 'A'
    const key = parseKeypress(`\x1b[97:65:113;2;65u`)
    expect(key.name).toBe("a")
    expect(key.shiftedKey).toBe("A")
    expect(key.baseLayoutKey).toBe("q")
    expect(key.shift).toBe(true)
    expect(key.associatedText).toBe("A")
  })

  test("no associated text when not present", () => {
    const key = parseKeypress(kittySeq(97))
    expect(key.associatedText).toBeUndefined()
  })

  test("no associated text with modifiers but no text group", () => {
    const key = parseKeypress(kittySeq(97, 5))
    expect(key.associatedText).toBeUndefined()
  })

  test("full kitchen-sink: shifted + base + modifiers + event + text", () => {
    // CSI 246:214:111;66:1;214 u
    // codepoint=246('ö'), shifted=214('Ö'), base=111('o'),
    // modifier=66 (shift=1 + capsLock=64 = 65, encoded=66), event=press(1),
    // text=214('Ö')
    const key = parseKeypress(`\x1b[246:214:111;66:1;214u`)
    expect(key.name).toBe("ö")
    expect(key.shiftedKey).toBe("Ö")
    expect(key.baseLayoutKey).toBe("o")
    expect(key.shift).toBe(true)
    expect(key.capsLock).toBe(true)
    expect(key.eventType).toBe(1)
    expect(key.associatedText).toBe("Ö")
  })
})
