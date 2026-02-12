/**
 * Tests for splitRawInput — tokenizer that splits raw terminal input
 * into individual keypresses.
 */

import { describe, expect, it } from "vitest"
import { splitRawInput } from "../src/keys.js"

function split(data: string): string[] {
  return [...splitRawInput(data)]
}

describe("splitRawInput", () => {
  it("returns empty for empty string", () => {
    expect(split("")).toEqual([])
  })

  it("splits single characters", () => {
    expect(split("a")).toEqual(["a"])
    expect(split("z")).toEqual(["z"])
    expect(split(" ")).toEqual([" "])
  })

  it("splits multiple characters into individual keypresses", () => {
    expect(split("abc")).toEqual(["a", "b", "c"])
    expect(split("hello")).toEqual(["h", "e", "l", "l", "o"])
  })

  it("splits mixed printable and control characters", () => {
    expect(split("a\tb")).toEqual(["a", "\t", "b"])
    expect(split("a\rb")).toEqual(["a", "\r", "b"])
    expect(split("a\nb")).toEqual(["a", "\n", "b"])
  })

  it("keeps CSI escape sequences intact", () => {
    // Arrow up: ESC [ A
    expect(split("\x1b[A")).toEqual(["\x1b[A"])
    // Arrow down: ESC [ B
    expect(split("\x1b[B")).toEqual(["\x1b[B"])
    // Delete: ESC [ 3 ~
    expect(split("\x1b[3~")).toEqual(["\x1b[3~"])
    // Page up: ESC [ 5 ~
    expect(split("\x1b[5~")).toEqual(["\x1b[5~"])
  })

  it("splits characters around CSI sequences", () => {
    // a + ArrowUp + b
    expect(split("a\x1b[Ab")).toEqual(["a", "\x1b[A", "b"])
    // hello + ArrowDown + world
    expect(split("hello\x1b[Bworld")).toEqual(["h", "e", "l", "l", "o", "\x1b[B", "w", "o", "r", "l", "d"])
  })

  it("keeps SS3 sequences intact", () => {
    // ESC O A (arrow up in some terminals)
    expect(split("\x1bOA")).toEqual(["\x1bOA"])
    // ESC O P (F1 in some terminals)
    expect(split("\x1bOP")).toEqual(["\x1bOP"])
  })

  it("splits characters around SS3 sequences", () => {
    expect(split("x\x1bOAy")).toEqual(["x", "\x1bOA", "y"])
  })

  it("keeps meta key sequences intact", () => {
    // Alt+a: ESC a
    expect(split("\x1ba")).toEqual(["\x1ba"])
    // Alt+x: ESC x
    expect(split("\x1bx")).toEqual(["\x1bx"])
  })

  it("handles bare ESC", () => {
    expect(split("\x1b")).toEqual(["\x1b"])
  })

  it("handles double ESC", () => {
    expect(split("\x1b\x1b")).toEqual(["\x1b\x1b"])
  })

  it("handles Kitty keyboard protocol sequences", () => {
    // CSI 97 u (plain 'a' in Kitty)
    expect(split("\x1b[97u")).toEqual(["\x1b[97u"])
    // CSI 13 ; 5 u (Ctrl+Enter in Kitty)
    expect(split("\x1b[13;5u")).toEqual(["\x1b[13;5u"])
  })

  it("handles xterm modifyOtherKeys sequences", () => {
    // CSI 27 ; 5 ; 13 ~ (Ctrl+Enter in Ghostty/xterm)
    expect(split("\x1b[27;5;13~")).toEqual(["\x1b[27;5;13~"])
  })

  it("handles Shift+Tab", () => {
    // ESC [ Z
    expect(split("\x1b[Z")).toEqual(["\x1b[Z"])
  })

  it("handles rapid typing: full sentence", () => {
    const input = "hello world"
    const result = split(input)
    expect(result).toEqual(["h", "e", "l", "l", "o", " ", "w", "o", "r", "l", "d"])
  })

  it("handles paste with newlines", () => {
    expect(split("line1\nline2")).toEqual(["l", "i", "n", "e", "1", "\n", "l", "i", "n", "e", "2"])
  })

  it("handles Ctrl+C (0x03)", () => {
    expect(split("\x03")).toEqual(["\x03"])
    expect(split("ab\x03cd")).toEqual(["a", "b", "\x03", "c", "d"])
  })

  it("keeps emoji with variation selectors as one grapheme", () => {
    // ❤️ = U+2764 + U+FE0F (variation selector)
    expect(split("❤️")).toEqual(["❤️"])
    expect(split("a❤️b")).toEqual(["a", "❤️", "b"])
  })

  it("keeps surrogate pair emoji as one grapheme", () => {
    expect(split("😀")).toEqual(["😀"])
    expect(split("🎉🚀")).toEqual(["🎉", "🚀"])
  })

  it("keeps ZWJ emoji sequences as one grapheme", () => {
    // Family emoji: 👨‍👩‍👧‍👦
    expect(split("👨‍👩‍👧‍👦")).toEqual(["👨‍👩‍👧‍👦"])
  })

  it("splits CJK characters into individual graphemes", () => {
    expect(split("你好")).toEqual(["你", "好"])
    expect(split("日本語")).toEqual(["日", "本", "語"])
  })

  it("splits fullwidth ASCII into individual graphemes", () => {
    expect(split("ＡＢＣ")).toEqual(["Ａ", "Ｂ", "Ｃ"])
  })

  it("handles multiple escape sequences in a row", () => {
    // ArrowUp + ArrowDown (held keys during slow render)
    expect(split("\x1b[A\x1b[B")).toEqual(["\x1b[A", "\x1b[B"])
    // Three arrow keys
    expect(split("\x1b[A\x1b[A\x1b[A")).toEqual(["\x1b[A", "\x1b[A", "\x1b[A"])
  })

  it("handles mixed escape sequences and characters", () => {
    // Type 'a', press ArrowUp, type 'b', press Enter
    expect(split("a\x1b[Ab\r")).toEqual(["a", "\x1b[A", "b", "\r"])
  })
})
