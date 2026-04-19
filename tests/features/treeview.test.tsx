/**
 * TreeView — termless end-to-end tests.
 *
 * Verifies tree rendering (indentation, expand/collapse indicators),
 * keyboard navigation (j/k delegated to ListView), and expand/collapse
 * (Enter toggles, Right expands, Left collapses) through the full
 * ANSI rendering pipeline.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"
import { TreeView } from "../../packages/ag-react/src/ui/components/TreeView"
import type { TreeNode } from "../../packages/ag-react/src/ui/components/TreeView"

// ============================================================================
// Test fixtures
// ============================================================================

const TREE_DATA: TreeNode[] = [
  {
    id: "1",
    label: "Documents",
    children: [
      { id: "1.1", label: "README.md" },
      {
        id: "1.2",
        label: "src",
        children: [
          { id: "1.2.1", label: "index.ts" },
          { id: "1.2.2", label: "utils.ts" },
        ],
      },
    ],
  },
  { id: "2", label: "config.json" },
  {
    id: "3",
    label: "tests",
    children: [{ id: "3.1", label: "app.test.ts" }],
  },
]

function QuitableTree({
  data = TREE_DATA,
  defaultExpanded = false,
}: {
  data?: TreeNode[]
  defaultExpanded?: boolean
}) {
  useInput((input) => {
    if (input === "q") return "exit"
  })
  return <TreeView data={data} defaultExpanded={defaultExpanded} />
}

// ============================================================================
// Rendering
// ============================================================================

describe("TreeView: rendering", () => {
  test("renders collapsed tree with branch indicators", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    await run(<QuitableTree />, term)

    // Top-level items visible, collapsed branches show ">"
    expect(term.screen).toContainText("> Documents")
    expect(term.screen).toContainText("config.json")
    expect(term.screen).toContainText("> tests")
    // Children not visible when collapsed
    expect(term.screen).not.toContainText("README.md")
  })

  test("renders expanded tree with indentation", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    await run(<QuitableTree defaultExpanded />, term)

    // All nodes visible
    expect(term.screen).toContainText("v Documents")
    expect(term.screen).toContainText("README.md")
    expect(term.screen).toContainText("v src")
    expect(term.screen).toContainText("index.ts")
    expect(term.screen).toContainText("utils.ts")
    expect(term.screen).toContainText("config.json")
    expect(term.screen).toContainText("v tests")
    expect(term.screen).toContainText("app.test.ts")
  })

  test("empty tree shows 'No items'", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    await run(<QuitableTree data={[]} />, term)

    expect(term.screen).toContainText("No items")
  })
})

// ============================================================================
// Navigation
// ============================================================================

describe("TreeView: navigation", () => {
  test("j/k moves cursor between top-level items", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<QuitableTree />, term)

    // Cursor starts on first item — "Documents" should be highlighted (inverse)
    // Move down to config.json
    await handle.press("j")
    // Move down to tests
    await handle.press("j")
    // "tests" should be under cursor now; press Enter to expand
    await handle.press("Enter")
    expect(term.screen).toContainText("v tests")
    expect(term.screen).toContainText("app.test.ts")
  })

  test("arrow keys work for navigation", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<QuitableTree />, term)

    await handle.press("ArrowDown")
    await handle.press("ArrowDown")
    // On "tests", expand it
    await handle.press("Enter")
    expect(term.screen).toContainText("v tests")
  })
})

// ============================================================================
// Expand / Collapse
// ============================================================================

describe("TreeView: expand/collapse", () => {
  test("Enter toggles expansion on a branch node", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<QuitableTree />, term)

    // Cursor on "Documents" — press Enter to expand
    await handle.press("Enter")
    expect(term.screen).toContainText("v Documents")
    expect(term.screen).toContainText("README.md")

    // Press Enter again to collapse
    await handle.press("Enter")
    expect(term.screen).toContainText("> Documents")
    expect(term.screen).not.toContainText("README.md")
  })

  test("Right arrow expands collapsed node", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<QuitableTree />, term)

    // Cursor on "Documents" — Right to expand
    await handle.press("ArrowRight")
    expect(term.screen).toContainText("v Documents")
    expect(term.screen).toContainText("README.md")

    // Right on already-expanded does nothing (stays expanded)
    await handle.press("ArrowRight")
    expect(term.screen).toContainText("v Documents")
  })

  test("Left arrow collapses expanded node", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<QuitableTree />, term)

    // Expand first
    await handle.press("Enter")
    expect(term.screen).toContainText("v Documents")

    // Left to collapse
    await handle.press("ArrowLeft")
    expect(term.screen).toContainText("> Documents")
    expect(term.screen).not.toContainText("README.md")
  })

  test("Enter on leaf node does nothing", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<QuitableTree />, term)

    // Move to "config.json" (leaf)
    await handle.press("j")
    await handle.press("Enter")
    // Nothing should change — config.json has no children
    expect(term.screen).toContainText("config.json")
    expect(term.screen).toContainText("> Documents")
  })

  test("nested expand/collapse works", async () => {
    using term = createTermless({ cols: 40, rows: 15 })
    const handle = await run(<QuitableTree />, term)

    // Expand Documents
    await handle.press("Enter")
    expect(term.screen).toContainText("README.md")

    // Move to "src" (j twice: README.md, then src)
    await handle.press("j")
    await handle.press("j")
    // Expand src
    await handle.press("Enter")
    expect(term.screen).toContainText("index.ts")
    expect(term.screen).toContainText("utils.ts")

    // Collapse src
    await handle.press("Enter")
    expect(term.screen).not.toContainText("index.ts")
    // Documents still expanded
    expect(term.screen).toContainText("v Documents")
  })
})

// ============================================================================
// Controlled expansion
// ============================================================================

describe("TreeView: controlled expansion", () => {
  test("expandedIds controls which nodes are expanded", async () => {
    const expandedIds = new Set(["1"]) // Only Documents expanded

    function ControlledTree() {
      useInput((input) => {
        if (input === "q") return "exit"
      })
      return <TreeView data={TREE_DATA} expandedIds={expandedIds} />
    }

    using term = createTermless({ cols: 40, rows: 10 })
    await run(<ControlledTree />, term)

    expect(term.screen).toContainText("v Documents")
    expect(term.screen).toContainText("README.md")
    expect(term.screen).toContainText("> src")
    expect(term.screen).toContainText("> tests")
  })
})
