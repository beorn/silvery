/**
 * Tests for G8: node signals — textContent and focus as signals.
 *
 * Verifies that:
 * - textContent signal updates when text changes via React re-render
 * - focused signal updates when focus changes via FocusManager
 * - Signals are lazy — only allocated when getNodeSignals() is called
 * - Signal values track node state correctly through multiple updates
 */
import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { effect } from "@silvery/signals"
import { Box, Text } from "silvery"
import {
  getNodeSignals,
  hasNodeSignals,
  syncTextContentSignal,
  syncFocusedSignal,
} from "@silvery/ag/node-signals"
import type { AgNode } from "@silvery/ag/types"

describe("G8: node signals", () => {
  describe("textContent signal", () => {
    test("textContent signal reflects initial text", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>Hello</Text>
        </Box>,
      )

      // Find a text node with textContent
      const textNode = findTextNode(app.rootNode, "Hello")
      expect(textNode).toBeDefined()

      const signals = getNodeSignals(textNode!)
      expect(signals.textContent()).toBe("Hello")
    })

    test("textContent signal updates on re-render with new text", () => {
      const render = createRenderer({ cols: 40, rows: 5 })

      function App({ text }: { text: string }) {
        return (
          <Box>
            <Text>{text}</Text>
          </Box>
        )
      }

      const app = render(<App text="First" />)
      const textNode = findTextNode(app.rootNode, "First")
      expect(textNode).toBeDefined()

      // Access signal to trigger lazy allocation
      const signals = getNodeSignals(textNode!)
      expect(signals.textContent()).toBe("First")

      // Re-render with new text
      app.rerender(<App text="Second" />)
      expect(signals.textContent()).toBe("Second")
    })

    test("textContent signal triggers effect on change", () => {
      const render = createRenderer({ cols: 40, rows: 5 })

      function App({ text }: { text: string }) {
        return (
          <Box>
            <Text>{text}</Text>
          </Box>
        )
      }

      const app = render(<App text="Alpha" />)
      const textNode = findTextNode(app.rootNode, "Alpha")
      expect(textNode).toBeDefined()

      const signals = getNodeSignals(textNode!)
      const observed: (string | undefined)[] = []

      const dispose = effect(() => {
        observed.push(signals.textContent())
      })

      expect(observed).toEqual(["Alpha"])

      app.rerender(<App text="Beta" />)
      expect(observed).toEqual(["Alpha", "Beta"])

      app.rerender(<App text="Gamma" />)
      expect(observed).toEqual(["Alpha", "Beta", "Gamma"])

      dispose()
    })

    test("textContent signal is lazy — only allocated when requested", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>Lazy check</Text>
        </Box>,
      )

      const textNode = findTextNode(app.rootNode, "Lazy check")
      expect(textNode).toBeDefined()

      // Before calling getNodeSignals, no signals should exist
      expect(hasNodeSignals(textNode!)).toBe(false)

      // After calling getNodeSignals, signals should exist
      getNodeSignals(textNode!)
      expect(hasNodeSignals(textNode!)).toBe(true)
    })

    test("syncTextContentSignal is no-op when signals not allocated", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>No signal</Text>
        </Box>,
      )

      const textNode = findTextNode(app.rootNode, "No signal")
      expect(textNode).toBeDefined()
      expect(hasNodeSignals(textNode!)).toBe(false)

      // Should not throw — just a no-op
      syncTextContentSignal(textNode!)
      expect(hasNodeSignals(textNode!)).toBe(false)
    })

    test("textContent signal does not trigger effect when value unchanged", () => {
      const render = createRenderer({ cols: 40, rows: 5 })

      function App({ text, count }: { text: string; count: number }) {
        return (
          <Box>
            <Text>{text}</Text>
            <Text>{String(count)}</Text>
          </Box>
        )
      }

      const app = render(<App text="Stable" count={0} />)
      const textNode = findTextNode(app.rootNode, "Stable")
      expect(textNode).toBeDefined()

      const signals = getNodeSignals(textNode!)
      let effectCount = 0

      const dispose = effect(() => {
        signals.textContent()
        effectCount++
      })

      expect(effectCount).toBe(1) // initial run

      // Re-render with different count but same text — textContent signal unchanged
      app.rerender(<App text="Stable" count={1} />)
      expect(effectCount).toBe(1) // no extra effect run

      dispose()
    })
  })

  describe("focused signal", () => {
    test("syncFocusedSignal updates signal when focus changes", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>Focus target</Text>
        </Box>,
      )

      const textNode = findTextNode(app.rootNode, "Focus target")
      expect(textNode).toBeDefined()

      const signals = getNodeSignals(textNode!)
      expect(signals.focused()).toBe(false)

      // Simulate focus gain
      syncFocusedSignal(textNode!, true)
      expect(signals.focused()).toBe(true)

      // Simulate focus loss
      syncFocusedSignal(textNode!, false)
      expect(signals.focused()).toBe(false)
    })

    test("focused signal triggers effect on focus change", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>Focus effect</Text>
        </Box>,
      )

      const textNode = findTextNode(app.rootNode, "Focus effect")
      expect(textNode).toBeDefined()

      const signals = getNodeSignals(textNode!)
      const observed: boolean[] = []

      const dispose = effect(() => {
        observed.push(signals.focused())
      })

      expect(observed).toEqual([false])

      syncFocusedSignal(textNode!, true)
      expect(observed).toEqual([false, true])

      syncFocusedSignal(textNode!, false)
      expect(observed).toEqual([false, true, false])

      dispose()
    })

    test("syncFocusedSignal is no-op when signals not allocated", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>No focus signal</Text>
        </Box>,
      )

      const textNode = findTextNode(app.rootNode, "No focus signal")
      expect(textNode).toBeDefined()
      expect(hasNodeSignals(textNode!)).toBe(false)

      // Should not throw — just a no-op
      syncFocusedSignal(textNode!, true)
      expect(hasNodeSignals(textNode!)).toBe(false)
    })

    test("focused signal does not trigger effect when value unchanged", () => {
      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(
        <Box>
          <Text>Focus stable</Text>
        </Box>,
      )

      const textNode = findTextNode(app.rootNode, "Focus stable")
      expect(textNode).toBeDefined()

      const signals = getNodeSignals(textNode!)
      let effectCount = 0

      const dispose = effect(() => {
        signals.focused()
        effectCount++
      })

      expect(effectCount).toBe(1) // initial run

      // Set to false when already false — should not re-trigger
      syncFocusedSignal(textNode!, false)
      expect(effectCount).toBe(1)

      dispose()
    })
  })

  describe("signal isolation", () => {
    test("different nodes have independent signals", () => {
      const render = createRenderer({ cols: 40, rows: 5 })

      function App({ a, b }: { a: string; b: string }) {
        return (
          <Box>
            <Text>{a}</Text>
            <Text>{b}</Text>
          </Box>
        )
      }

      const app = render(<App a="NodeA" b="NodeB" />)
      const nodeA = findTextNode(app.rootNode, "NodeA")
      const nodeB = findTextNode(app.rootNode, "NodeB")
      expect(nodeA).toBeDefined()
      expect(nodeB).toBeDefined()

      const sigA = getNodeSignals(nodeA!)
      const sigB = getNodeSignals(nodeB!)

      expect(sigA.textContent()).toBe("NodeA")
      expect(sigB.textContent()).toBe("NodeB")

      app.rerender(<App a="ChangedA" b="NodeB" />)
      expect(sigA.textContent()).toBe("ChangedA")
      expect(sigB.textContent()).toBe("NodeB") // unchanged
    })
  })
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find the first raw text AgNode with the given textContent in the tree.
 * Raw text nodes have isRawText === true and textContent set.
 */
function findTextNode(root: AgNode, text: string): AgNode | undefined {
  if (root.isRawText && root.textContent === text) return root
  for (const child of root.children) {
    const found = findTextNode(child, text)
    if (found) return found
  }
  return undefined
}
