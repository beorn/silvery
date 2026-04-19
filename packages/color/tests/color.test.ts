/**
 * Tests for @silvery/color — OKLCH-native pure color math utilities.
 */

import { describe, expect, it } from "vitest"
import {
  hexToRgb,
  rgbToHex,
  blend,
  brighten,
  darken,
  saturate,
  contrastFg,
  rgbToHsl,
  hslToHex,
  hexToHsl,
  desaturate,
  complement,
  oklch,
  toHex,
  colorDistance,
  checkContrast,
  ensureContrast,
  hexToOklch,
  oklchToHex,
  lerpOklch,
  lerpHue,
  deltaE,
} from "@silvery/color"
import type { HSL, ContrastResult, OKLCH } from "@silvery/color"

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

// ── OKLCH primitives ────────────────────────────────────────────────

describe("hexToOklch / oklchToHex", () => {
  it("roundtrips black", () => {
    const o = hexToOklch("#000000")!
    expect(o.L).toBeCloseTo(0, 3)
    expect(oklchToHex(o)).toBe("#000000")
  })

  it("roundtrips white", () => {
    const o = hexToOklch("#FFFFFF")!
    expect(o.L).toBeCloseTo(1, 2)
    expect(oklchToHex(o)).toBe("#FFFFFF")
  })

  it("roundtrips saturated hues within 1 sRGB step", () => {
    for (const hex of ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF"]) {
      const o = hexToOklch(hex)!
      const back = oklchToHex(o)
      const a = hexToRgb(hex)!
      const b = hexToRgb(back)!
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(1)
    }
  })

  it("returns null for invalid hex", () => {
    expect(hexToOklch("red")).toBeNull()
    expect(hexToOklch("")).toBeNull()
  })

  it("gamut-maps out-of-sRGB chroma by reducing C", () => {
    // Extreme chroma — gets chroma-reduced to stay in sRGB
    const hex = oklchToHex({ L: 0.7, C: 1.0, H: 30 })
    expect(hex).toMatch(/^#[0-9A-F]{6}$/)
    const rgb = hexToRgb(hex)!
    for (const c of rgb) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
})

describe("oklch / toHex convenience aliases", () => {
  it("oklch parses hex", () => {
    const o = oklch("#FF0000")!
    expect(o.L).toBeGreaterThan(0)
    expect(o.C).toBeGreaterThan(0)
  })
  it("toHex serializes", () => {
    const hex = toHex({ L: 0.5, C: 0.1, H: 180 })
    expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })
  it("oklch returns null for non-hex", () => {
    expect(oklch("red")).toBeNull()
  })
})

describe("lerpHue", () => {
  it("takes the short arc", () => {
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0, 5)
  })
  it("midpoint for 0 → 180 picks one of the two equidistant arcs", () => {
    // 0° and 180° are diametrically opposite — both 90° and 270° are shortest-arc midpoints.
    const h = lerpHue(0, 180, 0.5)
    expect([90, 270]).toContain(Math.round(h))
  })
  it("midpoint 30 → 150 is 90 (unambiguous)", () => {
    expect(lerpHue(30, 150, 0.5)).toBeCloseTo(90, 5)
  })
  it("wraps to [0, 360)", () => {
    expect(lerpHue(10, -30, 0)).toBeCloseTo(10, 5)
    const h = lerpHue(10, 350, 0.5)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
  })
})

describe("lerpOklch", () => {
  it("t=0 returns first", () => {
    const a: OKLCH = { L: 0.5, C: 0.1, H: 180 }
    const b: OKLCH = { L: 0.2, C: 0.2, H: 60 }
    expect(lerpOklch(a, b, 0)).toEqual(a)
  })
  it("t=1 returns second", () => {
    const a: OKLCH = { L: 0.5, C: 0.1, H: 180 }
    const b: OKLCH = { L: 0.2, C: 0.2, H: 60 }
    expect(lerpOklch(a, b, 1)).toEqual(b)
  })
  it("t=0.5 is midpoint in L and C", () => {
    const a: OKLCH = { L: 0.4, C: 0.1, H: 90 }
    const b: OKLCH = { L: 0.8, C: 0.3, H: 90 }
    const mid = lerpOklch(a, b, 0.5)
    expect(mid.L).toBeCloseTo(0.6, 5)
    expect(mid.C).toBeCloseTo(0.2, 5)
    expect(mid.H).toBeCloseTo(90, 5)
  })
})

describe("deltaE", () => {
  it("is zero for identical colors", () => {
    const a: OKLCH = { L: 0.5, C: 0.15, H: 210 }
    expect(deltaE(a, a)).toBeCloseTo(0, 5)
  })
  it("grows with L difference", () => {
    const a: OKLCH = { L: 0.3, C: 0.1, H: 0 }
    const b: OKLCH = { L: 0.7, C: 0.1, H: 0 }
    expect(deltaE(a, b)).toBeGreaterThan(0.3)
  })
})

// ── blend ───────────────────────────────────────────────────────────

describe("blend", () => {
  it("t=0 returns first color (exact)", () => {
    expect(blend("#FF0000", "#0000FF", 0)).toBe("#FF0000")
  })

  it("t=1 returns second color (exact)", () => {
    expect(blend("#FF0000", "#0000FF", 1)).toBe("#0000FF")
  })

  it("t=0.5 black↔white produces a perceptual mid-gray (~#777–#7E, brighter than naive RGB #80)", () => {
    // OKLCH midpoint of black and white is perceptually 50% — which is DARKER in sRGB
    // than naive RGB #80 because L=0.5 in OKLCH corresponds to ~#777 sRGB gray.
    const mid = blend("#000000", "#FFFFFF", 0.5)
    const [r, g, b] = hexToRgb(mid)!
    expect(r).toBe(g)
    expect(g).toBe(b) // neutral gray
    expect(r).toBeGreaterThan(0x60)
    expect(r).toBeLessThan(0x90)
  })

  it("returns first color unchanged for non-hex input", () => {
    expect(blend("red", "#0000FF", 0.5)).toBe("red")
    expect(blend("#FF0000", "blue", 0.5)).toBe("#FF0000")
  })

  it("same color at any t returns that color (within 1 sRGB step)", () => {
    const a = "#4A9EE8"
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const out = blend(a, a, t)
      const orig = hexToRgb(a)!
      const back = hexToRgb(out)!
      for (let i = 0; i < 3; i++) expect(Math.abs(orig[i]! - back[i]!)).toBeLessThanOrEqual(1)
    }
  })
})

// ── brighten / darken / saturate / desaturate ───────────────────────

describe("brighten (OKLCH additive L)", () => {
  it("increases OKLCH L by amount", () => {
    const before = hexToOklch("#333333")!
    const after = hexToOklch(brighten("#333333", 0.2))!
    expect(after.L - before.L).toBeCloseTo(0.2, 1)
  })

  it("clamps L at 1", () => {
    const out = brighten("#FFFFFF", 0.5)
    expect(out).toBe("#FFFFFF")
  })

  it("preserves hue and chroma", () => {
    const before = hexToOklch("#5B8FC8")!
    const after = hexToOklch(brighten("#5B8FC8", 0.1))!
    expect(after.C).toBeCloseTo(before.C, 2)
    // Hue preservation — short-arc distance < 1°.
    const d = (((after.H - before.H) % 360) + 360) % 360
    const shortArc = Math.min(d, 360 - d)
    expect(shortArc).toBeLessThan(1)
  })

  it("returns non-hex unchanged", () => {
    expect(brighten("red", 0.5)).toBe("red")
  })
})

describe("darken (OKLCH additive L)", () => {
  it("decreases OKLCH L by amount", () => {
    const before = hexToOklch("#CCCCCC")!
    const after = hexToOklch(darken("#CCCCCC", 0.2))!
    expect(before.L - after.L).toBeCloseTo(0.2, 1)
  })

  it("clamps L at 0", () => {
    const out = darken("#000000", 0.5)
    expect(out).toBe("#000000")
  })

  it("returns non-hex unchanged", () => {
    expect(darken("red", 0.5)).toBe("red")
  })
})

describe("saturate", () => {
  it("increases OKLCH C additively", () => {
    const before = hexToOklch("#A0A0A0")!
    const after = hexToOklch(saturate("#5B8FC8", 0.05))!
    expect(after.C).toBeGreaterThan(before.C)
  })
  it("returns non-hex unchanged", () => {
    expect(saturate("red", 0.1)).toBe("red")
  })
})

describe("desaturate", () => {
  it("reduces OKLCH C multiplicatively", () => {
    const before = hexToOklch("#FF0000")!
    const after = hexToOklch(desaturate("#FF0000", 0.5))!
    expect(after.C).toBeCloseTo(before.C * 0.5, 2)
  })

  it("returns non-hex unchanged", () => {
    expect(desaturate("red", 0.5)).toBe("red")
  })
})

describe("complement", () => {
  it("rotates hue by 180 degrees, preserves L (C may gamut-map)", () => {
    // Pure red #FF0000 is at the sRGB chroma boundary; its OKLCH complement
    // (cyan at same L+C) may lie outside sRGB and gamut-map to lower C.
    // L and H must still be preserved exactly.
    const before = hexToOklch("#FF0000")!
    const after = hexToOklch(complement("#FF0000"))!
    const hueDiff = (((after.H - before.H) % 360) + 360) % 360
    expect(Math.abs(hueDiff - 180)).toBeLessThan(1)
    expect(after.L).toBeCloseTo(before.L, 2)
    // Chroma ≤ original (gamut-mapped down if needed), but still colorful.
    expect(after.C).toBeLessThanOrEqual(before.C + 0.001)
    expect(after.C).toBeGreaterThan(0.05)
  })

  it("preserves L exactly and C approximately for in-gamut colors", () => {
    // A moderately-saturated blue whose complement stays in sRGB gamut.
    // C may drift slightly near sRGB edges even for moderate colors.
    const before = hexToOklch("#5570C0")!
    const after = hexToOklch(complement("#5570C0"))!
    expect(after.L).toBeCloseTo(before.L, 2)
    expect(Math.abs(after.C - before.C)).toBeLessThan(0.02)
  })

  it("returns non-hex unchanged", () => {
    expect(complement("red")).toBe("red")
  })
})

describe("colorDistance", () => {
  it("is zero for same color", () => {
    expect(colorDistance("#3355AA", "#3355AA")).toBeCloseTo(0, 4)
  })
  it("is positive for different colors", () => {
    expect(colorDistance("#FF0000", "#0000FF")).toBeGreaterThan(0)
  })
  it("returns null for non-hex", () => {
    expect(colorDistance("red", "#000")).toBeNull()
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

describe("ensureContrast (OKLCH L adjustment)", () => {
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

  it("preserves hue (OKLCH repair keeps the color family)", () => {
    // Start with a blue that fails contrast; repair darkens but stays blue.
    const adjusted = ensureContrast("#5570C0", "#FFFFFF", 4.5)
    const before = hexToOklch("#5570C0")!
    const after = hexToOklch(adjusted)!
    // Hue difference from 0 (perfect preservation) — allow ≤10° drift from gamut mapping.
    const diff = (((after.H - before.H) % 360) + 360) % 360 // 0..360
    const shortArc = Math.min(diff, 360 - diff)
    expect(shortArc).toBeLessThan(10)
  })

  it("returns non-hex color unchanged", () => {
    expect(ensureContrast("red", "#FFFFFF", 4.5)).toBe("red")
  })

  it("type: HSL is a tuple", () => {
    const hsl: HSL = [180, 0.5, 0.5]
    expect(hsl).toHaveLength(3)
  })

  it("type: OKLCH has L, C, H fields", () => {
    const o: OKLCH = { L: 0.5, C: 0.1, H: 180 }
    expect(o.L).toBe(0.5)
    expect(o.C).toBe(0.1)
    expect(o.H).toBe(180)
  })
})
