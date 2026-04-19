/**
 * Tests for `pickColorLevel` — deep hex-leaf quantization across Theme
 * (and any hex-bearing) object trees.
 *
 * Structural rule: any string leaf matching `#rgb` / `#rrggbb` is a color
 * value and gets quantized via `quantizeHex`. All other leaves pass through.
 */

import { describe, expect, it } from "vitest"
import { ANSI16_SLOT_HEX, pickColorLevel, quantizeHex } from "../src/color-maps"

const HEX_RE = /^#[0-9a-f]{6}$/

// Miniature theme-shaped fixture covering the shapes that show up in both
// the legacy ANSI Theme and the Sterling Theme: flat hex tokens, nested
// role objects, palette arrays, and non-color metadata (name, numbers).
function makeFixtureTheme() {
  return {
    name: "Nord",
    dark: true,
    bg: "#2e3440",
    fg: "#eceff4",
    primary: "#88c0d0",
    muted: "#4c566a",
    palette: ["#bf616a", "#a3be8c", "#ebcb8b", "#b48ead"],
    roles: {
      accent: {
        base: "#5e81ac",
        hover: "#81a1c1",
      },
      status: {
        success: "#a3be8c",
        error: "#bf616a",
      },
    },
    // Non-hex strings must pass through untouched (tokens, names, etc.).
    brand: "$primary",
    ratio: 0.5,
    count: 7,
  }
}

describe("pickColorLevel", () => {
  it("truecolor is identity (returns the same reference)", () => {
    const theme = makeFixtureTheme()
    const out = pickColorLevel(theme, "truecolor")
    expect(out).toBe(theme)
  })

  it("walks every hex leaf (flat + nested + palette array)", () => {
    const theme = makeFixtureTheme()
    const out = pickColorLevel(theme, "ansi16") as typeof theme

    // Flat hex tokens quantized
    expect(out.bg).toBe(quantizeHex("#2e3440", "ansi16"))
    expect(out.fg).toBe(quantizeHex("#eceff4", "ansi16"))
    expect(out.primary).toBe(quantizeHex("#88c0d0", "ansi16"))
    expect(out.muted).toBe(quantizeHex("#4c566a", "ansi16"))

    // Palette array quantized
    expect(out.palette).toEqual(theme.palette.map((h) => quantizeHex(h, "ansi16")))

    // Nested roles quantized
    expect(out.roles.accent.base).toBe(quantizeHex("#5e81ac", "ansi16"))
    expect(out.roles.accent.hover).toBe(quantizeHex("#81a1c1", "ansi16"))
    expect(out.roles.status.success).toBe(quantizeHex("#a3be8c", "ansi16"))
    expect(out.roles.status.error).toBe(quantizeHex("#bf616a", "ansi16"))

    // Every hex leaf is a canonical ANSI16 slot hex
    const slots = new Set(Object.values(ANSI16_SLOT_HEX).map((h) => h.toLowerCase()))
    const allHexLeaves = [
      out.bg,
      out.fg,
      out.primary,
      out.muted,
      ...out.palette,
      out.roles.accent.base,
      out.roles.accent.hover,
      out.roles.status.success,
      out.roles.status.error,
    ]
    for (const leaf of allHexLeaves) {
      expect(leaf.toLowerCase()).toMatch(HEX_RE)
      expect(slots.has(leaf.toLowerCase())).toBe(true)
    }
  })

  it("preserves non-hex values (name, booleans, numbers, $tokens)", () => {
    const theme = makeFixtureTheme()
    const out = pickColorLevel(theme, "ansi16") as typeof theme

    expect(out.name).toBe("Nord")
    expect(out.dark).toBe(true)
    expect(out.ratio).toBe(0.5)
    expect(out.count).toBe(7)
    // $primary is a theme-token reference, not a color literal — must not
    // be mangled into a hex.
    expect(out.brand).toBe("$primary")
  })

  it("is idempotent per tier", () => {
    const theme = makeFixtureTheme()
    const once = pickColorLevel(theme, "ansi16") as typeof theme
    const twice = pickColorLevel(once, "ansi16") as typeof theme

    expect(twice.bg).toBe(once.bg)
    expect(twice.primary).toBe(once.primary)
    expect(twice.palette).toEqual(once.palette)
    expect(twice.roles.accent.base).toBe(once.roles.accent.base)
  })

  it("does not mutate the input", () => {
    const theme = makeFixtureTheme()
    const snapshot = JSON.stringify(theme)
    pickColorLevel(theme, "ansi16")
    pickColorLevel(theme, "mono")
    pickColorLevel(theme, "256")
    expect(JSON.stringify(theme)).toBe(snapshot)
  })

  it("mono collapses every hex leaf to black or white", () => {
    const theme = makeFixtureTheme()
    const out = pickColorLevel(theme, "mono") as typeof theme
    const mono = new Set(["#000000", "#ffffff"])

    const leaves = [
      out.bg,
      out.fg,
      out.primary,
      out.muted,
      ...out.palette,
      out.roles.accent.base,
      out.roles.accent.hover,
      out.roles.status.success,
      out.roles.status.error,
    ]
    for (const leaf of leaves) {
      expect(mono.has(leaf.toLowerCase())).toBe(true)
    }
  })

  it("256 quantizes every hex leaf to a xterm-256 slot hex", () => {
    const theme = makeFixtureTheme()
    const out = pickColorLevel(theme, "256") as typeof theme

    // Each channel must be a cube level or the channels must be equal
    // (grayscale ramp).
    const cubeLevels = new Set([0, 95, 135, 175, 215, 255])
    const leaves = [
      out.bg,
      out.fg,
      out.primary,
      out.muted,
      ...out.palette,
      out.roles.accent.base,
      out.roles.accent.hover,
    ]
    for (const leaf of leaves) {
      expect(leaf).toMatch(HEX_RE)
      const r = parseInt(leaf.slice(1, 3), 16)
      const g = parseInt(leaf.slice(3, 5), 16)
      const b = parseInt(leaf.slice(5, 7), 16)
      const isCube = cubeLevels.has(r) && cubeLevels.has(g) && cubeLevels.has(b)
      const isGray = r === g && g === b
      const isAnsi16 = new Set(Object.values(ANSI16_SLOT_HEX).map((h) => h.toLowerCase())).has(
        leaf.toLowerCase(),
      )
      expect(isCube || isGray || isAnsi16).toBe(true)
    }
  })

  it("handles null / undefined / primitives gracefully", () => {
    expect(pickColorLevel(null, "ansi16")).toBe(null)
    expect(pickColorLevel(undefined, "ansi16")).toBe(undefined)
    expect(pickColorLevel(42, "ansi16")).toBe(42)
    expect(pickColorLevel("not a hex", "ansi16")).toBe("not a hex")
    expect(pickColorLevel(true, "ansi16")).toBe(true)
  })

  it("handles a lone hex string (returns the quantized hex)", () => {
    expect(pickColorLevel("#88c0d0", "ansi16")).toBe(quantizeHex("#88c0d0", "ansi16"))
  })

  it("handles an array of mixed values", () => {
    const arr = ["#88c0d0", "not-a-hex", 42, { nested: "#bf616a" }]
    const out = pickColorLevel(arr, "ansi16")
    expect(out[0]).toBe(quantizeHex("#88c0d0", "ansi16"))
    expect(out[1]).toBe("not-a-hex")
    expect(out[2]).toBe(42)
    expect((out[3] as { nested: string }).nested).toBe(quantizeHex("#bf616a", "ansi16"))
  })
})
