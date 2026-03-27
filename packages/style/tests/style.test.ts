import { describe, expect, it } from "vitest"
import { createStyle } from "../src/index.ts"
import type { ThemeLike } from "../src/types.ts"

const ESC = "\x1b["

describe("createStyle", () => {
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

    it("applies green", () => {
      const s = createStyle({ level: "basic" })
      expect(s.green("ok")).toBe(`${ESC}32mok${ESC}39m`)
    })

    it("applies cyan", () => {
      const s = createStyle({ level: "basic" })
      expect(s.cyan("info")).toBe(`${ESC}36minfo${ESC}39m`)
    })

    it("applies bright colors", () => {
      const s = createStyle({ level: "basic" })
      expect(s.redBright("hot")).toBe(`${ESC}91mhot${ESC}39m`)
      expect(s.yellowBright("warm")).toBe(`${ESC}93mwarm${ESC}39m`)
    })

    it("applies gray/grey alias", () => {
      const s = createStyle({ level: "basic" })
      expect(s.gray("muted")).toBe(`${ESC}90mmuted${ESC}39m`)
      expect(s.grey("muted")).toBe(`${ESC}90mmuted${ESC}39m`)
    })
  })

  describe("background colors", () => {
    it("applies bgRed", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bgRed("error")).toBe(`${ESC}41merror${ESC}49m`)
    })

    it("applies bgBlueBright", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bgBlueBright("highlight")).toBe(`${ESC}104mhighlight${ESC}49m`)
    })
  })

  describe("chaining", () => {
    it("chains bold + red", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bold.red("error")).toBe(`${ESC}1;31merror${ESC}22;39m`)
    })

    it("chains multiple modifiers", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bold.italic.underline("fancy")).toBe(`${ESC}1;3;4mfancy${ESC}22;23;24m`)
    })

    it("chains modifier + fg + bg", () => {
      const s = createStyle({ level: "basic" })
      expect(s.bold.red.bgWhite("alert")).toBe(`${ESC}1;31;47malert${ESC}22;39;49m`)
    })
  })

  describe("hex colors", () => {
    it("applies hex foreground in truecolor mode", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.hex("#ff0000")("red")).toBe(`${ESC}38;2;255;0;0mred${ESC}39m`)
    })

    it("applies hex background in truecolor mode", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.bgHex("#0000ff")("blue")).toBe(`${ESC}48;2;0;0;255mblue${ESC}49m`)
    })

    it("quantizes hex to 256-color", () => {
      const s = createStyle({ level: "256" })
      const result = s.hex("#ff0000")("red")
      expect(result).toContain("38;5;")
      expect(result).toContain("red")
    })

    it("quantizes hex to ANSI 16", () => {
      const s = createStyle({ level: "basic" })
      const result = s.hex("#ff0000")("red")
      // Should map to ANSI red (31) or bright red (91)
      expect(result).toMatch(/\x1b\[\d+mred/)
    })

    it("handles 3-digit hex", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.hex("#f00")("red")).toBe(`${ESC}38;2;255;0;0mred${ESC}39m`)
    })

    it("chains hex with modifiers", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.bold.hex("#ff0000")("error")).toBe(`${ESC}1;38;2;255;0;0merror${ESC}22;39m`)
    })
  })

  describe("rgb colors", () => {
    it("applies rgb foreground", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.rgb(255, 128, 0)("orange")).toBe(`${ESC}38;2;255;128;0morange${ESC}39m`)
    })

    it("applies rgb background", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.bgRgb(0, 128, 255)("sky")).toBe(`${ESC}48;2;0;128;255msky${ESC}49m`)
    })
  })

  describe("ansi256", () => {
    it("applies 256-color foreground", () => {
      const s = createStyle({ level: "256" })
      expect(s.ansi256(196)("red")).toBe(`${ESC}38;5;196mred${ESC}39m`)
    })

    it("applies 256-color background", () => {
      const s = createStyle({ level: "256" })
      expect(s.bgAnsi256(21)("blue")).toBe(`${ESC}48;5;21mblue${ESC}49m`)
    })
  })

  describe("no color (level: null)", () => {
    it("returns plain text", () => {
      const s = createStyle({ level: null })
      expect(s.bold.red("hello")).toBe("hello")
    })

    it("returns plain text for hex", () => {
      const s = createStyle({ level: null })
      expect(s.hex("#ff0000")("red")).toBe("red")
    })

    it("returns plain text for theme tokens", () => {
      const s = createStyle({ level: null, theme: { primary: "#ff0000" } })
      expect(s.primary("deploy")).toBe("deploy")
    })
  })

  describe("theme tokens", () => {
    const theme: ThemeLike = {
      primary: "#818cf8",
      secondary: "#a78bfa",
      accent: "#f472b6",
      error: "#f87171",
      warning: "#fbbf24",
      success: "#34d399",
      info: "#38bdf8",
      muted: "#6b7280",
      link: "#60a5fa",
      border: "#374151",
      surface: "#e5e7eb",
      palette: [
        "#1f2937",
        "#ef4444",
        "#22c55e",
        "#eab308",
        "#3b82f6",
        "#a855f7",
        "#06b6d4",
        "#d1d5db",
        "#4b5563",
        "#f87171",
        "#4ade80",
        "#facc15",
        "#60a5fa",
        "#c084fc",
        "#22d3ee",
        "#f3f4f6",
      ],
    }

    it("resolves primary to hex color", () => {
      const s = createStyle({ level: "truecolor", theme })
      expect(s.primary("deploy")).toBe(`${ESC}38;2;129;140;248mdeploy${ESC}39m`)
    })

    it("resolves error to hex color", () => {
      const s = createStyle({ level: "truecolor", theme })
      expect(s.error("fail")).toBe(`${ESC}38;2;248;113;113mfail${ESC}39m`)
    })

    it("resolves success to hex color", () => {
      const s = createStyle({ level: "truecolor", theme })
      expect(s.success("done")).toBe(`${ESC}38;2;52;211;153mdone${ESC}39m`)
    })

    it("chains theme token with modifier", () => {
      const s = createStyle({ level: "truecolor", theme })
      expect(s.bold.primary("deploy")).toBe(`${ESC}1;38;2;129;140;248mdeploy${ESC}22;39m`)
    })

    it("link adds underline", () => {
      const s = createStyle({ level: "truecolor", theme })
      const result = s.link("click here")
      expect(result).toContain("38;2;96;165;250") // link color
      expect(result).toContain(";4m") // underline
    })

    it("falls back to ANSI defaults without theme", () => {
      const s = createStyle({ level: "basic" })
      // primary falls back to yellow (33)
      expect(s.primary("deploy")).toBe(`${ESC}33mdeploy${ESC}39m`)
      // error falls back to red (31)
      expect(s.error("fail")).toBe(`${ESC}31mfail${ESC}39m`)
      // success falls back to green (32)
      expect(s.success("done")).toBe(`${ESC}32mdone${ESC}39m`)
    })

    it("muted uses dim modifier as fallback", () => {
      const s = createStyle({ level: "basic" })
      expect(s.muted("note")).toBe(`${ESC}2mnote${ESC}22m`)
    })
  })

  describe("resolve()", () => {
    it("resolves theme tokens", () => {
      const theme: ThemeLike = { primary: "#818cf8" }
      const s = createStyle({ level: "truecolor", theme })
      expect(s.resolve("primary")).toBe("#818cf8")
      expect(s.resolve("$primary")).toBe("#818cf8")
    })

    it("resolves palette colors", () => {
      const theme: ThemeLike = { palette: ["#000000", "#ff0000"] }
      const s = createStyle({ level: "truecolor", theme })
      expect(s.resolve("$color0")).toBe("#000000")
      expect(s.resolve("$color1")).toBe("#ff0000")
    })

    it("resolves hyphenated tokens", () => {
      const theme: ThemeLike = { surfacebg: "#1e1e2e" }
      const s = createStyle({ level: "truecolor", theme })
      expect(s.resolve("$surface-bg")).toBe("#1e1e2e")
    })

    it("returns undefined for unknown tokens", () => {
      const s = createStyle({ level: "truecolor" })
      expect(s.resolve("$unknown")).toBeUndefined()
    })
  })

  describe("template literals", () => {
    it("handles tagged template literals", () => {
      const s = createStyle({ level: "basic" })
      const name = "world"
      expect(s.bold`hello ${name}`).toBe(`${ESC}1mhello world${ESC}22m`)
    })
  })

  describe("immutability", () => {
    it("chains are independent", () => {
      const s = createStyle({ level: "basic" })
      const bold = s.bold
      const red = s.red
      expect(bold("a")).toBe(`${ESC}1ma${ESC}22m`)
      expect(red("b")).toBe(`${ESC}31mb${ESC}39m`)
      // bold chain wasn't affected by red
      expect(bold("c")).toBe(`${ESC}1mc${ESC}22m`)
    })

    it("root style is reusable", () => {
      const s = createStyle({ level: "basic" })
      expect(s.red("a")).toBe(`${ESC}31ma${ESC}39m`)
      expect(s.blue("b")).toBe(`${ESC}34mb${ESC}39m`)
      expect(s.bold("c")).toBe(`${ESC}1mc${ESC}22m`)
    })
  })
})
