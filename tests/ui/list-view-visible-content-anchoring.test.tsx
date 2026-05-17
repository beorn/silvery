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
import {
  resolveRowsAboveViewport,
  resolveDirectionalMaintainedTopRow,
  resolveActiveAnchorCorrectionBudgetRows,
  resolveActiveScrollMeasuredHeightFallback,
  shouldApplyVisibleContentAnchoring,
} from "../../packages/ag-react/src/ui/components/list-view/use-scroll-anchoring"
import {
  captureAnchorAtViewportY,
  createContentGeometry,
  resolveScrollPositionTop,
} from "../../packages/ag-react/src/ui/components/list-view/scroll-position"
import {
  resolveActiveLeadingSpacer,
  resolveActiveScrollWindow,
} from "../../packages/ag-react/src/ui/components/list-view/scroll-authority"
import { createHeightModel } from "../../packages/ag-react/src/ui/components/list-view/height-model"

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

function renderFlexMeasuredList(
  items: Item[],
  ref: React.RefObject<ListViewHandle | null>,
): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <ListView<Item>
        ref={ref}
        items={items}
        estimateHeight={(index) => items[index]?.height ?? 1}
        getKey={(item) => item.id}
        virtualization="index"
        renderItem={(item) => (
          <Box height={item.height} flexShrink={0}>
            <Text>{item.title}</Text>
          </Box>
        )}
      />
    </Box>
  )
}

function renderUnderestimatedFlexList(
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
        virtualization="index"
        renderItem={(item) => (
          <Box height={item.height} flexShrink={0}>
            <Text>{item.title}</Text>
          </Box>
        )}
      />
    </Box>
  )
}

function renderFollowEndFlexList(
  items: Item[],
  ref: React.RefObject<ListViewHandle | null>,
  extra?: Partial<ListViewProps<Item>>,
): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <ListView<Item>
        ref={ref}
        items={items}
        estimateHeight={(index) => items[index]?.height ?? 1}
        getKey={(item) => item.id}
        follow="end"
        virtualization="index"
        renderItem={(item) => (
          <Box height={item.height} flexShrink={0}>
            <Text>{item.title}</Text>
          </Box>
        )}
        {...extra}
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

function visibleItemNumber(line: string): number {
  const match = visibleItemId(line).match(/\d+/)
  return match ? Number(match[0]) : Number.NaN
}

describe("ListView maintainVisibleContentPosition", () => {
  test("index virtualization uses the layout scroll offset as the row baseline", () => {
    const model = createHeightModel({
      itemCount: 200,
      gap: 0,
      estimate: () => 5,
    })

    expect(
      resolveRowsAboveViewport({
        virtualization: "index",
        layoutScrollOffset: 584,
        layoutOwnsScroll: true,
        virtualizerScrollOffset: 149,
        model,
      }),
    ).toBe(584)
  })

  test("index virtualization keeps cursor bootstrap as the row baseline before layout owns scroll", () => {
    const model = createHeightModel({
      itemCount: 200,
      gap: 0,
      estimate: () => 5,
    })

    expect(
      resolveRowsAboveViewport({
        virtualization: "index",
        layoutScrollOffset: 0,
        layoutOwnsScroll: false,
        virtualizerScrollOffset: 50,
        model,
      }),
    ).toBe(250)
  })

  test("visible-content anchoring applies while row-space scroll owns the viewport", () => {
    expect(
      shouldApplyVisibleContentAnchoring({
        maintainVisibleContentPosition: true,
        followOwnsViewport: false,
      }),
    ).toBe(true)
  })

  test("visible-content anchoring does not apply during active wheel ownership", () => {
    expect(
      shouldApplyVisibleContentAnchoring({
        maintainVisibleContentPosition: true,
        followOwnsViewport: false,
        wheelGestureActive: true,
      }),
    ).toBe(false)
  })

  test("visible-content anchoring does not apply while follow owns the viewport", () => {
    expect(
      shouldApplyVisibleContentAnchoring({
        maintainVisibleContentPosition: true,
        followOwnsViewport: true,
      }),
    ).toBe(false)
  })

  test("viewport anchor resolves from the previously rendered visible line", () => {
    const before = createHeightModel({
      itemCount: 6,
      gap: 0,
      estimate: (index) => (index === 1 ? 4 : 1),
    })
    const anchor = captureAnchorAtViewportY({
      geometry: createContentGeometry({
        model: before,
        keyAtIndex: (index) => `item-${index}`,
      }),
      viewportTopRow: 5,
      viewportY: 0,
    })

    expect(anchor).toEqual({
      key: "item-2",
      offset: 0,
    })

    const after = createHeightModel({
      itemCount: 6,
      gap: 0,
      estimate: (index) => (index === 0 || index === 1 ? 4 : 1),
    })

    expect(
      resolveScrollPositionTop(
        { kind: "anchored", point: anchor!, pin: { kind: "top" } },
        createContentGeometry({
          model: after,
          keyAtIndex: (index) => `item-${index}`,
        }),
        { height: 3 },
      ).topRow,
    ).toBe(8)
  })

  test("viewport anchor supports a hard end sentinel for follow=end", () => {
    const model = createHeightModel({
      itemCount: 10,
      gap: 0,
      estimate: () => 3,
    })

    expect(
      resolveScrollPositionTop(
        { kind: "end" },
        createContentGeometry({
          model,
          keyAtIndex: (index) => `item-${index}`,
        }),
        { height: 8 },
      ).topRow,
    ).toBe(22)
  })

  test("active upward scroll does not accept opposite-direction anchor correction", () => {
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 532,
        currentTopRow: 493,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
      }),
    ).toBeNull()
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 480,
        currentTopRow: 493,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
      }),
    ).toBe(480)
  })

  test("active upward scroll rejects even tiny opposite measurement corrections", () => {
    // Live transcript traces showed that allowing small opposite row-space
    // corrections kept the row counter locally plausible while the visible
    // item window reversed. During an active flick, monotonic visible motion
    // is the invariant; any opposite correction waits until scroll idle.
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 4523,
        currentTopRow: 4520,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxOppositeActiveCorrectionRows: 4,
      }),
    ).toBeNull()

    expect(
      resolveDirectionalMaintainedTopRow({
        row: 4530,
        currentTopRow: 4520,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxOppositeActiveCorrectionRows: 4,
      }),
    ).toBeNull()
  })

  test("active wheel rejects stale anchor corrections when the height model did not change", () => {
    // Latest live silvercode trace: the kinetic row moved up by the frame
    // budget (`currentTopRow=4624`), but the preserved anchor from the
    // previous frame still resolved to 4628. With no height-model change,
    // that is not measurement correction; it is a stale anchor cancelling
    // explicit wheel motion.
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 4628,
        currentTopRow: 4624,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxOppositeActiveCorrectionRows: 4,
        allowActiveAnchorCorrection: false,
      }),
    ).toBeNull()

    expect(
      resolveDirectionalMaintainedTopRow({
        row: 4620,
        currentTopRow: 4624,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxActiveCorrectionRows: 28,
        allowActiveAnchorCorrection: false,
      }),
    ).toBeNull()
  })

  test("active wheel clamps same-direction measurement jumps to the frame budget", () => {
    // Reproduces the 2026-05-15 silvercode log shape: while the user was
    // actively scrolling up, newly mounted row measurements moved the
    // maintained top row 650 rows upward with zero wheel events in that
    // interval. Measurement can preserve anchors, but it must be capped so
    // it does not become an extra scroll authority larger than the current
    // frame budget.
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 3962,
        currentTopRow: 4612,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxActiveCorrectionRows: 60,
      }),
    ).toBe(4552)

    expect(
      resolveDirectionalMaintainedTopRow({
        row: 4580,
        currentTopRow: 4612,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxActiveCorrectionRows: 60,
      }),
    ).toBe(4580)
  })

  test("active wheel anchor correction budget is frame-sized, not viewport-sized", () => {
    // Latest silvercode trace hit the active-wheel anchor cap with no wheel
    // input in that render interval: viewport=112 rows, correction=-224 rows.
    // A cap larger than the viewport turns measurement reflow into an extra
    // high-speed scroll source, which users see as a frozen frame followed by
    // a skip.
    const budget = resolveActiveAnchorCorrectionBudgetRows(112)
    expect(budget).toBe(0)

    expect(
      resolveDirectionalMaintainedTopRow({
        row: 3962,
        currentTopRow: 4612,
        activeScrollDirection: "up",
        toleranceRows: 0.5,
        maxActiveCorrectionRows: budget,
      }),
    ).toBe(4612)
  })

  test("active upward scroll keeps the rendered window stable while the anchor has buffer", () => {
    // Reproduces the latest silvercode flick-tail failure: renderScrollRow
    // moved upward, but the offscreen overscan start shifted 831 -> 830.
    // The newly mounted offscreen item had a real height different from the
    // frozen estimate, so the visible transcript moved downward by two lines.
    expect(
      resolveActiveScrollWindow({
        startIndex: 830,
        endIndex: 888,
        previousStartIndex: 831,
        previousEndIndex: 889,
        anchorFirstIndex: 856,
        anchorLastIndex: 863,
        activeScrollDirection: "up",
      }),
    ).toEqual({ startIndex: 831, endIndex: 889, clamped: true })
  })

  test("active upward scroll rejects a window recenter that moves visible content downward", () => {
    // Live silvercode trace, 2026-05-16: row-space wheel motion moved up
    // by 4 rows, but the virtual window rebased 861 -> 815. That collapsed
    // the leading spacer by ~159 rows, so renderRow-leadingHeight moved
    // DOWN by +155 rows, visibly opposite the flick direction. Since the
    // previous leading spacer still covers the row-space viewport, keep
    // that window instead of recentering the index slice.
    expect(
      resolveActiveScrollWindow({
        startIndex: 815,
        endIndex: 923,
        previousStartIndex: 861,
        previousEndIndex: 969,
        anchorFirstIndex: 819,
        anchorLastIndex: 846,
        activeScrollDirection: "up",
        renderScrollRow: 3003,
        previousRenderScrollRow: 3007,
        leadingHeight: 2825.333333333344,
        previousLeadingHeight: 2984.8000000000106,
        visibleTopClampedStartIndex: 858,
      }),
    ).toEqual({ startIndex: 861, endIndex: 969, clamped: true })
  })

  test("active upward scroll advances instead of carrying spacer debt into blank space", () => {
    expect(
      resolveActiveScrollWindow({
        startIndex: 787,
        endIndex: 921,
        previousStartIndex: 788,
        previousEndIndex: 921,
        anchorFirstIndex: 788,
        anchorLastIndex: 817,
        activeScrollDirection: "up",
        renderScrollRow: 2731,
        previousRenderScrollRow: 2734,
        leadingHeight: 2725,
        previousLeadingHeight: 2732,
        visibleTopClampedStartIndex: 787,
      }),
    ).toEqual({ startIndex: 787, endIndex: 921, clamped: true })
  })

  test("active upward scroll advances when the previous window no longer paints content", () => {
    expect(
      resolveActiveScrollWindow({
        startIndex: 787,
        endIndex: 921,
        previousStartIndex: 788,
        previousEndIndex: 921,
        anchorFirstIndex: 788,
        anchorLastIndex: 817,
        activeScrollDirection: "up",
        renderScrollRow: 2729,
        previousRenderScrollRow: 2734,
        leadingHeight: 2725,
        previousLeadingHeight: 2732,
        visibleTopClampedStartIndex: 787,
      }),
    ).toEqual({ startIndex: 787, endIndex: 921, clamped: true })
  })

  test("active upward visible-top clamp does not grow the rendered tail window", () => {
    // When the window advances upward, preserving the old end accumulates every
    // item below the viewport into the mounted slice. A long flick trace grew a
    // 60-row transcript window past 200 mounted rows, creating measurement churn.
    expect(
      resolveActiveScrollWindow({
        startIndex: 708,
        endIndex: 908,
        previousStartIndex: 709,
        previousEndIndex: 921,
        anchorFirstIndex: 709,
        anchorLastIndex: 738,
        activeScrollDirection: "up",
        renderScrollRow: 2457,
        previousRenderScrollRow: 2458,
        leadingHeight: 2454,
        previousLeadingHeight: 2458,
        visibleTopClampedStartIndex: 708,
      }),
    ).toEqual({ startIndex: 708, endIndex: 908, clamped: true })
  })

  test("active upward scroll carries intra-item spacer offset instead of reversing visible rows", () => {
    expect(
      resolveActiveLeadingSpacer({
        leadingHeight: 2454,
        activeScrollDirection: "up",
        renderScrollRow: 2457,
        previousRenderScrollRow: 2458,
        previousLeadingHeight: 2458,
        visibleTopToleranceRows: 0.01,
      }),
    ).toEqual({ leadingHeight: 2457, carryRows: 3, clamped: true })
  })

  test("active upward spacer carry does not introduce blank top rows", () => {
    expect(
      resolveActiveLeadingSpacer({
        leadingHeight: 2458,
        activeScrollDirection: "up",
        renderScrollRow: 2457,
        previousRenderScrollRow: 2458,
        previousLeadingHeight: 2458,
        visibleTopToleranceRows: 0.01,
      }),
    ).toEqual({ leadingHeight: 2458, carryRows: 0, clamped: false })
  })

  test("active upward scroll keeps the buffered window before visible-top clamping", () => {
    // When the previous window still covers the row-space viewport anchor,
    // moving the start index upward by even one item can make
    // renderRow-leadingHeight move opposite the wheel direction. Keep the
    // buffered window until the anchor reaches its edge.
    expect(
      resolveActiveScrollWindow({
        startIndex: 285,
        endIndex: 361,
        previousStartIndex: 286,
        previousEndIndex: 361,
        anchorFirstIndex: 335,
        anchorLastIndex: 355,
        activeScrollDirection: "up",
        renderScrollRow: 335,
        previousRenderScrollRow: 335,
        leadingHeight: 285,
        previousLeadingHeight: 286,
      }),
    ).toEqual({ startIndex: 286, endIndex: 361, clamped: true })
  })

  test("active upward scroll advances the window when the anchor reaches the buffer edge", () => {
    expect(
      resolveActiveScrollWindow({
        startIndex: 830,
        endIndex: 888,
        previousStartIndex: 831,
        previousEndIndex: 889,
        anchorFirstIndex: 834,
        anchorLastIndex: 842,
        activeScrollDirection: "up",
      }),
    ).toEqual({ startIndex: 830, endIndex: 888, clamped: false })
  })

  test("active downward scroll keeps the rendered window stable while the anchor has buffer", () => {
    expect(
      resolveActiveScrollWindow({
        startIndex: 832,
        endIndex: 890,
        previousStartIndex: 831,
        previousEndIndex: 889,
        anchorFirstIndex: 856,
        anchorLastIndex: 863,
        activeScrollDirection: "down",
      }),
    ).toEqual({ startIndex: 831, endIndex: 890, clamped: true })
  })

  test("wheel-driven viewport freezes the unmeasured-row fallback average until ownership resets", () => {
    // A single new measurement can move the live average, which otherwise
    // multiplies across every unmeasured transcript row and shifts the scroll
    // extent during the gesture. The fallback stays pinned for the whole
    // wheel-driven read position, including the idle handoff after the final
    // wheel packet; otherwise the viewport rebases by hundreds of rows when
    // the gesture timer expires.
    expect(
      resolveActiveScrollMeasuredHeightFallback({
        wheelGestureActive: true,
        wheelDriven: true,
        snapshotAvgMeasuredHeight: 4.75,
        liveAvgMeasuredHeight: 5.25,
      }),
    ).toBe(4.75)

    expect(
      resolveActiveScrollMeasuredHeightFallback({
        wheelGestureActive: false,
        wheelDriven: true,
        snapshotAvgMeasuredHeight: 4.75,
        liveAvgMeasuredHeight: 5.25,
      }),
    ).toBe(4.75)

    expect(
      resolveActiveScrollMeasuredHeightFallback({
        wheelGestureActive: false,
        wheelDriven: false,
        snapshotAvgMeasuredHeight: 4.75,
        liveAvgMeasuredHeight: 5.25,
      }),
    ).toBe(5.25)

    expect(
      resolveActiveScrollMeasuredHeightFallback({
        wheelGestureActive: true,
        wheelDriven: true,
        snapshotAvgMeasuredHeight: undefined,
        liveAvgMeasuredHeight: 5.25,
      }),
    ).toBe(5.25)
  })

  test("active downward scroll does not accept opposite-direction anchor correction", () => {
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 480,
        currentTopRow: 493,
        activeScrollDirection: "down",
        toleranceRows: 0.5,
      }),
    ).toBeNull()
    expect(
      resolveDirectionalMaintainedTopRow({
        row: 532,
        currentTopRow: 493,
        activeScrollDirection: "down",
        toleranceRows: 0.5,
      }),
    ).toBe(532)
  })

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

  test("preserves the visible anchor in height-independent index virtualization when rows above remeasure", () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 12 })
    const initial = makeItems(80)
    const app = r(renderFlexMeasuredList(initial, listRef))

    act(() => {
      listRef.current!.scrollBy(40)
    })
    app.rerender(renderFlexMeasuredList(initial, listRef))
    const before = visibleItemId(visibleLines(app.text)[0] ?? "")
    expect(before).toBe("Item 40")

    const expanded = initial.map((item) =>
      item.id === "item-5" || item.id === "item-6" ? { ...item, height: 4 } : item,
    )
    app.rerender(renderFlexMeasuredList(expanded, listRef))

    expect(visibleItemId(visibleLines(app.text)[0] ?? "")).toBe(before)
  })

  test("does not reverse visible position when rows above remeasure during an active upward wheel gesture", async () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 12 })
    const initial = makeItems(80)
    const app = r(renderFlexMeasuredList(initial, listRef))

    act(() => {
      listRef.current!.scrollToBottom()
    })
    app.rerender(renderFlexMeasuredList(initial, listRef))
    await app.wheel(5, 5, -1)
    const before = visibleItemId(visibleLines(app.text)[0] ?? "")
    expect(before).not.toBe("")

    const expanded = initial.map((item) =>
      item.id === "item-5" || item.id === "item-6" || item.id === "item-7"
        ? { ...item, height: 4 }
        : item,
    )
    app.rerender(renderFlexMeasuredList(expanded, listRef))

    expect(visibleItemId(visibleLines(app.text)[0] ?? "")).toBe(before)
  })

  test("lone opposite wheel bounce cannot authorize an opposite anchor correction", async () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 12 })
    const initial = makeItems(1000)
    const app = r(renderUnderestimatedFlexList(initial, listRef))

    act(() => {
      listRef.current!.scrollToBottom()
    })
    app.rerender(renderUnderestimatedFlexList(initial, listRef))

    for (let i = 0; i < 6; i++) {
      await app.wheel(5, 5, -1)
    }
    const beforeBounce = visibleItemNumber(visibleLines(app.text)[0] ?? "")
    expect(Number.isFinite(beforeBounce), `missing top item before bounce:\n${app.text}`).toBe(true)

    // A single opposite sample is filtered by useKineticScroll's
    // WheelGestureFilter, but ListView's anchor-direction state used to
    // consume the raw sample and mark the active gesture as "down".
    await app.wheel(5, 5, 1)
    const afterBounce = visibleItemNumber(visibleLines(app.text)[0] ?? "")
    expect(
      afterBounce,
      "the filtered bounce itself must not move the viewport down",
    ).toBeLessThanOrEqual(beforeBounce)

    const firstRemeasure = initial.map((item, index) =>
      index >= afterBounce - 5 && index <= afterBounce - 3 ? { ...item, height: 4 } : item,
    )
    app.rerender(renderUnderestimatedFlexList(firstRemeasure, listRef))
    const afterFirstRemeasure = visibleItemNumber(visibleLines(app.text)[0] ?? "")
    expect(
      afterFirstRemeasure,
      "first measurement churn must not reverse the upward gesture",
    ).toBeLessThanOrEqual(afterBounce)

    const secondRemeasure = initial.map((item, index) =>
      index >= afterBounce - 10 && index <= afterBounce - 5 ? { ...item, height: 4 } : item,
    )
    app.rerender(renderUnderestimatedFlexList(secondRemeasure, listRef))

    const afterRemeasure = visibleItemNumber(visibleLines(app.text)[0] ?? "")
    expect(
      afterRemeasure,
      `active upward gesture reversed after row measurements changed. before=${beforeBounce} afterBounce=${afterBounce} afterFirst=${afterFirstRemeasure} afterRemeasure=${afterRemeasure}`,
    ).toBeLessThanOrEqual(afterFirstRemeasure)
  })

  test("preserves visible anchor during active wheel when measured row model shrinks", async () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 12 })
    const tall = makeItems(80).map((item) => ({ ...item, height: 6 }))
    const app = r(renderFlexMeasuredList(tall, listRef))

    act(() => {
      listRef.current!.scrollToBottom()
    })
    app.rerender(renderFlexMeasuredList(tall, listRef))
    await app.wheel(5, 5, -1)
    const before = visibleItemId(visibleLines(app.text)[0] ?? "")
    expect(before).not.toBe("")

    const shrunk = tall.map((item, index) => (index < 40 ? { ...item, height: 1 } : item))
    app.rerender(renderFlexMeasuredList(shrunk, listRef))

    expect(visibleItemId(visibleLines(app.text)[0] ?? "")).toBe(before)
  })

  test("active upward wheel does not rearm follow=end when row measurements shrink", async () => {
    const listRef = React.createRef<ListViewHandle>()
    const r = createRenderer({ cols: 40, rows: 12 })
    const tall = makeItems(90).map((item) => ({ ...item, height: 6 }))
    const atBottomChanges: boolean[] = []
    const render = (items: Item[]) =>
      renderFollowEndFlexList(items, listRef, {
        onAtBottomChange: (value) => atBottomChanges.push(value),
      })
    const app = r(render(tall))

    act(() => {
      listRef.current!.scrollToBottom()
    })
    app.rerender(render(tall))
    await app.wheel(5, 5, -1)

    expect(atBottomChanges.at(-1), "wheel-up must disengage follow=end").toBe(false)
    atBottomChanges.length = 0

    const shrunk = tall.map((item, index) => (index < 70 ? { ...item, height: 1 } : item))
    app.rerender(render(shrunk))
    expect(
      atBottomChanges,
      "measurement shrink during an active upward wheel must not rearm follow=end",
    ).not.toContain(true)
  })
})
