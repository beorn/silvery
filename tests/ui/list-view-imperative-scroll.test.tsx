/**
 * ListView imperative-scroll API: scrollBy / scrollToTop / scrollToBottom.
 *
 * These methods drive the row-space viewport position from outside the
 * ListView so app-level keybindings (e.g. silvercode's Shift+Up/Down/
 * PageUp/Down) can scroll the message stream when keyboard focus lives
 * elsewhere (CommandBox). Mirror the wheel handler's semantics — viewport
 * moves but cursor doesn't, and `follow="end"` auto-follow disengages on
 * any explicit scroll (rearmed by `scrollToBottom()`).
 *
 * Bead: km-silvercode.no-keyboard-scroll-from-command-box.
 */

import React, { act } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { useVirtualizer } from "../../packages/ag-react/src/hooks/useVirtualizer"
import {
  ListView,
  type ListViewHandle,
  type ListViewProps,
} from "../../packages/ag-react/src/ui/components/ListView"

interface Item {
  id: string
  title: string
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, title: `Item ${i}` }))
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
      height={8}
      renderItem={(item) => <Text>{item.title}</Text>}
      getKey={(item) => item.id}
      {...extra}
    />
  )
}

describe("ListView imperative scroll API", () => {
  test("scrollBy moves the viewport down and reveals later items", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 0")

    act(() => {
      listRef.current!.scrollBy(15)
    })
    app.rerender(renderList(items, listRef))
    const scrolled = stripAnsi(app.text)
    expect(scrolled).toContain("Item 15")
  })

  test("scrollToTop returns viewport to row 0", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))

    act(() => {
      listRef.current!.scrollBy(20)
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).not.toContain("Item 0")

    act(() => {
      listRef.current!.scrollToTop()
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 0")
  })

  test("scrollToBottom snaps to the last item", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))

    act(() => {
      listRef.current!.scrollToBottom()
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 49")
  })

  test('scrollToTop disengages follow="end" so the viewport stays at top', () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef, { follow: "end" }))
    // follow="end" → tail visible initially.
    expect(stripAnsi(app.text)).toContain("Item 49")
    // scrollToTop with follow="end" still engaged.
    act(() => {
      listRef.current!.scrollToTop()
    })
    app.rerender(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).toContain("Item 0")
    // Stays at top across re-renders.
    app.rerender(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).toContain("Item 0")
  })

  test("scrollBy clamps to [0, maxScrollRow]", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))

    act(() => {
      listRef.current!.scrollBy(-1000)
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 0")

    act(() => {
      listRef.current!.scrollBy(10000)
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 49")
  })

  test("burst scrollBy(-1) calls without re-render compose — each call sees its own previous write", () => {
    // Regression for @km/code/transcript-scroll-broken: under
    // `follow="end"`, App-level Shift+Up bursts dispatch many scrollBy(-1)
    // calls within a single React tick. If `scrollBy` seeds from the
    // React-state `physics.scrollFloat`, every call in the burst reads the
    // same stale value and the increments collapse to a single-row scroll.
    // The fix routes the seed through `getScrollFloat()` (ref-current).
    const items = makeItems(60)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef, { follow: "end" }))
    // follow="end" → tail visible initially.
    expect(stripAnsi(app.text)).toContain("Item 59")

    // 15 consecutive scrollBy(-1) inside ONE act — no React commit
    // between them. Without the ref-current seed fix, only the first call
    // would move the viewport.
    act(() => {
      for (let i = 0; i < 15; i++) listRef.current!.scrollBy(-1)
    })
    app.rerender(renderList(items, listRef, { follow: "end" }))
    const after = stripAnsi(app.text)
    // 15 rows up from the tail must hide the very last items.
    expect(after).not.toContain("Item 59")
    expect(after).not.toContain("Item 58")
  })

  test('scrollBy(-1) from follow="end" works when nav is disabled', () => {
    const items = makeItems(60)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef, { follow: "end", nav: false }))
    expect(stripAnsi(app.text)).toContain("Item 59")

    act(() => {
      listRef.current!.scrollBy(-1)
    })
    app.rerender(renderList(items, listRef, { follow: "end", nav: false }))
    expect(stripAnsi(app.text)).not.toContain("Item 59")
  })

  test('scrollToBottom re-engages follow="end" auto-follow on subsequent appends', () => {
    let items = makeItems(20)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef, { follow: "end" }))
    // follow="end" → tail visible initially.
    expect(stripAnsi(app.text)).toContain("Item 19")

    // Scroll up — leaves the tail.
    act(() => {
      listRef.current!.scrollBy(-30)
    })
    app.rerender(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).toContain("Item 0")

    // Append new items: scrollBy disengaged follow, so tail should NOT
    // be visible after the append.
    items = [...items, ...makeItems(10).map((_, i) => ({ id: `new-${i}`, title: `New ${i}` }))]
    app.rerender(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).not.toContain("New 9")

    // Now scrollToBottom — re-arms follow="end" snap.
    act(() => {
      listRef.current!.scrollToBottom()
    })
    app.rerender(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).toContain("New 9")
  })

  test("scrollBy clamped at the bottom edge flashes the bottom overscroll indicator", () => {
    // Intent-based edge bump for the imperative path: app-level keyboard
    // scroll (silvercode Ctrl+Down) and forwarded wheel events both go
    // through scrollBy. A scroll request that clamps at the edge is intent
    // to move past it — same cue as the wheel handler's onEdgeReached and
    // moveTo's cursor bump. Without this, scrolling at the end from the
    // keyboard (or with the pointer over an overlay that forwards wheel
    // deltas) gives no "you hit the end" feedback at all.
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).toContain("Item 49")
    expect(stripAnsi(app.text)).not.toContain("▄▄▄▄▄▄▄▄▄▄")

    act(() => {
      listRef.current!.scrollBy(5)
    })
    app.rerender(renderList(items, listRef, { follow: "end" }))
    expect(stripAnsi(app.text)).toContain("▄▄▄▄▄▄▄▄▄▄")
  })

  test("scrollBy clamped at the top edge flashes the top overscroll indicator", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 0")
    expect(stripAnsi(app.text)).not.toContain("▀▀▀▀▀▀▀▀▀▀")

    act(() => {
      listRef.current!.scrollBy(-5)
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("▀▀▀▀▀▀▀▀▀▀")
  })

  test("scrollBy on a list whose content fits stays silent — no spurious edge bump", () => {
    const items = makeItems(3)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))

    act(() => {
      listRef.current!.scrollBy(5)
      listRef.current!.scrollBy(-5)
    })
    app.rerender(renderList(items, listRef))
    expect(stripAnsi(app.text)).not.toContain("▄▄▄▄▄▄▄▄▄▄")
    expect(stripAnsi(app.text)).not.toContain("▀▀▀▀▀▀▀▀▀▀")
  })

  test("scrollToItem with center alignment vertically centers target item in viewport", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))
    expect(stripAnsi(app.text)).toContain("Item 0")

    act(() => {
      listRef.current!.scrollToItem(25, "center")
    })
    app.rerender(renderList(items, listRef))
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // In an 8-row viewport, item 25 centered has items 21..28 visible with item 25 at index 4
    expect(itemLines.length).toBe(8)
    expect(itemLines[0]).toContain("Item 21")
    expect(itemLines[4]).toContain("Item 25")
    expect(itemLines[7]).toContain("Item 28")
    expect(scrolled).not.toContain("Item 20")
    expect(scrolled).not.toContain("Item 29")
  })

  test("scrollToItem with end alignment places target item at bottom of viewport", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(renderList(items, listRef))

    act(() => {
      listRef.current!.scrollToItem(25, "end")
    })
    app.rerender(renderList(items, listRef))
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // In an 8-row viewport with end alignment, items 18..25 are visible with item 25 at bottom (index 7)
    expect(itemLines.length).toBe(8)
    expect(itemLines[0]).toContain("Item 18")
    expect(itemLines[7]).toContain("Item 25")
    expect(scrolled).not.toContain("Item 17")
    expect(scrolled).not.toContain("Item 26")
  })

  test("C1 pin: a height-independent list in a box shorter than terminal centers target item in the box after layout", () => {
    const items = makeItems(50)
    function Harness({ listItems }: { listItems: Item[] }) {
      const listRef = React.useRef<ListViewHandle | null>(null)
      React.useEffect(() => {
        listRef.current?.scrollToItem(25, "center")
      }, [listItems])
      return (
        <Box height={8} flexDirection="column">
          <ListView<Item>
            ref={listRef}
            items={listItems}
            renderItem={(item) => <Text>{item.title}</Text>}
            getKey={(item) => item.id}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 25 })
    const app = r(<Harness listItems={items} />)
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // Centered in the 8-row box, NOT the 25-row terminal
    expect(itemLines.length).toBe(8)
    expect(itemLines[0]).toContain("Item 21")
    expect(itemLines[4]).toContain("Item 25")
    expect(itemLines[7]).toContain("Item 28")
  })

  test("C3 pin: useVirtualizer scrollToItem callback identity is stable across renders with same count", () => {
    const callbacks: Array<(index: number, align?: "start" | "center" | "end") => void> = []
    function Harness({ step }: { step: number }) {
      const v = useVirtualizer({
        count: 50,
        estimateHeight: 1,
        viewportHeight: 10,
      })
      callbacks.push(v.scrollToItem)
      return <Text>step:{step}</Text>
    }
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<Harness step={1} />)
    app.rerender(<Harness step={2} />)
    expect(callbacks.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < callbacks.length; i++) {
      expect(callbacks[i]).toBe(callbacks[0])
    }
  })

  test("D1 pin: a list with an unmounted prefix centers target item i, not i - unmountedCount, when scrollToItem is called before layout", () => {
    const items = makeItems(50)
    function Harness({ listItems }: { listItems: Item[] }) {
      const listRef = React.useRef<ListViewHandle | null>(null)
      React.useEffect(() => {
        listRef.current?.scrollToItem(25, "center")
      }, [listItems])
      return (
        <Box height={8} flexDirection="column">
          <ListView<Item>
            ref={listRef}
            items={listItems}
            unmounted={(_item, index) => index < 10}
            renderItem={(item) => <Text>{item.title}</Text>}
            getKey={(item) => item.id}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 25 })
    const app = r(<Harness listItems={items} />)
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // Target item 25 centered in 8-row box (rowsAbove = 4, rowsBelow = 3)
    // Visible items are 21..28 with item 25 at index 4 (NOT 15 which would occur if unmounted prefix was double-subtracted)
    expect(itemLines.length).toBe(8)
    expect(itemLines[0]).toContain("Item 21")
    expect(itemLines[4]).toContain("Item 25")
    expect(itemLines[7]).toContain("Item 28")
    expect(scrolled).not.toContain("Item 15")
  })

  test("D2 pin: odd viewport with 1-row item centers target item with equal rows above and below", () => {
    const items = makeItems(50)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 15 })
    const app = r(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={9}
        renderItem={(item) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    act(() => {
      listRef.current!.scrollToItem(25, "center")
    })
    app.rerender(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={9}
        renderItem={(item) => <Text>{item.title}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // In a 9-row viewport with 1-row item, rowsAbove = (9-1)/2 = 4 and rowsBelow = 4 (equal!)
    // Target item 25 is at index 4, with 4 items above (21..24) and 4 items below (26..29)
    expect(itemLines.length).toBe(9)
    expect(itemLines[0]).toContain("Item 21")
    expect(itemLines[4]).toContain("Item 25")
    expect(itemLines[8]).toContain("Item 29")
    expect(scrolled).not.toContain("Item 20")
    expect(scrolled).not.toContain("Item 30")
  })

  test("D2 pin: odd viewport with 3-row item centers target item with equal rows above and below", () => {
    const items = makeItems(30)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 15 })
    const app = r(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={9}
        estimateHeight={3}
        renderItem={(item) => (
          <Box height={3} flexShrink={0} flexDirection="column">
            <Text>{item.title}</Text>
            <Text>{item.title}-b</Text>
            <Text>{item.title}-c</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    act(() => {
      listRef.current!.scrollToItem(10, "center")
    })
    app.rerender(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={9}
        estimateHeight={3}
        renderItem={(item) => (
          <Box height={3} flexShrink={0} flexDirection="column">
            <Text>{item.title}</Text>
            <Text>{item.title}-b</Text>
            <Text>{item.title}-c</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // In a 9-row viewport with 3-row items, rowsAbove = (9-3)/2 = 3 and rowsBelow = 3 (equal!)
    // Target Item 10 is centered: 3 rows (Item 9) above and 3 rows (Item 11) below.
    expect(itemLines.length).toBe(9)
    expect(itemLines[0]).toContain("Item 9")
    expect(itemLines[3]).toContain("Item 10")
    expect(itemLines[6]).toContain("Item 11")
    expect(scrolled).not.toContain("Item 8")
    expect(scrolled).not.toContain("Item 12")
  })

  test("D2 pin: even viewport with 2-row item centers target item with equal rows above and below", () => {
    const items = makeItems(30)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 15 })
    const app = r(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={8}
        estimateHeight={2}
        renderItem={(item) => (
          <Box height={2} flexShrink={0} flexDirection="column">
            <Text>{item.title}</Text>
            <Text>{item.title}-sub</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    act(() => {
      listRef.current!.scrollToItem(10, "center")
    })
    app.rerender(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={8}
        estimateHeight={2}
        renderItem={(item) => (
          <Box height={2} flexShrink={0} flexDirection="column">
            <Text>{item.title}</Text>
            <Text>{item.title}-sub</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // In an 8-row viewport with 2-row items, rowsAbove = (8-2)/2 = 3 and rowsBelow = 3 (equal!)
    // Target Item 10 starts at row 20. Top row of viewport is 20 - 3 = 17.
    // Row 17: Item 8's 2nd line (1 row)
    // Rows 18-19: Item 9 (2 rows) -> 3 rows above Item 10
    // Rows 20-21: Item 10 (2 rows, centered)
    // Rows 22-23: Item 11 (2 rows)
    // Row 24: Item 12's 1st line (1 row) -> 3 rows below Item 10
    expect(itemLines.length).toBe(8)
    expect(itemLines[0]).toContain("Item 8-sub")
    expect(itemLines[1]).toContain("Item 9")
    expect(itemLines[3]).toContain("Item 10")
    expect(itemLines[5]).toContain("Item 11")
    expect(itemLines[7]).toContain("Item 12")
    expect(scrolled).not.toContain("Item 7")
    expect(scrolled).not.toContain("Item 13")
  })

  test("D2 pin: odd viewport with 2-row item puts spare row below (3 above and 4 below)", () => {
    const items = makeItems(30)
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 15 })
    const app = r(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={9}
        estimateHeight={2}
        renderItem={(item) => (
          <Box height={2} flexShrink={0} flexDirection="column">
            <Text>{item.title}</Text>
            <Text>{item.title}-sub</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    act(() => {
      listRef.current!.scrollToItem(10, "center")
    })
    app.rerender(
      <ListView<Item>
        ref={listRef}
        items={items}
        height={9}
        estimateHeight={2}
        renderItem={(item) => (
          <Box height={2} flexShrink={0} flexDirection="column">
            <Text>{item.title}</Text>
            <Text>{item.title}-sub</Text>
          </Box>
        )}
        getKey={(item) => item.id}
      />,
    )
    const scrolled = stripAnsi(app.text)
    const itemLines = scrolled.split("\n").filter((l) => l.includes("Item "))
    // In a 9-row viewport with 2-row items, rowsAbove = floor(9/2) - floor(2/2) = 4 - 1 = 3, rowsBelow = 4 (spare row below!)
    // Target Item 10 starts at row 20. Top row of viewport is 20 - 3 = 17.
    // Row 17: Item 8's 2nd line (1 row)
    // Rows 18-19: Item 9 (2 rows) -> 3 rows above Item 10
    // Rows 20-21: Item 10 (2 rows, centered at index 3)
    // Rows 22-23: Item 11 (2 rows)
    // Rows 24-25: Item 12 (2 rows) -> 4 rows below Item 10
    expect(itemLines.length).toBe(9)
    expect(itemLines[0]).toContain("Item 8-sub")
    expect(itemLines[1]).toContain("Item 9")
    expect(itemLines[3]).toContain("Item 10")
    expect(itemLines[5]).toContain("Item 11")
    expect(itemLines[7]).toContain("Item 12")
    expect(scrolled).not.toContain("Item 7")
    expect(scrolled).not.toContain("Item 13")
  })
})
