/**
 * VirtualView Component Tests
 *
 * Tests for the app-managed scrollable viewport with virtualization.
 */

import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { Text } from "../src/index.js"
import { Box } from "../src/components/Box.js"
import { VirtualView } from "../src/components/VirtualView.js"
import { initYogaEngine, setLayoutEngine } from "../src/render.js"
import { createRenderer } from "inkx/testing"

// Initialize layout engine before tests
beforeAll(async () => {
  const engine = await initYogaEngine()
  setLayoutEngine(engine)
})

const render = createRenderer({ cols: 80, rows: 24 })

describe("VirtualView", () => {
  test("renders visible items only", () => {
    const items = Array.from({ length: 100 }, (_, i) => `Item ${i}`)

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
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
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
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
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render without errors
    expect(app.text).toBeDefined()
  })

  test("handles small list without virtualization", () => {
    const items = ["A", "B", "C"]

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
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
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        scrollTo={500}
        maxRendered={50}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should render items around index 500
    expect(app.text).toContain("Item 500")

    // Count rendered items (rough check)
    const matches = app.text.match(/Item \d+/g) || []
    expect(matches.length).toBeLessThanOrEqual(70)
  })

  test("supports keyExtractor", () => {
    const items = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ]

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
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
      <VirtualView
        items={items}
        height={5}
        estimateHeight={1}
        scrollTo={50}
        overflowIndicator
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should show overflow indicators
    expect(app.text).toContain("▲")
    expect(app.text).toContain("▼")
  })

  test("multi-line items work correctly", () => {
    const items = ["First", "Second", "Third"]

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={2}
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

  test("freezes scroll when scrollTo is undefined", () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`)

    // First render with scrollTo=20
    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        scrollTo={20}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(app.text).toContain("Item 20")

    // Re-render without scrollTo — scroll should freeze
    app.rerender(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // Should still show items near 20 (frozen scroll)
    expect(app.text).toContain("Item 20")
  })

  test("supports gap between items", () => {
    const items = ["A", "B", "C"]

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        gap={1}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(app.text).toContain("A")
    expect(app.text).toContain("B")
    expect(app.text).toContain("C")
  })

  test("supports renderSeparator", () => {
    const items = ["A", "B", "C"]

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        renderSeparator={() => <Text>---</Text>}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(app.text).toContain("A")
    expect(app.text).toContain("---")
    expect(app.text).toContain("C")
  })

  test("onEndReached fires when scrolled near end", () => {
    const items = Array.from({ length: 50 }, (_, i) => `Item ${i}`)
    let endReachedCount = 0

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        scrollTo={0}
        onEndReached={() => endReachedCount++}
        onEndReachedThreshold={5}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    // At scrollTo=0, endIndex is far from 50 — should not fire
    expect(endReachedCount).toBe(0)

    // Scroll near the end
    app.rerender(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        scrollTo={45}
        onEndReached={() => endReachedCount++}
        onEndReachedThreshold={5}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(endReachedCount).toBe(1)
  })

  test("onEndReached fires only once per item count", () => {
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i}`)
    let endReachedCount = 0
    const onEndReached = () => endReachedCount++

    const app = render(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        scrollTo={25}
        onEndReached={onEndReached}
        onEndReachedThreshold={5}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(endReachedCount).toBe(1)

    // Re-render at same count, different scroll — should not re-fire
    app.rerender(
      <VirtualView
        items={items}
        height={10}
        estimateHeight={1}
        scrollTo={28}
        onEndReached={onEndReached}
        onEndReachedThreshold={5}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(endReachedCount).toBe(1)

    // New items loaded — resets, fires again when at end
    const moreItems = Array.from({ length: 60 }, (_, i) => `Item ${i}`)
    app.rerender(
      <VirtualView
        items={moreItems}
        height={10}
        estimateHeight={1}
        scrollTo={55}
        onEndReached={onEndReached}
        onEndReachedThreshold={5}
        renderItem={(item, index) => <Text key={index}>{item}</Text>}
      />,
    )

    expect(endReachedCount).toBe(2)
  })
})
