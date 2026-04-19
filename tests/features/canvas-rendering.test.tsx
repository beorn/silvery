/**
 * Canvas rendering tests.
 *
 * Tests the canvas rendering pipeline at the ag tree level — layout dimensions,
 * node rects, text measurement integration, and the getRoot() API.
 *
 * These tests use createRenderer (headless) to verify the ag tree structure
 * that the canvas adapter would consume. Canvas2D rendering itself requires
 * a browser environment (OffscreenCanvas) and is tested via the diagnostic
 * overlay (examples/web/canvas-debug.html).
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import React from "react"
import { Box, Text } from "silvery"
import type { AgNode, Rect } from "@silvery/ag"

/** Walk the ag tree and collect all nodes with their scrollrects. */
function collectRects(
  node: AgNode,
  acc: { type: string; rect: Rect | null; text?: string }[] = [],
) {
  acc.push({
    type: node.type,
    rect: node.scrollRect ?? node.boxRect,
    text: node.textContent,
  })
  for (const child of node.children) {
    collectRects(child, acc)
  }
  return acc
}

/** Find the first text node with matching content. */
function findText(node: AgNode, content: string): AgNode | null {
  if (node.type === "silvery-text" && node.textContent?.includes(content)) return node
  for (const child of node.children) {
    const found = findText(child, content)
    if (found) return found
  }
  return null
}

describe("canvas rendering pipeline", () => {
  describe("ag tree structure", () => {
    test("root node has children after render", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box>
          <Text>Hello</Text>
        </Box>,
      )
      const root = app.getContainer()
      expect(root).toBeDefined()
      expect(root.children.length).toBeGreaterThan(0)
    })

    test("text nodes have textContent", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(<Text>Hello World</Text>)
      const textNode = findText(app.getContainer(), "Hello World")
      expect(textNode).not.toBeNull()
      expect(textNode!.textContent).toBe("Hello World")
    })

    test("nested boxes have scrollrects", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box flexDirection="column">
          <Box height={3}>
            <Text>Top</Text>
          </Box>
          <Box height={5}>
            <Text>Bottom</Text>
          </Box>
        </Box>,
      )

      const topText = findText(app.getContainer(), "Top")
      const bottomText = findText(app.getContainer(), "Bottom")
      expect(topText).not.toBeNull()
      expect(bottomText).not.toBeNull()

      // Top box should be at y=0, bottom box below it
      const topRect = topText!.parent?.scrollRect
      const bottomRect = bottomText!.parent?.scrollRect
      expect(topRect).toBeDefined()
      expect(bottomRect).toBeDefined()
      expect(topRect!.y).toBe(0)
      expect(bottomRect!.y).toBe(3)
    })

    test("padding affects content positioning", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box paddingLeft={4} paddingTop={2}>
          <Text>Padded</Text>
        </Box>,
      )
      const textNode = findText(app.getContainer(), "Padded")
      expect(textNode).not.toBeNull()
      const rect = textNode!.scrollRect ?? textNode!.boxRect
      expect(rect).toBeDefined()
      // Text should be offset by padding
      expect(rect!.x).toBe(4)
      expect(rect!.y).toBe(2)
    })

    test("border adds layout space in terminal mode", () => {
      const render = createRenderer({ cols: 40, rows: 10 })
      const app = render(
        <Box borderStyle="single">
          <Text>Bordered</Text>
        </Box>,
      )
      const textNode = findText(app.getContainer(), "Bordered")
      expect(textNode).not.toBeNull()
      const rect = textNode!.scrollRect ?? textNode!.boxRect
      expect(rect).toBeDefined()
      // Border takes 1 cell on each side
      expect(rect!.x).toBe(1)
      expect(rect!.y).toBe(1)
    })
  })

  describe("layout dimensions", () => {
    test("fixed-size box has correct dimensions", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(<Box width={20} height={5} />)

      const rects = collectRects(app.getContainer())
      const boxRect = rects.find((r) => r.type === "silvery-box" && r.rect)
      expect(boxRect).toBeDefined()
      expect(boxRect!.rect!.width).toBe(20)
      expect(boxRect!.rect!.height).toBe(5)
    })

    test("flex column children stack vertically", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box flexDirection="column">
          <Text>Line A</Text>
          <Text>Line B</Text>
          <Text>Line C</Text>
        </Box>,
      )

      const a = findText(app.getContainer(), "Line A")
      const b = findText(app.getContainer(), "Line B")
      const c = findText(app.getContainer(), "Line C")
      expect(a?.scrollRect?.y).toBeLessThan(b?.scrollRect?.y ?? 0)
      expect(b?.scrollRect?.y).toBeLessThan(c?.scrollRect?.y ?? 0)
    })

    test("maxWidth constrains box width", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box maxWidth={30}>
          <Text wrap="wrap">
            This is a long text that should wrap within the max width constraint of thirty columns
          </Text>
        </Box>,
      )

      const rects = collectRects(app.getContainer())
      const boxRect = rects.find((r) => r.type === "silvery-box" && r.rect)
      expect(boxRect).toBeDefined()
      expect(boxRect!.rect!.width).toBeLessThanOrEqual(30)
    })
  })

  describe("text wrapping", () => {
    test("text wraps at container boundary", () => {
      const render = createRenderer({ cols: 20, rows: 10 })
      const app = render(
        <Box width={20}>
          <Text wrap="wrap">Hello World this is a long text</Text>
        </Box>,
      )

      // Should produce multiple lines
      const lines = app.text.split("\n").filter((l) => l.trim())
      expect(lines.length).toBeGreaterThan(1)
    })

    test("nowrap text does not wrap", () => {
      const render = createRenderer({ cols: 20, rows: 10 })
      const app = render(
        <Box width={20}>
          <Text>Short</Text>
        </Box>,
      )

      expect(app.text).toContain("Short")
      // Only uses one line
      const contentLines = app.text.split("\n").filter((l) => l.includes("Short"))
      expect(contentLines.length).toBe(1)
    })
  })

  describe("tree walking utilities", () => {
    test("findText finds nested text", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box>
          <Box>
            <Box>
              <Text>Deep</Text>
            </Box>
          </Box>
        </Box>,
      )
      const node = findText(app.getContainer(), "Deep")
      expect(node).not.toBeNull()
      expect(node!.textContent).toBe("Deep")
    })

    test("collectRects returns all nodes", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box flexDirection="column">
          <Text>A</Text>
          <Text>B</Text>
        </Box>,
      )
      const rects = collectRects(app.getContainer())
      // root + box + 2 text nodes (at minimum)
      expect(rects.length).toBeGreaterThanOrEqual(3)
    })

    test("parent references are correct", () => {
      const render = createRenderer({ cols: 80, rows: 24 })
      const app = render(
        <Box>
          <Text>Child</Text>
        </Box>,
      )
      const textNode = findText(app.getContainer(), "Child")
      expect(textNode).not.toBeNull()
      expect(textNode!.parent).not.toBeNull()
      // Parent is either a silvery-text (Text component wrapper) or silvery-box
      expect(["silvery-text", "silvery-box"]).toContain(textNode!.parent!.type)
    })
  })
})
