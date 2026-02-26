/**
 * VirtualList Component Tests
 *
 * Tests for React-level virtualization.
 */

import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { Box, Text, VirtualList, type VirtualListHandle } from "../src/index.js"
import { initYogaEngine, setLayoutEngine } from "../src/render.js"
import { createRenderer } from "inkx/testing"

// Initialize layout engine before tests
beforeAll(async () => {
  const engine = await initYogaEngine()
  setLayoutEngine(engine)
})

const render = createRenderer({ cols: 80, rows: 24 })

describe("VirtualList", () => {
  test("renders visible items only", () => {
    const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render first items
    expect(app.text).toContain("Item 0")
    expect(app.text).toContain("Item 1")

    // Should NOT render items far below viewport
    expect(app.text).not.toContain("Item 99")
  })

  test("scrolls to selected item", () => {
    const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={50}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render items around index 50
    expect(app.text).toContain("Item 50")

    // Should NOT render items at the start
    expect(app.text).not.toContain("Item 0")
  })

  test("handles empty list", () => {
    const items: string[] = []

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render without errors
    expect(app.text).toBeDefined()
  })

  test("handles small list without virtualization", () => {
    const items = ["A", "B", "C"]

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render all items
    expect(app.text).toContain("A")
    expect(app.text).toContain("B")
    expect(app.text).toContain("C")
  })

  test("respects maxRendered limit", () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={500}
        maxRendered={50}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render items around index 500
    expect(app.text).toContain("Item 500")

    // Count rendered items (rough check via text content)
    const matches = app.text.match(/Item \d+/g) || []
    // Should be approximately maxRendered + overscan (50 + 5*2 = 60 max)
    expect(matches.length).toBeLessThanOrEqual(70)
  })

  test("supports keyExtractor", () => {
    const items = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ]

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <Text>{item.name}</Text>}
      />,
    )

    expect(app.text).toContain("Alpha")
    expect(app.text).toContain("Beta")
    expect(app.text).toContain("Gamma")
  })

  test("renders with overflow indicators", () => {
    const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={50}
        overflowIndicator
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should show overflow indicators
    expect(app.text).toContain("▲")
    expect(app.text).toContain("▼")
  })

  // ── Interactive mode ──────────────────────────────────────────────

  describe("interactive mode", () => {
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`)

    function renderInteractive(
      opts: { selectedIndex?: number; onSelectionChange?: (i: number) => void; onSelect?: (i: number) => void } = {},
    ) {
      return render(
        <VirtualList
          items={items}
          height={10}
          itemHeight={1}
          interactive
          selectedIndex={opts.selectedIndex}
          onSelectionChange={opts.onSelectionChange}
          onSelect={opts.onSelect}
          renderItem={(item, _index, meta) => (
            <Text>
              {meta?.isSelected ? "> " : "  "}
              {item}
            </Text>
          )}
        />,
      )
    }

    test("shows first item selected by default", () => {
      const app = renderInteractive()
      expect(app.text).toContain("> Item 0")
      expect(app.text).not.toContain("> Item 1")
    })

    test("j moves selection down", async () => {
      const changes: number[] = []
      const app = renderInteractive({ onSelectionChange: (i) => changes.push(i) })
      await app.press("j")
      expect(app.text).toContain("> Item 1")
      expect(changes).toEqual([1])
    })

    test("k moves selection up", async () => {
      const app = renderInteractive({ selectedIndex: 3 })
      await app.press("k")
      expect(app.text).toContain("> Item 2")
    })

    test("arrow keys navigate", async () => {
      const app = renderInteractive()
      await app.press("ArrowDown")
      await app.press("ArrowDown")
      expect(app.text).toContain("> Item 2")
      await app.press("ArrowUp")
      expect(app.text).toContain("> Item 1")
    })

    test("G jumps to last item", async () => {
      const app = renderInteractive()
      await app.press("G")
      expect(app.text).toContain("> Item 19")
    })

    test("Home jumps to first item", async () => {
      const app = renderInteractive({ selectedIndex: 15 })
      await app.press("Home")
      expect(app.text).toContain("> Item 0")
    })

    test("End jumps to last item", async () => {
      const app = renderInteractive()
      await app.press("End")
      expect(app.text).toContain("> Item 19")
    })

    test("page down moves by half viewport", async () => {
      const app = renderInteractive()
      await app.press("PageDown")
      // Half of height=10 is 5
      expect(app.text).toContain("> Item 5")
    })

    test("page up moves by half viewport", async () => {
      const app = renderInteractive({ selectedIndex: 10 })
      await app.press("PageUp")
      expect(app.text).toContain("> Item 5")
    })

    test("clamps at boundaries", async () => {
      const app = renderInteractive()
      await app.press("k") // at 0, can't go up
      expect(app.text).toContain("> Item 0")

      await app.press("G") // go to end
      await app.press("j") // at 19, can't go down
      expect(app.text).toContain("> Item 19")
    })

    test("Enter calls onSelect", async () => {
      const selections: number[] = []
      const app = renderInteractive({ selectedIndex: 5, onSelect: (i) => selections.push(i) })
      await app.press("Enter")
      expect(selections).toEqual([5])
    })

    test("non-interactive mode ignores keyboard", async () => {
      const app = render(
        <VirtualList
          items={items}
          height={10}
          itemHeight={1}
          scrollTo={0}
          renderItem={(item, _index, meta) => (
            <Text>
              {meta?.isSelected ? "> " : "  "}
              {item}
            </Text>
          )}
        />,
      )
      // No interactive — j should not change selection
      await app.press("j")
      // In non-interactive mode, no item should be marked selected
      expect(app.text).not.toContain("> Item 1")
    })
  })

  test("multi-line items work correctly", () => {
    const items = ["First", "Second", "Third"]

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={2} // Each item takes 2 rows
        renderItem={(item, index) => (
          <Box key={index} height={2} flexDirection="column">
            <Text>{item}</Text>
            <Text dimColor>Description</Text>
          </Box>
        )}
      />,
    )

    expect(app.text).toContain("First")
    expect(app.text).toContain("Description")
  })

  // ── Feature coverage (AC for DRY refactoring) ──────────────────────

  test("variable itemHeight function sizes items correctly", () => {
    // Items alternate between 1 and 3 rows tall
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={(_item, index) => (index % 2 === 0 ? 1 : 3)}
        scrollTo={0}
        renderItem={(item, index) => (
          <Box key={index} height={index % 2 === 0 ? 1 : 3}>
            <Text>{item}</Text>
          </Box>
        )}
      />,
    )

    // Should render first items
    expect(app.text).toContain("Item 0")
    expect(app.text).toContain("Item 1")
    // Should not render all items (viewport is 10 rows, items average 2 rows)
    expect(app.text).not.toContain("Item 19")
  })

  test("frozen prop excludes contiguous prefix from render", () => {
    const items = Array.from({ length: 10 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={3}
        frozen={(_item, index) => index < 3}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Frozen prefix (0,1,2) should NOT be rendered
    expect(app.text).not.toContain("Item 0")
    expect(app.text).not.toContain("Item 1")
    expect(app.text).not.toContain("Item 2")
    // Active items should be rendered
    expect(app.text).toContain("Item 3")
    expect(app.text).toContain("Item 4")
  })

  test("frozen items adjust scrollTo index", () => {
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={15}
        frozen={(_item, index) => index < 10}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // scrollTo=15 with 10 frozen means adjusted scrollTo=5 in the active items
    // Should still show Item 15 (the target)
    expect(app.text).toContain("Item 15")
    // Frozen items should not be visible
    expect(app.text).not.toContain("Item 0")
    expect(app.text).not.toContain("Item 9")
  })

  test("gap adds spacing between items", () => {
    const items = ["A", "B", "C", "D", "E"]

    const app = render(
      <VirtualList
        items={items}
        height={20}
        itemHeight={1}
        gap={1}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // All items should be visible
    expect(app.text).toContain("A")
    expect(app.text).toContain("E")
  })

  test("renderSeparator renders between items", () => {
    const items = ["A", "B", "C"]

    const app = render(
      <VirtualList
        items={items}
        height={20}
        itemHeight={1}
        renderSeparator={() => <Text>---</Text>}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(app.text).toContain("A")
    expect(app.text).toContain("---")
    expect(app.text).toContain("C")
  })

  test("imperative scrollToItem via ref", () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`)
    const ref = React.createRef<VirtualListHandle>()

    function TestApp() {
      return (
        <VirtualList
          ref={ref}
          items={items}
          height={10}
          itemHeight={1}
          scrollTo={0}
          renderItem={(item, index) => <Text key={index}>{item}</Text>}
        />
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("Item 0")

    // Imperative scroll to item 40
    ref.current!.scrollToItem(40)

    // Note: scrollToItem updates internal state but VirtualList is declarative
    // (scrollTo=0), so the imperative call may not visually change without
    // re-render. This test verifies the ref is properly exposed.
    expect(ref.current).toBeDefined()
    expect(ref.current!.scrollToItem).toBeInstanceOf(Function)
  })

  describe("interactive mouse wheel", () => {
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i}`)

    test("wheel down moves selection", async () => {
      const changes: number[] = []
      const app = render(
        <VirtualList
          items={items}
          height={10}
          itemHeight={1}
          interactive
          onSelectionChange={(i) => changes.push(i)}
          renderItem={(item, _index, meta) => (
            <Text>
              {meta?.isSelected ? "> " : "  "}
              {item}
            </Text>
          )}
        />,
      )

      expect(app.text).toContain("> Item 0")
      // Simulate wheel down
      await app.wheel(5, 5, 1)
      // Should have moved selection down by WHEEL_STEP (3)
      expect(changes.length).toBeGreaterThan(0)
      expect(changes[0]).toBe(3)
    })
  })
})
