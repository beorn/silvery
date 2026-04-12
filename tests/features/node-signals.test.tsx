/**
 * Tests for G8: node signals — textContent and focus as signals.
 *
 * Verifies that:
 * - textContent signal updates via syncTextContentSignal
 * - focused signal updates via syncFocusedSignal
 * - Signals are lazy — only allocated when getLayoutSignals() is called
 * - Signal values track node state correctly through multiple updates
 * - Integration with FocusManager for focus signal wiring
 */
import { describe, test, expect } from "vitest"
import { effect } from "@silvery/signals"
import type { AgNode, BoxProps, TextProps } from "../../packages/ag/src/types"
import { INITIAL_EPOCH } from "../../packages/ag/src/epoch"
import {
  getLayoutSignals,
  hasLayoutSignals,
  syncTextContentSignal,
  syncFocusedSignal,
} from "../../packages/ag/src/layout-signals"
import { createFocusManager } from "../../packages/ag/src/focus-manager"

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal AgNode stub for testing. */
function stubNode(
  id: string,
  opts?: {
    children?: AgNode[]
    textContent?: string
    isRawText?: boolean
    focusable?: boolean
  },
): AgNode {
  const children = opts?.children ?? []
  const node: AgNode = {
    type: opts?.isRawText ? "silvery-text" : "silvery-box",
    props: { testID: id, focusable: opts?.focusable ?? false } as BoxProps,
    children,
    parent: null,
    layoutNode: {} as any,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    dirtyBits: 0,
    dirtyEpoch: INITIAL_EPOCH,
    textContent: opts?.textContent,
    isRawText: opts?.isRawText,
  }
  for (const child of children) {
    child.parent = node
  }
  return node
}

// ============================================================================
// Tests
// ============================================================================

describe("G8: node signals", () => {
  describe("textContent signal", () => {
    test("textContent signal reflects initial text", () => {
      const node = stubNode("t1", { textContent: "Hello", isRawText: true })
      const signals = getLayoutSignals(node)
      expect(signals.textContent()).toBe("Hello")
    })

    test("textContent signal updates via syncTextContentSignal", () => {
      const node = stubNode("t1", { textContent: "First", isRawText: true })
      const signals = getLayoutSignals(node)
      expect(signals.textContent()).toBe("First")

      // Simulate what commitTextUpdate does
      node.textContent = "Second"
      syncTextContentSignal(node)
      expect(signals.textContent()).toBe("Second")
    })

    test("textContent signal triggers effect on change", () => {
      const node = stubNode("t1", { textContent: "Alpha", isRawText: true })
      const signals = getLayoutSignals(node)
      const observed: (string | undefined)[] = []

      const dispose = effect(() => {
        observed.push(signals.textContent())
      })

      expect(observed).toEqual(["Alpha"])

      node.textContent = "Beta"
      syncTextContentSignal(node)
      expect(observed).toEqual(["Alpha", "Beta"])

      node.textContent = "Gamma"
      syncTextContentSignal(node)
      expect(observed).toEqual(["Alpha", "Beta", "Gamma"])

      dispose()
    })

    test("textContent signal is lazy — only allocated when requested", () => {
      const node = stubNode("t1", { textContent: "Lazy check", isRawText: true })

      // Before calling getLayoutSignals, no signals should exist
      expect(hasLayoutSignals(node)).toBe(false)

      // After calling getLayoutSignals, signals should exist
      getLayoutSignals(node)
      expect(hasLayoutSignals(node)).toBe(true)
    })

    test("syncTextContentSignal is no-op when signals not allocated", () => {
      const node = stubNode("t1", { textContent: "No signal", isRawText: true })
      expect(hasLayoutSignals(node)).toBe(false)

      // Should not throw — just a no-op
      syncTextContentSignal(node)
      expect(hasLayoutSignals(node)).toBe(false)
    })

    test("textContent signal does not trigger effect when value unchanged", () => {
      const node = stubNode("t1", { textContent: "Stable", isRawText: true })
      const signals = getLayoutSignals(node)
      let effectCount = 0

      const dispose = effect(() => {
        signals.textContent()
        effectCount++
      })

      expect(effectCount).toBe(1) // initial run

      // Sync with same value — should not re-trigger
      syncTextContentSignal(node)
      expect(effectCount).toBe(1)

      dispose()
    })

    test("textContent signal handles undefined initial value", () => {
      const node = stubNode("t1") // no textContent set
      const signals = getLayoutSignals(node)
      expect(signals.textContent()).toBeUndefined()

      node.textContent = "Now set"
      syncTextContentSignal(node)
      expect(signals.textContent()).toBe("Now set")
    })
  })

  describe("focused signal", () => {
    test("focused signal reflects initial state (unfocused)", () => {
      const node = stubNode("f1", { focusable: true })
      const signals = getLayoutSignals(node)
      expect(signals.focused()).toBe(false)
    })

    test("syncFocusedSignal updates signal when focus changes", () => {
      const node = stubNode("f1", { focusable: true })
      const signals = getLayoutSignals(node)
      expect(signals.focused()).toBe(false)

      // Simulate focus gain
      syncFocusedSignal(node, true)
      expect(signals.focused()).toBe(true)

      // Simulate focus loss
      syncFocusedSignal(node, false)
      expect(signals.focused()).toBe(false)
    })

    test("focused signal triggers effect on focus change", () => {
      const node = stubNode("f1", { focusable: true })
      const signals = getLayoutSignals(node)
      const observed: boolean[] = []

      const dispose = effect(() => {
        observed.push(signals.focused())
      })

      expect(observed).toEqual([false])

      syncFocusedSignal(node, true)
      expect(observed).toEqual([false, true])

      syncFocusedSignal(node, false)
      expect(observed).toEqual([false, true, false])

      dispose()
    })

    test("syncFocusedSignal is no-op when signals not allocated", () => {
      const node = stubNode("f1", { focusable: true })
      expect(hasLayoutSignals(node)).toBe(false)

      // Should not throw — just a no-op
      syncFocusedSignal(node, true)
      expect(hasLayoutSignals(node)).toBe(false)
    })

    test("focused signal does not trigger effect when value unchanged", () => {
      const node = stubNode("f1", { focusable: true })
      const signals = getLayoutSignals(node)
      let effectCount = 0

      const dispose = effect(() => {
        signals.focused()
        effectCount++
      })

      expect(effectCount).toBe(1) // initial run

      // Set to false when already false — should not re-trigger
      syncFocusedSignal(node, false)
      expect(effectCount).toBe(1)

      dispose()
    })

    test("focus manager wires syncFocusedSignal on focus change", () => {
      const nodeA = stubNode("a", { focusable: true })
      const nodeB = stubNode("b", { focusable: true })
      const root = stubNode("root", { children: [nodeA, nodeB] })

      const fm = createFocusManager()

      // Allocate signals before focus changes
      const sigA = getLayoutSignals(nodeA)
      const sigB = getLayoutSignals(nodeB)

      expect(sigA.focused()).toBe(false)
      expect(sigB.focused()).toBe(false)

      // Focus A
      fm.focus(nodeA, "programmatic")
      expect(sigA.focused()).toBe(true)
      expect(sigB.focused()).toBe(false)

      // Focus B — A should lose focus
      fm.focus(nodeB, "programmatic")
      expect(sigA.focused()).toBe(false)
      expect(sigB.focused()).toBe(true)

      // Blur
      fm.blur()
      expect(sigA.focused()).toBe(false)
      expect(sigB.focused()).toBe(false)
    })
  })

  describe("signal isolation", () => {
    test("different nodes have independent signals", () => {
      const nodeA = stubNode("a", { textContent: "NodeA", isRawText: true })
      const nodeB = stubNode("b", { textContent: "NodeB", isRawText: true })

      const sigA = getLayoutSignals(nodeA)
      const sigB = getLayoutSignals(nodeB)

      expect(sigA.textContent()).toBe("NodeA")
      expect(sigB.textContent()).toBe("NodeB")

      nodeA.textContent = "ChangedA"
      syncTextContentSignal(nodeA)

      expect(sigA.textContent()).toBe("ChangedA")
      expect(sigB.textContent()).toBe("NodeB") // unchanged
    })

    test("textContent and focused signals are independent on same node", () => {
      const node = stubNode("both", { textContent: "Hello", isRawText: true })
      const signals = getLayoutSignals(node)

      let textEffectCount = 0
      let focusEffectCount = 0

      const disposeText = effect(() => {
        signals.textContent()
        textEffectCount++
      })

      const disposeFocus = effect(() => {
        signals.focused()
        focusEffectCount++
      })

      expect(textEffectCount).toBe(1)
      expect(focusEffectCount).toBe(1)

      // Change text — only text effect should re-run
      node.textContent = "Changed"
      syncTextContentSignal(node)
      expect(textEffectCount).toBe(2)
      expect(focusEffectCount).toBe(1) // no change

      // Change focus — only focus effect should re-run
      syncFocusedSignal(node, true)
      expect(textEffectCount).toBe(2) // no change
      expect(focusEffectCount).toBe(2)

      disposeText()
      disposeFocus()
    })
  })
})
