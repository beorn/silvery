/**
 * Strict factory for `NodeRenderState` test fixtures.
 *
 * Per Gemini 3 Pro's recommendation in the 2026-04-27 dual-pro review:
 *
 * > Recommendation: Replace `@ts-expect-error` partials with a centralized
 * > `createTestRenderState(overrides?: Partial<NodeRenderState>)` factory
 * > function in your test utilities. This ensures all tests use structurally
 * > complete, default-safe state objects (e.g., automatically injecting
 * > `selectableMode: true` and `inheritedBg: null`), giving you strict type
 * > safety without fixture boilerplate.
 *
 * Why this matters:
 *
 * `NodeRenderState` is the primary vehicle for top-down per-node context.
 * As silvery's renderer matures across targets (terminal, canvas, DOM), the
 * shape grows — every new threaded prop becomes a required field at the
 * type level. Tests that construct partial states with `as any` or
 * `@ts-expect-error` happily compile but silently miss the new threading
 * contract. A factory with strict defaults forces every new field to either
 * (a) ship with a sensible default here, or (b) break every test until the
 * test owner explicitly opts in.
 *
 * Default state mirrors the root state in `renderPhase()`:
 *   - scrollOffset: 0
 *   - clipBounds: undefined
 *   - hasPrevBuffer: false
 *   - ancestorCleared: false
 *   - bufferIsCloned: false
 *   - ancestorLayoutChanged: false
 *   - inheritedBg: { color: null, ancestorRect: null }
 *   - inheritedFg: null
 *   - selectableMode: true
 *
 * Bead: km-silvery.test-render-state-factory
 */
import type { NodeRenderState } from "@silvery/ag-term/pipeline"

/**
 * Construct a complete `NodeRenderState` for testing. Overrides any subset
 * of fields; unspecified fields default to the root-state values used by
 * `renderPhase`.
 *
 * Example — test that exercises a subtree under userSelect="none":
 *
 *   const childState = createTestRenderState({ selectableMode: false })
 *
 * Example — test that pretends an ancestor cleared its region:
 *
 *   const childState = createTestRenderState({
 *     hasPrevBuffer: true,
 *     ancestorCleared: true,
 *     bufferIsCloned: true,
 *   })
 */
export function createTestRenderState(
  overrides?: Partial<NodeRenderState>,
): NodeRenderState {
  return {
    scrollOffset: 0,
    clipBounds: undefined,
    hasPrevBuffer: false,
    ancestorCleared: false,
    bufferIsCloned: false,
    ancestorLayoutChanged: false,
    inheritedBg: { color: null, ancestorRect: null },
    inheritedFg: null,
    selectableMode: true,
    ...overrides,
  }
}
