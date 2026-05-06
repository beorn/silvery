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
