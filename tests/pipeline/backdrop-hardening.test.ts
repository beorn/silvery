/**
 * Backdrop fade — hardening regression suite (km-silvery.backdrop-hardening).
 *
 * Each `describe` block pins one P0 fix from the GPT 5.4 Pro review of
 * commit b335f1f6. Numbered to match the bead suffixes:
 *
 *   1. multi-exclude       — region.ts union-of-outsides bug
 *   2. kitty-edge-cleanup  — applyBackdrop spam on inactive frames
 *   3. realize-kitty-guard — public-API contract for realizeToKitty
 *   4. legacy-emoji-dim    — non-Kitty emoji fallback
 *   5. split-core-plan     — CorePlan vs TerminalPlan
 *   6. slim-barrel         — public surface area
 *   7. color-compat-hide   — internal shim hidden from public barrel
 *   8. rename-final-pass   — naming policy
 */

import { describe, test, expect } from "vitest"
import {
  applyBackdrop,
  buildPlan,
  forEachFadeRegionCell,
  realizeToKitty,
} from "@silvery/ag-term/pipeline/backdrop"
import type { AgNode, Rect } from "@silvery/ag/types"
import { createBuffer } from "@silvery/ag-term/buffer"

function fakeNode(
  props: Record<string, unknown>,
  rect: Rect | null = null,
  children: AgNode[] = [],
): AgNode {
  return {
    type: "silvery-box",
    props,
    children,
    parent: null,
    layoutNode: null,
    prevLayout: null,
    boxRect: rect,
    scrollRect: null,
    prevScrollRect: null,
    screenRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: 0,
    dirtyBits: 0,
    dirtyEpoch: 0,
  } as unknown as AgNode
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. multi-exclude — region.ts: outside(A) ∪ outside(B) ≠ outside(A ∪ B).
// With 2 disjoint excludes, the previous loop visited each rect's outside
// independently; the cells inside one exclude's hole were "outside the other"
// and therefore got visited.
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop-hardening 1: multi-exclude union semantics", () => {
  test("two disjoint excludes — both holes stay crisp (zero visits inside either)", () => {
    // Buffer 10x4. Exclude A at (1,1) 2x2; exclude B at (6,1) 2x2.
    // Correct: outside(A ∪ B) = 40 - 4 - 4 = 32 cells.
    const visits = new Set<string>()
    const count = forEachFadeRegionCell(
      10,
      4,
      [],
      [
        { rect: { x: 1, y: 1, width: 2, height: 2 } },
        { rect: { x: 6, y: 1, width: 2, height: 2 } },
      ],
      (x, y) => {
        visits.add(`${x},${y}`)
      },
    )
    expect(count).toBe(32)
    // A's hole stays crisp
    expect(visits.has("1,1")).toBe(false)
    expect(visits.has("2,2")).toBe(false)
    // B's hole stays crisp
    expect(visits.has("6,1")).toBe(false)
    expect(visits.has("7,2")).toBe(false)
  })

  test("two overlapping excludes — union of interiors is preserved", () => {
    // Buffer 10x4 = 40. Exclude A at (1,0) 4x4; exclude B at (3,0) 4x4.
    // Union interior = x=[1,7), y=[0,4) = 24 cells. Outside = 40 - 24 = 16.
    const visits = new Set<string>()
    const count = forEachFadeRegionCell(
      10,
      4,
      [],
      [
        { rect: { x: 1, y: 0, width: 4, height: 4 } },
        { rect: { x: 3, y: 0, width: 4, height: 4 } },
      ],
      (x, y) => {
        visits.add(`${x},${y}`)
      },
    )
    expect(count).toBe(16)
    // Inside the union — none visited
    for (let x = 1; x < 7; x++) {
      for (let y = 0; y < 4; y++) {
        expect(visits.has(`${x},${y}`)).toBe(false)
      }
    }
    // Outside the union — visited
    expect(visits.has("0,0")).toBe(true)
    expect(visits.has("9,3")).toBe(true)
  })

  test("includes + multiple excludes — inside includes OR outside-union-of-excludes", () => {
    // Buffer 8x4. Include at (5,0) 3x4 (12 cells, x=[5,8)). Excludes at (1,1) 2x2 and (5,1) 2x2.
    // Outside(A ∪ B) on 8x4 = 32 - 4 - 4 = 24 cells.
    // Include adds cells in x=[5,8) y=[0,4). Of those 12, x=[5,7)y=[1,3) (4) overlap with exclude B
    // — these are NOT in outside(A∪B), so the include adds them. Other 8 already in outside.
    // Total unique = 24 + 4 = 28.
    const visits = new Set<string>()
    const count = forEachFadeRegionCell(
      8,
      4,
      [{ rect: { x: 5, y: 0, width: 3, height: 4 } }],
      [
        { rect: { x: 1, y: 1, width: 2, height: 2 } },
        { rect: { x: 5, y: 1, width: 2, height: 2 } },
      ],
      (x, y) => {
        visits.add(`${x},${y}`)
      },
    )
    expect(count).toBe(28)
    // A's hole stays crisp (no include covers it)
    expect(visits.has("1,1")).toBe(false)
    expect(visits.has("2,2")).toBe(false)
    // B's hole — covered by include at (5..7,1..2) → visited
    expect(visits.has("5,1")).toBe(true)
    expect(visits.has("6,2")).toBe(true)
  })
})
