/**
 * ListView tests.
 *
 * Verifies the unified ListView component: basic rendering, nav mode,
 * getKey, estimateHeight, overflow indicators, virtualized prefix, listFooter,
 * and backward compatibility via VirtualView/VirtualList wrappers.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"
import { VirtualList } from "../../packages/ag-react/src/ui/components/VirtualList"

// ============================================================================
// Test Helpers
// ============================================================================

interface Item {
  id: string
  title: string
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
  }))
}

function countVisibleItems(text: string, prefix: string, total: number): number {
  let count = 0
  for (let i = 0; i < total; i++) {
    if (text.includes(`${prefix} ${i}`)) count++
  }
  return count
}

// ============================================================================
// ListView — Basic Rendering
// ============================================================================

describe("ListView — basic rendering", () => {
  test("renders all items when they fit", () => {
    const items = makeItems(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    for (let i = 0; i < 3; i++) {
      expect(text).toContain(`Item ${i}`)
    }
  })

  test("renders empty viewport with no items", () => {
    const items: Item[] = []
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<ListView items={items} height={5} renderItem={(item, _i, _meta) => <Text>{item.title}</Text>} />)
    const text = stripAnsi(app.text)
    expect(text).not.toContain("Item")
  })

  test("single item renders correctly", () => {
    const items = makeItems(1)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(<ListView items={items} height={5} renderItem={(item, _i, _meta) => <Text>{item.title}</Text>} />)
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 0")
  })

  test("meta.isCursor is false in passive mode", () => {
    const items = makeItems(3)
    const cursorValues: boolean[] = []
    const r = createRenderer({ cols: 40, rows: 7 })
    r(
      <ListView
        items={items}
        height={5}
        renderItem={(item, _i, meta) => {
          cursorValues.push(meta.isCursor)
          return <Text>{item.title}</Text>
        }}
      />,
    )
    // All should be false in passive mode
    expect(cursorValues.every((v) => v === false)).toBe(true)
  })
})

// ============================================================================
// ListView — Overflow Indicators
// ============================================================================

describe("ListView — overflow indicators", () => {
  test("shows bottom overflow when items exceed viewport", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        overflowIndicator
        scrollTo={0}
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("▼")
    expect(text).not.toContain("▲")
  })

  test("no overflow indicators when all items fit", () => {
    const items = makeItems(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        overflowIndicator
        scrollTo={0}
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).not.toContain("▲")
    expect(text).not.toContain("▼")
  })

  test("shows top overflow when scrolled past beginning", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        scrollTo={5}
        overflowIndicator
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("▲")
  })

  test("shows both indicators when scrolled to middle", () => {
    const items = makeItems(20)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <ListView
        items={items}
        height={10}
        scrollTo={10}
        overflowIndicator
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("▲")
    expect(text).toContain("▼")
  })
})

// ============================================================================
// ListView — Navigable Mode
// ============================================================================

describe("ListView — nav mode", () => {
  test("cursor at index 0 shows first item with isCursor=true", () => {
    const items = makeItems(20)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        nav
        cursorKey={0}
        overflowIndicator
        renderItem={(item, _i, meta) => (
          <Text>
            {meta.isCursor ? "> " : "  "}
            {item.title}
          </Text>
        )}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("> Item 0")
  })

  test("cursor item is always visible", () => {
    const items = makeItems(20)
    for (const idx of [0, 5, 10, 15, 19]) {
      const r = createRenderer({ cols: 40, rows: 7 })
      const app = r(
        <ListView
          items={items}
          height={5}
          nav
          cursorKey={idx}
          renderItem={(item, _i, meta) => (
            <Text>
              {meta.isCursor ? ">" : " "}
              {item.title}
            </Text>
          )}
          getKey={(item) => item.id}
        />,
      )
      const text = stripAnsi(app.text)
      expect(text, `Item ${idx} should be visible when cursor`).toContain(`Item ${idx}`)
    }
  })
})

// ============================================================================
// ListView — estimateHeight
// ============================================================================

describe("ListView — estimateHeight", () => {
  test("multi-row items: 3-row items in height=6 — exactly 2 fit", () => {
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 8 })
    const app = r(
      <ListView
        items={items}
        height={6}
        estimateHeight={3}
        scrollTo={0}
        overflowIndicator
        renderItem={(item, _i, _meta) => (
          <Box height={3} flexShrink={0}>
            <Text>{item.title}</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 0")
    expect(text).toContain("Item 1")
    expect(text).toContain("▼")
  })
})

// ============================================================================
// ListView — getKey
// ============================================================================

describe("ListView — getKey", () => {
  test("items are keyed by getKey", () => {
    // Just verify it renders without error when getKey is provided
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        scrollTo={0}
        getKey={(item) => item.id}
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 0")
  })
})

// ============================================================================
// ListView — virtualized prefix
// ============================================================================

describe("ListView — virtualized prefix", () => {
  test("excludes contiguous virtualized prefix from rendering", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <ListView
        items={items}
        height={10}
        scrollTo={5}
        virtualized={(_item, index) => index < 3}
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    // Items 0-2 are virtualized and should not appear
    expect(text).not.toContain("Item 0")
    expect(text).not.toContain("Item 1")
    expect(text).not.toContain("Item 2")
    // Item 5 (the scroll target) should be visible
    expect(text).toContain("Item 5")
  })
})

// ============================================================================
// ListView — listFooter
// ============================================================================

describe("ListView — listFooter", () => {
  test("renders footer content after items", () => {
    const items = makeItems(3)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        scrollTo={0}
        listFooter={<Text>FOOTER</Text>}
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("FOOTER")
  })
})

// ============================================================================
// ListView — gap handling
// ============================================================================

describe("ListView — gap handling", () => {
  test("gap reduces number of visible items", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <ListView
        items={items}
        height={5}
        gap={1}
        scrollTo={0}
        overflowIndicator
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const textWithGap = stripAnsi(app.text)

    const r2 = createRenderer({ cols: 40, rows: 7 })
    const app2 = r2(
      <ListView
        items={items}
        height={5}
        scrollTo={0}
        overflowIndicator
        renderItem={(item, _i, _meta) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const textNoGap = stripAnsi(app2.text)

    const visibleWithGap = countVisibleItems(textWithGap, "Item", 10)
    const visibleNoGap = countVisibleItems(textNoGap, "Item", 10)
    expect(visibleWithGap).toBeLessThan(visibleNoGap)
  })
})

// ============================================================================
// VirtualList wrapper — backward compatibility
// ============================================================================

describe("VirtualList wrapper — backward compatibility", () => {
  test("renders items with itemHeight", () => {
    const items = makeItems(5)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        getKey={(item) => item.id}
        renderItem={(item, _index) => <Text>{item.title}</Text>}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 0")
  })

  test("nav mode with isCursor in meta", () => {
    const items = makeItems(20)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        nav
        cursorKey={0}
        overflowIndicator
        renderItem={(item, _index, meta) => (
          <Text>
            {meta?.isCursor ? "> " : "  "}
            {item.title}
          </Text>
        )}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("> Item 0")
  })

  test("overflow indicators match original behavior", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 7 })
    const app = r(
      <VirtualList
        items={items}
        height={5}
        itemHeight={1}
        scrollTo={0}
        overflowIndicator
        getKey={(item) => item.id}
        renderItem={(item, _index) => <Text>{item.title}</Text>}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("▼")
    expect(text).not.toContain("▲")
  })

  test("virtualized prefix still works", () => {
    const items = makeItems(10)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={5}
        virtualized={(_item, index) => index < 3}
        renderItem={(item, _index) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).not.toContain("Item 0")
    expect(text).not.toContain("Item 1")
    expect(text).not.toContain("Item 2")
    expect(text).toContain("Item 5")
  })
})
