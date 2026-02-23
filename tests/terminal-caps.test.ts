import { describe, test, expect, afterEach } from "vitest"
import { detectTerminalCaps } from "../src/terminal-caps.ts"

describe("detectTerminalCaps", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("detects kitty terminal", () => {
    process.env.TERM = "xterm-kitty"
    process.env.TERM_PROGRAM = ""
    const caps = detectTerminalCaps()
    expect(caps.kittyKeyboard).toBe(true)
    expect(caps.kittyGraphics).toBe(true)
    expect(caps.notifications).toBe(true)
  })

  test("detects iTerm2", () => {
    process.env.TERM_PROGRAM = "iTerm.app"
    const caps = detectTerminalCaps()
    expect(caps.notifications).toBe(true)
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
  })

  test("detects Ghostty", () => {
    process.env.TERM_PROGRAM = "ghostty"
    const caps = detectTerminalCaps()
    expect(caps.kittyKeyboard).toBe(true)
    expect(caps.kittyGraphics).toBe(true)
    expect(caps.osc52).toBe(true)
  })

  test("respects NO_COLOR", () => {
    process.env.NO_COLOR = "1"
    const caps = detectTerminalCaps()
    expect(caps.colorLevel).toBe("none")
  })

  test("detects truecolor from COLORTERM", () => {
    delete process.env.NO_COLOR
    process.env.COLORTERM = "truecolor"
    const caps = detectTerminalCaps()
    expect(caps.colorLevel).toBe("truecolor")
  })
})
