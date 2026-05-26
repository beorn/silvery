/**
 * Contract: `deriveProtocolModesFromFocusSubtree` walks focused-ancestor
 * chain, OR-merges island modes, returns unified IslandProtocolModes.
 *
 * Unit C aggregator for `@km/silvery/15646-islands`. The aggregator is
 * pure (walks AgNode ancestors, reads islandState.handle.modes.modes,
 * unions) — no rendering, no side effects. Tests it with mocked AgNodes.
 */

import { describe, expect, test } from "vitest"
import { deriveProtocolModesFromFocusSubtree } from "@silvery/ag-term/runtime/island-aggregator"
import type { AgNode } from "@silvery/ag/types"
import type {
  IslandHandle,
  IslandModesOwner,
  IslandNodeState,
  IslandProtocolModes,
} from "@silvery/ag/island-types"

// ============================================================================
// Fixtures — minimal AgNode + Island mocks
// ============================================================================

function makeNode(type: AgNode["type"], parent: AgNode | null = null): AgNode {
  // The aggregator only reads `type`, `parent`, `islandState` — minimal stub.
  const node = {
    type,
    props: {},
    children: [],
    parent,
    layoutNode: null,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: 0,
    dirtyBits: 0,
    dirtyEpoch: 0,
  } as unknown as AgNode
  return node
}

function makeIslandModesOwner(modes: IslandProtocolModes): IslandModesOwner {
  return {
    modes,
    subscribe: () => () => {},
  }
}

function attachIsland(node: AgNode, modes: IslandProtocolModes | null): void {
  const handle = (
    modes
      ? {
          size: { cols: 80, rows: 24, subscribe: () => () => {}, requestResize: () => {} },
          output: {
            buffer: { cols: 80, rows: 24, getCell: () => ({}) as never },
            cursor: null,
            cursorVisible: false,
            subscribe: () => () => {},
            writeCells: () => {},
            invalidateAll: () => {},
          },
          modes: makeIslandModesOwner(modes),
          dispose: () => {},
        }
      : null
  ) as IslandHandle | null
  node.islandState = {
    handle,
    guest: { init: async () => handle as IslandHandle },
    capabilities: {},
    focusable: false,
    focused: false,
    palettePolicy: "freeze",
    frozenPalette: null,
    hydrate: "load",
    lifecycle: handle ? "ready" : "pending",
    lastError: null,
    abortController: new AbortController(),
  } satisfies IslandNodeState
}

// ============================================================================
// Tests
// ============================================================================

describe("deriveProtocolModesFromFocusSubtree", () => {
  test("null focus → empty modes", () => {
    expect(deriveProtocolModesFromFocusSubtree(null)).toEqual({})
  })

  test("focus on a node with NO island ancestors → empty modes", () => {
    const root = makeNode("silvery-root")
    const box = makeNode("silvery-box", root)
    const text = makeNode("silvery-text", box)
    expect(deriveProtocolModesFromFocusSubtree(text)).toEqual({})
  })

  test("focus inside a single island → that island's modes", () => {
    const root = makeNode("silvery-root")
    const island = makeNode("silvery-island", root)
    attachIsland(island, {
      kittyKeyboard: true,
      mouseTracking: "drag",
      focusReporting: true,
    })
    const child = makeNode("silvery-box", island)
    const focus = makeNode("silvery-text", child)
    expect(deriveProtocolModesFromFocusSubtree(focus)).toEqual({
      kittyKeyboard: true,
      mouseTracking: "drag",
      focusReporting: true,
    })
  })

  test("focus IS the island leaf → still aggregates", () => {
    const root = makeNode("silvery-root")
    const island = makeNode("silvery-island", root)
    attachIsland(island, { altScreen: true })
    expect(deriveProtocolModesFromFocusSubtree(island)).toEqual({ altScreen: true })
  })

  test("nested islands → OR-merged (outer + inner)", () => {
    // Future-compat: recursive islands are possible by construction even
    // though v1 has no acceptance test for the nested case. The aggregator
    // should handle them correctly regardless.
    const root = makeNode("silvery-root")
    const outer = makeNode("silvery-island", root)
    attachIsland(outer, { kittyKeyboard: true, focusReporting: true })
    const inner = makeNode("silvery-island", outer)
    attachIsland(inner, { bracketedPaste: true, mouseTracking: "any" })
    const focus = makeNode("silvery-text", inner)
    expect(deriveProtocolModesFromFocusSubtree(focus)).toEqual({
      kittyKeyboard: true,
      focusReporting: true,
      bracketedPaste: true,
      mouseTracking: "any",
    })
  })

  test("island ancestor with no handle (pending hydrate) → contributes nothing", () => {
    const root = makeNode("silvery-root")
    const island = makeNode("silvery-island", root)
    attachIsland(island, null) // pending — handle is null
    const focus = makeNode("silvery-text", island)
    expect(deriveProtocolModesFromFocusSubtree(focus)).toEqual({})
  })

  test("mouse tracking — precedence (higher granularity wins)", () => {
    const root = makeNode("silvery-root")
    const outer = makeNode("silvery-island", root)
    attachIsland(outer, { mouseTracking: "any" })
    const inner = makeNode("silvery-island", outer)
    attachIsland(inner, { mouseTracking: "click" })
    const focus = makeNode("silvery-text", inner)
    // Outer requests "any" (3), inner requests "click" (1). Union wins on
    // precedence — host enables "any" so both islands get what they need.
    expect(deriveProtocolModesFromFocusSubtree(focus).mouseTracking).toBe("any")
  })

  test("cursor — first-island-wins (deepest focused island)", () => {
    const root = makeNode("silvery-root")
    const outer = makeNode("silvery-island", root)
    attachIsland(outer, { cursor: { shape: "underline", visible: true } })
    const inner = makeNode("silvery-island", outer)
    attachIsland(inner, { cursor: { shape: "block", visible: true } })
    const focus = makeNode("silvery-text", inner)
    // Walk leaf → root, so inner (deepest = actually-focused) wins.
    expect(deriveProtocolModesFromFocusSubtree(focus).cursor).toEqual({
      shape: "block",
      visible: true,
    })
  })

  test("sibling island (NOT on focus chain) → not aggregated", () => {
    const root = makeNode("silvery-root")
    const focusedIsland = makeNode("silvery-island", root)
    attachIsland(focusedIsland, { kittyKeyboard: true })
    const siblingIsland = makeNode("silvery-island", root)
    attachIsland(siblingIsland, { mouseTracking: "any", focusReporting: true })
    const focus = makeNode("silvery-text", focusedIsland)
    // Sibling is not on the focus chain — host should NOT enable its modes.
    expect(deriveProtocolModesFromFocusSubtree(focus)).toEqual({
      kittyKeyboard: true,
    })
  })
})
