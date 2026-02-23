/**
 * Tests for SplitView component — renders layout trees as split panes.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { SplitView } from "../src/components/SplitView.js"
import { createLeaf, splitPane } from "../src/pane-manager.js"
import type { LayoutNode } from "../src/pane-manager.js"
import { createRenderer } from "../src/testing/index.js"

const renderPane = (id: string) => <Text>{`Content:${id}`}</Text>

// ============================================================================
// Single pane
// ============================================================================

describe("SplitView — single pane", () => {
  const render = createRenderer({ cols: 60, rows: 10 })

  test("renders a single pane with content", () => {
    const app = render(<SplitView layout={createLeaf("main")} renderPane={renderPane} />)
    expect(app.text).toContain("Content:main")
  })

  test("renders border by default", () => {
    const app = render(<SplitView layout={createLeaf("main")} renderPane={renderPane} />)
    // Border characters from borderStyle="single"
    expect(app.text).toContain("─")
    expect(app.text).toContain("│")
  })

  test("no border when showBorders=false", () => {
    const app = render(<SplitView layout={createLeaf("main")} renderPane={renderPane} showBorders={false} />)
    expect(app.text).toContain("Content:main")
    expect(app.text).not.toContain("─")
  })

  test("sets testID on pane", () => {
    const app = render(<SplitView layout={createLeaf("main")} renderPane={renderPane} />)
    const pane = app.getByTestId("pane-main")
    expect(pane.textContent()).toContain("Content:main")
  })
})

// ============================================================================
// Horizontal split
// ============================================================================

describe("SplitView — horizontal split", () => {
  const render = createRenderer({ cols: 80, rows: 10 })

  test("renders two panes side by side", () => {
    const layout = splitPane(createLeaf("left"), "left", "horizontal", "right")
    const app = render(<SplitView layout={layout} renderPane={renderPane} />)

    expect(app.text).toContain("Content:left")
    expect(app.text).toContain("Content:right")
  })

  test("both panes have testIDs", () => {
    const layout = splitPane(createLeaf("left"), "left", "horizontal", "right")
    const app = render(<SplitView layout={layout} renderPane={renderPane} />)

    const leftPane = app.getByTestId("pane-left")
    expect(leftPane.textContent()).toContain("Content:left")

    const rightPane = app.getByTestId("pane-right")
    expect(rightPane.textContent()).toContain("Content:right")
  })
})

// ============================================================================
// Vertical split
// ============================================================================

describe("SplitView — vertical split", () => {
  const render = createRenderer({ cols: 60, rows: 20 })

  test("renders two panes stacked", () => {
    const layout = splitPane(createLeaf("top"), "top", "vertical", "bottom")
    const app = render(<SplitView layout={layout} renderPane={renderPane} />)

    expect(app.text).toContain("Content:top")
    expect(app.text).toContain("Content:bottom")
  })
})

// ============================================================================
// Nested splits
// ============================================================================

describe("SplitView — nested splits", () => {
  const render = createRenderer({ cols: 120, rows: 24 })

  test("renders three panes from nested split", () => {
    let layout: LayoutNode = createLeaf("a")
    layout = splitPane(layout, "a", "horizontal", "b")
    layout = splitPane(layout, "a", "vertical", "c")

    const app = render(<SplitView layout={layout} renderPane={renderPane} />)

    expect(app.text).toContain("Content:a")
    expect(app.text).toContain("Content:b")
    expect(app.text).toContain("Content:c")
  })

  test("four panes in a grid", () => {
    let layout: LayoutNode = createLeaf("tl")
    layout = splitPane(layout, "tl", "horizontal", "tr")
    layout = splitPane(layout, "tl", "vertical", "bl")
    layout = splitPane(layout, "tr", "vertical", "br")

    const app = render(<SplitView layout={layout} renderPane={renderPane} />)

    expect(app.text).toContain("Content:tl")
    expect(app.text).toContain("Content:tr")
    expect(app.text).toContain("Content:bl")
    expect(app.text).toContain("Content:br")
  })
})

// ============================================================================
// Focus highlighting
// ============================================================================

describe("SplitView — focus highlighting", () => {
  const render = createRenderer({ cols: 80, rows: 10 })

  test("focused pane border gets focused color", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    const app = render(
      <SplitView
        layout={layout}
        renderPane={renderPane}
        focusedPaneId="a"
        focusedBorderColor="green"
        unfocusedBorderColor="gray"
      />,
    )

    // Both panes should render
    expect(app.text).toContain("Content:a")
    expect(app.text).toContain("Content:b")
  })

  test("switching focused pane updates correctly", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")

    // First render with "a" focused
    const app = render(<SplitView layout={layout} renderPane={renderPane} focusedPaneId="a" />)
    expect(app.text).toContain("Content:a")

    // Re-render with "b" focused
    app.rerender(<SplitView layout={layout} renderPane={renderPane} focusedPaneId="b" />)
    expect(app.text).toContain("Content:b")
  })
})

// ============================================================================
// Pane titles
// ============================================================================

describe("SplitView — pane titles", () => {
  const render = createRenderer({ cols: 80, rows: 10 })

  test("renders pane title when renderPaneTitle is provided", () => {
    const layout = splitPane(createLeaf("a"), "a", "horizontal", "b")
    const app = render(<SplitView layout={layout} renderPane={renderPane} renderPaneTitle={(id) => `[${id}]`} />)

    expect(app.text).toContain("[a]")
    expect(app.text).toContain("[b]")
  })

  test("no title when renderPaneTitle is not provided", () => {
    const layout = createLeaf("a")
    const app = render(<SplitView layout={layout} renderPane={renderPane} />)

    // Should not contain any title-like text, just content
    expect(app.text).toContain("Content:a")
    // No brackets wrapping the id
    expect(app.text).not.toContain("[a]")
  })
})
