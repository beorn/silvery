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
import { Text } from "@silvery/ag-react"
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
    // Regression for @km/silvercode/transcript-scroll-broken: under
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
})
