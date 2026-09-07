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
})

describe("resolveThemeColor", () => {
  it("resolves a canonical token from theme", () => {
    expect(resolveThemeColor("$fg-accent", { "fg-accent": "#ff0000" })).toBe("#ff0000")
  })

  it("passes through non-$ strings", () => {
    expect(resolveThemeColor("#ff0000", {})).toBe("#ff0000")
  })

  it("preserves optional custom lookups, including prototype-named tokens", () => {
    // Retirement membership is own-entry-only; an inherited Object method
    // must neither become a cure nor hide the app's custom string value.
    for (const token of ["unknown", "constructor", "toString", "hasOwnProperty"]) {
      expect(resolveThemeColor(`$${token}`, {})).toBeUndefined()
      expect(resolveThemeColor(`$${token}`, { [token]: "#aabbcc" })).toBe("#aabbcc")
    }
  })

  it("resolves palette colors", () => {
    expect(resolveThemeColor("$color0", { palette: ["#000000"] })).toBe("#000000")
  })

  it("rejects legacy spellings with their canonical cure", () => {
    expect(() => resolveThemeColor("$primary", { primary: "#ff0000" })).toThrow(
      'Legacy theme token "$primary" is retired; use "$fg-accent" for text or "$bg-accent" for fills.',
    )
    expect(() => resolveThemeColor("$surface-bg", { surfacebg: "#1e1e2e" })).toThrow(
      'Legacy theme token "$surface-bg" is retired; use "$bg-surface-raised".',
    )
    expect(() => resolveThemeColor("$warning-fg", { warningfg: "#ffffff" })).toThrow(
      'Legacy theme token "$warning-fg" is retired; use "$fg-warning" for warning-colored text or "$fg-on-warning" for text on a warning background.',
    )
    expect(() => resolveThemeColor("$accent-fg", { accentfg: "#000000" })).toThrow(
      'Legacy theme token "$accent-fg" is retired; use "$fg-accent" for accent-colored text or "$fg-on-accent" for text on an accent background.',
    )
  })

  it("direct kebab lookup for state-variant tokens", () => {
    // New-style flat kebab keys — resolved via direct lookup without stripping
    const theme = { "fg-accent-hover": "#aabbcc", "bg-selected-hover": "#112233" }
    expect(resolveThemeColor("$fg-accent-hover", theme)).toBe("#aabbcc")
    expect(resolveThemeColor("$bg-selected-hover", theme)).toBe("#112233")
  })

  // Sterling flat tokens resolve via direct lookup — every shipped default
  // Theme carries them as first-class fields (see `@silvery/theme/schemes`).
  // The previous `LEGACY_ALIASES` translation layer (e.g. `fgmuted` → `muted`,
  // `bgsurface` → `surfacebg`) was deleted in 0.18.1 as redundant. The
  // single-hex `selection` / `selectionbg` / `inverse` / `inversebg` / `link`
  // legacy aliases were dropped from runtime emit in 0.21.0
  // (sterling-purge-legacy-tokens) — consumers read Sterling flat tokens
  // (`bg-selected`, `fg-on-selected`, inverse-family tokens, `fg-link`).
  describe("Sterling flat tokens (direct lookup)", () => {
    const sterlingTheme = {
      // Canonical flat tokens are the direct resolver surface.
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
      "bg-inverse-hover": "#e2e2de",
      "fg-on-inverse-muted": "#686866",
      "fg-link": "#8be9fd",
      "fg-disabled": "#666666",
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
    it("$bg-inverse-hover resolves directly", () => {
      expect(resolveThemeColor("$bg-inverse-hover", sterlingTheme)).toBe("#e2e2de")
    })
    it("$fg-on-inverse-muted resolves directly", () => {
      expect(resolveThemeColor("$fg-on-inverse-muted", sterlingTheme)).toBe("#686866")
    })
    it("$fg-link resolves directly (Sterling-owned, no legacy root)", () => {
      expect(resolveThemeColor("$fg-link", sterlingTheme)).toBe("#8be9fd")
    })
    it("legacy names reject rather than following a fallback", () => {
      expect(() => resolveThemeColor("$muted", sterlingTheme)).toThrow('use "$fg-muted"')
      expect(() => resolveThemeColor("$focusborder", sterlingTheme)).toThrow('use "$border-focus"')
    })
    it("retired aliases reject loudly", () => {
      expect(() => resolveThemeColor("$bg-surface", sterlingTheme)).toThrow(
        'use "$bg-surface-default"',
      )
      expect(() => resolveThemeColor("$bg-popover", sterlingTheme)).toThrow(
        'use "$bg-surface-overlay"',
      )
      expect(() => resolveThemeColor("$fg-selected", sterlingTheme)).toThrow(
        'use "$fg-on-selected"',
      )
      expect(resolveThemeColor("$fg-disabled", sterlingTheme)).toBe(sterlingTheme["fg-disabled"])
      expect(() => resolveThemeColor("$disabledfg", sterlingTheme)).toThrow('use "$fg-disabled"')
      expect(() => resolveThemeColor("$border-input", sterlingTheme)).toThrow(
        'use "$border-default"',
      )
      expect(() => resolveThemeColor("$fg-on-primary", sterlingTheme)).toThrow(
        'use "$fg-on-accent"',
      )
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
