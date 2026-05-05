/**
 * ListView visible-content anchoring.
 *
 * The top visible logical item should keep its screen row when content above
 * the viewport changes. This is the ListView-level equivalent of browser
 * scroll anchoring and is the primitive chat transcripts need for stable
 * disclosure expansion.
 */

import React, { act } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import {
  ListView,
  type ListViewHandle,
  type ListViewProps,
} from "../../packages/ag-react/src/ui/components/ListView"

interface Item {
  id: string
  title: string
  height: number
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
    height: 1,
  }))
}

function renderList(
  items: Item[],
  ref: React.RefObject<ListViewHandle | null>,
  extra?: Partial<ListViewProps<Item>>,
): React.ReactElement {
  return (
    <ListView<Item>
      ref={ref}
      items={items}
      height={6}
      estimateHeight={(index) => items[index]?.height ?? 1}
      getKey={(item) => item.id}
      renderItem={(item) => (
        <Box height={item.height} flexShrink={0}>
          <Text>{item.title}</Text>
        </Box>
      )}
      {...extra}
    />
  )
}

function renderWrappingList(
  items: Item[],
  ref: React.RefObject<ListViewHandle | null>,
): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <ListView<Item>
        ref={ref}
        items={items}
        estimateHeight={1}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" width="100%" flexShrink={0}>
            <Text wrap="wrap">
              {item.title} alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi
              omicron pi rho sigma tau upsilon phi chi psi omega
            </Text>
          </Box>
        )}
      />
    </Box>
  )
}

function visibleLines(text: string): string[] {
  return stripAnsi(text)
    .split("\n")
    .filter((line) => line.trim().length > 0)
}

function visibleItemId(line: string): string {
  return line.match(/Item \d+/)?.[0] ?? ""
}

describe("ListView maintainVisibleContentPosition", () => {
  test("preserves the top visible item when content above it grows", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 30, rows: 8 })
    const initial = makeItems(30)
    const app = r(renderList(initial, listRef))

    act(() => {
      listRef.current!.scrollBy(10)
    })
    app.rerender(renderList(initial, listRef))
    expect(visibleLines(app.text)[0]).toContain("Item 10")

    const expanded = initial.map((item) => (item.id === "item-2" ? { ...item, height: 4 } : item))
    app.rerender(renderList(expanded, listRef))

    expect(visibleLines(app.text)[0]).toContain("Item 10")
  })

  test("preserves the top visible item when content above it shrinks", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 30, rows: 8 })
    const expanded = makeItems(30).map((item) =>
      item.id === "item-2" ? { ...item, height: 4 } : item,
    )
    const app = r(renderList(expanded, listRef))

    act(() => {
      listRef.current!.scrollBy(13)
    })
    app.rerender(renderList(expanded, listRef))
    expect(visibleLines(app.text)[0]).toContain("Item 10")

    const shrunk = makeItems(30)
    app.rerender(renderList(shrunk, listRef))

    expect(visibleLines(app.text)[0]).toContain("Item 10")
  })

  test("preserves the top visible keyed item when items are inserted above", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 30, rows: 8 })
    const initial = makeItems(30)
    const app = r(renderList(initial, listRef))

    act(() => {
      listRef.current!.scrollBy(10)
    })
    app.rerender(renderList(initial, listRef))
    expect(visibleLines(app.text)[0]).toContain("Item 10")

    const inserted: Item[] = [
      { id: "new-a", title: "New A", height: 1 },
      { id: "new-b", title: "New B", height: 1 },
      { id: "new-c", title: "New C", height: 1 },
      ...initial,
    ]
    app.rerender(renderList(inserted, listRef))

    expect(visibleLines(app.text)[0]).toContain("Item 10")
  })

  test("preserves the top visible item when gaps contribute to row position", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 30, rows: 8 })
    const initial = makeItems(30)
    const props = { gap: 1 }
    const app = r(renderList(initial, listRef, props))

    act(() => {
      listRef.current!.scrollBy(19)
    })
    app.rerender(renderList(initial, listRef, props))
    expect(visibleLines(app.text)[0]).toContain("Item 10")

    const expanded = initial.map((item) => (item.id === "item-2" ? { ...item, height: 4 } : item))
    app.rerender(renderList(expanded, listRef, props))

    expect(visibleLines(app.text)[0]).toContain("Item 10")
  })

  test("can be disabled for raw scroll surfaces", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 30, rows: 8 })
    const initial = makeItems(30)
    const props = { maintainVisibleContentPosition: false }
    const app = r(renderList(initial, listRef, props))

    act(() => {
      listRef.current!.scrollBy(10)
    })
    app.rerender(renderList(initial, listRef, props))
    expect(visibleLines(app.text)[0]).toContain("Item 10")

    const expanded = initial.map((item) => (item.id === "item-2" ? { ...item, height: 4 } : item))
    app.rerender(renderList(expanded, listRef, props))

    expect(visibleLines(app.text)[0]).toContain("Item 7")
  })

  test("establishes a new anchor after imperative user scroll", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 30, rows: 8 })
    const initial = makeItems(30)
    const app = r(renderList(initial, listRef))

    act(() => {
      listRef.current!.scrollBy(5)
    })
    app.rerender(renderList(initial, listRef))
    expect(visibleLines(app.text)[0]).toContain("Item 5")

    act(() => {
      listRef.current!.scrollBy(5)
    })
    app.rerender(renderList(initial, listRef))
    expect(visibleLines(app.text)[0]).toContain("Item 10")

    const expanded = initial.map((item) => (item.id === "item-2" ? { ...item, height: 4 } : item))
    app.rerender(renderList(expanded, listRef))

    expect(visibleLines(app.text)[0]).toContain("Item 10")
  })

  test("preserves the top visible keyed item when viewport width reflows wrapped rows", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 90, rows: 14 })
    const initial = makeItems(50)
    const app = r(renderWrappingList(initial, listRef))

    app.rerender(renderWrappingList(initial, listRef))
    act(() => {
      listRef.current!.scrollBy(42)
    })
    app.rerender(renderWrappingList(initial, listRef))

    const before = visibleItemId(visibleLines(app.text)[0] ?? "")
    expect(before).not.toBe("")

    app.resize(130, 14)
    app.rerender(renderWrappingList(initial, listRef))

    expect(visibleItemId(visibleLines(app.text)[0] ?? "")).toBe(before)
  })
})
