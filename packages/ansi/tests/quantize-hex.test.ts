/**
 * Tests for `quantizeHex` + `ansi256ToHex` — hex-in / hex-out tier
 * quantization used by in-process previews (e.g. the Sterling storybook).
 */

import { describe, expect, it } from "vitest"
import {
  ansi256ToHex,
  ANSI16_SLOT_HEX,
  nearestAnsi16,
  quantizeHex,
  rgbToAnsi256,
} from "../src/color-maps"

/** Extract [r, g, b] channels from a `#rrggbb` string as non-optional numbers. */
function hexChannels(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

describe("ansi256ToHex", () => {
  it("maps every cube index back to a canonical cube level", () => {
    const cubeLevels = new Set([0, 95, 135, 175, 215, 255])
    for (let idx = 16; idx < 232; idx++) {
      const hex = ansi256ToHex(idx)
      const [r, g, b] = hexChannels(hex)
      expect(cubeLevels.has(r)).toBe(true)
      expect(cubeLevels.has(g)).toBe(true)
      expect(cubeLevels.has(b)).toBe(true)
    }
  })

  it("ansi256ToHex(rgbToAnsi256(r,g,b)) returns a canonical cube or ramp hex", () => {
    const cubeLevels = new Set([0, 95, 135, 175, 215, 255])
    const samples: Array<[number, number, number]> = [
      [0x88, 0xc0, 0xd0],
      [0xbf, 0x61, 0x6a],
      [0xa3, 0xbe, 0x8c],
      [0xeb, 0xcb, 0x8b],
    ]
    for (const [r, g, b] of samples) {
      const hex = ansi256ToHex(rgbToAnsi256(r, g, b))
      const [rr, gg, bb] = hexChannels(hex)
      // Each channel is either a cube level, or all three equal (grayscale ramp),
      // or a canonical ANSI16 slot (low index — unlikely here but allowed).
      const isCube = cubeLevels.has(rr) && cubeLevels.has(gg) && cubeLevels.has(bb)
      const isGrayRamp = rr === gg && gg === bb
      expect(isCube || isGrayRamp).toBe(true)
    }
  })

  it("round-trips through grayscale ramp (232-255)", () => {
    for (let idx = 232; idx <= 255; idx++) {
      const hex = ansi256ToHex(idx)
      expect(hex).toMatch(/^#([0-9a-f]{2})\1\1$/) // pure gray
    }
  })

  it("returns ANSI16 slot hex for low indices", () => {
    expect(ansi256ToHex(1).toLowerCase()).toBe(ANSI16_SLOT_HEX.red!.toLowerCase())
    expect(ansi256ToHex(9).toLowerCase()).toBe(ANSI16_SLOT_HEX.redBright!.toLowerCase())
  })
})

describe("quantizeHex", () => {
  it("truecolor is a pass-through (normalized to #rrggbb)", () => {
    expect(quantizeHex("#88C0D0", "truecolor")).toBe("#88c0d0")
    expect(quantizeHex("#abc", "truecolor")).toBe("#aabbcc")
  })

  it("ansi16 snaps to one of 16 canonical slots", () => {
    // Every quantized output must be a canonical ANSI16 slot hex.
    const slots = new Set(Object.values(ANSI16_SLOT_HEX).map((h) => h.toLowerCase()))
    const samples = ["#88C0D0", "#BF616A", "#A3BE8C", "#EBCB8B", "#B48EAD", "#5E81AC"]
    for (const s of samples) {
      const q = quantizeHex(s, "ansi16").toLowerCase()
      expect(slots.has(q)).toBe(true)
    }
  })

  it("ansi16 result matches nearestAnsi16 directly", () => {
    const idx = nearestAnsi16(0x88, 0xc0, 0xd0)
    const slots: Array<[number, number, number]> = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ]
    const [cr, cg, cb] = slots[idx]!
    const expected = `#${[cr, cg, cb].map((n) => n.toString(16).padStart(2, "0")).join("")}`
    expect(quantizeHex("#88c0d0", "ansi16")).toBe(expected)
  })

  it("256 snaps to xterm cube levels", () => {
    const q = quantizeHex("#88c0d0", "256")
    // The result must be a cube point (components ∈ {0,95,135,175,215,255})
    // or a grayscale ramp value. Cheapest check: round-trip through rgbToAnsi256.
    const [r, g, b] = hexChannels(q)
    const idx = rgbToAnsi256(r, g, b)
    expect(ansi256ToHex(idx).toLowerCase()).toBe(q.toLowerCase())
  })

  it("mono collapses hues to black or white by luminance", () => {
    // Light colors → white
    expect(quantizeHex("#eceff4", "mono")).toBe("#ffffff")
    expect(quantizeHex("#ffcc00", "mono")).toBe("#ffffff")
    // Dark colors → black
    expect(quantizeHex("#2e3440", "mono")).toBe("#000000")
    expect(quantizeHex("#3b4252", "mono")).toBe("#000000")
  })

  it("is a pure function (no mutation, deterministic)", () => {
    const out1 = quantizeHex("#88c0d0", "ansi16")
    const out2 = quantizeHex("#88c0d0", "ansi16")
    expect(out1).toBe(out2)
  })

  it("returns input unchanged for non-hex strings", () => {
    expect(quantizeHex("not a hex", "ansi16")).toBe("not a hex")
    expect(quantizeHex("$accent", "256")).toBe("$accent")
  })
})
