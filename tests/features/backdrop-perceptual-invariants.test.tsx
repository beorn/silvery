/**
 * Perceptual invariants for backdrop fade.
 *
 * Locks the core perception contract the 12+ fix commits converged on:
 * a faded cell is NEVER perceptually more prominent than its pre-fade
 * counterpart. If a future math change regresses any of these invariants,
 * this test fails loudly before the regression reaches a user.
 *
 * Invariants asserted:
 *
 *   1. Lightness never increases: L(fade(c)) ≤ L(c) for dark-theme scrim
 *   2. Chroma never increases: C(fade(c)) ≤ C(c)
 *   3. Hue is preserved (within ε): H(fade(c)) ≈ H(c) for C > small
 *   4. C/L ratio (perceived saturation proxy) is bounded — doesn't rise
 *      dramatically. The quadratic chroma falloff in `deemphasize` keeps
 *      C/L within the original or below.
 *
 * Test panel covers realistic theme colors across hue space and
 * chroma range — pale (Catppuccin fg), mid (primary lavender,
 * blue), deep (mauve, red, green). Amounts span 0.2-0.5 which
 * brackets the ModalDialog default (0.25) and common alternatives
 * (Material 3 0.32, iOS 0.40).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { deemphasize, hexToOklch } from "@silvery/color"
import { Backdrop, Box, Text, ThemeProvider } from "@silvery/ag-react"
import { deriveTheme } from "@silvery/ansi"
import { catppuccinMocha } from "@silvery/theme/schemes"

const darkTheme = deriveTheme(catppuccinMocha, "truecolor")

// Test panel: realistic theme colors spanning hue + chroma range.
// Each entry is (name, hex) for diagnostic output on failure.
const COLOR_PANEL: Array<[string, string]> = [
  // Pale / low-chroma
  ["catppuccin fg", "#cdd6f4"],
  ["catppuccin fg-muted", "#bac2de"],
  ["nord-like defaultBg", "#2e3440"],
  // Mid chroma
  ["catppuccin primary", "#b4befe"],
  ["catppuccin blue", "#89b4fa"],
  ["catppuccin teal", "#94e2d5"],
  ["catppuccin green", "#a6e3a1"],
  ["catppuccin yellow", "#f9e2af"],
  ["catppuccin peach", "#fab387"],
  // Deep / high-chroma
  ["catppuccin red", "#f38ba8"],
  ["catppuccin mauve", "#cba6f7"],
  ["catppuccin flamingo", "#f2cdcd"],
  ["pure red", "#ff0000"],
  ["pure blue", "#0000ff"],
  ["pure green", "#00ff00"],
  // Edge
  ["pure white", "#ffffff"],
  ["near-black", "#101010"],
]

const AMOUNTS = [0.2, 0.25, 0.32, 0.4, 0.5]

describe("backdrop perceptual invariants: deemphasize primitive", () => {
  test("L never increases (fade darkens)", () => {
    for (const [name, hex] of COLOR_PANEL) {
      const before = hexToOklch(hex)
      if (!before) continue // unparseable — skip
      for (const amount of AMOUNTS) {
        const after = hexToOklch(deemphasize(hex, amount))!
        // Allow tiny floating-point overshoot from round-trip conversion.
        expect(
          after.L,
          `${name} ${hex} @α=${amount}: L increased (${before.L.toFixed(3)} → ${after.L.toFixed(3)})`,
        ).toBeLessThanOrEqual(before.L + 1e-6)
      }
    }
  })

  test("C never increases (fade desaturates or preserves chroma)", () => {
    for (const [name, hex] of COLOR_PANEL) {
      const before = hexToOklch(hex)
      if (!before) continue
      for (const amount of AMOUNTS) {
        const after = hexToOklch(deemphasize(hex, amount))!
        expect(
          after.C,
          `${name} ${hex} @α=${amount}: C increased (${before.C.toFixed(3)} → ${after.C.toFixed(3)})`,
        ).toBeLessThanOrEqual(before.C + 1e-6)
      }
    }
  })

  test("H is preserved (within 5° for cells with meaningful chroma)", () => {
    // OKLCH → sRGB → OKLCH round-trip + quadratic chroma falloff can shift
    // H a few degrees on low-chroma cells where the chroma signal is weak
    // relative to quantization noise. Allow 5° for C >= 0.05, skip smaller.
    for (const [name, hex] of COLOR_PANEL) {
      const before = hexToOklch(hex)
      if (!before || before.C < 0.05) continue // low-C H is quantization-noisy
      for (const amount of AMOUNTS) {
        const after = hexToOklch(deemphasize(hex, amount))!
        if (after.C < 0.005) continue // deemphasized to near-neutral — H meaningless
        const delta = Math.min(
          Math.abs(before.H - after.H),
          360 - Math.abs(before.H - after.H),
        )
        expect(
          delta,
          `${name} ${hex} @α=${amount}: H drifted ${delta.toFixed(1)}° (was ${before.H.toFixed(1)} → ${after.H.toFixed(1)})`,
        ).toBeLessThan(5.0)
      }
    }
  })

  test("C/L ratio never rises above original + small tolerance", () => {
    // The user-reported "colors look more saturated when darkened" symptom
    // is a rising C/L ratio. Quadratic chroma falloff keeps C/L at or below
    // the original. This test would have caught the symptom immediately.
    const TOLERANCE = 0.05 // allow 5% drift due to round-trip / gamut mapping
    for (const [name, hex] of COLOR_PANEL) {
      const before = hexToOklch(hex)
      if (!before || before.L < 0.05 || before.C < 0.02) continue // skip near-black / near-neutral
      const ratioBefore = before.C / before.L
      for (const amount of AMOUNTS) {
        const after = hexToOklch(deemphasize(hex, amount))!
        if (after.L < 0.01) continue // deemphasize to near-black — ratio numerically unstable
        const ratioAfter = after.C / after.L
        expect(
          ratioAfter,
          `${name} ${hex} @α=${amount}: C/L rose (${ratioBefore.toFixed(3)} → ${ratioAfter.toFixed(3)})`,
        ).toBeLessThanOrEqual(ratioBefore * (1 + TOLERANCE))
      }
    }
  })

  test("amount=0 is a passthrough (fade=0 means cell unchanged)", () => {
    for (const [, hex] of COLOR_PANEL) {
      expect(deemphasize(hex, 0).toLowerCase()).toBe(hex.toLowerCase())
    }
  })

  test("amount=1 fully fades to neutral black", () => {
    for (const [, hex] of COLOR_PANEL) {
      const after = hexToOklch(deemphasize(hex, 1))!
      // L and C both scaled by 0 — must land at pure black (L=0, C=0).
      expect(after.L).toBeLessThan(0.01)
      expect(after.C).toBeLessThan(0.01)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Integration: invariants hold when exercised through the full
// `applyBackdrop` pipeline (not just the primitive). This catches any
// orchestration bug that would e.g. apply deemphasize twice or mix with the
// wrong color. Uses `createRenderer` so the whole backdrop pass runs.
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop perceptual invariants: end-to-end render", () => {
  test("colored fg cells never gain chroma through the fade pass", () => {
    const render = createRenderer({ cols: 60, rows: 10 })

    // Render each color as text; then render the same tree with a Backdrop
    // wrapper; compare each cell's fg OKLCH C before and after.
    const coloredEntries = COLOR_PANEL.filter(([, hex]) => {
      const o = hexToOklch(hex)
      return o !== null && o.C >= 0.02
    })

    function TextRow({ entries }: { entries: Array<[string, string]> }) {
      return (
        <Box flexDirection="row" gap={1} backgroundColor="#1e1e2e">
          {entries.map(([name, hex]) => (
            <Text key={name} color={hex}>
              {name.slice(0, 6)}
            </Text>
          ))}
        </Box>
      )
    }

    function App({ faded }: { faded: boolean }) {
      return (
        <ThemeProvider theme={darkTheme}>
          {faded ? (
            <Backdrop fade={0.4}>
              <TextRow entries={coloredEntries} />
            </Backdrop>
          ) : (
            <TextRow entries={coloredEntries} />
          )}
        </ThemeProvider>
      )
    }

    const app = render(<App faded={false} />)
    // Capture pre-fade cell fg chromas by sampling one cell per glyph.
    const preChromas = new Map<number, number>() // x -> C
    for (let x = 0; x < 60; x++) {
      const cell = app.cell(x, 0)
      if (!cell.fg) continue
      const hex = `#${cell.fg.r.toString(16).padStart(2, "0")}${cell.fg.g.toString(16).padStart(2, "0")}${cell.fg.b.toString(16).padStart(2, "0")}`
      const o = hexToOklch(hex)
      if (!o) continue
      preChromas.set(x, o.C)
    }
    expect(preChromas.size).toBeGreaterThan(0)

    // Re-render with fade applied.
    app.rerender(<App faded={true} />)
    for (const [x, preC] of preChromas) {
      const cell = app.cell(x, 0)
      if (!cell.fg) continue
      const hex = `#${cell.fg.r.toString(16).padStart(2, "0")}${cell.fg.g.toString(16).padStart(2, "0")}${cell.fg.b.toString(16).padStart(2, "0")}`
      const o = hexToOklch(hex)
      if (!o) continue
      expect(
        o.C,
        `cell x=${x}: C rose through fade pass (pre=${preC.toFixed(3)} → post=${o.C.toFixed(3)})`,
      ).toBeLessThanOrEqual(preC + 1e-6)
    }
  })

  test("bg channels never increase toward black scrim", () => {
    // Dark-theme scrim is #000000, so sRGB source-over at α>0 always reduces
    // (or preserves) each channel. Locks the sRGB contract for bg.
    const render = createRenderer({ cols: 20, rows: 3 })

    function App({ faded }: { faded: boolean }) {
      return (
        <ThemeProvider theme={darkTheme}>
          {faded ? (
            <Backdrop fade={0.4}>
              <Box backgroundColor="#ff0000" width={10} height={3}>
                <Text color="#ffffff">XYZ</Text>
              </Box>
            </Backdrop>
          ) : (
            <Box backgroundColor="#ff0000" width={10} height={3}>
              <Text color="#ffffff">XYZ</Text>
            </Box>
          )}
        </ThemeProvider>
      )
    }

    const app = render(<App faded={false} />)
    const preBg = app.cell(5, 1).bg as { r: number; g: number; b: number }
    expect(preBg.r).toBe(255)
    app.rerender(<App faded={true} />)
    const postBg = app.cell(5, 1).bg as { r: number; g: number; b: number }
    expect(postBg.r).toBeLessThanOrEqual(preBg.r)
    expect(postBg.g).toBeLessThanOrEqual(preBg.g)
    expect(postBg.b).toBeLessThanOrEqual(preBg.b)
  })
})
