import { describe, expect, it } from "vitest"
import { createStyle, createPlainStyle, style, resolveThemeColor } from "../src/index.ts"

const ESC = "\x1b["

describe("createStyle (from @silvery/ansi)", () => {
  describe("basic modifiers", () => {
    it("applies bold", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.bold("hello")).toBe(`${ESC}1mhello${ESC}22m`)
    })

    it("applies dim", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.dim("text")).toBe(`${ESC}2mtext${ESC}22m`)
    })

    it("applies italic", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.italic("text")).toBe(`${ESC}3mtext${ESC}23m`)
    })

    it("applies underline", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.underline("text")).toBe(`${ESC}4mtext${ESC}24m`)
    })

    it("applies strikethrough", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.strikethrough("text")).toBe(`${ESC}9mtext${ESC}29m`)
    })
  })

  describe("foreground colors", () => {
    it("applies red", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.red("error")).toBe(`${ESC}31merror${ESC}39m`)
    })

    it("applies cyan", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.cyan("info")).toBe(`${ESC}36minfo${ESC}39m`)
    })

    it("applies bright colors", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.redBright("hot")).toBe(`${ESC}91mhot${ESC}39m`)
    })

    it("applies gray/grey alias", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.gray("muted")).toBe(`${ESC}90mmuted${ESC}39m`)
      expect(s.grey("muted")).toBe(`${ESC}90mmuted${ESC}39m`)
    })
  })

  describe("chaining", () => {
    it("chains bold + red", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.bold.red("error")).toBe(`${ESC}1;31merror${ESC}22;39m`)
    })

    it("chains modifier + fg + bg", () => {
      const s = createStyle({ level: "ansi16" })
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
      const s = createStyle({ level: "ansi16" })
      expect(s.primary("deploy")).toBe(`${ESC}33mdeploy${ESC}39m`)
      expect(s.error("fail")).toBe(`${ESC}31mfail${ESC}39m`)
    })

    it("muted uses dim modifier as fallback", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.muted("note")).toBe(`${ESC}2mnote${ESC}22m`)
    })
  })

  describe("multiple arguments (chalk compat)", () => {
    it("joins multiple args with spaces", () => {
      const s = createStyle({ level: "ansi16" })
      expect(s.red("hello", "there")).toBe(`${ESC}31mhello there${ESC}39m`)
    })

    it("joins multiple args without styles", () => {
      const s = createStyle({ level: "ansi16" })
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
      expect(createStyle({ level: "ansi16" }).level).toBe(1)
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
    const s = createPlainStyle("ansi16")
    expect(s.red("error")).toBe(`${ESC}31merror${ESC}39m`)
  })

  it("theme tokens use fallback defaults", () => {
    const s = createPlainStyle("ansi16")
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

  it("strips hyphens for lookup (legacy no-hyphen key)", () => {
    expect(resolveThemeColor("$surface-bg", { surfacebg: "#1e1e2e" })).toBe("#1e1e2e")
  })

  it("direct kebab lookup for state-variant tokens", () => {
    // New-style flat kebab keys — resolved via direct lookup without stripping
    const theme = { "primary-hover": "#aabbcc", "bg-selected-hover": "#112233" }
    expect(resolveThemeColor("$primary-hover", theme)).toBe("#aabbcc")
    expect(resolveThemeColor("$bg-selected-hover", theme)).toBe("#112233")
  })

  // Sterling flat tokens resolve via direct lookup — every shipped default
  // Theme carries them as first-class fields (see `@silvery/theme/schemes`).
  // The previous `LEGACY_ALIASES` translation layer (e.g. `fgmuted` → `muted`,
  // `bgsurface` → `surfacebg`) was deleted in 0.18.1 as redundant. The
  // single-hex `selection` / `selectionbg` / `inverse` / `inversebg` / `link`
  // legacy aliases were dropped from runtime emit in 0.21.0
  // (sterling-purge-legacy-tokens) — consumers read Sterling flat tokens
  // (`bg-selected`, `fg-on-selected`, `bg-inverse`, `fg-on-inverse`, `fg-link`).
  describe("Sterling flat tokens (direct lookup)", () => {
    const sterlingTheme = {
      // Legacy roots still emitted by deriveTheme at runtime
      muted: "#8b8da2",
      surface: "#f8f8f2",
      popover: "#f8f8f2",
      cursor: "#282a36",
      focusborder: "#bd93f9",
      inputborder: "#44475a",
      // Sterling flat tokens — baked in by inlineSterlingTokens at theme
      // construction
      "fg-muted": "#8b8da2",
      "bg-muted": "#2a2a40",
      "bg-surface-default": "#1e1e2e",
      "bg-surface-subtle": "#232336",
      "bg-surface-overlay": "#262637",
      "fg-on-accent": "#000000",
      "fg-on-error": "#ffffff",
      "bg-cursor": "#f1fa8c",
      "fg-cursor": "#282a36",
      "border-focus": "#bd93f9",
      "border-default": "#44475a",
      // Sterling-only roles (no legacy single-hex root) — these replace the
      // dropped `selection` / `inverse` / `link` aliases.
      "bg-selected": "#44475a",
      "fg-on-selected": "#f8f8f2",
      "bg-inverse": "#f8f8f2",
      "fg-on-inverse": "#1a1a1a",
      "fg-link": "#8be9fd",
    }
    it("$fg-muted resolves directly", () => {
      expect(resolveThemeColor("$fg-muted", sterlingTheme)).toBe("#8b8da2")
    })
    it("$bg-muted resolves directly", () => {
      expect(resolveThemeColor("$bg-muted", sterlingTheme)).toBe("#2a2a40")
    })
    it("$bg-surface-default resolves directly", () => {
      expect(resolveThemeColor("$bg-surface-default", sterlingTheme)).toBe("#1e1e2e")
    })
    it("$bg-cursor resolves directly", () => {
      expect(resolveThemeColor("$bg-cursor", sterlingTheme)).toBe("#f1fa8c")
    })
    it("$fg-cursor resolves directly", () => {
      expect(resolveThemeColor("$fg-cursor", sterlingTheme)).toBe("#282a36")
    })
    it("$border-focus resolves directly", () => {
      expect(resolveThemeColor("$border-focus", sterlingTheme)).toBe("#bd93f9")
    })
    it("$fg-on-accent resolves directly", () => {
      expect(resolveThemeColor("$fg-on-accent", sterlingTheme)).toBe("#000000")
    })
    it("$bg-selected resolves directly (Sterling-owned, no legacy root)", () => {
      expect(resolveThemeColor("$bg-selected", sterlingTheme)).toBe("#44475a")
    })
    it("$fg-on-selected resolves directly (Sterling-owned, no legacy root)", () => {
      expect(resolveThemeColor("$fg-on-selected", sterlingTheme)).toBe("#f8f8f2")
    })
    it("$bg-inverse resolves directly (Sterling-owned, no legacy root)", () => {
      expect(resolveThemeColor("$bg-inverse", sterlingTheme)).toBe("#f8f8f2")
    })
    it("$fg-on-inverse resolves directly (Sterling-owned, no legacy root)", () => {
      expect(resolveThemeColor("$fg-on-inverse", sterlingTheme)).toBe("#1a1a1a")
    })
    it("$fg-link resolves directly (Sterling-owned, no legacy root)", () => {
      expect(resolveThemeColor("$fg-link", sterlingTheme)).toBe("#8be9fd")
    })
    it("legacy names still resolve via direct lookup", () => {
      expect(resolveThemeColor("$muted", sterlingTheme)).toBe("#8b8da2")
      expect(resolveThemeColor("$focusborder", sterlingTheme)).toBe("#bd93f9")
    })
    it("legacy-only aliases without Sterling equivalents no longer resolve", () => {
      // Removed in 0.18.1 — callers should switch to canonical Sterling forms.
      expect(resolveThemeColor("$bg-surface", sterlingTheme)).toBeUndefined()
      expect(resolveThemeColor("$bg-popover", sterlingTheme)).toBeUndefined()
      expect(resolveThemeColor("$fg-selected", sterlingTheme)).toBeUndefined()
      expect(resolveThemeColor("$fg-disabled", sterlingTheme)).toBeUndefined()
      expect(resolveThemeColor("$border-input", sterlingTheme)).toBeUndefined()
      expect(resolveThemeColor("$fg-on-primary", sterlingTheme)).toBeUndefined()
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
