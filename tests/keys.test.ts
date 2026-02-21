import { describe, expect, test } from "vitest"
import { keyToAnsi, keyToKittyAnsi, parseKey } from "../src/keys.js"

describe("keyToAnsi", () => {
  describe("single characters", () => {
    test("lowercase letter", () => {
      expect(keyToAnsi("a")).toBe("a")
    })

    test("uppercase letter", () => {
      expect(keyToAnsi("A")).toBe("A")
    })

    test("number", () => {
      expect(keyToAnsi("5")).toBe("5")
    })

    test("special character", () => {
      expect(keyToAnsi("!")).toBe("!")
    })
  })

  describe("named keys", () => {
    test("Enter", () => {
      expect(keyToAnsi("Enter")).toBe("\r")
    })

    test("Escape", () => {
      expect(keyToAnsi("Escape")).toBe("\x1b")
    })

    test("Tab", () => {
      expect(keyToAnsi("Tab")).toBe("\t")
    })

    test("Space", () => {
      expect(keyToAnsi("Space")).toBe(" ")
    })

    test("Backspace", () => {
      expect(keyToAnsi("Backspace")).toBe("\x7f")
    })

    test("Delete", () => {
      expect(keyToAnsi("Delete")).toBe("\x1b[3~")
    })

    test("ArrowUp", () => {
      expect(keyToAnsi("ArrowUp")).toBe("\x1b[A")
    })

    test("ArrowDown", () => {
      expect(keyToAnsi("ArrowDown")).toBe("\x1b[B")
    })

    test("ArrowLeft", () => {
      expect(keyToAnsi("ArrowLeft")).toBe("\x1b[D")
    })

    test("ArrowRight", () => {
      expect(keyToAnsi("ArrowRight")).toBe("\x1b[C")
    })

    test("Home", () => {
      expect(keyToAnsi("Home")).toBe("\x1b[H")
    })

    test("End", () => {
      expect(keyToAnsi("End")).toBe("\x1b[F")
    })

    test("PageUp", () => {
      expect(keyToAnsi("PageUp")).toBe("\x1b[5~")
    })

    test("PageDown", () => {
      expect(keyToAnsi("PageDown")).toBe("\x1b[6~")
    })
  })

  describe("modifier combos", () => {
    test("Control+c produces ETX (0x03)", () => {
      expect(keyToAnsi("Control+c")).toBe("\x03")
    })

    test("Control+a produces SOH (0x01)", () => {
      expect(keyToAnsi("Control+a")).toBe("\x01")
    })

    test("Control+z produces SUB (0x1a)", () => {
      expect(keyToAnsi("Control+z")).toBe("\x1a")
    })

    test("Control+uppercase letter works", () => {
      expect(keyToAnsi("Control+C")).toBe("\x03")
    })

    test("Control+Enter returns \\n (legacy Ctrl+Enter)", () => {
      expect(keyToAnsi("Control+Enter")).toBe("\n")
    })
  })

  describe("modifier aliases", () => {
    test("ctrl+c works like Control+c", () => {
      expect(keyToAnsi("ctrl+c")).toBe("\x03")
    })

    test("ctrl+a works like Control+a", () => {
      expect(keyToAnsi("ctrl+a")).toBe("\x01")
    })

    test("Ctrl+c (capitalized) works", () => {
      expect(keyToAnsi("Ctrl+c")).toBe("\x03")
    })

    test("alt+x produces ESC+x", () => {
      expect(keyToAnsi("alt+x")).toBe("\x1bx")
    })

    test("meta+x produces ESC+x", () => {
      expect(keyToAnsi("meta+x")).toBe("\x1bx")
    })

    test("cmd+x uses Kitty encoding (Super requires Kitty protocol)", () => {
      // cmd maps to Super, which has no legacy ANSI representation.
      // keyToAnsi now delegates to keyToKittyAnsi for Super/Hyper modifiers.
      expect(keyToAnsi("cmd+x")).toBe(keyToKittyAnsi("cmd+x"))
    })

    test("option+x produces ESC+x (macOS alias)", () => {
      expect(keyToAnsi("option+x")).toBe("\x1bx")
    })

    test("shift+Tab works like Shift+Tab", () => {
      expect(keyToAnsi("shift+Tab")).toBe(keyToAnsi("Shift+Tab"))
    })

    test("Shift+Tab produces backtab sequence", () => {
      expect(keyToAnsi("Shift+Tab")).toBe("\x1b[Z")
    })
  })

  describe("Ctrl+Enter round-trip", () => {
    test("keyToAnsi → parseKey produces key.return + key.ctrl", () => {
      const ansi = keyToAnsi("Control+Enter")
      const [, key] = parseKey(ansi)
      expect(key.return).toBe(true)
      expect(key.ctrl).toBe(true)
    })
  })

  describe("Shift+Tab round-trip", () => {
    test("keyToAnsi → parseKey produces key.tab + key.shift", () => {
      const ansi = keyToAnsi("Shift+Tab")
      const [, key] = parseKey(ansi)
      expect(key.tab).toBe(true)
      expect(key.shift).toBe(true)
    })
  })
})

describe("parseKey", () => {
  describe("xterm modifyOtherKeys format", () => {
    test("CSI 27;5;13~ = Ctrl+Enter", () => {
      const [, key] = parseKey("\x1b[27;5;13~")
      expect(key.return).toBe(true)
      expect(key.ctrl).toBe(true)
      expect(key.shift).toBe(false)
    })

    test("CSI 27;6;13~ = Ctrl+Shift+Enter", () => {
      const [, key] = parseKey("\x1b[27;6;13~")
      expect(key.return).toBe(true)
      expect(key.ctrl).toBe(true)
      expect(key.shift).toBe(true)
    })

    test("CSI 27;5;9~ = Ctrl+Tab", () => {
      const [, key] = parseKey("\x1b[27;5;9~")
      expect(key.tab).toBe(true)
      expect(key.ctrl).toBe(true)
    })

    test("CSI 27;5;97~ = Ctrl+a (modifyOtherKeys)", () => {
      const [input, key] = parseKey("\x1b[27;5;97~")
      expect(input).toBe("a")
      expect(key.ctrl).toBe(true)
    })
  })

  describe("legacy terminal", () => {
    test("\\n = Ctrl+Enter (legacy)", () => {
      const [, key] = parseKey("\n")
      expect(key.return).toBe(true)
      expect(key.ctrl).toBe(true)
    })

    test("\\r = Enter", () => {
      const [, key] = parseKey("\r")
      expect(key.return).toBe(true)
      expect(key.ctrl).toBe(false)
    })
  })

  describe("unknown keys", () => {
    test("unknown named key passes through", () => {
      expect(keyToAnsi("UnknownKey")).toBe("UnknownKey")
    })

    test("modifier-only key is stripped", () => {
      // When only modifier is specified, mainKey becomes the modifier name
      expect(keyToAnsi("Control")).toBe("Control")
    })
  })
})
