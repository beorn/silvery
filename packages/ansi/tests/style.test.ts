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

  describe("multiple arguments (chalk compat)", () => {
    it("joins multiple args with spaces", () => {
      const s = createStyle({ level: "basic" })
      expect(s.red("hello", "there")).toBe(`${ESC}31mhello there${ESC}39m`)
    })

    it("joins multiple args without styles", () => {
      const s = createStyle({ level: "basic" })
      expect(s("hello", "there")).toBe("hello there")
    })

    it("joins multiple args with no color", () => {
      const s = createStyle({ level: null })
      expect(s.bold("a", "b", "c")).toBe("a b c")
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

  // Primer-style aliases (theme-system-v2 token rename) — new names resolve to
  // existing Theme keys so apps can migrate gradually.
  describe("Primer-style aliases", () => {
    const legacyTheme = {
      muted: "#8b8da2",
      mutedbg: "#2a2a40",
      surfacebg: "#1e1e2e",
      popoverbg: "#262637",
      inversebg: "#c0c0c0",
      selectionbg: "#6272a4",
      cursorbg: "#f1fa8c",
      cursor: "#282a36",
      selection: "#f8f8f2",
      inverse: "#1a1a1a",
      surface: "#f8f8f2",
      popover: "#f8f8f2",
      primaryfg: "#000000",
      disabledfg: "#4a4a5f",
      focusborder: "#bd93f9",
      inputborder: "#44475a",
    }
    it("$fg-muted → muted", () => {
      expect(resolveThemeColor("$fg-muted", legacyTheme)).toBe("#8b8da2")
    })
    it("$bg-muted → mutedbg", () => {
      expect(resolveThemeColor("$bg-muted", legacyTheme)).toBe("#2a2a40")
    })
    it("$bg-surface → surfacebg", () => {
      expect(resolveThemeColor("$bg-surface", legacyTheme)).toBe("#1e1e2e")
    })
    it("$bg-popover → popoverbg", () => {
      expect(resolveThemeColor("$bg-popover", legacyTheme)).toBe("#262637")
    })
    it("$bg-inverse → inversebg", () => {
      expect(resolveThemeColor("$bg-inverse", legacyTheme)).toBe("#c0c0c0")
    })
    it("$bg-selected → selectionbg", () => {
      expect(resolveThemeColor("$bg-selected", legacyTheme)).toBe("#6272a4")
    })
    it("$bg-cursor → cursorbg", () => {
      expect(resolveThemeColor("$bg-cursor", legacyTheme)).toBe("#f1fa8c")
    })
    it("$fg-cursor → cursor", () => {
      expect(resolveThemeColor("$fg-cursor", legacyTheme)).toBe("#282a36")
    })
    it("$fg-selected → selection", () => {
      expect(resolveThemeColor("$fg-selected", legacyTheme)).toBe("#f8f8f2")
    })
    it("$fg-disabled → disabledfg", () => {
      expect(resolveThemeColor("$fg-disabled", legacyTheme)).toBe("#4a4a5f")
    })
    it("$border-focus → focusborder", () => {
      expect(resolveThemeColor("$border-focus", legacyTheme)).toBe("#bd93f9")
    })
    it("$border-input → inputborder", () => {
      expect(resolveThemeColor("$border-input", legacyTheme)).toBe("#44475a")
    })
    it("$fg-on-primary → primaryfg", () => {
      expect(resolveThemeColor("$fg-on-primary", legacyTheme)).toBe("#000000")
    })
    it("legacy names still resolve (backwards compat)", () => {
      expect(resolveThemeColor("$muted", legacyTheme)).toBe("#8b8da2")
      expect(resolveThemeColor("$focusborder", legacyTheme)).toBe("#bd93f9")
      expect(resolveThemeColor("$disabledfg", legacyTheme)).toBe("#4a4a5f")
    })
  })
})

describe("global style", () => {
  it("is a Style instance", () => {
    expect(typeof style).toBe("function")
    expect("bold" in style).toBe(true)
    expect("red" in style).toBe(true)
  })
})
