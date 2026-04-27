/**
 * Contract test for `createTestRenderState` — ensures the factory's
 * defaults match the documented invariants and that every required field
 * on `NodeRenderState` has a default value (so adding a new required
 * field forces a test update or a documented default here).
 *
 * Bead: km-silvery.test-render-state-factory
 */
import { describe, test, expect } from "vitest"
import type { NodeRenderState } from "@silvery/ag-term/pipeline"
import { createTestRenderState } from "./render-state"

describe("createTestRenderState — strict factory for NodeRenderState fixtures", () => {
  test("default state matches the root state used by renderPhase", () => {
    const state = createTestRenderState()
    expect(state.scrollOffset).toBe(0)
    expect(state.clipBounds).toBeUndefined()
    expect(state.hasPrevBuffer).toBe(false)
    expect(state.ancestorCleared).toBe(false)
    expect(state.bufferIsCloned).toBe(false)
    expect(state.ancestorLayoutChanged).toBe(false)
    expect(state.inheritedBg).toEqual({ color: null, ancestorRect: null })
    expect(state.inheritedFg).toBeNull()
    expect(state.selectableMode).toBe(true)
  })

  test("overrides apply on top of defaults", () => {
    const state = createTestRenderState({
      hasPrevBuffer: true,
      selectableMode: false,
    })
    expect(state.hasPrevBuffer).toBe(true)
    expect(state.selectableMode).toBe(false)
    // Unspecified fields keep their defaults
    expect(state.ancestorCleared).toBe(false)
    expect(state.scrollOffset).toBe(0)
  })

  test("type-level: factory return is fully typed as NodeRenderState (no Partial)", () => {
    // If the factory ever returns a partial, this assignment would fail
    // at compile time. The assignment is the structural contract test.
    const state: NodeRenderState = createTestRenderState()
    expect(state).toBeDefined()
  })

  test("inheritedBg reference is per-call (not shared)", () => {
    // The default object is recreated each call so tests can mutate
    // inheritedBg.ancestorRect without polluting other test states.
    const a = createTestRenderState()
    const b = createTestRenderState()
    expect(a.inheritedBg).not.toBe(b.inheritedBg)
  })
})
