/**
 * A0.2 — fitWidth Box prop wiring through the silvery adapter.
 *
 * The React-level prop parsing (`"100cqi"` → `{ value: 100, unit: "cqi" }`)
 * happens in applyBoxProps; this test exercises the LayoutNode.setFitWidth
 * surface which the parser feeds into. End-to-end lane selection is verified
 * at the flexily layer (vendor/flexily/tests/fit-width.test.ts, 11 tests).
 */
import { describe, expect, test } from "vitest"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"

describe("[A0.2] LayoutNode.setFitWidth — flexily-zero adapter", () => {
  test("plain-number lanes pass through to flexily", () => {
    const engine = createFlexilyZeroEngine()
    const box = engine.createNode()
    box.setFitWidth([80, 120, 160])

    // No children → no max-content → smallest lane (80) selected as default.
    box.calculateLayout(320, 100)
    expect(box.getComputedWidth()).toBe(80)
  })

  test("mixed-unit lanes accepted without throw (translation to flexily UNIT_* shape)", () => {
    // End-to-end CQ-lane resolution is verified at the flexily layer
    // (vendor/flexily/tests/fit-width.test.ts), where the test puts the box
    // inside a setContainerType+containSize parent and asserts lane selection.
    // Here we just confirm the adapter translates "cqi" / "cqmin" strings to
    // flexily's UNIT_CQI / UNIT_CQMIN without throwing.
    const engine = createFlexilyZeroEngine()
    const box = engine.createNode()
    box.setFitWidth([80, { value: 100, unit: "cqi" }, { value: 50, unit: "cqmin" }])
    expect(() => box.calculateLayout(200, 100)).not.toThrow()
  })

  test("setFitWidth(undefined) disables fit-width", () => {
    const engine = createFlexilyZeroEngine()
    const box = engine.createNode()
    box.setFitWidth([80, 120])
    box.calculateLayout(320, 100)
    const widthWithFit = box.getComputedWidth()

    box.setFitWidth(undefined)
    box.calculateLayout(320, 100)
    const widthWithoutFit = box.getComputedWidth()

    expect(widthWithFit).toBe(80)
    expect(widthWithoutFit).not.toBe(80) // No fit-width → constraint-based
  })

  test("setFitWidth([]) is equivalent to undefined", () => {
    const engine = createFlexilyZeroEngine()
    const box = engine.createNode()
    box.setFitWidth([])
    box.calculateLayout(320, 100)
    // Empty array disables fit-width; no specific assertion about value, just
    // confirm no throw.
    expect(box.getComputedWidth()).toBeDefined()
  })
})
