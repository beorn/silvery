/**
 * Pipeline Tests
 *
 * Tests for the render pipeline phases: measure, layout, content, output.
 */

import { beforeAll, describe, expect, test } from "vitest"
import { initYogaEngine } from "../src/adapters/yoga-adapter.js"
import { TerminalBuffer } from "../src/buffer.js"
import {
  type LayoutEngine,
  type LayoutNode,
  getConstants,
  getLayoutEngine,
  setLayoutEngine,
} from "../src/layout-engine.js"
import {
  type CellChange,
  contentPhase,
  executeRender,
  layoutPhase,
  measurePhase,
  outputPhase,
  screenRectPhase,
  scrollPhase,
  setBgConflictMode,
} from "../src/pipeline.js"
import { type BoxProps, type ComputedLayout, type TeaNode, type TextProps, rectEqual } from "../src/types.js"

// Initialize layout engine before tests run
let layoutEngine: LayoutEngine

beforeAll(async () => {
  layoutEngine = await initYogaEngine()
  setLayoutEngine(layoutEngine)
})

// ============================================================================
// Test Helpers
// ============================================================================

type Rect = { x: number; y: number; width: number; height: number }

/** Mark a node as clean (not needing re-render) with optional prevLayout sync */
function markNodeClean(node: TeaNode, syncPrevLayout = true): void {
  node.contentDirty = false
  node.paintDirty = false
  node.subtreeDirty = false
  if (syncPrevLayout && node.contentRect) {
    node.prevLayout = node.contentRect
  }
}

/** Mark a node as dirty (needing re-render) */
function markNodeDirty(node: TeaNode): void {
  node.contentDirty = true
  node.paintDirty = true
  node.subtreeDirty = true
  // Compute layoutChangedThisFrame from prevLayout vs contentRect (layout phase would do this)
  node.layoutChangedThisFrame = !rectEqual(node.prevLayout, node.contentRect)
}

/** Mark a node as having only dirty descendants (subtreeDirty but not contentDirty) */
function markSubtreeOnlyDirty(node: TeaNode, syncPrevLayout = true): void {
  node.contentDirty = false
  node.paintDirty = false
  node.subtreeDirty = true
  if (syncPrevLayout && node.contentRect) {
    node.prevLayout = node.contentRect
  }
}

/** Set layout on a node (contentRect) */
function setNodeLayout(node: TeaNode, layout: Rect): void {
  node.contentRect = layout
}

/** Helper to create mock HighteaNode */
async function createMockNode(
  type: TeaNode["type"],
  props: BoxProps | TextProps,
  children: TeaNode[] = [],
  textContent?: string,
): Promise<TeaNode> {
  const engine = getLayoutEngine()
  const c = getConstants()
  const layoutNode = engine.createNode()

  // Apply props to layout node
  if (type === "hightea-box" || type === "hightea-text") {
    const boxProps = props as BoxProps
    if (typeof boxProps.width === "number") layoutNode.setWidth(boxProps.width)
    if (typeof boxProps.height === "number") {
      layoutNode.setHeight(boxProps.height)
    }
    if (boxProps.flexDirection === "row") {
      layoutNode.setFlexDirection(c.FLEX_DIRECTION_ROW)
    }
    if (boxProps.flexDirection === "column") {
      layoutNode.setFlexDirection(c.FLEX_DIRECTION_COLUMN)
    }
    if (typeof boxProps.padding === "number") {
      layoutNode.setPadding(c.EDGE_ALL, boxProps.padding)
    }
  }

  const node: TeaNode = {
    type,
    props,
    children,
    parent: null,
    layoutNode,
    contentRect: null,
    screenRect: null,
    prevLayout: null,
    layoutDirty: true,
    contentDirty: true,
    paintDirty: true,
    subtreeDirty: true,
    layoutSubscribers: new Set(),
    isRawText: false,
    textContent,
  }

  // Link children
  for (let i = 0; i < children.length; i++) {
    children[i]!.parent = node
    if (children[i]!.layoutNode) {
      layoutNode.insertChild(children[i]!.layoutNode!, i)
    }
  }

  return node
}

/** Helper to create raw text node (no layout node) */
function createRawTextNode(text: string): TeaNode {
  return {
    type: "hightea-text",
    props: {},
    children: [],
    parent: null,
    layoutNode: null,
    contentRect: null,
    screenRect: null,
    prevLayout: null,
    layoutDirty: false,
    contentDirty: true,
    paintDirty: true,
    subtreeDirty: true,
    layoutSubscribers: new Set(),
    isRawText: true,
    textContent: text,
  }
}

/** Create a simple box with layout set */
async function createBoxWithLayout(props: BoxProps, layout: Rect, children: TeaNode[] = []): Promise<TeaNode> {
  const node = await createMockNode("hightea-box", props, children)
  setNodeLayout(node, layout)
  return node
}

/** Create a text node with layout set */
async function createTextWithLayout(text: string, layout: Rect, props: TextProps = {}): Promise<TeaNode> {
  const node = await createMockNode("hightea-text", props, [], text)
  setNodeLayout(node, layout)
  return node
}

/** Create N sequential box items (height 1 each, stacking vertically) */
async function createSequentialItems(count: number, width = 10, startY = 0): Promise<TeaNode[]> {
  const items: TeaNode[] = []
  for (let i = 0; i < count; i++) {
    const item = await createMockNode("hightea-box", { height: 1 })
    item.contentRect = { x: 0, y: startY + i, width, height: 1 }
    items.push(item)
  }
  return items
}

describe("Pipeline", () => {
  describe("rectEqual", () => {
    test("null equals null", () => {
      expect(rectEqual(null, null)).toBe(true)
    })

    test("null !== non-null", () => {
      const layout: ComputedLayout = { x: 0, y: 0, width: 10, height: 5 }
      expect(rectEqual(null, layout)).toBe(false)
      expect(rectEqual(layout, null)).toBe(false)
    })

    test("same layout equals", () => {
      const a: ComputedLayout = { x: 5, y: 10, width: 20, height: 15 }
      const b: ComputedLayout = { x: 5, y: 10, width: 20, height: 15 }
      expect(rectEqual(a, b)).toBe(true)
    })

    test.each([
      ["x", { x: 1, y: 0, width: 10, height: 5 }],
      ["y", { x: 0, y: 1, width: 10, height: 5 }],
      ["width", { x: 0, y: 0, width: 11, height: 5 }],
      ["height", { x: 0, y: 0, width: 10, height: 6 }],
    ] as const)("different %s not equal", (_field, b) => {
      const a: ComputedLayout = { x: 0, y: 0, width: 10, height: 5 }
      expect(rectEqual(a, b)).toBe(false)
    })
  })

  describe("measurePhase", () => {
    test("processes fit-content nodes", async () => {
      // Create a box with fit-content width containing text
      const textNode = await createMockNode("hightea-text", {}, [], "Hello")
      const root = await createMockNode("hightea-box", { width: "fit-content" as unknown as number }, [textNode])

      // Should not throw
      measurePhase(root)
    })

    test("skips nodes without layoutNode", async () => {
      const rawText = createRawTextNode("Hello")
      const root = await createMockNode("hightea-box", { width: 20, height: 5 }, [rawText])

      // Should not throw even though rawText has no layoutNode
      measurePhase(root)
    })
  })

  describe("layoutPhase", () => {
    test("calculates layout for root node", async () => {
      const root = await createMockNode("hightea-box", { width: 80, height: 24 })
      root.layoutDirty = true

      layoutPhase(root, 80, 24)

      expect(root.contentRect).not.toBeNull()
      expect(root.contentRect?.width).toBe(80)
      expect(root.contentRect?.height).toBe(24)
    })

    test("propagates layout to children", async () => {
      const child = await createMockNode("hightea-box", { width: 20, height: 5 })
      const root = await createMockNode("hightea-box", { width: 80, height: 24 }, [child])
      root.layoutDirty = true

      layoutPhase(root, 80, 24)

      expect(child.contentRect).not.toBeNull()
      expect(child.contentRect?.width).toBe(20)
    })

    test("skips when no dirty nodes", async () => {
      const root = await createMockNode("hightea-box", { width: 80, height: 24 })
      root.layoutDirty = false
      setNodeLayout(root, { x: 0, y: 0, width: 80, height: 24 })

      // Should return early without recalculating
      layoutPhase(root, 100, 50)

      // Layout unchanged
      expect(root.contentRect?.width).toBe(80)
    })

    test("handles virtual text nodes (no layoutNode)", async () => {
      const rawText = createRawTextNode("Hello")
      const root = await createMockNode("hightea-box", { width: 80, height: 24 }, [rawText])
      root.layoutDirty = true

      layoutPhase(root, 80, 24)

      // Virtual text inherits parent position
      expect(rawText.contentRect).not.toBeNull()
    })
  })

  describe("contentPhase", () => {
    test("returns buffer with correct dimensions", async () => {
      const root = await createMockNode("hightea-box", { width: 40, height: 10 })
      setNodeLayout(root, { x: 0, y: 0, width: 40, height: 10 })

      const buffer = contentPhase(root)

      expect(buffer.width).toBe(40)
      expect(buffer.height).toBe(10)
    })

    test("throws if layout not computed", async () => {
      const root = await createMockNode("hightea-box", { width: 40, height: 10 })
      // contentRect left as null to test error case

      expect(() => contentPhase(root)).toThrow("contentPhase called before layout phase")
    })

    test("renders text content", async () => {
      const textNode = await createMockNode("hightea-text", { color: "red" }, [], "Hello")
      setNodeLayout(textNode, { x: 0, y: 0, width: 10, height: 1 })

      const root = await createMockNode("hightea-box", { width: 40, height: 10 }, [textNode])
      setNodeLayout(root, { x: 0, y: 0, width: 40, height: 10 })

      const buffer = contentPhase(root)

      expect(buffer.getCell(0, 0).char).toBe("H")
      expect(buffer.getCell(4, 0).char).toBe("o")
    })

    test("renders box with border", async () => {
      const root = await createMockNode("hightea-box", {
        width: 10,
        height: 3,
        borderStyle: "single",
      })
      root.contentRect = { x: 0, y: 0, width: 10, height: 3 }

      const buffer = contentPhase(root)

      // Top-left corner
      expect(buffer.getCell(0, 0).char).toBe("\u250c") // ┌
      // Top-right corner
      expect(buffer.getCell(9, 0).char).toBe("\u2510") // ┐
      // Bottom-left corner
      expect(buffer.getCell(0, 2).char).toBe("\u2514") // └
      // Horizontal border
      expect(buffer.getCell(1, 0).char).toBe("\u2500") // ─
    })
  })

  describe("contentPhase incremental rendering", () => {
    test("clones prevBuffer when dimensions match", async () => {
      const root = await createBoxWithLayout({ width: 40, height: 10 }, { x: 0, y: 0, width: 40, height: 10 })

      // First render
      const buffer1 = contentPhase(root)
      buffer1.setCell(5, 5, { char: "X" })

      // Clear dirty flags and set prevLayout to simulate stable state
      markNodeClean(root)

      // Second render with prevBuffer
      const buffer2 = contentPhase(root, buffer1)

      // Should have cloned the previous buffer content
      expect(buffer2.getCell(5, 5).char).toBe("X")
    })

    test("creates fresh buffer when dimensions differ", async () => {
      const { TerminalBuffer: TB } = await import("../src/buffer.js")

      const root = await createMockNode("hightea-box", { width: 40, height: 10 })
      setNodeLayout(root, { x: 0, y: 0, width: 40, height: 10 })

      // Create prevBuffer with different dimensions
      const prevBuffer = new TB(30, 8)
      prevBuffer.setCell(5, 5, { char: "Y" })

      // Render with mismatched prevBuffer - should create fresh buffer
      const buffer = contentPhase(root, prevBuffer)

      // Fresh buffer should have default empty cells
      expect(buffer.width).toBe(40)
      expect(buffer.height).toBe(10)
      expect(buffer.getCell(5, 5).char).toBe(" ")
    })

    test("skips clean subtrees when fast path is enabled", async () => {
      // Create a tree: root -> [child1, child2]
      const child1 = await createTextWithLayout("Child1", {
        x: 0,
        y: 0,
        width: 6,
        height: 1,
      })
      markNodeClean(child1, false)

      const child2 = await createTextWithLayout("Child2", {
        x: 0,
        y: 1,
        width: 6,
        height: 1,
      })
      // child2 stays dirty (default from creation)

      const root = await createBoxWithLayout({ width: 40, height: 10 }, { x: 0, y: 0, width: 40, height: 10 }, [
        child1,
        child2,
      ])
      root.subtreeDirty = true // Has dirty descendant

      // First render
      const buffer1 = contentPhase(root)

      // Modify child1's rendered area in buffer to track if it gets re-rendered
      buffer1.setCell(0, 0, { char: "Z" }) // Overwrite "C" from "Child1"

      // Mark root as having dirty descendant (child2 still dirty)
      markSubtreeOnlyDirty(root)
      markNodeClean(child1)

      // Second render - child1 is clean so it's SKIPPED (Z stays)
      const buffer2 = contentPhase(root, buffer1)

      // Child1 was SKIPPED (Z remains - clean node kept its cloned pixels)
      expect(buffer2.getCell(0, 0).char).toBe("Z")

      // Child2 was re-rendered (has its content)
      expect(buffer2.getCell(0, 1).char).toBe("C")
    })

    test("re-renders nodes when layout changed even if not contentDirty", async () => {
      const textNode = await createTextWithLayout("Text", {
        x: 0,
        y: 0,
        width: 4,
        height: 1,
      })

      const root = await createBoxWithLayout({ width: 40, height: 10 }, { x: 0, y: 0, width: 40, height: 10 }, [
        textNode,
      ])

      // First render
      const buffer1 = contentPhase(root)
      expect(buffer1.getCell(0, 0).char).toBe("T")

      // Mark text as not dirty but change its layout position
      markNodeClean(textNode)
      textNode.prevLayout = { x: 0, y: 0, width: 4, height: 1 } // Old position
      textNode.contentRect = { x: 5, y: 0, width: 4, height: 1 } // New position

      markSubtreeOnlyDirty(root, false)

      // Second render - should re-render at new position because layout changed
      const buffer2 = contentPhase(root, buffer1)

      // Text should now be at x=5
      expect(buffer2.getCell(5, 0).char).toBe("T")
    })

    test("subtreeDirty propagates to ancestors", async () => {
      // This test verifies that markSubtreeDirty works correctly
      const { hostConfig } = await import("../src/reconciler/host-config.js")
      const { createNode } = await import("../src/reconciler/nodes.js")

      const parent = createNode("hightea-box", {})
      const child = createNode("hightea-box", {})

      // Initially both have subtreeDirty = true from creation
      parent.subtreeDirty = false
      child.subtreeDirty = false

      // Append child to parent
      hostConfig.appendChild(parent, child)

      // Parent should now have subtreeDirty = true
      expect(parent.subtreeDirty).toBe(true)

      // Clean up
      child.layoutNode?.free()
      parent.layoutNode?.free()
    })

    test("clears stale bg pixels when box becomes contentDirty without backgroundColor", async () => {
      // Simulate the scenario that causes visual corruption:
      // 1. First render: a box has backgroundColor (fills region with color)
      // 2. Second render: box is contentDirty (e.g., backgroundColor removed or children changed)
      //    Without clearing, stale colored pixels from clone bleed through

      const child = await createBoxWithLayout({ width: 10, height: 3, backgroundColor: "blue" } as BoxProps, {
        x: 2,
        y: 1,
        width: 10,
        height: 3,
      })
      child.prevLayout = child.contentRect

      const root = await createBoxWithLayout({ width: 20, height: 5 }, { x: 0, y: 0, width: 20, height: 5 }, [child])

      // First render - child has backgroundColor='blue', fills its region
      const buffer1 = contentPhase(root)

      // Verify the blue background was painted
      const cellBefore = buffer1.getCell(5, 2)
      expect(cellBefore.bg).not.toBeNull() // Should have blue bg

      // Now simulate: backgroundColor removed, child is contentDirty
      child.props = { width: 10, height: 3 } as BoxProps // No backgroundColor
      markNodeDirty(child)
      child.prevLayout = child.contentRect // Layout unchanged

      markSubtreeOnlyDirty(root)

      // Second render with prevBuffer - should clear child's region
      const buffer2 = contentPhase(root, buffer1)

      // The stale blue background should be gone (cleared to space with no bg)
      const cellAfter = buffer2.getCell(5, 2)
      expect(cellAfter.bg).toBeNull() // No more blue bg artifact
      expect(cellAfter.char).toBe(" ") // Cleared to space
    })

    test("clears stale pixels when box layout changes (moved/resized)", async () => {
      // When a box moves, its old position in the cloned buffer has stale content
      // The new position should be cleared before re-rendering

      const child = await createBoxWithLayout({ width: 5, height: 2 } as BoxProps, {
        x: 0,
        y: 0,
        width: 5,
        height: 2,
      })

      const root = await createBoxWithLayout({ width: 20, height: 5 }, { x: 0, y: 0, width: 20, height: 5 }, [child])

      // First render
      const buffer1 = contentPhase(root)

      // Simulate layout change: child moved from y=0 to y=2
      child.prevLayout = { x: 0, y: 0, width: 5, height: 2 }
      child.contentRect = { x: 0, y: 2, width: 5, height: 2 }
      markNodeClean(child, false) // Not content-dirty, but layout changed

      markSubtreeOnlyDirty(root)

      // Second render - should detect layout change and clear new region
      const buffer2 = contentPhase(root, buffer1)

      // The new region (y=2) should be cleared (not have stale content from clone)
      const cell = buffer2.getCell(0, 2)
      expect(cell.char).toBe(" ")
    })

    test("shrinking node clears stale pixels in old bounds (Bug 3: km-hightea-stale)", async () => {
      // When a node shrinks (gets narrower or shorter), the old excess area
      // in the cloned buffer has stale pixels that must be cleared.

      const child = await createBoxWithLayout({ width: 10, height: 4, backgroundColor: "blue" } as BoxProps, {
        x: 2,
        y: 1,
        width: 10,
        height: 4,
      })
      child.prevLayout = child.contentRect

      const root = await createBoxWithLayout({ width: 20, height: 8 }, { x: 0, y: 0, width: 20, height: 8 }, [child])

      // First render - child is 10x4 with blue bg
      const buffer1 = contentPhase(root)

      // Verify blue bg fills the 10x4 region
      expect(buffer1.getCell(5, 2).bg).not.toBeNull() // inside child
      expect(buffer1.getCell(11, 2).bg).not.toBeNull() // right edge of child
      expect(buffer1.getCell(5, 4).bg).not.toBeNull() // bottom area of child

      // Now shrink: child goes from 10x4 to 6x2
      child.props = { width: 6, height: 2 } as BoxProps // No more blue bg
      child.prevLayout = { x: 2, y: 1, width: 10, height: 4 } // Old size
      child.contentRect = { x: 2, y: 1, width: 6, height: 2 } // New size
      markNodeDirty(child)

      markSubtreeOnlyDirty(root)

      // Second render with prevBuffer
      const buffer2 = contentPhase(root, buffer1)

      // Right margin: old x=8..11 (x=2+6 to x=2+10) should be cleared
      expect(buffer2.getCell(9, 1).bg).toBeNull() // was blue, now cleared
      expect(buffer2.getCell(11, 1).bg).toBeNull() // was blue, now cleared

      // Bottom margin: old y=3..4 should be cleared
      expect(buffer2.getCell(5, 3).bg).toBeNull() // was blue, now cleared
      expect(buffer2.getCell(5, 4).bg).toBeNull() // was blue, now cleared
    })

    test("parent bg inherited when clearing child (Bug 1: km-hightea-stale)", async () => {
      // When parent Box has backgroundColor and child Text has no bg,
      // clearing the child region should use the parent's bg, not null.

      const textChild = await createTextWithLayout("Title", {
        x: 0,
        y: 0,
        width: 5,
        height: 1,
      })

      const parentBox = await createBoxWithLayout(
        { width: 20, height: 3, backgroundColor: "white" } as BoxProps,
        { x: 0, y: 0, width: 20, height: 3 },
        [textChild],
      )

      const root = await createBoxWithLayout({ width: 20, height: 3 }, { x: 0, y: 0, width: 20, height: 3 }, [
        parentBox,
      ])

      // First render
      const buffer1 = contentPhase(root)
      // Parent box fills with white bg (7)
      expect(buffer1.getCell(0, 0).bg).toBe(7)

      // Simulate content change on textChild (e.g., style changed)
      markNodeDirty(textChild)
      textChild.prevLayout = textChild.contentRect // No layout change

      markSubtreeOnlyDirty(parentBox)
      markSubtreeOnlyDirty(root)

      // Second render - textChild clearing should use inherited white bg
      const buffer2 = contentPhase(root, buffer1)

      // The text area should have white bg (from parent), not null/black
      expect(buffer2.getCell(0, 0).bg).toBe(7)
    })

    test("scroll container with colored children clears stale bg on scroll", async () => {
      // Simulates the cards-view scenario: scroll container with colored box children.
      // After scrolling, children move to new screen positions. The cloned buffer
      // has colored pixels at old positions - these must not bleed through.

      // Create colored card-like boxes
      const card1 = await createBoxWithLayout({ width: 8, height: 2, backgroundColor: "blue" } as BoxProps, {
        x: 1,
        y: 0,
        width: 8,
        height: 2,
      })
      const card2 = await createBoxWithLayout({ width: 8, height: 2, backgroundColor: "green" } as BoxProps, {
        x: 1,
        y: 2,
        width: 8,
        height: 2,
      })
      const card3 = await createBoxWithLayout({ width: 8, height: 2, backgroundColor: "red" } as BoxProps, {
        x: 1,
        y: 4,
        width: 8,
        height: 2,
      })

      // Scroll container: viewport of 4 rows, content of 6 rows
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 4, width: 10 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 4 },
        [card1, card2, card3],
      )
      scrollContainer.scrollState = {
        offset: 0,
        contentHeight: 6,
        viewportHeight: 4,
        firstVisibleChild: 0,
        lastVisibleChild: 1,
        hiddenAbove: 0,
        hiddenBelow: 1,
      }

      const root = await createBoxWithLayout({ width: 10, height: 4 }, { x: 0, y: 0, width: 10, height: 4 }, [
        scrollContainer,
      ])

      // First render: card1 (blue) at y=0-1, card2 (green) at y=2-3
      const buffer1 = contentPhase(root)

      // Verify colored backgrounds were painted
      expect(buffer1.getCell(2, 0).bg).not.toBeNull() // card1 blue
      expect(buffer1.getCell(2, 2).bg).not.toBeNull() // card2 green

      // Now simulate scrolling down by 2 rows
      scrollContainer.scrollState = {
        offset: 2,
        contentHeight: 6,
        viewportHeight: 4,
        firstVisibleChild: 1,
        lastVisibleChild: 2,
        hiddenAbove: 1,
        hiddenBelow: 0,
      }

      // Mark scroll container as having subtree changes
      markSubtreeOnlyDirty(root)
      markNodeDirty(scrollContainer) // scrollState changed
      scrollContainer.prevLayout = scrollContainer.contentRect

      // Children are clean (their content didn't change, but positions will shift)
      markNodeClean(card1)
      markNodeClean(card2)
      markNodeClean(card3)

      // Second render with prevBuffer - scroll container forces child re-render
      const buffer2 = contentPhase(root, buffer1)

      // card2 (green) should now be at y=0-1 (was at y=2-3)
      expect(buffer2.getCell(2, 0).bg).not.toBeNull() // card2's green bg
      expect(buffer2.getCell(2, 1).bg).not.toBeNull() // card2's green bg

      // card3 (red) should be at y=2-3
      expect(buffer2.getCell(2, 2).bg).not.toBeNull() // card3's red bg
      expect(buffer2.getCell(2, 3).bg).not.toBeNull() // card3's red bg

      // CRITICAL: card1's old blue pixels at y=0-1 should NOT bleed through.
      // The scroll container clears its region and re-renders children at new positions.
      // card2 should be at y=0 now, not card1's stale blue.
    })

    test("cursor highlight cleared when moving between cards in scroll container", async () => {
      // Exact reproduction of the cards-view bug:
      // 1. Card A has cursor -> backgroundColor='yellow'
      // 2. Cursor moves to Card B -> Card A loses backgroundColor, Card B gets it
      // 3. On cloned buffer, Card A's old yellow pixels must be cleared

      // Card A: initially selected (yellow background)
      const cardA = await createBoxWithLayout({ width: 8, height: 2, backgroundColor: "yellow" } as BoxProps, {
        x: 1,
        y: 0,
        width: 8,
        height: 2,
      })

      // Card B: initially not selected (no background)
      const cardB = await createBoxWithLayout({ width: 8, height: 2 } as BoxProps, {
        x: 1,
        y: 2,
        width: 8,
        height: 2,
      })

      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 4, width: 10 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 4 },
        [cardA, cardB],
      )
      scrollContainer.scrollState = {
        offset: 0,
        contentHeight: 4,
        viewportHeight: 4,
        firstVisibleChild: 0,
        lastVisibleChild: 1,
        hiddenAbove: 0,
        hiddenBelow: 0,
      }

      const root = await createBoxWithLayout({ width: 10, height: 4 }, { x: 0, y: 0, width: 10, height: 4 }, [
        scrollContainer,
      ])

      // First render: Card A has yellow background
      const buffer1 = contentPhase(root)
      expect(buffer1.getCell(2, 0).bg).not.toBeNull() // Card A's yellow
      expect(buffer1.getCell(2, 2).bg).toBeNull() // Card B has no bg

      // Cursor moves: Card A loses yellow, Card B gains yellow
      cardA.props = { width: 8, height: 2 } as BoxProps // No backgroundColor
      markNodeDirty(cardA)
      cardA.prevLayout = cardA.contentRect

      cardB.props = {
        width: 8,
        height: 2,
        backgroundColor: "yellow",
      } as BoxProps
      markNodeDirty(cardB)
      cardB.prevLayout = cardB.contentRect

      // Scroll container: subtreeDirty (children changed) but NOT contentDirty
      // (no scroll position change - both cards are visible)
      markSubtreeOnlyDirty(scrollContainer)
      markSubtreeOnlyDirty(root)

      // Second render with prevBuffer
      const buffer2 = contentPhase(root, buffer1)

      // CRITICAL: Card A's yellow must be gone (no stale cursor highlight)
      expect(buffer2.getCell(2, 0).bg).toBeNull()
      expect(buffer2.getCell(2, 1).bg).toBeNull()

      // Card B should now have yellow
      expect(buffer2.getCell(2, 2).bg).not.toBeNull()
      expect(buffer2.getCell(2, 3).bg).not.toBeNull()
    })

    test("scroll container children always re-render even with hasPrevBuffer", async () => {
      // Create a scroll container with children
      const child1 = await createTextWithLayout("A", {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      })
      const child2 = await createTextWithLayout("B", {
        x: 0,
        y: 1,
        width: 1,
        height: 1,
      })

      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 2 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 2 },
        [child1, child2],
      )
      scrollContainer.scrollState = {
        offset: 0,
        contentHeight: 2,
        viewportHeight: 2,
        firstVisibleChild: 0,
        lastVisibleChild: 1,
        hiddenAbove: 0,
        hiddenBelow: 0,
      }

      const root = await createBoxWithLayout({ width: 10, height: 2 }, { x: 0, y: 0, width: 10, height: 2 }, [
        scrollContainer,
      ])

      // First render
      const buffer1 = contentPhase(root)
      expect(buffer1.getCell(0, 0).char).toBe("A")
      expect(buffer1.getCell(0, 1).char).toBe("B")

      // Mark all as clean
      markNodeClean(root, false)
      markNodeClean(scrollContainer, false)
      markNodeClean(child1, false)
      markNodeClean(child2, false)

      // Modify the buffer to test if children re-render (they should, because
      // scroll container children always re-render to handle scroll offset changes)
      buffer1.setCell(0, 0, { char: "X" })
      buffer1.setCell(0, 1, { char: "Y" })

      // Mark scroll container as having dirty children (to trigger traversal)
      root.subtreeDirty = true
      scrollContainer.subtreeDirty = true

      // Second render with prevBuffer
      const buffer2 = contentPhase(root, buffer1)

      // Children of scroll container should be re-rendered, overwriting X and Y
      expect(buffer2.getCell(0, 0).char).toBe("A")
      expect(buffer2.getCell(0, 1).char).toBe("B")
    })
  })

  describe("scrollPhase", () => {
    test("calculates scroll state for overflow=scroll containers", async () => {
      const children = await createSequentialItems(3)

      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 2 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 2 },
        children,
      )

      scrollPhase(scrollContainer)

      expect(scrollContainer.scrollState).toBeDefined()
      expect(scrollContainer.scrollState?.viewportHeight).toBe(2)
      expect(scrollContainer.scrollState?.contentHeight).toBe(3)
      expect(scrollContainer.scrollState?.firstVisibleChild).toBe(0)
      expect(scrollContainer.scrollState?.lastVisibleChild).toBe(1)
      expect(scrollContainer.scrollState?.hiddenBelow).toBe(1)
    })

    test("skips non-scroll containers", async () => {
      const container = await createBoxWithLayout({ overflow: "hidden" } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 5,
      })

      scrollPhase(container)

      expect(container.scrollState).toBeUndefined()
    })

    test("identifies sticky children for rendering", async () => {
      // Create a header (sticky) and some content
      const stickyHeader = await createBoxWithLayout({ height: 1, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 1,
      })
      const items = await createSequentialItems(3, 10, 1) // 3 items starting at y=1

      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 3, scrollTo: 2 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 3 },
        [stickyHeader, ...items],
      )

      scrollPhase(scrollContainer)

      expect(scrollContainer.scrollState).toBeDefined()
      expect(scrollContainer.scrollState?.stickyChildren).toBeDefined()
      expect(scrollContainer.scrollState?.stickyChildren?.length).toBe(1)
      expect(scrollContainer.scrollState?.stickyChildren?.[0]?.index).toBe(0)
    })

    test("calculates sticky-top render offset when scrolled past header", async () => {
      // Header at natural position 0, sticks to top when scrolled
      const stickyHeader = await createBoxWithLayout({ height: 1, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 1,
      })
      // Many items below it
      const items = await createSequentialItems(10, 10, 1)

      // Viewport of 5 rows, scroll to item 5 (near bottom)
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 5 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        [stickyHeader, ...items],
      )

      scrollPhase(scrollContainer)

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0]
      expect(sticky).toBeDefined()
      // When scrolled down, header should render at top (offset 0)
      expect(sticky?.renderOffset).toBe(0)
    })

    test("sticky header at natural position when not scrolled", async () => {
      // Header at natural position 0
      const stickyHeader = await createBoxWithLayout({ height: 1, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 1,
      })
      const items = await createSequentialItems(1, 10, 1)

      // Viewport of 5 rows, no scroll (scrollTo first item)
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 0 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        [stickyHeader, ...items],
      )

      scrollPhase(scrollContainer)

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0]
      expect(sticky).toBeDefined()
      // When not scrolled, header should be at its natural position (offset 0)
      expect(sticky?.renderOffset).toBe(0)
    })

    test("sticky children are always considered visible", async () => {
      // Header at position 0
      const stickyHeader = await createBoxWithLayout({ height: 1, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 1,
      })
      // 20 items below it
      const items = await createSequentialItems(20, 10, 1)

      // Scroll to bottom (item 18)
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 18 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        [stickyHeader, ...items],
      )

      scrollPhase(scrollContainer)

      // Even when scrolled to bottom, sticky header should be considered "visible"
      // firstVisibleChild should include index 0 (the sticky header)
      expect(scrollContainer.scrollState?.firstVisibleChild).toBe(0)
    })

    test("sticky child taller than viewport scrolls to show bottom when scrolled far", async () => {
      // Sticky child with height 8 in a viewport of 5
      // When scrolled past, the child should progressively reveal its bottom
      const stickyPanel = await createBoxWithLayout({ height: 8, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 8,
      })
      // Content items below the sticky panel (starting at y=8)
      const items = await createSequentialItems(20, 10, 8)

      // Viewport of 5, scroll to item near the end
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 20 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        [stickyPanel, ...items],
      )

      scrollPhase(scrollContainer)

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0]
      expect(sticky).toBeDefined()

      // childHeight(8) > viewportHeight(5), so when scrolled far:
      // renderOffset should be negative to show the bottom of the child
      // minimum renderOffset = viewportHeight - childHeight = 5 - 8 = -3
      expect(sticky?.renderOffset).toBe(-3)
    })

    test("sticky child taller than viewport starts at top when not scrolled past", async () => {
      // Sticky child with height 8 placed at y=1, in a viewport of 5
      const item0 = await createBoxWithLayout({ height: 1 }, { x: 0, y: 0, width: 10, height: 1 })
      const stickyPanel = await createBoxWithLayout({ height: 8, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 1,
        width: 10,
        height: 8,
      })
      // Content items below the sticky panel (starting at y=9)
      const moreItems = await createSequentialItems(19, 10, 9)

      // Viewport of 5, scrollTo item0 (no scroll needed, already visible)
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 0 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        [item0, stickyPanel, ...moreItems],
      )

      scrollPhase(scrollContainer)

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0]
      expect(sticky).toBeDefined()

      // scrollOffset=0, naturalRenderY = 1 - 0 = 1 (hasn't reached stick point)
      // Child shows at natural position: renderOffset = 1
      expect(sticky?.renderOffset).toBe(1)
    })

    test("sticky child taller than viewport has proportional offset at mid-scroll", async () => {
      // Sticky child with height 8 in a viewport of 5
      // The child overflows by 3 rows (8 - 5 = 3)
      const stickyPanel = await createBoxWithLayout({ height: 8, position: "sticky", stickyTop: 0 } as BoxProps, {
        x: 0,
        y: 0,
        width: 10,
        height: 8,
      })
      // Content items below the sticky panel (starting at y=8)
      const items = await createSequentialItems(20, 10, 8)

      // Viewport of 5, scroll just a bit past the sticky child's natural position
      // naturalRenderY = 0 - scrollOffset. When scrollOffset = 1, naturalRenderY = -1.
      // For sticky-top with tall child: renderOffset = max(viewportH - childH, naturalRenderY)
      //   = max(5 - 8, -1) = max(-3, -1) = -1
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 1 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        [stickyPanel, ...items],
      )

      scrollPhase(scrollContainer)

      const sticky = scrollContainer.scrollState?.stickyChildren?.[0]
      expect(sticky).toBeDefined()

      // scrollOffset should be enough to see item 1 (at content y=8)
      // scrollOffset = 8 - 5 = 4 (to show item at y=8 at bottom of viewport)
      // Actually scrollTo=1 means child index 1, which is at y=8, height 1.
      // To make it visible in viewport of 5, scrollOffset = max(0, 8+1-5) = 4
      // naturalRenderY = 0 - 4 = -4
      // renderOffset = max(5-8, -4) = max(-3, -4) = -3
      expect(sticky?.renderOffset).toBe(-3)
    })

    test("overflowIndicator renders indicators for borderless containers", async () => {
      const items = await createSequentialItems(10)

      // Borderless container with overflowIndicator, scrolled to middle
      const scrollContainer = await createBoxWithLayout(
        {
          overflow: "scroll",
          height: 5,
          scrollTo: 5,
          overflowIndicator: true,
        } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        items,
      )

      scrollPhase(scrollContainer)

      // Should have hidden items above and below
      expect(scrollContainer.scrollState?.hiddenAbove).toBeGreaterThan(0)
      expect(scrollContainer.scrollState?.hiddenBelow).toBeGreaterThan(0)

      // Render content phase and check for indicator characters
      const buffer = contentPhase(scrollContainer)

      // Check for indicator characters in buffer
      const hasChar = (char: string, row: number) => {
        for (let x = 0; x < 10; x++) {
          if (buffer.getCell(x, row).char === char) return true
        }
        return false
      }
      expect(hasChar("▲", 0)).toBe(true) // Top indicator
      expect(hasChar("▼", 4)).toBe(true) // Bottom indicator
    })

    test("no indicators without overflowIndicator prop for borderless", async () => {
      const items = await createSequentialItems(10)

      // Borderless container WITHOUT overflowIndicator, scrolled to middle
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 5, scrollTo: 5 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 5 },
        items,
      )

      scrollPhase(scrollContainer)

      const buffer = contentPhase(scrollContainer)

      // Should NOT have indicator characters anywhere
      const hasIndicator = () => {
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 10; x++) {
            const char = buffer.getCell(x, y).char
            if (char === "▲" || char === "▼") return true
          }
        }
        return false
      }
      expect(hasIndicator()).toBe(false)
    })
  })

  describe("screenRectPhase", () => {
    test("computes screen positions accounting for scroll offset", async () => {
      // Create a child at content y=10
      const child = await createBoxWithLayout({ height: 3 }, { x: 0, y: 10, width: 10, height: 3 })

      // Create a scroll container scrolled down by 5
      const scrollContainer = await createBoxWithLayout(
        { overflow: "scroll", height: 10, scrollTo: 1 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 10 },
        [child],
      )

      // Run scroll phase to set scrollState.offset
      scrollPhase(scrollContainer)
      const scrollOffset = scrollContainer.scrollState?.offset ?? 0

      // Run screen rect phase
      screenRectPhase(scrollContainer)

      // Container screen position equals content position (no parent scroll)
      expect(scrollContainer.screenRect).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      })

      // Child screen position = content position - scroll offset
      expect(child.screenRect).toEqual({
        x: 0,
        y: 10 - scrollOffset,
        width: 10,
        height: 3,
      })
    })

    test("accumulates scroll offsets from nested containers", async () => {
      // Inner child at content y=20
      const innerChild = await createBoxWithLayout({ height: 2 }, { x: 0, y: 20, width: 10, height: 2 })

      // Inner scroll container scrolled by 5
      const innerScroll = await createBoxWithLayout(
        { overflow: "scroll", height: 10 } as BoxProps,
        { x: 0, y: 5, width: 10, height: 10 },
        [innerChild],
      )
      innerScroll.scrollState = {
        offset: 5,
        contentHeight: 30,
        viewportHeight: 10,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      }

      // Outer scroll container scrolled by 3
      const outerScroll = await createBoxWithLayout(
        { overflow: "scroll", height: 15 } as BoxProps,
        { x: 0, y: 0, width: 10, height: 15 },
        [innerScroll],
      )
      outerScroll.scrollState = {
        offset: 3,
        contentHeight: 20,
        viewportHeight: 15,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      }

      // Run screen rect phase
      screenRectPhase(outerScroll)

      // Outer container: screen = content (no parent scroll)
      expect(outerScroll.screenRect?.y).toBe(0)

      // Inner container: screen = content(5) - outer scroll(3) = 2
      expect(innerScroll.screenRect?.y).toBe(2)

      // Inner child: screen = content(20) - outer scroll(3) - inner scroll(5) = 12
      expect(innerChild.screenRect?.y).toBe(12)
    })

    test("cross-column visual navigation uses screen Y not content Y", async () => {
      // Simulate two columns with different scroll offsets
      // Column 1: scrolled down, card at content y=50 appears at screen y=10
      const col1Card = await createBoxWithLayout({ height: 3 }, { x: 0, y: 50, width: 20, height: 3 })

      const col1 = await createBoxWithLayout(
        { overflow: "scroll", height: 20 } as BoxProps,
        { x: 0, y: 0, width: 20, height: 20 },
        [col1Card],
      )
      col1.scrollState = {
        offset: 40,
        contentHeight: 100,
        viewportHeight: 20,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      }

      // Column 2: not scrolled, card at content y=10 appears at screen y=10
      const col2Card = await createBoxWithLayout({ height: 3 }, { x: 20, y: 10, width: 20, height: 3 })

      const col2 = await createBoxWithLayout(
        { overflow: "scroll", height: 20 } as BoxProps,
        { x: 20, y: 0, width: 20, height: 20 },
        [col2Card],
      )
      col2.scrollState = {
        offset: 0,
        contentHeight: 50,
        viewportHeight: 20,
        firstVisibleChild: 0,
        lastVisibleChild: 0,
        hiddenAbove: 0,
        hiddenBelow: 0,
      }

      // Root container
      const root = await createBoxWithLayout(
        { flexDirection: "row" } as BoxProps,
        { x: 0, y: 0, width: 40, height: 20 },
        [col1, col2],
      )

      // Run screen rect phase
      screenRectPhase(root)

      // Both cards should have the SAME screen Y despite different content Y
      // col1Card: content y=50, scroll=40 → screen y=10
      // col2Card: content y=10, scroll=0 → screen y=10
      expect(col1Card.screenRect?.y).toBe(10)
      expect(col2Card.screenRect?.y).toBe(10)

      // This is the key invariant for h/l navigation:
      // Cards at the same visual position have matching screenRect.y
      expect(col1Card.screenRect?.y).toBe(col2Card.screenRect?.y)
    })
  })

  describe("outputPhase", () => {
    test("outputs entire buffer on first render", () => {
      const buffer = new TerminalBuffer(10, 2)
      buffer.setCell(0, 0, { char: "H" })
      buffer.setCell(1, 0, { char: "i" })

      const output = outputPhase(null, buffer)

      // Should have cursor home
      expect(output).toContain("\x1b[H")
      // Should have content
      expect(output).toContain("H")
      expect(output).toContain("i")
    })

    test("returns empty string when no changes", () => {
      const buffer = new TerminalBuffer(10, 2)
      buffer.setCell(0, 0, { char: "A" })

      const prev = buffer.clone()
      const output = outputPhase(prev, buffer)

      expect(output).toBe("")
    })

    test("outputs only changed cells", () => {
      const prev = new TerminalBuffer(10, 2)
      prev.setCell(0, 0, { char: "A" })

      const next = new TerminalBuffer(10, 2)
      next.setCell(0, 0, { char: "B" })

      const output = outputPhase(prev, next)

      expect(output).toContain("B")
      expect(output.length).toBeLessThan(outputPhase(null, next).length)
    })
  })

  describe("executeRender", () => {
    test("runs full pipeline", async () => {
      const root = await createMockNode("hightea-box", { width: 20, height: 5 })
      root.layoutDirty = true

      const { output, buffer } = executeRender(root, 20, 5, null)

      expect(buffer).toBeInstanceOf(TerminalBuffer)
      expect(buffer.width).toBe(20)
      expect(buffer.height).toBe(5)
      expect(typeof output).toBe("string")
    })

    test("diffs against previous buffer", async () => {
      const root = await createMockNode("hightea-box", { width: 20, height: 5 })
      root.layoutDirty = true

      const { buffer: buffer1 } = executeRender(root, 20, 5, null)

      // Second render with same content
      root.layoutDirty = true
      const { output: output2 } = executeRender(root, 20, 5, buffer1)

      // Should be minimal or empty (no changes)
      expect(output2.length).toBeLessThanOrEqual(10)
    })

    test("renders text with ANSI escape sequences", async () => {
      // Create a text node with ANSI-styled content (like chalk output)
      const textNode = await createTextWithLayout("\x1b[31mred text\x1b[0m", {
        x: 0,
        y: 0,
        width: 20,
        height: 1,
      })

      const root = await createBoxWithLayout({ width: 20, height: 3 }, { x: 0, y: 0, width: 20, height: 3 }, [textNode])

      const buffer = contentPhase(root)

      // The text "red text" should be in the buffer (without ANSI codes)
      const cell = buffer.getCell(0, 0)
      expect(cell.char).toBe("r")
      // The foreground color should be set (red = palette index 1)
      expect(cell.fg).toBe(1)
    })

    test("calculates ANSI text width correctly", async () => {
      // ANSI codes should not affect measured text width
      const textNode = await createTextWithLayout("\x1b[1;34mhello\x1b[0m", {
        x: 0,
        y: 0,
        width: 20,
        height: 1,
      })

      const root = await createBoxWithLayout({ width: 20, height: 1 }, { x: 0, y: 0, width: 20, height: 1 }, [textNode])

      const buffer = contentPhase(root)

      // Should render "hello" (5 chars) not the full ANSI string
      expect(buffer.getCell(0, 0).char).toBe("h")
      expect(buffer.getCell(4, 0).char).toBe("o")
      // Position 5 should be empty (space)
      expect(buffer.getCell(5, 0).char).toBe(" ")
    })

    test.each([
      // [description, text, expected cells]
      [
        "emoji width (wide characters)",
        "A😀B",
        [
          { x: 0, char: "A", wide: false },
          { x: 1, char: "😀", wide: true },
          { x: 2, continuation: true },
          { x: 3, char: "B" },
        ],
      ],
      [
        "CJK characters (wide)",
        "中文",
        [
          { x: 0, char: "中", wide: true },
          { x: 1, continuation: true },
          { x: 2, char: "文", wide: true },
          { x: 3, continuation: true },
          { x: 4, char: " " },
        ],
      ],
    ])("handles %s correctly", async (_desc, text, expectedCells) => {
      const textNode = await createTextWithLayout(text, {
        x: 0,
        y: 0,
        width: 10,
        height: 1,
      })
      const root = await createBoxWithLayout({ width: 10, height: 1 }, { x: 0, y: 0, width: 10, height: 1 }, [textNode])

      const buffer = contentPhase(root)

      for (const expected of expectedCells) {
        const cell = buffer.getCell(expected.x, 0)
        if (expected.char !== undefined) expect(cell.char).toBe(expected.char)
        if (expected.wide !== undefined) expect(cell.wide).toBe(expected.wide)
        if (expected.continuation !== undefined) expect(cell.continuation).toBe(expected.continuation)
      }
    })

    test("handles combining characters correctly (zero-width)", async () => {
      // cafe with combining acute accent: "cafe\u0301"
      // The e + combining accent should be treated as one grapheme
      // Total: c(1) + a(1) + f(1) + e(1) = 4 columns
      // Note: wrap-ansi normalizes decomposed chars to precomposed form
      const textNode = await createTextWithLayout("cafe\u0301", {
        x: 0,
        y: 0,
        width: 10,
        height: 1,
      })
      const root = await createBoxWithLayout({ width: 10, height: 1 }, { x: 0, y: 0, width: 10, height: 1 }, [textNode])

      const buffer = contentPhase(root)

      // c, a, f at positions 0, 1, 2
      expect(buffer.getCell(0, 0).char).toBe("c")
      expect(buffer.getCell(1, 0).char).toBe("a")
      expect(buffer.getCell(2, 0).char).toBe("f")
      // e should be at position 3 (may be precomposed '\u00e9' or decomposed 'e\u0301')
      const eChar = buffer.getCell(3, 0).char
      expect(eChar === "\u00e9" || eChar === "e\u0301").toBe(true)
      // Position 4 should be space (not the combining accent as separate char)
      expect(buffer.getCell(4, 0).char).toBe(" ")
    })
  })

  describe("background conflict detection", () => {
    test("throws on chalk bg with hightea Text backgroundColor (throw mode)", async () => {
      setBgConflictMode("throw")

      // Text with backgroundColor + chalk.bgBlue ANSI code
      const textNode = await createTextWithLayout(
        "\x1b[44mconflict\x1b[0m", // chalk.bgBlue output
        { x: 0, y: 0, width: 20, height: 1 },
        { backgroundColor: "cyan" } as TextProps,
      )

      const root = await createBoxWithLayout({ width: 20, height: 1 }, { x: 0, y: 0, width: 20, height: 1 }, [textNode])

      expect(() => contentPhase(root)).toThrow(/Background conflict/)
    })

    test("throws on chalk bg with parent Box backgroundColor (throw mode)", async () => {
      setBgConflictMode("throw")

      // Text without own bg, but parent Box has bg
      const textNode = await createTextWithLayout(
        "\x1b[44mconflict\x1b[0m", // chalk.bgBlue output
        { x: 0, y: 0, width: 20, height: 1 },
      )

      // Parent box with backgroundColor - will fill buffer before text renders
      const root = await createBoxWithLayout(
        { width: 20, height: 1, backgroundColor: "cyan" } as BoxProps,
        { x: 0, y: 0, width: 20, height: 1 },
        [textNode],
      )

      expect(() => contentPhase(root)).toThrow(/Background conflict/)
    })

    test.each([
      [
        "allows chalk bg when no hightea background (no conflict)",
        "throw",
        {} as TextProps,
        { width: 20, height: 1 } as BoxProps,
        "\x1b[44mno conflict\x1b[0m",
      ],
      [
        "allows conflict with bgOverride marker (SGR 9999)",
        "throw",
        { backgroundColor: "cyan" } as TextProps,
        { width: 20, height: 1 } as BoxProps,
        "\x1b[9999m\x1b[44mintentional\x1b[0m", // bgOverride + chalk.bgBlue
      ],
      [
        "ignore mode allows conflict silently",
        "ignore",
        { backgroundColor: "cyan" } as TextProps,
        { width: 20, height: 1 } as BoxProps,
        "\x1b[44mignored\x1b[0m",
      ],
    ] as const)("%s", async (_desc, envMode, textProps, rootProps, textContent) => {
      setBgConflictMode(envMode)

      const textNode = await createTextWithLayout(textContent, { x: 0, y: 0, width: 20, height: 1 }, textProps)
      const root = await createBoxWithLayout(rootProps, { x: 0, y: 0, width: 20, height: 1 }, [textNode])

      // Should not throw
      expect(() => contentPhase(root)).not.toThrow()
    })
  })
})
