/**
 * Tests for @silvery/color — pure color math utilities.
 */

import { describe, expect, it } from "vitest"
import {
  hexToRgb,
  rgbToHex,
  blend,
  brighten,
  darken,
  contrastFg,
  rgbToHsl,
  hslToHex,
  hexToHsl,
  desaturate,
  complement,
  checkContrast,
  ensureContrast,
} from "@silvery/color"
import type { HSL, ContrastResult } from "@silvery/color"

// ── hexToRgb ────────────────────────────────────────────────────────

describe("hexToRgb", () => {
  it("parses #rrggbb", () => {
    expect(hexToRgb("#FF0000")).toEqual([255, 0, 0])
    expect(hexToRgb("#00FF00")).toEqual([0, 255, 0])
    expect(hexToRgb("#0000FF")).toEqual([0, 0, 255])
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255])
    expect(hexToRgb("#000000")).toEqual([0, 0, 0])
  })

  it("parses #rgb shorthand", () => {
    expect(hexToRgb("#F00")).toEqual([255, 0, 0])
    expect(hexToRgb("#0F0")).toEqual([0, 255, 0])
    expect(hexToRgb("#00F")).toEqual([0, 0, 255])
    expect(hexToRgb("#FFF")).toEqual([255, 255, 255])
    expect(hexToRgb("#000")).toEqual([0, 0, 0])
  })

  it("parses lowercase hex", () => {
    expect(hexToRgb("#ff8800")).toEqual([255, 136, 0])
    expect(hexToRgb("#abc")).toEqual([170, 187, 204])
  })

  it("returns null for invalid input", () => {
    expect(hexToRgb("red")).toBeNull()
    expect(hexToRgb("")).toBeNull()
    expect(hexToRgb("#GG0000")).toEqual([NaN, 0, 0]) // parseInt quirk
    expect(hexToRgb("#12345")).toBeNull() // wrong length
  })
})

// ── rgbToHex ────────────────────────────────────────────────────────

describe("rgbToHex", () => {
  it("converts RGB to uppercase hex", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#FF0000")
    expect(rgbToHex(0, 255, 0)).toBe("#00FF00")
    expect(rgbToHex(0, 0, 255)).toBe("#0000FF")
    expect(rgbToHex(255, 255, 255)).toBe("#FFFFFF")
    expect(rgbToHex(0, 0, 0)).toBe("#000000")
  })

  it("clamps out-of-range values", () => {
    expect(rgbToHex(300, -10, 128)).toBe("#FF0080")
  })

  it("rounds fractional values", () => {
    expect(rgbToHex(127.6, 0.4, 255)).toBe("#8000FF")
  })
})

// ── blend ───────────────────────────────────────────────────────────

describe("blend", () => {
  it("t=0 returns first color", () => {
    expect(blend("#FF0000", "#0000FF", 0)).toBe("#FF0000")
  })

  it("t=1 returns second color", () => {
    expect(blend("#FF0000", "#0000FF", 1)).toBe("#0000FF")
  })

  it("t=0.5 returns midpoint", () => {
    expect(blend("#000000", "#FFFFFF", 0.5)).toBe("#808080")
  })

  it("returns first color unchanged for non-hex input", () => {
    expect(blend("red", "#0000FF", 0.5)).toBe("red")
    expect(blend("#FF0000", "blue", 0.5)).toBe("#FF0000")
  })
})

// ── brighten / darken ───────────────────────────────────────────────

describe("brighten", () => {
  it("moves color toward white", () => {
    const result = brighten("#000000", 0.5)
    expect(result).toBe(blend("#000000", "#FFFFFF", 0.5))
  })

  it("returns non-hex unchanged", () => {
    expect(brighten("red", 0.5)).toBe("red")
  })
})

describe("darken", () => {
  it("moves color toward black", () => {
    const result = darken("#FFFFFF", 0.5)
    expect(result).toBe(blend("#FFFFFF", "#000000", 0.5))
  })

  it("returns non-hex unchanged", () => {
    expect(darken("red", 0.5)).toBe("red")
  })
})

// ── contrastFg ──────────────────────────────────────────────────────

describe("contrastFg", () => {
  it("returns black for light backgrounds", () => {
    expect(contrastFg("#FFFFFF")).toBe("#000000")
    expect(contrastFg("#FFFF00")).toBe("#000000")
  })

  it("returns white for dark backgrounds", () => {
    expect(contrastFg("#000000")).toBe("#FFFFFF")
    expect(contrastFg("#00008B")).toBe("#FFFFFF")
  })

  it("returns white for non-hex input", () => {
    expect(contrastFg("red")).toBe("#FFFFFF")
  })
})

// ── HSL conversions ─────────────────────────────────────────────────

describe("rgbToHsl", () => {
  it("converts pure red", () => {
    const [h, s, l] = rgbToHsl(255, 0, 0)
    expect(h).toBeCloseTo(0)
    expect(s).toBeCloseTo(1)
    expect(l).toBeCloseTo(0.5)
  })

  it("converts pure white (achromatic)", () => {
    const [h, s, l] = rgbToHsl(255, 255, 255)
    expect(h).toBe(0)
    expect(s).toBe(0)
    expect(l).toBeCloseTo(1)
  })

  it("converts pure black (achromatic)", () => {
    const [h, s, l] = rgbToHsl(0, 0, 0)
    expect(h).toBe(0)
    expect(s).toBe(0)
    expect(l).toBeCloseTo(0)
  })
})

describe("hslToHex", () => {
  it("converts red (0, 1, 0.5)", () => {
    expect(hslToHex(0, 1, 0.5)).toBe("#FF0000")
  })

  it("converts green (120, 1, 0.5)", () => {
    expect(hslToHex(120, 1, 0.5)).toBe("#00FF00")
  })

  it("converts blue (240, 1, 0.5)", () => {
    expect(hslToHex(240, 1, 0.5)).toBe("#0000FF")
  })

  it("handles negative hue via wrapping", () => {
    expect(hslToHex(-120, 1, 0.5)).toBe("#0000FF")
  })
})

describe("hexToHsl", () => {
  it("roundtrips through hexToRgb -> rgbToHsl", () => {
    const hsl = hexToHsl("#FF0000")
    expect(hsl).not.toBeNull()
    expect(hsl![0]).toBeCloseTo(0) // hue
    expect(hsl![1]).toBeCloseTo(1) // saturation
    expect(hsl![2]).toBeCloseTo(0.5) // lightness
  })

  it("returns null for non-hex", () => {
    expect(hexToHsl("red")).toBeNull()
  })
})

// ── desaturate / complement ─────────────────────────────────────────

describe("desaturate", () => {
  it("reduces saturation", () => {
    const original = hexToHsl("#FF0000")!
    const result = desaturate("#FF0000", 0.5)
    const desaturated = hexToHsl(result)!
    expect(desaturated[1]).toBeLessThan(original[1])
  })

  it("returns non-hex unchanged", () => {
    expect(desaturate("red", 0.5)).toBe("red")
  })
})

describe("complement", () => {
  it("rotates hue by 180 degrees", () => {
    const original = hexToHsl("#FF0000")!
    const result = complement("#FF0000")
    const comp = hexToHsl(result)!
    // Red (0) -> Cyan (180)
    expect(comp[0]).toBeCloseTo(180, 0)
  })

  it("returns non-hex unchanged", () => {
    expect(complement("red")).toBe("red")
  })
})

// ── checkContrast ───────────────────────────────────────────────────

describe("checkContrast", () => {
  it("maximum contrast: white on black", () => {
    const result = checkContrast("#FFFFFF", "#000000")
    expect(result).not.toBeNull()
    expect(result!.ratio).toBe(21)
    expect(result!.aa).toBe(true)
    expect(result!.aaa).toBe(true)
  })

  it("minimum contrast: same color", () => {
    const result = checkContrast("#808080", "#808080")
    expect(result).not.toBeNull()
    expect(result!.ratio).toBe(1)
    expect(result!.aa).toBe(false)
    expect(result!.aaa).toBe(false)
  })

  it("returns null for invalid colors", () => {
    expect(checkContrast("red", "#000000")).toBeNull()
    expect(checkContrast("#FFFFFF", "black")).toBeNull()
  })

  it("type: ContrastResult has expected shape", () => {
    const result: ContrastResult | null = checkContrast("#FFF", "#000")
    expect(result).toHaveProperty("ratio")
    expect(result).toHaveProperty("aa")
    expect(result).toHaveProperty("aaa")
  })
})

// ── ensureContrast ──────────────────────────────────────────────────

describe("ensureContrast", () => {
  it("returns color unchanged when already meeting target", () => {
    expect(ensureContrast("#000000", "#FFFFFF", 4.5)).toBe("#000000")
  })

  it("adjusts low-contrast color on light bg", () => {
    const adjusted = ensureContrast("#FFAB91", "#FFFFFF", 4.5)
    const result = checkContrast(adjusted, "#FFFFFF")
    expect(result).not.toBeNull()
    expect(result!.ratio).toBeGreaterThanOrEqual(4.5)
  })

  it("adjusts low-contrast color on dark bg", () => {
    const adjusted = ensureContrast("#2E3440", "#1A1A2E", 4.5)
    const result = checkContrast(adjusted, "#1A1A2E")
    expect(result).not.toBeNull()
    expect(result!.ratio).toBeGreaterThanOrEqual(4.5)
  })

  it("returns non-hex color unchanged", () => {
    expect(ensureContrast("red", "#FFFFFF", 4.5)).toBe("red")
  })

  it("type: HSL is a tuple", () => {
    const hsl: HSL = [180, 0.5, 0.5]
    expect(hsl).toHaveLength(3)
  })
})
