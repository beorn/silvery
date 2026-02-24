/**
 * VirtualList frozen prop & useScrollback hook tests
 *
 * Tests for scrollback/freeze mode where completed items are excluded
 * from VirtualList rendering via a contiguous frozen prefix.
 */

import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { Box, Text, VirtualList } from "../src/index.js"
import { initYogaEngine, setLayoutEngine } from "../src/render.js"
import { createRenderer } from "inkx/testing"
import { useScrollback } from "../src/hooks/useScrollback.js"

// Initialize layout engine before tests
beforeAll(async () => {
  const engine = await initYogaEngine()
  setLayoutEngine(engine)
})

const render = createRenderer({ cols: 40, rows: 10 })

interface TestItem {
  id: number
  name: string
  complete: boolean
}

describe("VirtualList frozen prop", () => {
  test("renders non-frozen items only", () => {
    const items: TestItem[] = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "done-2", complete: true },
      { id: 3, name: "active-3", complete: false },
      { id: 4, name: "active-4", complete: false },
    ]

    const app = render(
      <VirtualList
        items={items}
        frozen={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    // Frozen items should NOT be in the rendered output
    expect(app.text).not.toContain("done-1")
    expect(app.text).not.toContain("done-2")
    // Active items should be rendered
    expect(app.text).toContain("active-3")
    expect(app.text).toContain("active-4")
  })

  test("handles all items frozen", () => {
    const items: TestItem[] = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "done-2", complete: true },
    ]

    const app = render(
      <VirtualList
        items={items}
        frozen={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).not.toContain("done-1")
    expect(app.text).not.toContain("done-2")
  })

  test("only freezes contiguous prefix", () => {
    const items: TestItem[] = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "active-2", complete: false },
      { id: 3, name: "done-3", complete: true }, // NOT frozen — not contiguous
    ]

    const app = render(
      <VirtualList
        items={items}
        frozen={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).not.toContain("done-1") // frozen (prefix)
    expect(app.text).toContain("active-2") // not frozen
    expect(app.text).toContain("done-3") // not frozen (not contiguous)
  })

  test("without frozen prop, renders all items", () => {
    const items: TestItem[] = [
      { id: 1, name: "item-1", complete: true },
      { id: 2, name: "item-2", complete: false },
    ]

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).toContain("item-1")
    expect(app.text).toContain("item-2")
  })

  test("preserves original indices in renderItem", () => {
    const indices: number[] = []
    const items: TestItem[] = [
      { id: 1, name: "done", complete: true },
      { id: 2, name: "active", complete: false },
    ]

    render(
      <VirtualList
        items={items}
        frozen={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item, index) => {
          indices.push(index)
          return <Text key={item.id}>{item.name}</Text>
        }}
      />,
    )

    // Index 1 (active item) should still get its original index
    expect(indices).toContain(1)
    expect(indices).not.toContain(0)
  })

  test("frozen with no frozen items renders all", () => {
    const items: TestItem[] = [
      { id: 1, name: "active-1", complete: false },
      { id: 2, name: "active-2", complete: false },
      { id: 3, name: "active-3", complete: false },
    ]

    const app = render(
      <VirtualList
        items={items}
        frozen={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).toContain("active-1")
    expect(app.text).toContain("active-2")
    expect(app.text).toContain("active-3")
  })

  test("frozen with empty items array", () => {
    const items: TestItem[] = []

    const app = render(
      <VirtualList
        items={items}
        frozen={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    // Should render empty without errors
    expect(app.text).toBe("")
  })
})

describe("useScrollback", () => {
  test("writes newly frozen items to stdout", () => {
    const items = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "done-2", complete: true },
      { id: 3, name: "active", complete: false },
    ]

    const writtenChunks: string[] = []
    const mockStdout = {
      write(data: string) {
        writtenChunks.push(data)
        return true
      },
    }

    function TestComponent() {
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.complete,
        render: (item) => `[${item.complete ? "x" : " "}] ${item.name}`,
        stdout: mockStdout,
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestComponent />)

    // useScrollback should have written frozen items
    expect(writtenChunks.join("")).toContain("[x] done-1")
    expect(writtenChunks.join("")).toContain("[x] done-2")
    expect(writtenChunks.join("")).not.toContain("active")
    expect(app.text).toContain("frozen=2")
  })

  test("returns 0 when no items are frozen", () => {
    const items = [
      { id: 1, name: "active-1", complete: false },
      { id: 2, name: "active-2", complete: false },
    ]

    function TestComponent() {
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.complete,
        render: (item) => item.name,
        stdout: { write: () => true },
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestComponent />)
    expect(app.text).toContain("frozen=0")
  })

  test("only counts contiguous prefix", () => {
    const items = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "active", complete: false },
      { id: 3, name: "done-3", complete: true },
    ]

    function TestComponent() {
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.complete,
        render: (item) => item.name,
        stdout: { write: () => true },
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestComponent />)
    expect(app.text).toContain("frozen=1")
  })
})
