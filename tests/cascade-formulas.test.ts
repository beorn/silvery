/**
 * Exhaustive tests for the cascade predicates in render-phase.ts.
 *
 * 14 boolean inputs = 2^14 = 16,384 combinations.
 * Each combination is tested against the expected output computed from the formulas.
 * Structural invariants are verified across all combinations.
 */

import { describe, test, expect } from "vitest"
import { computeCascade } from "@silvery/ag-term/pipeline/cascade-predicates"
import type { CascadeInputs, CascadeOutputs } from "@silvery/ag-term/pipeline/cascade-predicates"

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

/** Convert a bitmask (0..16383) to CascadeInputs */
function bitsToInputs(bits: number): CascadeInputs {
  const inputs: Record<string, boolean> = {}
  for (let i = 0; i < INPUT_FIELDS.length; i++) {
    inputs[INPUT_FIELDS[i]!] = !!(bits & (1 << i))
  }
  return inputs as unknown as CascadeInputs
}

/**
 * Reference implementation — computes expected outputs directly from the formulas.
 * This is intentionally written differently from computeCascade to serve as
 * an independent oracle.
 */
function expectedOutputs(i: CascadeInputs): CascadeOutputs {
  const canSkipEntireSubtree =
    i.hasPrevBuffer &&
    !i.contentDirty &&
    !i.stylePropsDirty &&
    !i.layoutChanged &&
    !i.subtreeDirty &&
    !i.childrenDirty &&
    !i.childPositionChanged &&
    !i.ancestorLayoutChanged

  const textPaintDirty = i.isTextNode && i.stylePropsDirty

  const contentAreaAffected =
    i.contentDirty ||
    i.layoutChanged ||
    i.childPositionChanged ||
    i.childrenDirty ||
    i.bgDirty ||
    textPaintDirty ||
    i.absoluteChildMutated ||
    i.descendantOverflowChanged

  const bgRefillNeeded = i.hasPrevBuffer && !contentAreaAffected && i.subtreeDirty && i.hasBgColor

  const contentRegionCleared = (i.hasPrevBuffer || i.ancestorCleared) && contentAreaAffected && !i.hasBgColor

  const skipBgFill = i.hasPrevBuffer && !i.ancestorCleared && !contentAreaAffected && !bgRefillNeeded

  const childrenNeedFreshRender = (i.hasPrevBuffer || i.ancestorCleared) && (contentAreaAffected || bgRefillNeeded)

  return {
    canSkipEntireSubtree,
    contentAreaAffected,
    bgRefillNeeded,
    contentRegionCleared,
    skipBgFill,
    childrenNeedFreshRender,
  }
}

/** Format inputs for readable error messages */
function formatInputs(inputs: CascadeInputs): string {
  const trueFlags = INPUT_FIELDS.filter((f) => inputs[f])
  return trueFlags.length === 0 ? "(all false)" : trueFlags.join(", ")
}

describe("cascade predicates — exhaustive (2^14 = 16384 cases)", () => {
  const TOTAL = 1 << INPUT_FIELDS.length // 16384

  test("computeCascade matches reference implementation for all input combinations", () => {
    const failures: string[] = []

    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const actual = computeCascade(inputs)
      const expected = expectedOutputs(inputs)

      for (const key of Object.keys(expected) as (keyof CascadeOutputs)[]) {
        if (actual[key] !== expected[key]) {
          failures.push(`bits=${bits} [${formatInputs(inputs)}]: ${key} = ${actual[key]}, expected ${expected[key]}`)
        }
      }

      // Stop early if too many failures (avoid enormous output)
      if (failures.length > 20) {
        failures.push(`... (stopped after 20 failures, ${TOTAL - bits - 1} combinations remaining)`)
        break
      }
    }

    expect(failures).toEqual([])
  })
})

describe("cascade predicates — structural invariants (2^14 = 16384 cases)", () => {
  const TOTAL = 1 << INPUT_FIELDS.length

  test("contentAreaAffected and bgRefillNeeded are mutually exclusive", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.contentAreaAffected && out.bgRefillNeeded) {
        violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
      }
    }
    expect(violations).toEqual([])
  })

  test("contentRegionCleared and skipBgFill are never both true", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.contentRegionCleared && out.skipBgFill) {
        violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
      }
    }
    expect(violations).toEqual([])
  })

  test("when !hasPrevBuffer && !ancestorCleared: contentRegionCleared is false", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      if (!inputs.hasPrevBuffer && !inputs.ancestorCleared) {
        const out = computeCascade(inputs)
        if (out.contentRegionCleared) {
          violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("when !hasPrevBuffer && !ancestorCleared: childrenNeedFreshRender is false", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      if (!inputs.hasPrevBuffer && !inputs.ancestorCleared) {
        const out = computeCascade(inputs)
        if (out.childrenNeedFreshRender) {
          violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("canSkipEntireSubtree requires hasPrevBuffer", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.canSkipEntireSubtree && !inputs.hasPrevBuffer) {
        violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
      }
    }
    expect(violations).toEqual([])
  })

  test("canSkipEntireSubtree implies all dirty flags are false", () => {
    const dirtyFlags: (keyof CascadeInputs)[] = [
      "contentDirty",
      "stylePropsDirty",
      "layoutChanged",
      "subtreeDirty",
      "childrenDirty",
      "childPositionChanged",
      "ancestorLayoutChanged",
    ]
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.canSkipEntireSubtree) {
        for (const flag of dirtyFlags) {
          if (inputs[flag]) {
            violations.push(`bits=${bits} [${formatInputs(inputs)}]: ${flag} is true but canSkipEntireSubtree is true`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("bgRefillNeeded requires hasPrevBuffer, subtreeDirty, and hasBgColor", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.bgRefillNeeded) {
        if (!inputs.hasPrevBuffer || !inputs.subtreeDirty || !inputs.hasBgColor) {
          violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("childrenNeedFreshRender implies contentAreaAffected or bgRefillNeeded", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.childrenNeedFreshRender && !out.contentAreaAffected && !out.bgRefillNeeded) {
        violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
      }
    }
    expect(violations).toEqual([])
  })

  test("contentRegionCleared implies contentAreaAffected and !hasBgColor", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.contentRegionCleared) {
        if (!out.contentAreaAffected || inputs.hasBgColor) {
          violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("skipBgFill requires hasPrevBuffer and !ancestorCleared", () => {
    const violations: string[] = []
    for (let bits = 0; bits < TOTAL; bits++) {
      const inputs = bitsToInputs(bits)
      const out = computeCascade(inputs)
      if (out.skipBgFill) {
        if (!inputs.hasPrevBuffer || inputs.ancestorCleared) {
          violations.push(`bits=${bits} [${formatInputs(inputs)}]`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

describe("cascade predicates — named scenarios", () => {
  /** Helper: all-false inputs */
  function allFalse(): CascadeInputs {
    return {
      hasPrevBuffer: false,
      contentDirty: false,
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
  }

  test("fresh render (no prev buffer, nothing dirty) — no skip, no clear, no region changed", () => {
    const out = computeCascade(allFalse())
    expect(out.canSkipEntireSubtree).toBe(false)
    expect(out.contentAreaAffected).toBe(false)
    expect(out.bgRefillNeeded).toBe(false)
    expect(out.contentRegionCleared).toBe(false)
    expect(out.skipBgFill).toBe(false)
    expect(out.childrenNeedFreshRender).toBe(false)
  })

  test("clean node with prev buffer — skip fast path", () => {
    const out = computeCascade({ ...allFalse(), hasPrevBuffer: true })
    expect(out.canSkipEntireSubtree).toBe(true)
    expect(out.skipBgFill).toBe(true)
  })

  test("content dirty with prev buffer — no skip, content affected, region changed", () => {
    const out = computeCascade({ ...allFalse(), hasPrevBuffer: true, contentDirty: true })
    expect(out.canSkipEntireSubtree).toBe(false)
    expect(out.contentAreaAffected).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
    expect(out.skipBgFill).toBe(false)
  })

  test("content dirty with prev buffer and bg — no skip, region not cleared (has bg fill)", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      contentDirty: true,
      hasBgColor: true,
    })
    expect(out.contentRegionCleared).toBe(false) // has bg, so renderBox fills instead
    expect(out.childrenNeedFreshRender).toBe(true)
    expect(out.contentAreaAffected).toBe(true)
  })

  test("content dirty with prev buffer, no bg — region cleared", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      contentDirty: true,
      hasBgColor: false,
    })
    expect(out.contentRegionCleared).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
  })

  test("paint dirty on text node — content area affected (text has no borders)", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      stylePropsDirty: true,
      isTextNode: true,
    })
    expect(out.contentAreaAffected).toBe(true) // textPaintDirty kicks in
    expect(out.canSkipEntireSubtree).toBe(false)
  })

  test("paint dirty on box node — content area NOT affected (border-only change)", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      stylePropsDirty: true,
      isTextNode: false,
    })
    expect(out.contentAreaAffected).toBe(false) // border-only, not content
    expect(out.canSkipEntireSubtree).toBe(false) // still not skipped (stylePropsDirty)
  })

  test("subtree dirty with bg color — forces bg refill, children re-render", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      subtreeDirty: true,
      hasBgColor: true,
    })
    expect(out.contentAreaAffected).toBe(false)
    expect(out.bgRefillNeeded).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
    expect(out.skipBgFill).toBe(false)
  })

  test("subtree dirty without bg color — no special handling", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      subtreeDirty: true,
      hasBgColor: false,
    })
    expect(out.bgRefillNeeded).toBe(false)
    expect(out.childrenNeedFreshRender).toBe(false)
    expect(out.skipBgFill).toBe(true) // clone has correct bg
  })

  test("ancestor cleared, content dirty, no bg — region cleared", () => {
    const out = computeCascade({
      ...allFalse(),
      ancestorCleared: true,
      contentDirty: true,
      hasBgColor: false,
    })
    // hasPrevBuffer=false but ancestorCleared=true
    expect(out.contentRegionCleared).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
  })

  test("ancestor cleared, nothing dirty — no region changes", () => {
    const out = computeCascade({ ...allFalse(), ancestorCleared: true })
    expect(out.contentRegionCleared).toBe(false)
    expect(out.childrenNeedFreshRender).toBe(false)
    expect(out.skipBgFill).toBe(false) // ancestorCleared prevents skip
  })

  test("bgDirty triggers contentAreaAffected (bg removal detection)", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      bgDirty: true,
    })
    expect(out.contentAreaAffected).toBe(true)
    expect(out.skipBgFill).toBe(false)
  })

  test("layout changed — content area affected, no skip", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      layoutChanged: true,
    })
    expect(out.canSkipEntireSubtree).toBe(false)
    expect(out.contentAreaAffected).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
  })

  test("ancestor layout changed only — no skip (safety net), but no content area change", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      ancestorLayoutChanged: true,
    })
    expect(out.canSkipEntireSubtree).toBe(false) // ancestorLayoutChanged prevents skip
    expect(out.contentAreaAffected).toBe(false) // own content area not affected
    expect(out.skipBgFill).toBe(true) // clone bg still valid
  })

  test("absolute child mutated — content area affected", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      absoluteChildMutated: true,
    })
    expect(out.contentAreaAffected).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
  })

  test("descendant overflow changed — content area affected", () => {
    const out = computeCascade({
      ...allFalse(),
      hasPrevBuffer: true,
      descendantOverflowChanged: true,
    })
    expect(out.contentAreaAffected).toBe(true)
    expect(out.childrenNeedFreshRender).toBe(true)
  })
})
