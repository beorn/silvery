import { describe, it, expect } from "vitest"
import { keyboardEventToSequence } from "../input.ts"

function key(
  k: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }> = {},
): KeyboardEvent {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  } as unknown as KeyboardEvent
}

describe("keyboardEventToSequence", () => {
  it("arrow keys", () => {
    expect(keyboardEventToSequence(key("ArrowUp"))).toBe("\x1b[A")
    expect(keyboardEventToSequence(key("ArrowDown"))).toBe("\x1b[B")
    expect(keyboardEventToSequence(key("ArrowRight"))).toBe("\x1b[C")
    expect(keyboardEventToSequence(key("ArrowLeft"))).toBe("\x1b[D")
  })

  it("special keys", () => {
    expect(keyboardEventToSequence(key("Enter"))).toBe("\r")
    expect(keyboardEventToSequence(key("Escape"))).toBe("\x1b")
    expect(keyboardEventToSequence(key("Tab"))).toBe("\t")
    expect(keyboardEventToSequence(key("Tab", { shiftKey: true }))).toBe("\x1b[Z")
    expect(keyboardEventToSequence(key("Backspace"))).toBe("\x7f")
    expect(keyboardEventToSequence(key("Delete"))).toBe("\x1b[3~")
    expect(keyboardEventToSequence(key(" "))).toBe(" ")
  })

  it("navigation keys", () => {
    expect(keyboardEventToSequence(key("Home"))).toBe("\x1b[H")
    expect(keyboardEventToSequence(key("End"))).toBe("\x1b[F")
    expect(keyboardEventToSequence(key("PageUp"))).toBe("\x1b[5~")
    expect(keyboardEventToSequence(key("PageDown"))).toBe("\x1b[6~")
    expect(keyboardEventToSequence(key("Insert"))).toBe("\x1b[2~")
  })

  it("function keys", () => {
    expect(keyboardEventToSequence(key("F1"))).toBe("\x1bOP")
    expect(keyboardEventToSequence(key("F2"))).toBe("\x1bOQ")
    expect(keyboardEventToSequence(key("F3"))).toBe("\x1bOR")
    expect(keyboardEventToSequence(key("F4"))).toBe("\x1bOS")
    expect(keyboardEventToSequence(key("F5"))).toBe("\x1b[15~")
    expect(keyboardEventToSequence(key("F12"))).toBe("\x1b[24~")
  })

  it("Ctrl+letter produces control codes", () => {
    expect(keyboardEventToSequence(key("a", { ctrlKey: true }))).toBe("\x01")
    expect(keyboardEventToSequence(key("c", { ctrlKey: true }))).toBe("\x03")
    expect(keyboardEventToSequence(key("z", { ctrlKey: true }))).toBe("\x1a")
  })

  it("Ctrl+brackets", () => {
    expect(keyboardEventToSequence(key("[", { ctrlKey: true }))).toBe("\x1b")
    expect(keyboardEventToSequence(key("]", { ctrlKey: true }))).toBe("\x1d")
    expect(keyboardEventToSequence(key("\\", { ctrlKey: true }))).toBe("\x1c")
  })

  it("Alt+key adds ESC prefix", () => {
    expect(keyboardEventToSequence(key("b", { altKey: true }))).toBe("\x1bb")
    expect(keyboardEventToSequence(key("f", { altKey: true }))).toBe("\x1bf")
  })

  it("printable characters pass through", () => {
    expect(keyboardEventToSequence(key("a"))).toBe("a")
    expect(keyboardEventToSequence(key("Z"))).toBe("Z")
    expect(keyboardEventToSequence(key("1"))).toBe("1")
    expect(keyboardEventToSequence(key("!"))).toBe("!")
  })

  it("modifier-only keys return null", () => {
    expect(keyboardEventToSequence(key("Shift"))).toBeNull()
    expect(keyboardEventToSequence(key("Control"))).toBeNull()
    expect(keyboardEventToSequence(key("Alt"))).toBeNull()
    expect(keyboardEventToSequence(key("Meta"))).toBeNull()
    expect(keyboardEventToSequence(key("CapsLock"))).toBeNull()
    expect(keyboardEventToSequence(key("NumLock"))).toBeNull()
  })
})
