import { describe, expect, it } from "vitest"
import { createStyle, createPlainStyle, style, resolveThemeColor } from "../src/index.ts"

const ESC = "\x1b["

describe("createStyle (from @silvery/ansi)", () => {
  describe("basic modifiers", () => {
    it("applies bold", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bold("hello")).toBe(`${ESC}1mhello${ESC}22m`)
    })

    it("applies dim", () => {
      const s = createStyle({ level: "basic" })
      expect(s.dim("text")).toBe(`${ESC}2mtext${ESC}22m`)
    })

    it("applies italic", () => {
      const s = createStyle({ level: "basic" })
      expect(s.italic("text")).toBe(`${ESC}3mtext${ESC}23m`)
    })

    it("applies underline", () => {
      const s = createStyle({ level: "basic" })
      expect(s.underline("text")).toBe(`${ESC}4mtext${ESC}24m`)
    })

    it("applies strikethrough", () => {
      const s = createStyle({ level: "basic" })
      expect(s.strikethrough("text")).toBe(`${ESC}9mtext${ESC}29m`)
    })
  })

  describe("foreground colors", () => {
    it("applies red", () => {
      const s = createStyle({ level: "basic" })
      expect(s.red("error")).toBe(`${ESC}31merror${ESC}39m`)
    })

    it("applies cyan", () => {
      const s = createStyle({ level: "basic" })
      expect(s.cyan("info")).toBe(`${ESC}36minfo${ESC}39m`)
    })

    it("applies bright colors", () => {
      const s = createStyle({ level: "basic" })
      expect(s.redBright("hot")).toBe(`${ESC}91mhot${ESC}39m`)
    })

    it("applies gray/grey alias", () => {
      const s = createStyle({ level: "basic" })
      expect(s.gray("muted")).toBe(`${ESC}90mmuted${ESC}39m`)
      expect(s.grey("muted")).toBe(`${ESC}90mmuted${ESC}39m`)
    })
  })

  describe("chaining", () => {
    it("chains bold + red", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bold.red("error")).toBe(`${ESC}1;31merror${ESC}22;39m`)
    })

    it("chains modifier + fg + bg", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bold.red.bgWhite("alert")).toBe(`${ESC}1;31;47malert${ESC}22;39;49m`)
    })
  })

  describe("hex colors", () => {
    it("applies hex foreground in truecolor", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.hex("#ff0000")("red")).toBe(`${ESC}38;2;255;0;0mred${ESC}39m`)
    })

    it("handles 3-digit hex", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.hex("#f00")("red")).toBe(`${ESC}38;2;255;0;0mred${ESC}39m`)
    })
  })

  describe("theme tokens", () => {
    const theme = {
      primary: "#818cf8",
      error: "#f87171",
      success: "#34d399",
      muted: "#6b7280",
      link: "#60a5fa",
      palette: ["#1f2937", "#ef4444"],
    }

    it("resolves primary to hex", () => {
      const s = createStyle({ level: "truecolor", theme })
      expect(s.primary("deploy")).toBe(`${ESC}38;2;129;140;248mdeploy${ESC}39m`)
    })

    it("falls back to ANSI defaults without theme", () => {
      const s = createStyle({ level: "basic" })
      expect(s.primary("deploy")).toBe(`${ESC}33mdeploy${ESC}39m`)
      expect(s.error("fail")).toBe(`${ESC}31mfail${ESC}39m`)
    })

    it("muted uses dim modifier as fallback", () => {
      const s = createStyle({ level: "basic" })
      expect(s.muted("note")).toBe(`${ESC}2mnote${ESC}22m`)
    })
  })

  describe("no color", () => {
    it("returns plain text", () => {
      const s = createStyle({ level: null })
      expect(s.bold.red("hello")).toBe("hello")
    })
  })

  describe("level property (chalk compat)", () => {
    it("returns numeric level", () => {
      expect(createStyle({ level: null }).level).toBe(0)
      expect(createStyle({ level: "basic" }).level).toBe(1)
      expect(createStyle({ level: "truecolor" }).level).toBe(3)
    })

    it("setting level changes output", () => {
      const s = createStyle({ level: null })
      expect(s.red("x")).toBe("x")
      s.level = 3
      expect(s.red("x")).toBe(`${ESC}31mx${ESC}39m`)
    })
  })
})

describe("createPlainStyle", () => {
  it("creates style without theme", () => {
    const s = createPlainStyle("basic")
    expect(s.red("error")).toBe(`${ESC}31merror${ESC}39m`)
  })

  it("theme tokens use fallback defaults", () => {
    const s = createPlainStyle("basic")
    expect(s.primary("x")).toBe(`${ESC}33mx${ESC}39m`)
  })
})

describe("resolveThemeColor", () => {
  it("resolves $token from theme", () => {
    expect(resolveThemeColor("$primary", { primary: "#ff0000" })).toBe("#ff0000")
  })

  it("passes through non-$ strings", () => {
    expect(resolveThemeColor("#ff0000", {})).toBe("#ff0000")
  })

  it("returns undefined for unknown token", () => {
    expect(resolveThemeColor("$unknown", {})).toBeUndefined()
  })

  it("resolves palette colors", () => {
    expect(resolveThemeColor("$color0", { palette: ["#000000"] })).toBe("#000000")
  })

  it("strips hyphens for lookup", () => {
    expect(resolveThemeColor("$surface-bg", { surfacebg: "#1e1e2e" })).toBe("#1e1e2e")
  })
})

describe("global style", () => {
  it("is a Style instance", () => {
    expect(typeof style).toBe("function")
    expect("bold" in style).toBe(true)
    expect("red" in style).toBe(true)
  })
})
