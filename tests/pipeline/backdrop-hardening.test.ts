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
  buildCorePlan,
  buildPlan,
  realizeToKitty,
  type CorePlan,
  type TerminalPlan,
} from "@silvery/ag-term/pipeline/backdrop"
// Internal — tests reach in directly so the public barrel can stay
// minimal. See km-silvery.backdrop-hardening.slim-barrel.
import { forEachBackdropCell } from "@silvery/ag-term/pipeline/backdrop/region"
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
    const count = forEachBackdropCell(
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
    const count = forEachBackdropCell(
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
    const count = forEachBackdropCell(
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

const RECT_FADE: Rect = { x: 0, y: 0, width: 10, height: 4 }

// ─────────────────────────────────────────────────────────────────────────────
// 2. kitty-edge-cleanup — applyBackdrop must NOT emit overlay bytes on every
// inactive frame when options.kittyGraphics === true. Edge-triggered cleanup
// (active→inactive) is the renderer's job (ag.ts uses _kittyActive).
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop-hardening 2: kitty-edge-cleanup — inactive frames are silent", () => {
  test("fade={0} + kittyGraphics=true → 0 overlay bytes/frame", () => {
    // Marker present but amount=0 → plan inactive. Previously emitted
    // KITTY_CLEANUP_OVERLAY every inactive frame; should now be silent.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0 }, RECT_FADE)])
    const buffer = createBuffer(20, 6)
    const result = applyBackdrop(root, buffer, {
      kittyGraphics: true,
      defaultBg: "#1e1e2e",
    })
    expect(result.overlay).toBe("")
    expect(result.modified).toBe(false)
  })

  test("inactive no-scrim plan + kittyGraphics=true → 0 bytes", () => {
    // No markers at all — plan inactive. Same expectation: silent.
    const root = fakeNode({})
    const buffer = createBuffer(20, 6)
    const result = applyBackdrop(root, buffer, {
      kittyGraphics: true,
      defaultBg: "#1e1e2e",
    })
    expect(result.overlay).toBe("")
    expect(result.modified).toBe(false)
  })

  test("active frame still emits the per-frame overlay (cleanup head + cells)", () => {
    // Sanity: deactivation suppression must not break the active path.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const buffer = createBuffer(20, 6)
    const result = applyBackdrop(root, buffer, {
      kittyGraphics: true,
      defaultBg: "#1e1e2e",
    })
    // Active plan with kittyEnabled emits at least the cursor-save / delete-all
    // / cursor-restore preamble (no emoji needed).
    expect(result.overlay.length).toBeGreaterThan(0)
  })

  test("inactive + kittyGraphics=false → 0 bytes (unchanged)", () => {
    // Sanity: Kitty-disabled inactive frames stay silent (always have).
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0 }, RECT_FADE)])
    const buffer = createBuffer(20, 6)
    const result = applyBackdrop(root, buffer)
    expect(result.overlay).toBe("")
    expect(result.modified).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. realize-kitty-guard — realizeToKitty's only guard was `!plan.active`.
// It must also honor plan.kittyEnabled and plan.scrim. Public-API safety:
// callers (tests, future consumers) shouldn't have to re-derive the same gate.
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop-hardening 3: realize-kitty-guard — full contract", () => {
  test("activePlan with kittyEnabled=false returns ''", () => {
    // Construct via buildPlan WITHOUT kittyGraphics — plan.kittyEnabled=false.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.active).toBe(true)
    expect(plan.kittyEnabled).toBe(false)
    const buffer = createBuffer(20, 6)
    expect(realizeToKitty(plan, buffer)).toBe("")
  })

  test("activePlan with scrim=null returns ''", () => {
    // No defaultBg + no scrimColor → scrim=null. kittyGraphics=true is
    // requested but plan derives kittyEnabled=false because scrim=null.
    // realizeToKitty must still return "" if a caller invokes it directly.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const plan = buildPlan(root, { kittyGraphics: true })
    expect(plan.active).toBe(true)
    expect(plan.scrim).toBeNull()
    expect(plan.kittyEnabled).toBe(false)
    const buffer = createBuffer(20, 6)
    expect(realizeToKitty(plan, buffer)).toBe("")
  })

  test("inactivePlan returns ''", () => {
    // Even when wrapped to look enabled, inactive short-circuits.
    const root = fakeNode({})
    const plan = buildPlan(root, { kittyGraphics: true, defaultBg: "#1e1e2e" })
    expect(plan.active).toBe(false)
    const buffer = createBuffer(20, 6)
    expect(realizeToKitty(plan, buffer)).toBe("")
  })

  test("activePlan with kittyEnabled=true and scrim still emits overlay", () => {
    // Sanity: the new guards don't break the happy path.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const plan = buildPlan(root, { kittyGraphics: true, defaultBg: "#1e1e2e" })
    expect(plan.kittyEnabled).toBe(true)
    const buffer = createBuffer(20, 6)
    expect(realizeToKitty(plan, buffer).length).toBeGreaterThan(0)
  })

  test("amount<=0 plan with kittyEnabled returns ''", () => {
    // Plan that somehow has amount=0 but active=true (defensive). Synthesize
    // by hand to verify the guard.
    const synthPlan = {
      active: true,
      amount: 0,
      scrim: "#000000" as const,
      defaultBg: "#000000" as const,
      defaultFg: "#ffffff" as const,
      includes: [{ rect: { x: 0, y: 0, width: 4, height: 4 } }],
      excludes: [],
      mixedAmounts: false,
      scrimTowardLight: false,
      kittyEnabled: true,
    } as const
    const buffer = createBuffer(20, 6)
    expect(realizeToKitty(synthPlan, buffer)).toBe("")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. legacy-emoji-dim — when scrim is null (no theme context, e.g., no
// ThemeProvider) AND Kitty is unavailable, the legacy fadeCell branch must
// stamp attrs.dim on emoji lead + continuation. The fg mix has no visual
// effect on emoji — without dim the emoji glyph stays at full brightness.
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop-hardening 4: legacy-emoji-dim — emoji fades without scrim/Kitty", () => {
  test("emoji in faded region without ThemeProvider has dim on lead + continuation", () => {
    // No defaultBg → plan.scrim === null (legacy branch in fadeCell).
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const buffer = createBuffer(10, 4)

    // Place an emoji at (2, 1). Lead cell + continuation cell at (3, 1).
    buffer.setCell(2, 1, {
      char: "😀",
      wide: true,
      fg: { r: 255, g: 255, b: 255 },
      bg: { r: 30, g: 30, b: 46 },
    })
    buffer.setCell(3, 1, {
      continuation: true,
      fg: { r: 255, g: 255, b: 255 },
      bg: { r: 30, g: 30, b: 46 },
    })

    const result = applyBackdrop(root, buffer)
    expect(result.modified).toBe(true)

    const lead = buffer.getCell(2, 1)
    const cont = buffer.getCell(3, 1)
    expect(lead.attrs.dim).toBe(true)
    expect(cont.attrs.dim).toBe(true)
  })

  test("emoji with null bg in legacy branch still gets dim (idempotent)", () => {
    // Emoji with null bg + null fg falls through to the dim fallback already.
    // Re-pin: dim must be present even when fgHex AND bgHex are both null.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const buffer = createBuffer(10, 4)
    buffer.setCell(2, 1, {
      char: "😀",
      wide: true,
    })
    buffer.setCell(3, 1, { continuation: true })

    const result = applyBackdrop(root, buffer)
    expect(result.modified).toBe(true)
    expect(buffer.getCell(2, 1).attrs.dim).toBe(true)
    expect(buffer.getCell(3, 1).attrs.dim).toBe(true)
  })

  test("non-emoji wide char (CJK) in legacy branch does NOT get dim (over-fades)", () => {
    // CJK responds to fg mix — stamping dim would over-fade. Cell still
    // gets the fg mix; just no dim attr.
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const buffer = createBuffer(10, 4)
    buffer.setCell(2, 1, {
      char: "漢",
      wide: true,
      fg: { r: 255, g: 255, b: 255 },
      bg: { r: 30, g: 30, b: 46 },
    })
    buffer.setCell(3, 1, {
      continuation: true,
      fg: { r: 255, g: 255, b: 255 },
      bg: { r: 30, g: 30, b: 46 },
    })

    const result = applyBackdrop(root, buffer)
    expect(result.modified).toBe(true)
    // Dim NOT stamped on CJK (legacy branch only stamps on isEmojiGlyph).
    expect(buffer.getCell(2, 1).attrs.dim ?? false).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. split-core-plan — CorePlan (framework-agnostic) vs TerminalPlan
// (terminal-only, adds kittyEnabled). Active plans + includes/excludes
// arrays are frozen. PlanRect.rect is cloned, not aliasing the source node.
// ─────────────────────────────────────────────────────────────────────────────

describe("backdrop-hardening 5: split-core-plan", () => {
  test("CorePlan type does not carry Kitty fields (JSON-serializable)", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const corePlan: CorePlan = buildCorePlan(root, { defaultBg: "#1e1e2e" })
    // Round-trip through JSON proves no Kitty fields and no cyclic AgNode refs
    const json = JSON.stringify(corePlan)
    const parsed = JSON.parse(json) as Record<string, unknown> & {
      active: boolean
      amount: number
      includes: Array<{ rect: { x: number; y: number; width: number; height: number } }>
    }
    expect("kittyEnabled" in parsed).toBe(false)
    expect("colorTier" in parsed).toBe(false)
    expect(parsed.active).toBe(true)
    expect(parsed.amount).toBe(0.4)
    expect(parsed.includes).toHaveLength(1)
    expect(parsed.includes[0]!.rect.x).toBe(RECT_FADE.x)
    expect(parsed.includes[0]!.rect.width).toBe(RECT_FADE.width)
  })

  test("TerminalPlan extends CorePlan with kittyEnabled", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const plan: TerminalPlan = buildPlan(root, { kittyGraphics: true, defaultBg: "#1e1e2e" })
    expect(plan.kittyEnabled).toBe(true)
    expect(plan.active).toBe(true)
  })

  test("active plan is frozen", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.includes)).toBe(true)
    expect(Object.isFrozen(plan.excludes)).toBe(true)
  })

  test("PlanRect.rect is cloned — mutating source node rect does not affect plan", () => {
    const sharedRect: Rect = { x: 0, y: 0, width: 10, height: 4 }
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, sharedRect)])
    const plan = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(plan.includes[0]!.rect).not.toBe(sharedRect)
    expect(plan.includes[0]!.rect).toEqual(sharedRect)
    // Mutate after — plan stays stable
    sharedRect.width = 999
    expect(plan.includes[0]!.rect.width).toBe(10)
  })

  test("buildCorePlan(root) === buildPlan minus Kitty fields", () => {
    const root = fakeNode({}, null, [fakeNode({ "data-backdrop-fade": 0.4 }, RECT_FADE)])
    const core = buildCorePlan(root, { defaultBg: "#1e1e2e" })
    const term = buildPlan(root, { defaultBg: "#1e1e2e" })
    expect(core.active).toBe(term.active)
    expect(core.amount).toBe(term.amount)
    expect(core.scrim).toBe(term.scrim)
    expect(core.defaultBg).toBe(term.defaultBg)
    expect(core.defaultFg).toBe(term.defaultFg)
    expect(core.scrimTowardLight).toBe(term.scrimTowardLight)
    expect(core.mixedAmounts).toBe(term.mixedAmounts)
    expect(core.includes).toHaveLength(term.includes.length)
    expect(core.excludes).toHaveLength(term.excludes.length)
  })
})
