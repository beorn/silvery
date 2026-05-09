import { describe, expect, test } from "vitest"
import { keyToAnsi, parseKey } from "../src/keys.ts"

describe("parseKey — Alt/Option punctuation", () => {
  test("legacy ESC-prefixed punctuation preserves the meta modifier", () => {
    for (const hotkey of ["Alt+,", "Alt+.", "Alt+/"]) {
      const [input, key] = parseKey(keyToAnsi(hotkey))
      expect(input).toBe(hotkey.at(-1))
      expect(key.meta).toBe(true)
      expect(key.text).toBe(hotkey.at(-1))
    }
  })
})

describe("keyToAnsi — modifier encoding on tilde-terminated nav keys", () => {
  // Regression for @km/silvery/keyToAnsi-shift-pageup-pagedown-encoding:
  // before the fix, keyToAnsi("Shift+PageUp") returned the bare "\x1b[5~"
  // sequence (ignoring Shift) so app.press("Shift+PageUp") in tests, and
  // any caller assembling hotkey ANSI for PageUp/PageDown/Insert/Delete
  // with modifiers, lost the modifier — parseKeypress decoded it as
  // `pageUp:true, shift:false` and bindings checking `key.shift` never
  // matched. The fix encodes via xterm modifyOtherKeys-style
  // CSI number;mod ~ form (\x1b[5;2~ for Shift+PageUp).
  test("Shift+PageUp encodes via CSI 5;2 ~ and round-trips with shift=true", () => {
    const ansi = keyToAnsi("Shift+PageUp")
    expect(ansi).toBe("\x1b[5;2~")
    const [, key] = parseKey(ansi)
    expect(key.pageUp).toBe(true)
    expect(key.shift).toBe(true)
  })

  test("Shift+PageDown encodes via CSI 6;2 ~", () => {
    const ansi = keyToAnsi("Shift+PageDown")
    expect(ansi).toBe("\x1b[6;2~")
    const [, key] = parseKey(ansi)
    expect(key.pageDown).toBe(true)
    expect(key.shift).toBe(true)
  })

  test("Ctrl+PageUp encodes with mod=5", () => {
    const ansi = keyToAnsi("Control+PageUp")
    expect(ansi).toBe("\x1b[5;5~")
    const [, key] = parseKey(ansi)
    expect(key.pageUp).toBe(true)
    expect(key.ctrl).toBe(true)
    expect(key.shift).toBe(false)
  })

  test("Shift+Insert and Shift+Delete also receive the modifier", () => {
    const insertAnsi = keyToAnsi("Shift+Insert")
    expect(insertAnsi).toBe("\x1b[2;2~")
    const [, insertKey] = parseKey(insertAnsi)
    expect(insertKey.shift).toBe(true)

    const deleteAnsi = keyToAnsi("Shift+Delete")
    expect(deleteAnsi).toBe("\x1b[3;2~")
    const [, deleteKey] = parseKey(deleteAnsi)
    expect(deleteKey.shift).toBe(true)
    expect(deleteKey.delete).toBe(true)
  })

  test("bare PageUp / PageDown still emit the unmodified bare sequence", () => {
    expect(keyToAnsi("PageUp")).toBe("\x1b[5~")
    expect(keyToAnsi("PageDown")).toBe("\x1b[6~")
  })
})
