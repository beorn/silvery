/**
 * Backdrop fade — scene-level legacy-scrim polarity (@km 19684).
 *
 * Follow-up to the @km 19665 fix (df3b0955), which added a PER-CELL polarity
 * target to the null-scrim legacy path: each cell's bg darkened toward
 * `LIGHT_SCRIM` or `DARK_SCRIM` based on the cell's OWN luminance vs the 0.5
 * surface midpoint. That darkened the dark status bar correctly, but it sent
 * every LIGHT element (the right-edge scrollbar block, bg ≈ #d8dee9) toward
 * WHITE — making it BRIGHTER under the modal instead of receding. On a dark
 * scene a light element should recede toward the dark scene, not pop toward
 * white.
 *
 * The fix replaces per-cell polarity with SCENE-LEVEL polarity: sample the
 * faded region once, count resolvable cell backgrounds by polarity bucket, and
 * apply the dominant bucket's target (`DARK_SCRIM` on a predominantly-dark
 * scene, `LIGHT_SCRIM` on a predominantly-light one) to EVERY cell. Only when
 * the region has no resolvable bg sample does it fall back to the per-cell
 * heuristic.
 *
 * These run under SILVERY_STRICT=1 (the default for `bun run test:fast` /
 * `test:vendor`) — `applyBackdrop` mutates the buffer in place and is a pure
 * function of (plan, buffer), so the realize pass is deterministic across the
 * fresh and incremental paths (incremental ≡ fresh).
 *
 * Realistic-scale fixtures per `packages/ag-term/src/pipeline/CLAUDE.md`: a
 * 120×40 buffer (4800 cells) with a full-screen dark surface, a multi-row
 * status bar, and a multi-row right-edge scrollbar — the silvercode shape the
 * user reported, not a 2–3 cell toy.
 *
 * Bead: @km/code/v0.2/19684-scrollbar-thumb-modal-scrim
 */

import { describe, expect, test } from "vitest"
import { applyBackdrop } from "@silvery/ag-term/pipeline/backdrop"
import { createBuffer } from "@silvery/ag-term/buffer"
import type { Rect } from "@silvery/ag/types"
import { fakeNode } from "../../packages/ag/tests/support/fake-node"

const COLS = 120
const ROWS = 40
const FULL_RECT: Rect = { x: 0, y: 0, width: COLS, height: ROWS }

type Rgb = { r: number; g: number; b: number }
const sum = (c: Rgb): number => c.r + c.g + c.b
/** Resolve a cell bg to an Rgb (true-color cells only — null otherwise). */
const bgRgb = (buffer: ReturnType<typeof createBuffer>, x: number, y: number): Rgb | null => {
  const bg = buffer.getCell(x, y).bg
  if (bg === null || typeof bg === "number") return null
  if (bg.r < 0) return null // DEFAULT_BG sentinel {r:-1,...}
  return { r: bg.r, g: bg.g, b: bg.b }
}

// Catppuccin/Nord-ish surfaces: a dark scene surface + a LIGHT scrollbar block.
const DARK_SURFACE: Rgb = { r: 46, g: 52, b: 64 } // #2e3440, lum ≈ 0.034 (dark bucket)
const STATUS_BAR: Rgb = { r: 59, g: 66, b: 82 } // #3b4252, lum ≈ 0.05 (dark bucket)
const LIGHT_SCROLLBAR: Rgb = { r: 216, g: 222, b: 233 } // #d8dee9, lum ≈ 0.73 (light bucket)
const TEXT_FG: Rgb = { r: 216, g: 222, b: 233 }

const SCROLLBAR_COLS = [COLS - 1] // single right-edge column
const STATUS_ROW = ROWS - 1

/**
 * Paint a predominantly-DARK silvercode-shaped scene into the buffer:
 *  - a full-screen dark surface fill (the transcript bg),
 *  - an opaque status bar across the bottom row,
 *  - a LIGHT scrollbar block down the right edge (the 19684 element).
 *
 * Far more dark cells than light → scene target resolves to DARK_SCRIM.
 */
function paintDarkScene(buffer: ReturnType<typeof createBuffer>): void {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      buffer.setCell(x, y, { char: " ", fg: TEXT_FG, bg: DARK_SURFACE })
    }
  }
  for (let x = 0; x < COLS; x++) {
    buffer.setCell(x, STATUS_ROW, { char: x % 3 === 0 ? "·" : " ", fg: TEXT_FG, bg: STATUS_BAR })
  }
  for (let y = 4; y < ROWS - 2; y++) {
    for (const x of SCROLLBAR_COLS) {
      buffer.setCell(x, y, { char: "█", fg: LIGHT_SCROLLBAR, bg: LIGHT_SCROLLBAR })
    }
  }
}

describe("backdrop 19684: scene-level legacy-scrim polarity", () => {
  test("dark scene — a LIGHT scrollbar AND the dark surface both DARKEN (not brighten)", () => {
    const buffer = createBuffer(COLS, ROWS)
    paintDarkScene(buffer)

    // Snapshot the two surface kinds before the pass.
    const surfaceBefore = bgRgb(buffer, 10, 10)!
    const statusBefore = bgRgb(buffer, 10, STATUS_ROW)!
    const scrollBefore = bgRgb(buffer, SCROLLBAR_COLS[0]!, 10)!
    expect(scrollBefore).toEqual(LIGHT_SCROLLBAR)

    // Null-scrim plan: no defaultBg, no scrimColor → plan.scrim === null →
    // legacy two-channel path with the scene-level target. Full-screen include.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.25 }, FULL_RECT)])
    const result = applyBackdrop(root, buffer)
    expect(result.modified).toBe(true)

    const surfaceAfter = bgRgb(buffer, 10, 10)!
    const statusAfter = bgRgb(buffer, 10, STATUS_ROW)!
    const scrollAfter = bgRgb(buffer, SCROLLBAR_COLS[0]!, 10)!

    // Dark surface recedes toward black — darkens.
    expect(sum(surfaceAfter)).toBeLessThan(sum(surfaceBefore))
    // Opaque status bar recedes — darkens (the 19665 win must survive).
    expect(sum(statusAfter)).toBeLessThan(sum(statusBefore))
    // THE 19684 FIX: the light scrollbar block must DARKEN too — it recedes
    // toward the DARK scene, not toward white. Pre-fix it BRIGHTENED
    // (#d8dee9 → #e2e6ef, sum 671 → 695).
    expect(
      sum(scrollAfter),
      `light scrollbar must recede toward the dark scene (darken), not pop ` +
        `toward white. before=${JSON.stringify(scrollBefore)} after=${JSON.stringify(scrollAfter)}`,
    ).toBeLessThan(sum(scrollBefore))
  })

  test("dark scene — EVERY scrollbar cell darkens, none brightens (multi-row)", () => {
    const buffer = createBuffer(COLS, ROWS)
    paintDarkScene(buffer)
    const before = new Map<string, Rgb>()
    for (let y = 4; y < ROWS - 2; y++) {
      for (const x of SCROLLBAR_COLS) before.set(`${x},${y}`, bgRgb(buffer, x, y)!)
    }

    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.25 }, FULL_RECT)])
    applyBackdrop(root, buffer)

    let darkened = 0
    let brightened = 0
    for (const [key, b] of before) {
      const [x, y] = key.split(",").map(Number) as [number, number]
      const a = bgRgb(buffer, x, y)!
      if (sum(a) < sum(b)) darkened += 1
      else if (sum(a) > sum(b)) brightened += 1
    }
    expect(before.size).toBeGreaterThan(20) // realistic multi-row scrollbar
    expect(brightened, "no scrollbar cell may brighten under the modal on a dark scene").toBe(0)
    expect(darkened).toBe(before.size)
  })

  test("light scene — a DARK element AND the light surface both move toward WHITE", () => {
    // Predominantly-LIGHT scene: invert the palette. A dark accent block on a
    // light page must recede toward the LIGHT scene (move toward white), and
    // the light surface lightens too.
    const LIGHT_SURFACE: Rgb = { r: 236, g: 239, b: 244 } // #eceff4, lum high → light bucket
    const DARK_ACCENT: Rgb = { r: 46, g: 52, b: 64 } // #2e3440, dark bucket
    const buffer = createBuffer(COLS, ROWS)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        buffer.setCell(x, y, { char: " ", fg: DARK_ACCENT, bg: LIGHT_SURFACE })
      }
    }
    // A small dark accent strip (the minority element).
    for (let y = 4; y < ROWS - 2; y++) {
      for (const x of SCROLLBAR_COLS) {
        buffer.setCell(x, y, { char: "█", fg: DARK_ACCENT, bg: DARK_ACCENT })
      }
    }

    const surfaceBefore = bgRgb(buffer, 10, 10)!
    const accentBefore = bgRgb(buffer, SCROLLBAR_COLS[0]!, 10)!
    expect(accentBefore).toEqual(DARK_ACCENT)

    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.25 }, FULL_RECT)])
    const result = applyBackdrop(root, buffer)
    expect(result.modified).toBe(true)

    const surfaceAfter = bgRgb(buffer, 10, 10)!
    const accentAfter = bgRgb(buffer, SCROLLBAR_COLS[0]!, 10)!

    // Light surface recedes toward white — lightens.
    expect(sum(surfaceAfter)).toBeGreaterThan(sum(surfaceBefore))
    // THE polarity flip: the dark accent recedes toward the LIGHT scene —
    // lightens (toward white), instead of darkening toward black.
    expect(
      sum(accentAfter),
      `dark accent must recede toward the light scene (lighten), not darken. ` +
        `before=${JSON.stringify(accentBefore)} after=${JSON.stringify(accentAfter)}`,
    ).toBeGreaterThan(sum(accentBefore))
  })

  test("no-usable-sample fallback — region with no resolvable bg uses the per-cell heuristic", () => {
    // Every cell keeps the default (null) bg, so the region sample finds no
    // resolvable backgrounds → regionTarget === null → fadeCell falls back to
    // the per-cell `legacyScrimTargetFor`. With null bg there is nothing to mix
    // toward at all, so the per-cell path stamps dim (the documented fallback).
    // This asserts the fallback BRANCH is reachable and behaves like the prior
    // per-cell path (dim stamp), confirming we didn't drop it.
    const buffer = createBuffer(COLS, ROWS)
    // Give cells a glyph + fg but NO bg (default/null) across a realistic block.
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        buffer.setCell(x, y, { char: x % 2 === 0 ? "x" : " ", fg: TEXT_FG })
      }
    }
    // Sanity: no cell has a resolvable bg.
    expect(bgRgb(buffer, 10, 10)).toBeNull()

    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.25 }, FULL_RECT)])
    const result = applyBackdrop(root, buffer)
    // The pass still runs (fg deemphasize / dim stamp); the fallback branch is
    // exercised without throwing and the buffer is mutated.
    expect(result.modified).toBe(true)
    // Documented per-cell fallback for null-bg cells: dim is stamped.
    expect(buffer.getCell(10, 10).attrs.dim).toBe(true)
  })

  test("no-sample fallback with a SINGLE resolvable light cell still recedes per-cell", () => {
    // Edge: a region whose ONLY resolvable bg is one light cell. The sample
    // finds light=1, dark=0 → scene target = LIGHT_SCRIM (light wins), so that
    // one light cell lightens toward white. This pins that a lone resolvable
    // cell drives the SCENE decision (it is the whole sampled population), and
    // that the no-resolvable-bg null-bg neighbors fall through to the dim stamp.
    const buffer = createBuffer(COLS, ROWS)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) buffer.setCell(x, y, { char: " ", fg: TEXT_FG })
    }
    buffer.setCell(5, 5, { char: " ", fg: TEXT_FG, bg: LIGHT_SCROLLBAR })
    const before = bgRgb(buffer, 5, 5)!

    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.25 }, FULL_RECT)])
    applyBackdrop(root, buffer)

    const after = bgRgb(buffer, 5, 5)!
    // Sole resolvable cell is light → scene polarity is light → it lightens.
    expect(sum(after)).toBeGreaterThan(sum(before))
    // A null-bg neighbor still gets the dim fallback.
    expect(buffer.getCell(0, 0).attrs.dim).toBe(true)
  })
})
