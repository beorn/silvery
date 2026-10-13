/**
 * Rect Signals — regression tests for G9 move to @silvery/ag.
 *
 * Verifies that rect-signals are importable from the framework-agnostic
 * core (@silvery/ag) with no ag-term dependency.
 */

import { describe, test, expect } from "vitest"
import {
  getLayoutSignals,
  hasLayoutSignals,
  hasObservedLayoutSignal,
  markObservedLayoutSignal,
  observeLayoutSignal,
  syncRectSignals,
} from "@silvery/ag/layout-signals"
import type { AgNode, Rect } from "@silvery/ag/types"
import { fakeNode } from "../../packages/ag/tests/support/fake-node"

const RECT: Rect = { x: 0, y: 0, width: 10, height: 5 }

/** A node whose box/scroll/screen rects all carry the same value (the owner's fakeNode base). */
function nodeWithRects(rect: Rect = RECT): AgNode {
  return fakeNode({}, null, [], { boxRect: rect, scrollRect: rect, screenRect: rect })
}

describe("rect-signals (@silvery/ag)", () => {
  test("signals are created lazily on first getLayoutSignals call", () => {
    const node = nodeWithRects()

    // Before first access, no signals should exist
    expect(hasLayoutSignals(node)).toBe(false)

    // First access creates signals
    const signals = getLayoutSignals(node)
    expect(signals).toBeDefined()
    expect(hasLayoutSignals(node)).toBe(true)
  })

  test("getLayoutSignals returns same instance on repeated calls", () => {
    const node = nodeWithRects()
    const a = getLayoutSignals(node)
    const b = getLayoutSignals(node)
    expect(a).toBe(b)
  })

  test("signals initialize with node rect values", () => {
    const rect: Rect = { x: 5, y: 10, width: 20, height: 15 }
    const node = nodeWithRects(rect)

    const signals = getLayoutSignals(node)
    expect(signals.boxRect()).toBe(rect)
    expect(signals.scrollRect()).toBe(rect)
    expect(signals.screenRect()).toBe(rect)
  })

  test("syncRectSignals updates signal values from node rects", () => {
    const initialRect: Rect = { x: 0, y: 0, width: 10, height: 5 }
    const updatedRect: Rect = { x: 1, y: 2, width: 20, height: 10 }
    const node = nodeWithRects(initialRect)

    // Create signals (initializes from node)
    const signals = getLayoutSignals(node)
    expect(signals.boxRect()).toBe(initialRect)

    // Simulate layout phase updating node rects
    node.boxRect = updatedRect
    node.scrollRect = updatedRect
    node.screenRect = updatedRect

    // Sync propagates new values
    syncRectSignals(node)

    expect(signals.boxRect()).toBe(updatedRect)
    expect(signals.scrollRect()).toBe(updatedRect)
    expect(signals.screenRect()).toBe(updatedRect)
  })

  test("syncRectSignals is a no-op for nodes without signals", () => {
    const node = nodeWithRects()

    // Should not throw or create signals
    syncRectSignals(node)
    expect(hasLayoutSignals(node)).toBe(false)
  })

  test("different nodes get independent signal instances", () => {
    const node1 = nodeWithRects()
    const node2 = nodeWithRects()

    const signals1 = getLayoutSignals(node1)
    const signals2 = getLayoutSignals(node2)

    expect(signals1).not.toBe(signals2)

    // Updating one doesn't affect the other
    const newRect: Rect = { x: 99, y: 99, width: 1, height: 1 }
    node1.boxRect = newRect
    syncRectSignals(node1)

    expect(signals1.boxRect()).toBe(newRect)
    expect(signals2.boxRect()).not.toBe(newRect)
  })

  test("exports are available from @silvery/ag/layout-signals (no ag-term needed)", () => {
    // This test verifies the import path works — if it compiles and runs,
    // the move to @silvery/ag was successful.
    expect(typeof getLayoutSignals).toBe("function")
    expect(typeof hasLayoutSignals).toBe("function")
    expect(typeof syncRectSignals).toBe("function")
    expect(typeof observeLayoutSignal).toBe("function")
  })

  test("temporary observations release without clearing permanent observations", () => {
    const temporaryOnly = nodeWithRects()
    const releaseTemporary = observeLayoutSignal(temporaryOnly, "boxRect")
    expect(hasObservedLayoutSignal(temporaryOnly, "boxRect")).toBe(true)
    releaseTemporary()
    expect(hasObservedLayoutSignal(temporaryOnly, "boxRect")).toBe(false)

    const permanent = nodeWithRects()
    markObservedLayoutSignal(permanent, "boxRect")
    const releaseRetained = observeLayoutSignal(permanent, "boxRect")
    expect(hasObservedLayoutSignal(permanent, "boxRect")).toBe(true)
    releaseRetained()
    expect(hasObservedLayoutSignal(permanent, "boxRect")).toBe(true)
  })
})
