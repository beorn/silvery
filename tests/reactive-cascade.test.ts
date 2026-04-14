/**
 * Tests for reactive cascade derivations (E+ Phase 2).
 *
 * Verifies that alien-signals computeds in ReactiveNodeState produce
 * identical outputs to the cascade-predicates.ts oracle across all
 * 2^14 = 16,384 input combinations.
 */

import { describe, test, expect } from "vitest"
import { computeCascade } from "@silvery/ag-term/pipeline/cascade-predicates"
import type { CascadeInputs, CascadeOutputs } from "@silvery/ag-term/pipeline/cascade-predicates"
import { createReactiveNodeState, assertReactiveMatchesOracle } from "@silvery/ag-term/pipeline/reactive-node"

/** Input field names in the order they map to bit positions */
const INPUT_FIELDS: (keyof CascadeInputs)[] = [
  "hasPrevBuffer",
  "contentDirty",
  "stylePropsDirty",
  "layoutChanged",
  "subtreeDirty",
  "childrenDirty",
  "childPositionChanged",
  "ancestorLayoutChanged",
  "ancestorCleared",
  "bgDirty",
  "isTextNode",
  "hasBgColor",
  "absoluteChildMutated",
  "descendantOverflowChanged",
]

/** Convert a bitmask to CascadeInputs */
function bitsToInputs(bits: number): CascadeInputs {
  const inputs: Record<string, boolean> = {}
  for (let i = 0; i < INPUT_FIELDS.length; i++) {
    inputs[INPUT_FIELDS[i]!] = !!(bits & (1 << i))
  }
  return inputs as unknown as CascadeInputs
}

/** Format inputs for readable error messages */
function formatInputs(inputs: CascadeInputs): string {
  const trueFlags = INPUT_FIELDS.filter((f) => inputs[f])
  return trueFlags.length === 0 ? "(all false)" : trueFlags.join(", ")
}

/**
 * Sync CascadeInputs into a ReactiveNodeState (without needing an AgNode).
 * Writes each signal directly from the boolean inputs.
 */
function syncInputsToState(state: ReturnType<typeof createReactiveNodeState>, inputs: CascadeInputs): void {
  state.contentDirty(inputs.contentDirty)
  state.stylePropsDirty(inputs.stylePropsDirty)
  state.bgDirty(inputs.bgDirty)
  state.childrenDirty(inputs.childrenDirty)
  state.subtreeDirty(inputs.subtreeDirty)
  state.layoutChanged(inputs.layoutChanged)
  state.hasPrevBuffer(inputs.hasPrevBuffer)
  state.childPositionChanged(inputs.childPositionChanged)
  state.ancestorLayoutChanged(inputs.ancestorLayoutChanged)
  state.ancestorCleared(inputs.ancestorCleared)
  state.isTextNode(inputs.isTextNode)
  state.hasBgColor(inputs.hasBgColor)
  state.absoluteChildMutated(inputs.absoluteChildMutated)
  state.descendantOverflowChanged(inputs.descendantOverflowChanged)
}

describe("reactive cascade — exhaustive oracle equivalence (2^14 = 16384 cases)", () => {
  const TOTAL = 1 << INPUT_FIELDS.length // 16384

  test("reactive computeds match computeCascade for all input combinations", () => {
    const state = createReactiveNodeState()
    const failures: string[] = []
    const OUTPUT_FIELDS: (keyof CascadeOutputs)[] = [
      "canSkipEntireSubtree",
      "contentAreaAffected",
      "bgRefillNeeded",
      "contentRegionCleared",
      "skipBgFill",
      "childrenNeedFreshRender",
      "bgOnlyChange",
    ]

    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const oracle = computeCascade(inputs)

      // Sync inputs into reactive signals
      syncInputsToState(state, inputs)

      // Read computeds and compare
      for (const field of OUTPUT_FIELDS) {
        const reactiveValue = state[field]()
        const oracleValue = oracle[field]
        if (reactiveValue !== oracleValue) {
          failures.push(
            `bits=${bits} [${formatInputs(inputs)}]: ${field} reactive=${reactiveValue}, oracle=${oracleValue}`,
          )
        }
      }

      // Stop early if too many failures
      if (failures.length > 20) {
        failures.push(`... (stopped after 20 failures, ${TOTAL - bits - 1} combinations remaining)`)
        break
      }
    }

    expect(failures).toEqual([])
  })
})

describe("reactive cascade — signal reuse across syncs", () => {
  test("a single ReactiveNodeState can be reused across multiple sync cycles", () => {
    const state = createReactiveNodeState()

    // Cycle 1: all false
    const inputs1 = bitsToInputs(0)
    syncInputsToState(state, inputs1)
    const oracle1 = computeCascade(inputs1)
    expect(state.canSkipEntireSubtree()).toBe(oracle1.canSkipEntireSubtree)
    expect(state.contentAreaAffected()).toBe(oracle1.contentAreaAffected)

    // Cycle 2: hasPrevBuffer + contentDirty
    const inputs2: CascadeInputs = {
      ...inputs1,
      hasPrevBuffer: true,
      contentDirty: true,
    }
    syncInputsToState(state, inputs2)
    const oracle2 = computeCascade(inputs2)
    expect(state.canSkipEntireSubtree()).toBe(oracle2.canSkipEntireSubtree) // false
    expect(state.contentAreaAffected()).toBe(oracle2.contentAreaAffected) // true
    expect(state.childrenNeedFreshRender()).toBe(oracle2.childrenNeedFreshRender) // true

    // Cycle 3: back to all false (signals reset)
    syncInputsToState(state, inputs1)
    expect(state.canSkipEntireSubtree()).toBe(oracle1.canSkipEntireSubtree)
    expect(state.contentAreaAffected()).toBe(oracle1.contentAreaAffected)
  })
})

describe("reactive cascade — assertReactiveMatchesOracle", () => {
  test("no error when matching", () => {
    const state = createReactiveNodeState()
    const inputs = bitsToInputs(0)
    syncInputsToState(state, inputs)
    const oracle = computeCascade(inputs)
    // Should not throw
    assertReactiveMatchesOracle(state, oracle, "test-node")
  })

  test("throws on mismatch", () => {
    const state = createReactiveNodeState()
    // Set up inputs that produce contentAreaAffected=true
    const inputs: CascadeInputs = {
      hasPrevBuffer: true,
      contentDirty: true,
      stylePropsDirty: false,
      layoutChanged: false,
      subtreeDirty: false,
      childrenDirty: false,
      childPositionChanged: false,
      ancestorLayoutChanged: false,
      ancestorCleared: false,
      bgDirty: false,
      isTextNode: false,
      hasBgColor: false,
      absoluteChildMutated: false,
      descendantOverflowChanged: false,
    }
    syncInputsToState(state, inputs)

    // Create a fake oracle with one flipped value
    const fakeOracle: CascadeOutputs = {
      ...computeCascade(inputs),
      contentAreaAffected: false, // deliberately wrong
    }

    expect(() => assertReactiveMatchesOracle(state, fakeOracle, "test-node")).toThrow(/ReactiveNodeState mismatch/)
  })
})

describe("reactive cascade — computed laziness", () => {
  test("computeds only reevaluate when dependencies actually change", () => {
    const state = createReactiveNodeState()

    // Set up: hasPrevBuffer=true, all else false → canSkip=true
    state.hasPrevBuffer(true)
    state.contentDirty(false)
    state.stylePropsDirty(false)
    state.layoutChanged(false)
    state.subtreeDirty(false)
    state.childrenDirty(false)
    state.childPositionChanged(false)
    state.ancestorLayoutChanged(false)
    state.ancestorCleared(false)
    state.isTextNode(false)
    state.hasBgColor(false)
    state.absoluteChildMutated(false)
    state.descendantOverflowChanged(false)

    expect(state.canSkipEntireSubtree()).toBe(true)

    // Writing same value should not cause issues
    state.contentDirty(false)
    expect(state.canSkipEntireSubtree()).toBe(true)

    // Changing one dependency flips the computed
    state.contentDirty(true)
    expect(state.canSkipEntireSubtree()).toBe(false)
    expect(state.contentAreaAffected()).toBe(true)
  })
})
