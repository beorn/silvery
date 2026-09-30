/**
 * Backdrop fade — theme-aware ANSI palette resolution (@km 19764).
 *
 * ## The bug
 *
 * When a modal/permission dialog opens (or a non-focus pane is dimmed), the
 * backdrop fade mixes every covered cell toward a scrim. To do that it resolves
 * each cell's color to RGB via `colorToHex()`. For a PALETTE-INDEXED cell
 * (`typeof color === "number"`, e.g. ANSI cyan index 6 parsed from agent
 * terminal output), `colorToHex` fell back to `ansi256ToRgb(idx)` — a HARDCODED
 * 1980s VGA table where index 6 = `[0,128,128]`. So palette-cyan UI chrome faded
 * to harsh VGA teal (`#008080`) and was emitted as TRUECOLOR `48;2;0;128;128`,
 * which the terminal/screenshot renders faithfully as the wrong color.
 *
 * Truecolor content (red/gold) survived because it never hit the palette table;
 * only the 16 ANSI palette slots drifted. Before the fade was added, palette
 * cells emitted `\x1b[46m` and the terminal themed them (muted, neutral).
 *
 * ## The fix
 *
 * `colorToHex` accepts an optional `palette` (the active theme's 16 ANSI colors,
 * `theme.palette`). When the color is a number 0–15 AND a palette is supplied,
 * it resolves against `palette[idx]` instead of the VGA table. Indices ≥16 keep
 * `ansi256ToRgb` (the 6×6×6 cube + grayscale ramp are palette-independent).
 *
 * The VGA table stays the no-theme fallback: bare buffers with no ThemeProvider
 * (and `createTextFrame` readback) keep current behavior. The fix is purely
 * ADDITIVE — a palette override that only the backdrop fade supplies, threaded
 * from `ag.ts`'s `findRootThemeAnsi16(root)` (mirroring `findRootThemeBg`).
 *
 * ## Test layers
 *
 * 1. Focused unit on `colorToHex(idx, palette)` — the core-helper contract.
 * 2. Realistic-scale (50+ node) STRICT-path integration via `applyBackdrop`:
 *    a 120×40 buffer carrying palette-indexed cells under a fade marker, with
 *    the theme palette threaded as the `palette` option. Asserts the faded bg
 *    derives from the THEME cyan, not VGA `#008080`.
 *
 * These run under SILVERY_STRICT=1 (the default for `bun run test:vendor`):
 * `applyBackdrop` mutates the buffer in place and is a pure function of
 * (plan, buffer), so the realize pass is deterministic across fresh/incremental.
 *
 * Bead: @km/infra/19764-tty-screenshot-color-drift
 */

import { describe, expect, test } from "vitest"
import { applyBackdrop } from "@silvery/ag-term/pipeline/backdrop"
import { colorToHex } from "@silvery/ag-term/pipeline/backdrop/color"
import { ansi256ToRgb, createBuffer } from "@silvery/ag-term/buffer"
import type { RGB } from "@silvery/ag/text-frame"
import type { Rect } from "@silvery/ag/types"
import { fakeNode } from "../../packages/ag/tests/support/fake-node"

// =============================================================================
// Theme ANSI-16 palette (Tokyo Night). Index order matches `theme.palette` and
// `colorToHex`'s buffer-Color number semantics:
//   0 black, 1 red, 2 green, 3 yellow, 4 blue, 5 magenta, 6 cyan, 7 white,
//   8 brightBlack, 9 brightRed, … 15 brightWhite.
// Tokyo Night cyan (#7dcfff) is the canonical "soft" cyan that VGA mangles.
// =============================================================================

const hex = (s: string): RGB => ({
  r: parseInt(s.slice(1, 3), 16),
  g: parseInt(s.slice(3, 5), 16),
  b: parseInt(s.slice(5, 7), 16),
})

const TOKYO_NIGHT_PALETTE: readonly RGB[] = [
  hex("#15161e"), // 0 black
  hex("#f7768e"), // 1 red
  hex("#9ece6a"), // 2 green
  hex("#e0af68"), // 3 yellow
  hex("#7aa2f7"), // 4 blue
  hex("#bb9af7"), // 5 magenta
  hex("#7dcfff"), // 6 cyan  ← the slot the bug mangles to #008080
  hex("#a9b1d6"), // 7 white
  hex("#414868"), // 8 brightBlack
  hex("#f7768e"), // 9 brightRed
  hex("#9ece6a"), // 10 brightGreen
  hex("#e0af68"), // 11 brightYellow
  hex("#7aa2f7"), // 12 brightBlue
  hex("#bb9af7"), // 13 brightMagenta
  hex("#7dcfff"), // 14 brightCyan
  hex("#c0caf5"), // 15 brightWhite
]

// =============================================================================
// Layer 1 — focused unit on colorToHex
// =============================================================================

describe("colorToHex — theme-aware ANSI palette resolution (@km 19764)", () => {
  test("palette index 6 resolves to THEME cyan, not VGA #008080", () => {
    // Before the fix: colorToHex(6) === "#008080" (VGA teal — the bug).
    expect(colorToHex(6)).toBe("#008080")

    // With a theme palette, index 6 must resolve to the theme's cyan slot.
    expect(colorToHex(6, TOKYO_NIGHT_PALETTE)).toBe("#7dcfff")
  })

  test("all 16 ANSI palette indices resolve against the theme palette", () => {
    for (let i = 0; i < 16; i++) {
      const want = TOKYO_NIGHT_PALETTE[i]!
      const wantHex = `#${[want.r, want.g, want.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
      expect(colorToHex(i, TOKYO_NIGHT_PALETTE)).toBe(wantHex)
    }
  })

  test("indices >= 16 ignore the palette (cube/grayscale are palette-independent)", () => {
    // 6×6×6 cube + grayscale ramp must stay on ansi256ToRgb regardless of
    // whether a theme palette is supplied — the theme only owns slots 0–15.
    for (const idx of [16, 100, 231, 232, 244, 255]) {
      const rgb = ansi256ToRgb(idx)
      const wantHex = `#${[rgb.r, rgb.g, rgb.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
      expect(colorToHex(idx, TOKYO_NIGHT_PALETTE)).toBe(wantHex)
      // And identical to the no-palette call.
      expect(colorToHex(idx, TOKYO_NIGHT_PALETTE)).toBe(colorToHex(idx))
    }
  })

  test("no palette → VGA fallback unchanged (bare-buffer / readback behavior)", () => {
    // The hard constraint: omitting the palette keeps the historical VGA table
    // so createTextFrame readback + bare tests are untouched.
    expect(colorToHex(6)).toBe("#008080")
    expect(colorToHex(8)).toBe("#808080")
    expect(colorToHex(2)).toBe("#008000")
  })

  test("true-color and null cells are unaffected by the palette param", () => {
    expect(colorToHex({ r: 220, g: 40, b: 40 }, TOKYO_NIGHT_PALETTE)).toBe("#dc2828")
    expect(colorToHex(null, TOKYO_NIGHT_PALETTE)).toBeNull()
  })
})

// =============================================================================
// Layer 2 — realistic-scale STRICT-path integration via applyBackdrop
// =============================================================================

const COLS = 120
const ROWS = 40
const FULL_RECT: Rect = { x: 0, y: 0, width: COLS, height: ROWS }

// Tokyo Night surface bg (#1a1b26) — the dark theme bg that drives the scrim to
// pure black (#000000). Threaded as `defaultBg` exactly like `ag.ts` does.
const THEME_BG = "#1a1b26"

type Rgb = { r: number; g: number; b: number }
const bgRgb = (buffer: ReturnType<typeof createBuffer>, x: number, y: number): Rgb | null => {
  const bg = buffer.getCell(x, y).bg
  if (bg === null || typeof bg === "number") return null
  if (bg.r < 0) return null // DEFAULT_BG sentinel
  return { r: bg.r, g: bg.g, b: bg.b }
}

describe("backdrop fade: themed palette resolution on a realistic scene (@km 19764)", () => {
  /**
   * Paint a silvercode-shaped scene whose UI chrome is PALETTE-INDEXED (the
   * shape produced when agent terminal output is parsed: SGR 46/36 → numeric
   * Color 6). 120×40 = 4800 cells; the chrome spans a multi-row bar + a column
   * so the faded set is well past the 50-node realistic-scale floor.
   */
  function paintPaletteCyanScene(buffer: ReturnType<typeof createBuffer>): void {
    // Full-screen truecolor dark surface (the transcript bg).
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        buffer.setCell(x, y, { char: " ", bg: hex(THEME_BG), fg: hex("#a9b1d6") })
      }
    }
    // A multi-row PALETTE-CYAN chrome band (bg = numeric index 6) across the
    // top — this is the cell class the bug mangles to VGA teal.
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < COLS; x++) {
        buffer.setCell(x, y, { char: x % 7 === 0 ? "│" : " ", bg: 6, fg: 0 })
      }
    }
    // A palette-cyan right-edge column (fg = numeric index 6) down the body.
    for (let y = 3; y < ROWS; y++) {
      buffer.setCell(COLS - 1, y, { char: "▌", fg: 6, bg: hex(THEME_BG) })
    }
  }

  test("palette-cyan chrome fades toward THEME cyan, not VGA #008080", () => {
    const buffer = createBuffer(COLS, ROWS)
    paintPaletteCyanScene(buffer)

    const root = fakeNode({}, FULL_RECT, [fakeNode({ "data-backdrop-fade": 0.4 }, FULL_RECT)])

    const result = applyBackdrop(root, buffer, {
      colorLevel: "truecolor",
      defaultBg: THEME_BG,
      palette: TOKYO_NIGHT_PALETTE,
    })
    expect(result.modified).toBe(true)

    // The chrome bg was palette-6. After fade it must derive from the THEME cyan
    // (#7dcfff → r=125,g=207,b=255) mixed toward black scrim — NOT from VGA
    // (#008080 → r=0,g=128,b=128). The discriminator: a theme-derived faded cyan
    // keeps R well below B (125 vs 255 in source), while a VGA-derived faded cyan
    // has R===0 and G≈B. We assert the bg is closer to the theme mix than VGA.
    const faded = bgRgb(buffer, 10, 1)
    expect(faded).not.toBeNull()

    // Expected theme mix: mixSrgb(#7dcfff, #000000, 0.4) in sRGB source-over.
    // VGA mix would be mixSrgb(#008080, #000000, 0.4). The two diverge sharply
    // in the RED channel: theme keeps red present (~75 at α=0.4), VGA has red 0.
    expect(faded!.r).toBeGreaterThan(20) // theme cyan has real red; VGA teal has none
    // Blue dominates a true cyan; VGA teal's blue (128) is much lower than the
    // theme's (255), so post-fade blue separates the two.
    expect(faded!.b).toBeGreaterThan(faded!.g) // #7dcfff: b(255) > g(207)
    expect(faded!.b).toBeGreaterThan(100)
  })

  test("WITHOUT a theme palette, the same scene reproduces the VGA-teal bug", () => {
    // Control: omitting `palette` must keep the legacy VGA path so the fix is
    // provably additive (and so we can see the bug it cures).
    const buffer = createBuffer(COLS, ROWS)
    paintPaletteCyanScene(buffer)

    const root = fakeNode({}, FULL_RECT, [fakeNode({ "data-backdrop-fade": 0.4 }, FULL_RECT)])

    applyBackdrop(root, buffer, { colorLevel: "truecolor", defaultBg: THEME_BG })

    // VGA teal #008080 mixed toward black scrim at α=0.4 → red stays 0.
    const faded = bgRgb(buffer, 10, 1)
    expect(faded).not.toBeNull()
    expect(faded!.r).toBe(0) // VGA teal has no red — the visible defect
  })

  test("the theme palette and VGA paths produce DIFFERENT faded chrome", () => {
    const themed = createBuffer(COLS, ROWS)
    const vga = createBuffer(COLS, ROWS)
    paintPaletteCyanScene(themed)
    paintPaletteCyanScene(vga)

    const root = fakeNode({}, FULL_RECT, [fakeNode({ "data-backdrop-fade": 0.4 }, FULL_RECT)])

    applyBackdrop(root, themed, {
      colorLevel: "truecolor",
      defaultBg: THEME_BG,
      palette: TOKYO_NIGHT_PALETTE,
    })
    applyBackdrop(root, vga, { colorLevel: "truecolor", defaultBg: THEME_BG })

    const themedCell = bgRgb(themed, 10, 1)
    const vgaCell = bgRgb(vga, 10, 1)
    expect(themedCell).not.toBeNull()
    expect(vgaCell).not.toBeNull()
    expect(themedCell).not.toEqual(vgaCell)
  })

  test("truecolor (non-palette) cells fade identically with or without a palette", () => {
    // The full-screen surface bg is truecolor (#1a1b26) — it must be untouched
    // by the palette param (only slots 0–15 of numeric cells are remapped). A
    // body cell at (40, 20) is pure surface bg, no palette content.
    const withPalette = createBuffer(COLS, ROWS)
    const withoutPalette = createBuffer(COLS, ROWS)
    paintPaletteCyanScene(withPalette)
    paintPaletteCyanScene(withoutPalette)

    const root = fakeNode({}, FULL_RECT, [fakeNode({ "data-backdrop-fade": 0.4 }, FULL_RECT)])

    applyBackdrop(root, withPalette, {
      colorLevel: "truecolor",
      defaultBg: THEME_BG,
      palette: TOKYO_NIGHT_PALETTE,
    })
    applyBackdrop(root, withoutPalette, {
      colorLevel: "truecolor",
      defaultBg: THEME_BG,
    })

    // A pure-surface body cell (no palette involvement) must land at the same
    // faded value on both paths — proving the palette override is scoped to
    // ANSI slots 0–15 and never touches truecolor cells.
    expect(bgRgb(withPalette, 40, 20)).toEqual(bgRgb(withoutPalette, 40, 20))
  })
})
