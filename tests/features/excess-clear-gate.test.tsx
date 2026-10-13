/**
 * Structural invariant: clearExcessArea cannot be invoked from a second-pass
 * dispatch site (sticky/absolute/overlap-forced), because the only way to
 * obtain an ExcessClearGate is through requireExcessClearGate, which returns
 * null when hasPrevBuffer === false.
 *
 * This test promotes the runtime guard at silvery 168b4989 (the
 * `&& hasPrevBuffer` term in `needsExcessClear`) to a STRUCTURAL invariant:
 * the wrong-order call site (the bug class km-silvery.ai-chat-incremental-mismatch
 * + fuzz nested seed=1337) is unrepresentable in the type system.
 *
 * Tracking: km-silvery.paint-clear-invariant.
 */

import { describe, expect, test } from "vitest"
import {
  type ExcessClearGate,
  requireExcessClearGate,
} from "@silvery/ag-term/pipeline/render-phase"

describe("excess-clear gate — structural invariant for clearExcessArea", () => {
  // Sample layout used in second-pass-style preconditions.
  const samplePrev = { x: 0, y: 0, width: 5, height: 5 }

  test("first-pass with prev buffer → gate is granted", () => {
    const gate = requireExcessClearGate(
      /* bufferIsCloned */ true,
      /* layoutChanged */ true,
      /* prevLayout */ samplePrev,
      /* hasPrevBuffer */ true,
    )
    expect(gate).not.toBeNull()
    expect(gate?.prevLayout).toBe(samplePrev)
  })

  test("second-pass dispatch (hasPrevBuffer=false) → gate denied", () => {
    // This is the case the runtime guard at silvery 168b4989 protected:
    // a sticky/absolute/overlap-forced child rendering on top of fresh
    // first-pass sibling paints. clearExcessArea would corrupt those.
    const gate = requireExcessClearGate(
      /* bufferIsCloned */ true,
      /* layoutChanged */ true,
      /* prevLayout */ samplePrev,
      /* hasPrevBuffer */ false,
    )
    expect(gate).toBeNull()
  })

  test("fresh buffer (no clone) → gate denied", () => {
    const gate = requireExcessClearGate(false, true, samplePrev, true)
    expect(gate).toBeNull()
  })

  test("layout did not change → gate denied", () => {
    const gate = requireExcessClearGate(true, false, samplePrev, true)
    expect(gate).toBeNull()
  })

  test("no prevLayout (first render of a node) → gate denied", () => {
    const gate = requireExcessClearGate(true, true, null, true)
    expect(gate).toBeNull()
  })

  test("type-level: ExcessClearGate brand blocks literal construction", () => {
    // The brand symbol is `declare const ... unique symbol` — runtime-absent
    // AND required — so no object literal can satisfy the type. The only way
    // to a value of type ExcessClearGate is requireExcessClearGate, which
    // mints one with the owner-local cast; a foreign literal is a compile
    // error, not a cast.
    // @ts-expect-error — ExcessClearGate is branded; a literal cannot satisfy it.
    const literal: ExcessClearGate = { prevLayout: samplePrev }
    void literal
    // The factory grants a real, non-null gate when all four preconditions hold.
    const gate = requireExcessClearGate(true, true, samplePrev, true)
    expect(gate?.prevLayout).toBe(samplePrev)
  })

  test("type-level: requireExcessClearGate signature pins all four preconditions", () => {
    // @ts-expect-error — bufferIsCloned is required.
    requireExcessClearGate(undefined, true, samplePrev, true)

    // @ts-expect-error — layoutChanged is required.
    requireExcessClearGate(true, undefined, samplePrev, true)

    // @ts-expect-error — hasPrevBuffer is required.
    requireExcessClearGate(true, true, samplePrev, undefined)

    // prevLayout permits null/undefined (a fresh-mounted node has no prev),
    // so this overload is intentionally NOT a type error:
    requireExcessClearGate(true, true, null, true)
  })
})
