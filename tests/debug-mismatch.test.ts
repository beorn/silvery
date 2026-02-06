/**
 * Tests for debug-mismatch.ts utilities.
 */

import { describe, expect, test } from "vitest"
import {
  buildMismatchContext,
  findAllContainingNodes,
  findNodeAtPosition,
  formatMismatchContext,
  getNodeDebugInfo,
} from "../src/debug-mismatch.js"
import type { InkxNode, Rect } from "../src/types.js"

// Helper to create a minimal mock node
function mockNode(
  id: string,
  screenRect: Rect | null,
  children: InkxNode[] = [],
  parent: InkxNode | null = null,
): InkxNode {
  const node: InkxNode = {
    type: "inkx-box",
    props: { id },
    children,
    parent,
    layoutNode: null,
    prevLayout: null,
    contentRect: screenRect,
    screenRect,
    layoutDirty: false,
    contentDirty: false,
    paintDirty: false,
    subtreeDirty: false,
    childrenDirty: false,
    layoutSubscribers: new Set(),
  }
  // Set parent reference on children
  for (const child of children) {
    child.parent = node
  }
  return node
}

describe("findNodeAtPosition", () => {
  test("finds innermost node at position", () => {
    const child = mockNode("inner", { x: 5, y: 5, width: 10, height: 10 })
    const root = mockNode("root", { x: 0, y: 0, width: 80, height: 24 }, [
      child,
    ])

    // Position inside inner
    expect(findNodeAtPosition(root, 7, 7)?.props.id).toBe("inner")

    // Position outside inner but inside root
    expect(findNodeAtPosition(root, 0, 0)?.props.id).toBe("root")

    // Position outside all nodes
    expect(findNodeAtPosition(root, 100, 100)).toBeNull()
  })

  test("handles nested nodes", () => {
    const innermost = mockNode("innermost", {
      x: 10,
      y: 10,
      width: 5,
      height: 5,
    })
    const middle = mockNode("middle", { x: 5, y: 5, width: 15, height: 15 }, [
      innermost,
    ])
    const root = mockNode("root", { x: 0, y: 0, width: 80, height: 24 }, [
      middle,
    ])

    expect(findNodeAtPosition(root, 12, 12)?.props.id).toBe("innermost")
    expect(findNodeAtPosition(root, 6, 6)?.props.id).toBe("middle")
    expect(findNodeAtPosition(root, 1, 1)?.props.id).toBe("root")
  })
})

describe("findAllContainingNodes", () => {
  test("returns all nodes from root to innermost", () => {
    const innermost = mockNode("innermost", {
      x: 10,
      y: 10,
      width: 5,
      height: 5,
    })
    const middle = mockNode("middle", { x: 5, y: 5, width: 15, height: 15 }, [
      innermost,
    ])
    const root = mockNode("root", { x: 0, y: 0, width: 80, height: 24 }, [
      middle,
    ])

    const nodes = findAllContainingNodes(root, 12, 12)
    expect(nodes.map((n) => n.props.id)).toEqual([
      "root",
      "middle",
      "innermost",
    ])
  })
})

describe("getNodeDebugInfo", () => {
  test("extracts debug info from node", () => {
    const node = mockNode("test-node", { x: 5, y: 10, width: 20, height: 5 })
    node.contentDirty = true
    node.prevLayout = { x: 5, y: 8, width: 20, height: 5 }

    const info = getNodeDebugInfo(node)

    expect(info.id).toBe("test-node")
    expect(info.type).toBe("inkx-box")
    expect(info.dirtyFlags.contentDirty).toBe(true)
    expect(info.dirtyFlags.paintDirty).toBe(false)
    expect(info.layout.layoutChanged).toBe(true) // y changed
  })

  test("includes scroll state when present", () => {
    const node = mockNode("scroll-container", {
      x: 0,
      y: 0,
      width: 80,
      height: 20,
    })
    node.scrollState = {
      offset: 5,
      prevOffset: 0,
      contentHeight: 100,
      viewportHeight: 20,
      firstVisibleChild: 5,
      lastVisibleChild: 15,
      hiddenAbove: 5,
      hiddenBelow: 80,
    }

    const info = getNodeDebugInfo(node)

    expect(info.scroll).toBeDefined()
    expect(info.scroll?.offset).toBe(5)
    expect(info.scroll?.offsetChanged).toBe(true)
    expect(info.scroll?.hiddenAbove).toBe(5)
    expect(info.scroll?.hiddenBelow).toBe(80)
  })
})

describe("formatMismatchContext", () => {
  test("formats context as readable string", () => {
    const child = mockNode("inner", { x: 5, y: 5, width: 10, height: 10 })
    child.contentDirty = true
    const root = mockNode("root", { x: 0, y: 0, width: 80, height: 24 }, [
      child,
    ])

    const ctx = buildMismatchContext(
      root,
      7,
      7,
      {
        char: "X",
        fg: null,
        bg: 6,
        underlineColor: null,
        attrs: {},
        wide: false,
        continuation: false,
      },
      {
        char: "Y",
        fg: null,
        bg: 0,
        underlineColor: null,
        attrs: {},
        wide: false,
        continuation: false,
      },
      42,
    )

    const output = formatMismatchContext(ctx)

    expect(output).toContain("MISMATCH at (7, 7) on render #42")
    expect(output).toContain('incremental: char="X"')
    expect(output).toContain('fresh:       char="Y"')
    expect(output).toContain("bg=6")
    expect(output).toContain("bg=0")
    expect(output).toContain("#inner")
    expect(output).toContain("contentDirty")
    expect(output).toContain("DIRTY FLAGS:")
    expect(output).toContain("LAYOUT:")
  })

  test("formats scroll ancestors when present", () => {
    const inner = mockNode("inner", { x: 5, y: 5, width: 10, height: 10 })
    const scrollable = mockNode(
      "scrollable",
      { x: 0, y: 0, width: 80, height: 20 },
      [inner],
    )
    scrollable.scrollState = {
      offset: 10,
      prevOffset: 5,
      contentHeight: 100,
      viewportHeight: 20,
      firstVisibleChild: 10,
      lastVisibleChild: 20,
      hiddenAbove: 10,
      hiddenBelow: 70,
    }
    const root = mockNode("root", { x: 0, y: 0, width: 80, height: 24 }, [
      scrollable,
    ])

    const ctx = buildMismatchContext(
      root,
      7,
      7,
      {
        char: " ",
        fg: null,
        bg: null,
        underlineColor: null,
        attrs: {},
        wide: false,
        continuation: false,
      },
      {
        char: "X",
        fg: null,
        bg: null,
        underlineColor: null,
        attrs: {},
        wide: false,
        continuation: false,
      },
      1,
    )

    const output = formatMismatchContext(ctx)

    expect(output).toContain("SCROLL ANCESTORS:")
    expect(output).toContain("SCROLL CHANGED: offset 5 → 10")
    expect(output).toContain("viewport: 20/100")
    expect(output).toContain("▲10 ▼70")
  })
})
