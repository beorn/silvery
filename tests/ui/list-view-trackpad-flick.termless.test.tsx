/**
 * ListView real-input trackpad flick reproduction.
 *
 * This uses createTermless() and the mouse.trackpadFlick() backend so the test
 * replays timestamped SGR-Pixels wheel packet groups, not direct App.wheel()
 * calls or 50ms bucket approximations.
 */

import React, { act, useState } from "react"
import { describe, expect, test } from "vitest"
import {
  createTermless,
  parseTermlessTrackpadFlickProfileFromDebugLog,
  type TermlessTrackpadFlickProfile,
} from "@silvery/test"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { getPassHistogram, resetPassHistogram } from "../../packages/ag-term/src/runtime/pass-cause"
import { Box, ListView, Text } from "../../src/index"
import type { ListViewHandle } from "../../packages/ag-react/src/ui/components/ListView"

interface RowItem {
  id: string
  label: string
  height: number
}

const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const USER_LOG_SINGLE_UP_FLICK_PACKETS: TermlessTrackpadFlickProfile = {
  x: 40,
  y: 76,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 8, height: 17 },
  packets: [
    { atMs: 0, count: 1, direction: "up" },
    { atMs: 1, count: 1, direction: "up" },
    { atMs: 1, count: 1, button: 67, direction: "down" },
    { atMs: 37, count: 1, direction: "up" },
    { atMs: 38, count: 11, direction: "up" },
    { atMs: 77, count: 20, direction: "up" },
    { atMs: 78, count: 1, direction: "up" },
    { atMs: 117, count: 13, direction: "up" },
    { atMs: 118, count: 3, direction: "up" },
    { atMs: 154, count: 12, direction: "up" },
    { atMs: 189, count: 11, direction: "up" },
    { atMs: 228, count: 10, direction: "up" },
    { atMs: 266, count: 8, direction: "up" },
    { atMs: 303, count: 3, direction: "up" },
    { atMs: 304, count: 4, direction: "up" },
    { atMs: 367, count: 8, direction: "up" },
    { atMs: 435, count: 7, direction: "up" },
    { atMs: 509, count: 4, direction: "up" },
    { atMs: 558, count: 3, direction: "up" },
    { atMs: 560, count: 1, direction: "up" },
    { atMs: 626, count: 3, direction: "up" },
    { atMs: 688, count: 1, direction: "up" },
    { atMs: 731, count: 1, direction: "up" },
    { atMs: 767, count: 1, direction: "up" },
    { atMs: 800, count: 1, direction: "up" },
    { atMs: 859, count: 1, direction: "up" },
    { atMs: 902, count: 1, direction: "up" },
    { atMs: 1000, count: 1, direction: "up" },
    { atMs: 1133, count: 1, direction: "up" },
  ],
}

const USER_LOG_DENSE_UP_FLICK_PACKETS: TermlessTrackpadFlickProfile = {
  x: 128,
  y: 49,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 14, height: 26 },
  packets: [
    { atMs: 0, count: 4, direction: "up" },
    { atMs: 36, count: 19, direction: "up" },
    { atMs: 76, count: 7, direction: "up" },
    { atMs: 76, count: 1, direction: "down" },
    { atMs: 76, count: 20, direction: "up" },
    { atMs: 109, count: 2, direction: "up" },
    { atMs: 110, count: 17, direction: "up" },
    { atMs: 140, count: 12, direction: "up" },
    { atMs: 206, count: 28, direction: "up" },
    { atMs: 244, count: 15, direction: "up" },
    { atMs: 284, count: 11, direction: "up" },
    { atMs: 316, count: 6, direction: "up" },
    { atMs: 347, count: 8, direction: "up" },
    { atMs: 377, count: 6, direction: "up" },
    { atMs: 407, count: 3, direction: "up" },
    { atMs: 436, count: 1, direction: "up" },
    { atMs: 437, count: 3, direction: "up" },
    { atMs: 535, count: 10, direction: "up" },
    { atMs: 564, count: 2, direction: "up" },
    { atMs: 593, count: 2, direction: "up" },
    { atMs: 622, count: 1, direction: "up" },
    { atMs: 652, count: 2, direction: "up" },
    { atMs: 680, count: 1, direction: "up" },
    { atMs: 708, count: 1, direction: "up" },
    { atMs: 737, count: 1, direction: "up" },
    { atMs: 832, count: 2, direction: "up" },
    { atMs: 861, count: 1, direction: "up" },
    { atMs: 888, count: 1, direction: "up" },
    { atMs: 972, count: 1, direction: "up" },
    { atMs: 1055, count: 1, direction: "up" },
    { atMs: 1144, count: 1, direction: "up" },
    { atMs: 1318, count: 1, direction: "up" },
  ],
}

const USER_LOG_20260517_SLIP_UP_FLICK_PACKETS: TermlessTrackpadFlickProfile = {
  x: 40,
  y: 76,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 8, height: 17 },
  packets: [
    { atMs: 0, count: 1, direction: "up" },
    { atMs: 48, count: 1, direction: "up" },
    { atMs: 49, count: 3, direction: "up" },
    { atMs: 98, count: 49, direction: "up" },
    { atMs: 151, count: 10, direction: "up" },
    { atMs: 152, count: 26, direction: "up" },
    { atMs: 202, count: 22, direction: "up" },
    { atMs: 250, count: 10, direction: "up" },
    { atMs: 251, count: 3, direction: "up" },
    { atMs: 252, count: 6, direction: "up" },
    { atMs: 297, count: 11, direction: "up" },
    { atMs: 350, count: 14, direction: "up" },
    { atMs: 390, count: 11, direction: "up" },
    { atMs: 434, count: 8, direction: "up" },
    { atMs: 436, count: 1, direction: "up" },
    { atMs: 489, count: 6, direction: "up" },
    { atMs: 531, count: 4, direction: "up" },
    { atMs: 572, count: 3, direction: "up" },
    { atMs: 612, count: 2, direction: "up" },
    { atMs: 651, count: 3, direction: "up" },
    { atMs: 686, count: 1, direction: "up" },
    { atMs: 724, count: 1, direction: "up" },
    { atMs: 764, count: 1, direction: "up" },
    { atMs: 804, count: 1, direction: "up" },
    { atMs: 849, count: 1, direction: "up" },
    { atMs: 890, count: 1, direction: "up" },
    { atMs: 951, count: 1, direction: "up" },
    { atMs: 1051, count: 1, direction: "up" },
    { atMs: 1184, count: 1, direction: "up" },
  ],
}

const USER_LOG_20260517_REPEATED_UP_FLICK_PACKETS: TermlessTrackpadFlickProfile = {
  x: 40,
  y: 76,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 8, height: 17 },
  packets: [
    { atMs: 0, count: 1, direction: "up" },
    { atMs: 1, count: 1, direction: "up" },
    { atMs: 77, count: 18, direction: "up" },
    { atMs: 78, count: 45, direction: "up" },
    { atMs: 79, count: 10, direction: "up" },
    { atMs: 158, count: 23, direction: "up" },
    { atMs: 159, count: 40, direction: "up" },
    { atMs: 160, count: 2, direction: "up" },
    { atMs: 238, count: 42, direction: "up" },
    { atMs: 239, count: 7, direction: "up" },
    { atMs: 315, count: 1, direction: "up" },
    { atMs: 316, count: 32, direction: "up" },
    { atMs: 318, count: 7, direction: "up" },
    { atMs: 394, count: 24, direction: "up" },
    { atMs: 395, count: 2, direction: "up" },
    { atMs: 472, count: 23, direction: "up" },
    { atMs: 546, count: 13, direction: "up" },
    { atMs: 618, count: 11, direction: "up" },
    { atMs: 687, count: 2, direction: "up" },
    { atMs: 750, count: 1, direction: "up" },
    { atMs: 809, count: 11, direction: "up" },
    { atMs: 810, count: 52, direction: "up" },
    { atMs: 811, count: 25, direction: "up" },
    { atMs: 881, count: 21, direction: "up" },
    { atMs: 882, count: 41, direction: "up" },
    { atMs: 950, count: 32, direction: "up" },
    { atMs: 951, count: 15, direction: "up" },
    { atMs: 952, count: 11, direction: "up" },
    { atMs: 1019, count: 18, direction: "up" },
    { atMs: 1020, count: 21, direction: "up" },
    { atMs: 1086, count: 6, direction: "up" },
    { atMs: 1087, count: 27, direction: "up" },
    { atMs: 1154, count: 27, direction: "up" },
    { atMs: 1220, count: 1, direction: "up" },
    { atMs: 1221, count: 21, direction: "up" },
    { atMs: 1283, count: 12, direction: "up" },
    { atMs: 1344, count: 3, direction: "up" },
    { atMs: 1345, count: 10, direction: "up" },
    { atMs: 1409, count: 9, direction: "up" },
    { atMs: 1468, count: 6, direction: "up" },
    { atMs: 1526, count: 3, direction: "up" },
    { atMs: 1583, count: 2, direction: "up" },
    { atMs: 1634, count: 2, direction: "up" },
    { atMs: 1689, count: 2, direction: "up" },
    { atMs: 1740, count: 1, direction: "up" },
    { atMs: 1790, count: 1, direction: "up" },
    { atMs: 1901, count: 1, direction: "up" },
    { atMs: 1952, count: 50, direction: "up" },
    { atMs: 1952, count: 1, direction: "down" },
    { atMs: 1953, count: 22, direction: "up" },
  ],
}

const USER_LOG_20260518_SLOW_SPARSE_UP_DRAG_PACKETS: TermlessTrackpadFlickProfile = {
  x: 196.14285714285714,
  y: 49,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 14, height: 26 },
  packets: [
    { atMs: 0, count: 1, direction: "up" },
    { atMs: 83, count: 1, direction: "up" },
    { atMs: 173, count: 1, direction: "up" },
    { atMs: 271, count: 1, direction: "up" },
    { atMs: 370, count: 1, direction: "up" },
    { atMs: 370, count: 1, direction: "down" },
    { atMs: 466, count: 1, direction: "up" },
    { atMs: 467, count: 1, direction: "down" },
    { atMs: 566, count: 1, direction: "up" },
    { atMs: 640, count: 1, direction: "down" },
    { atMs: 723, count: 1, direction: "down" },
    { atMs: 733, count: 1, direction: "up" },
    { atMs: 833, count: 1, direction: "down" },
    { atMs: 950, count: 1, direction: "up" },
    { atMs: 1021, count: 1, direction: "down" },
    { atMs: 1133, count: 1, direction: "down" },
    { atMs: 1166, count: 1, direction: "up" },
    { atMs: 1250, count: 1, direction: "down" },
    { atMs: 1350, count: 1, direction: "up" },
    { atMs: 1420, count: 1, direction: "down" },
    { atMs: 1566, count: 1, direction: "up" },
    { atMs: 1633, count: 1, direction: "down" },
    { atMs: 1683, count: 1, direction: "up" },
    { atMs: 1752, count: 1, direction: "down" },
    { atMs: 1816, count: 1, direction: "up" },
    { atMs: 1883, count: 1, direction: "down" },
    { atMs: 2034, count: 1, direction: "up" },
    { atMs: 2101, count: 1, direction: "down" },
    { atMs: 2166, count: 1, direction: "down" },
    { atMs: 2183, count: 1, direction: "up" },
    { atMs: 2283, count: 1, direction: "down" },
    { atMs: 2333, count: 1, direction: "up" },
    { atMs: 2402, count: 1, direction: "down" },
    { atMs: 2483, count: 1, direction: "up" },
    { atMs: 2519, count: 1, direction: "down" },
    { atMs: 2566, count: 1, direction: "up" },
    { atMs: 2635, count: 1, direction: "up" },
    { atMs: 2635, count: 1, direction: "down" },
    { atMs: 2683, count: 1, direction: "up" },
    { atMs: 2746, count: 1, direction: "up" },
    { atMs: 2819, count: 1, direction: "up" },
    { atMs: 2883, count: 1, direction: "up" },
    { atMs: 2950, count: 1, direction: "up" },
    { atMs: 3166, count: 1, direction: "up" },
    { atMs: 3266, count: 1, direction: "down" },
  ],
}

const USER_LOG_20260516_UP_FLICK_PACKETS: TermlessTrackpadFlickProfile = {
  x: 189.07142857142858,
  y: 59,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 14, height: 26 },
  packets: [
    { atMs: 0, count: 3, direction: "up" },
    { atMs: 1, count: 9, direction: "up" },
    { atMs: 44, count: 10, direction: "up" },
    { atMs: 44, count: 1, direction: "down" },
    { atMs: 44, count: 11, direction: "up" },
    { atMs: 89, count: 5, direction: "up" },
    { atMs: 90, count: 25, direction: "up" },
    { atMs: 129, count: 17, direction: "up" },
    { atMs: 160, count: 10, direction: "up" },
    { atMs: 161, count: 5, direction: "up" },
    { atMs: 200, count: 20, direction: "up" },
    { atMs: 239, count: 12, direction: "up" },
    { atMs: 282, count: 12, direction: "up" },
    { atMs: 283, count: 3, direction: "up" },
    { atMs: 322, count: 8, direction: "up" },
    { atMs: 372, count: 10, direction: "up" },
    { atMs: 407, count: 6, direction: "up" },
    { atMs: 446, count: 4, direction: "up" },
    { atMs: 483, count: 6, direction: "up" },
    { atMs: 522, count: 2, direction: "up" },
    { atMs: 560, count: 2, direction: "up" },
    { atMs: 599, count: 3, direction: "up" },
    { atMs: 633, count: 1, direction: "up" },
    { atMs: 670, count: 1, direction: "up" },
    { atMs: 706, count: 1, direction: "up" },
    { atMs: 742, count: 1, direction: "up" },
    { atMs: 777, count: 1, direction: "up" },
    { atMs: 826, count: 1, direction: "up" },
    { atMs: 884, count: 1, direction: "up" },
    { atMs: 933, count: 1, direction: "up" },
    { atMs: 1087, count: 1, direction: "up" },
    { atMs: 1247, count: 1, direction: "up" },
  ],
}

const SYNTHETIC_BURST_THEN_IDLE_UP_FLICK: TermlessTrackpadFlickProfile = {
  x: 40,
  y: 76,
  direction: "up",
  coordinateMode: "pixel",
  cellSize: { width: 8, height: 17 },
  packets: [{ atMs: 0, count: 240, direction: "up" }],
}

function makeVariableRows(count: number): RowItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    label: `Line ${String(index).padStart(4, "0")}`,
    height: index % 13 === 0 ? 14 : index % 5 === 0 ? 8 : 2 + (index % 4),
  }))
}

function makeUniformRows(count: number): RowItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `uniform-row-${index}`,
    label: `Line ${String(index).padStart(4, "0")}`,
    height: 1,
  }))
}

function makeIdleHandoffRows(count: number): RowItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `handoff-row-${index}`,
    label: `Line ${String(index).padStart(4, "0")}`,
    // Match the live failure shape: the initially visible tail is short,
    // then the upward flick measures a much taller region. The measured
    // average rises during the gesture; the viewport must not rebase when
    // the wheel gesture idles.
    height: index >= count - 90 ? 2 : index >= count - 620 ? 8 : 3,
  }))
}

function FlickList({
  items,
  listRef,
  continuousWheelMultiplier,
}: {
  items: readonly RowItem[]
  listRef: React.RefObject<ListViewHandle | null>
  continuousWheelMultiplier?: number
}): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <ListView<RowItem>
        ref={listRef}
        items={[...items]}
        estimateHeight={1}
        getKey={(item) => item.id}
        follow="end"
        virtualization="index"
        enableInputCadenceDetection
        continuousWheelMultiplier={continuousWheelMultiplier}
        viewportBottomInset={5}
        scrollbarVisibility="always"
        renderItem={(item) => (
          <Box height={item.height} flexShrink={0}>
            <Text>{item.label}</Text>
          </Box>
        )}
      />
    </Box>
  )
}

function FixedHeightFlickList({
  items,
  listRef,
}: {
  items: readonly RowItem[]
  listRef: React.RefObject<ListViewHandle | null>
}): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      <ListView<RowItem>
        ref={listRef}
        items={[...items]}
        height={100}
        estimateHeight={1}
        getKey={(item) => item.id}
        follow="end"
        virtualization="index"
        enableInputCadenceDetection
        viewportBottomInset={5}
        scrollbarVisibility="always"
        renderItem={(item) => (
          <Box height={item.height} flexShrink={0}>
            <Text>{item.label}</Text>
          </Box>
        )}
      />
    </Box>
  )
}

function MutableHeightFlickList({
  listRef,
  mutateRef,
}: {
  listRef: React.RefObject<ListViewHandle | null>
  mutateRef: React.RefObject<(() => void) | null>
}): React.ReactElement {
  const [expandedAbove, setExpandedAbove] = useState(false)
  mutateRef.current = () => setExpandedAbove(true)
  const items = Array.from({ length: 900 }, (_, index) => ({
    id: `mutable-row-${index}`,
    label: `Line ${String(index).padStart(4, "0")}`,
    height: expandedAbove && index < 700 ? 2 : 1,
  }))

  return <FlickList items={items} listRef={listRef} />
}

function MovingViewportFlickList({
  listRef,
  moveRef,
}: {
  listRef: React.RefObject<ListViewHandle | null>
  moveRef: React.RefObject<(() => void) | null>
}): React.ReactElement {
  const [top, setTop] = useState(1)
  moveRef.current = () => setTop((value) => (value === 1 ? 5 : 1))
  const items = makeUniformRows(160)

  return (
    <Box position="relative" width={80} height={32}>
      <Box position="absolute" top={top} left={0} width={80} height={20}>
        <ListView<RowItem>
          ref={listRef}
          items={[...items]}
          height={18}
          estimateHeight={1}
          getKey={(item) => item.id}
          follow="end"
          virtualization="index"
          renderItem={(item) => <Text>{item.label}</Text>}
        />
      </Box>
    </Box>
  )
}

function visibleLineNumbers(text: string): number[] {
  const numbers: number[] = []
  for (const match of text.matchAll(/Line\s+(\d+)/g)) {
    numbers.push(Number(match[1]))
  }
  return numbers
}

function newestVisibleLine(text: string): number | null {
  const numbers = visibleLineNumbers(text)
  return numbers.length === 0 ? null : Math.max(...numbers)
}

function oldestVisibleLine(text: string): number | null {
  const numbers = visibleLineNumbers(text)
  return numbers.length === 0 ? null : Math.min(...numbers)
}

function upwardReversals(samples: readonly { label: string; oldest: number | null }[]): string[] {
  const reversals: string[] = []
  let prev: { label: string; oldest: number } | null = null
  for (const sample of samples) {
    if (sample.oldest === null) continue
    if (prev !== null && sample.oldest > prev.oldest + 1) {
      reversals.push(`${prev.label}:${prev.oldest} -> ${sample.label}:${sample.oldest}`)
    }
    prev = { label: sample.label, oldest: sample.oldest }
  }
  return reversals
}

function longestUnchangedOldestRun(samples: readonly { oldest: number | null }[]): number {
  let longest = 0
  let current = 0
  let previous: number | null = null
  for (const sample of samples) {
    if (sample.oldest === null) continue
    if (previous !== null && sample.oldest === previous) {
      current++
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
    previous = sample.oldest
  }
  return longest
}

function largestOldestStep(samples: readonly { oldest: number | null }[]): number {
  let largest = 0
  let previous: number | null = null
  for (const sample of samples) {
    if (sample.oldest === null) continue
    if (previous !== null) largest = Math.max(largest, Math.abs(sample.oldest - previous))
    previous = sample.oldest
  }
  return largest
}

function layoutInvalidateEdgeCount(edge: string): number {
  const layoutInvalidates = getPassHistogram().byCause.find(
    (entry) => entry.cause === "layout-invalidate",
  )
  return layoutInvalidates?.topEdges.find((entry) => entry.edge === edge)?.count ?? 0
}

describe("ListView trackpad flick replay through termless", () => {
  test("parses timestamped wheel packets from silvery debug logs", () => {
    const log = [
      {
        time: "2026-05-15T18:02:19.865Z",
        name: "silvery:input-owner",
        msg: 'parsed mouse: action=wheel button=0 x=166.57142857142858 y=71 delta=-1 bytes="\u001b[<64;2333;1847M"',
      },
      {
        time: "2026-05-15T18:02:19.865Z",
        name: "silvery:input-owner",
        msg: 'parsed mouse: action=wheel button=0 x=166.57142857142858 y=71 delta=-1 bytes="\u001b[<64;2333;1847M"',
      },
      {
        time: "2026-05-15T18:02:19.900Z",
        name: "silvery:input-owner",
        msg: 'parsed mouse: action=wheel button=0 x=166.57142857142858 y=71 delta=1 bytes="\u001b[<67;2333;1847M"',
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n")

    const profile = parseTermlessTrackpadFlickProfileFromDebugLog(log)

    expect(profile.coordinateMode).toBe("pixel")
    expect(profile.cellSize).toEqual({ width: 14, height: 26 })
    expect(profile.x).toBeCloseTo(166.57142857142858)
    expect(profile.y).toBe(71)
    expect(profile.packets).toEqual([
      { atMs: 0, count: 2, delta: -1, button: 64 },
      { atMs: 35, count: 1, delta: 1, button: 67 },
    ])
  })

  test("parses JSON-escaped SGR-Pixels bytes from loggily debug logs", () => {
    const log = [
      {
        time: "2026-05-15T22:09:05.207Z",
        name: "silvery:input-owner",
        msg: 'parsed mouse: action=wheel button=0 x=108 y=62.69230769230769 delta=-1 bytes="\\u001b[<64;1513;1631M"',
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n")

    const profile = parseTermlessTrackpadFlickProfileFromDebugLog(log)

    expect(profile.coordinateMode).toBe("pixel")
    expect(profile.cellSize).toEqual({ width: 14, height: 26 })
    expect(profile.packets).toEqual([{ atMs: 0, count: 1, delta: -1, button: 64 }])
  })

  test("does not add a large idle-handoff jump after a captured upward flick", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeVariableRows(1265)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; newest: number | null; eventCount: number }[] = [
        { label: "initial", newest: newestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_SINGLE_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            newest: newestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(1000)
      samples.push({
        label: "settled",
        newest: newestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      expect(result.eventCount).toBe(134)
      expect(samples[0]?.newest).not.toBeNull()
      expect(samples.at(-1)?.newest).toBeLessThan(samples[0]!.newest!)

      const beforeSettled = samples[samples.length - 2]!
      const settled = samples.at(-1)!
      const handoffJump =
        beforeSettled.newest === null || settled.newest === null
          ? 0
          : Math.abs(settled.newest - beforeSettled.newest)
      expect(
        handoffJump,
        samples
          .slice(-8)
          .map((sample) => `${sample.label}@${sample.eventCount}:${sample.newest}`)
          .join(", "),
      ).toBeLessThanOrEqual(8)
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("keeps row position stable when measured average changes during idle handoff", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeIdleHandoffRows(1265)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; newest: number | null; eventCount: number }[] = [
        { label: "initial", newest: newestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_SINGLE_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            newest: newestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(1000)
      samples.push({
        label: "settled",
        newest: newestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      const beforeSettled = samples[samples.length - 2]!
      const settled = samples.at(-1)!
      const handoffJump =
        beforeSettled.newest === null || settled.newest === null
          ? 0
          : Math.abs(settled.newest - beforeSettled.newest)
      expect(
        handoffJump,
        samples
          .slice(-8)
          .map((sample) => `${sample.label}@${sample.eventCount}:${sample.newest}`)
          .join(", "),
      ).toBeLessThanOrEqual(8)
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("keeps upward direction active while a burst backlog drains across idle handoff", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const mutateRef = React.createRef<(() => void) | null>()
    const handle: RunHandle = await run(
      <MutableHeightFlickList listRef={listRef} mutateRef={mutateRef} />,
      term,
      {
        mouse: true,
      },
    )
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      await term.mouse.trackpadFlick(SYNTHETIC_BURST_THEN_IDLE_UP_FLICK)
      await settle(850)
      const beforeMutation = oldestVisibleLine(term.screen.getText())

      act(() => {
        mutateRef.current?.()
      })
      const tailSamples: { label: string; oldest: number | null }[] = []
      for (let i = 0; i < 12; i++) {
        await settle(20)
        tailSamples.push({ label: `tail-${i}`, oldest: oldestVisibleLine(term.screen.getText()) })
      }
      const afterMutation = tailSamples.at(-1)?.oldest ?? null

      expect(beforeMutation).not.toBeNull()
      expect(afterMutation).not.toBeNull()
      expect(
        afterMutation!,
        `upward flick reversed during smooth-drain idle handoff: before=${beforeMutation} after=${afterMutation}`,
      ).toBeLessThanOrEqual(beforeMutation! + 1)
      expect(
        upwardReversals([{ label: "before-mutation", oldest: beforeMutation }, ...tailSamples]),
        tailSamples.map((sample) => `${sample.label}:${sample.oldest}`).join(", "),
      ).toEqual([])
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("does not reverse the top visible line during a captured upward flick tail", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeVariableRows(1265)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()) },
      ]
      await term.mouse.trackpadFlick(USER_LOG_SINGLE_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
          })
        },
      })
      await settle(1000)
      samples.push({ label: "settled", oldest: oldestVisibleLine(term.screen.getText()) })

      expect(
        upwardReversals(samples),
        samples.map((sample) => `${sample.label}:${sample.oldest}`).join(", "),
      ).toEqual([])
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("does not reverse the top visible line during the latest captured upward flick", async () => {
    using term = createTermless({ cols: 363, rows: 123 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeVariableRows(1271)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()) },
      ]
      await term.mouse.trackpadFlick(USER_LOG_20260516_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
          })
        },
      })
      await settle(1000)
      samples.push({ label: "settled", oldest: oldestVisibleLine(term.screen.getText()) })

      expect(
        upwardReversals(samples),
        samples.map((sample) => `${sample.label}:${sample.oldest}`).join(", "),
      ).toEqual([])
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("keeps advancing during a dense captured upward flick over stable row heights", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeUniformRows(1271)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null; eventCount: number }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_DENSE_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(1000)
      samples.push({
        label: "settled",
        oldest: oldestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      const initial = samples[0]?.oldest
      const settled = samples.at(-1)?.oldest
      expect(result.eventCount).toBe(191)
      expect(initial).not.toBeNull()
      expect(settled).not.toBeNull()
      expect(
        initial! - settled!,
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeGreaterThanOrEqual(90)
      expect(
        longestUnchangedOldestRun(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeLessThanOrEqual(5)
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("calibrates continuous trackpad packets so captured flicks do not jump whole screens", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeUniformRows(1271)
    const handle: RunHandle = await run(
      <FlickList items={items} listRef={listRef} continuousWheelMultiplier={0.2} />,
      term,
      {
        mouse: true,
      },
    )
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null; eventCount: number }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_20260517_SLIP_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(300)
      samples.push({
        label: "settled",
        oldest: oldestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      const initial = samples[0]?.oldest
      const settled = samples.at(-1)?.oldest
      expect(result.eventCount).toBe(203)
      expect(initial).not.toBeNull()
      expect(settled).not.toBeNull()
      expect(
        initial! - settled!,
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeGreaterThanOrEqual(30)
      expect(
        initial! - settled!,
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeLessThanOrEqual(70)
      expect(
        largestOldestStep(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeLessThanOrEqual(15)
      expect(
        upwardReversals(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toEqual([])
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("preserves enough input during the latest captured slip flick", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeUniformRows(1271)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null; eventCount: number }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_20260517_SLIP_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(800)
      samples.push({
        label: "settled",
        oldest: oldestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      const initial = samples[0]?.oldest
      const settled = samples.at(-1)?.oldest
      expect(result.eventCount).toBe(203)
      expect(initial).not.toBeNull()
      expect(settled).not.toBeNull()
      expect(
        initial! - settled!,
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeGreaterThanOrEqual(120)
      expect(
        upwardReversals(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toEqual([])
      expect(
        longestUnchangedOldestRun(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeLessThanOrEqual(5)
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("preserves grip during the latest captured slow sparse upward drag", async () => {
    using term = createTermless({ cols: 363, rows: 123 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeUniformRows(1271)
    const handle: RunHandle = await run(
      <FlickList items={items} listRef={listRef} continuousWheelMultiplier={0.435} />,
      term,
      {
        mouse: true,
      },
    )
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null; eventCount: number }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_20260518_SLOW_SPARSE_UP_DRAG_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      await settle(300)
      samples.push({
        label: "settled",
        oldest: oldestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      const initial = samples[0]?.oldest
      const settled = samples.at(-1)?.oldest
      expect(result.eventCount).toBe(45)
      expect(initial).not.toBeNull()
      expect(settled).not.toBeNull()
      expect(
        initial! - settled!,
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeGreaterThanOrEqual(65)
      expect(
        upwardReversals(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toEqual([])
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test.skipIf(process.env.SILVERY_INSTRUMENT !== "1")(
    "does not treat measurement-only rows as scroll/screen rect subscribers during a flick",
    async () => {
      using term = createTermless({ cols: 302, rows: 117 })
      const listRef = React.createRef<ListViewHandle>()
      const items = makeUniformRows(1271)
      const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
        mouse: true,
      })
      try {
        await settle(120)
        act(() => {
          listRef.current?.scrollToBottom()
        })
        await settle(120)

        resetPassHistogram()
        await term.mouse.trackpadFlick(USER_LOG_20260517_SLIP_UP_FLICK_PACKETS)
        await settle(800)

        const scrollRectInvalidates = layoutInvalidateEdgeCount("scrollRect")
        const screenRectInvalidates = layoutInvalidateEdgeCount("screenRect")
        const boxRectInvalidates = layoutInvalidateEdgeCount("boxRect")
        expect(
          scrollRectInvalidates + screenRectInvalidates,
          getPassHistogram()
            .byCause.map(
              (entry) =>
                `${entry.cause}: ${entry.topEdges.map((edge) => `${edge.edge}=${edge.count}`).join(", ")}`,
            )
            .join(" | "),
        ).toBeLessThanOrEqual(20)
        expect(
          boxRectInvalidates,
          getPassHistogram()
            .byCause.map(
              (entry) =>
                `${entry.cause}: ${entry.topEdges.map((edge) => `${edge.edge}=${edge.count}`).join(", ")}`,
            )
            .join(" | "),
        ).toBeLessThanOrEqual(60)
      } finally {
        handle.unmount()
      }
    },
    20_000,
  )

  test.skipIf(process.env.SILVERY_INSTRUMENT !== "1")(
    "does not emit boxRect invalidations for measured row y-only movement",
    async () => {
      using term = createTermless({ cols: 302, rows: 117 })
      const listRef = React.createRef<ListViewHandle>()
      const items = makeVariableRows(1271)
      const handle: RunHandle = await run(
        <FixedHeightFlickList items={items} listRef={listRef} />,
        term,
        {
          mouse: true,
        },
      )
      try {
        await settle(120)
        act(() => {
          listRef.current?.scrollToBottom()
        })
        await settle(120)

        resetPassHistogram()
        await term.mouse.trackpadFlick(USER_LOG_20260517_SLIP_UP_FLICK_PACKETS)
        await settle(800)

        const boxRectInvalidates = layoutInvalidateEdgeCount("boxRect")
        expect(
          boxRectInvalidates,
          getPassHistogram()
            .byCause.map(
              (entry) =>
                `${entry.cause}: ${entry.topEdges.map((edge) => `${edge.edge}=${edge.count}`).join(", ")}`,
            )
            .join(" | "),
        ).toBeLessThanOrEqual(60)
      } finally {
        handle.unmount()
      }
    },
    20_000,
  )

  test.skipIf(process.env.SILVERY_INSTRUMENT !== "1")(
    "does not emit boxRect invalidations when only the viewport y position changes",
    async () => {
      using term = createTermless({ cols: 100, rows: 40 })
      const listRef = React.createRef<ListViewHandle>()
      const moveRef = React.createRef<(() => void) | null>()
      const handle: RunHandle = await run(
        <MovingViewportFlickList listRef={listRef} moveRef={moveRef} />,
        term,
        { mouse: true },
      )
      try {
        await settle(120)
        act(() => {
          listRef.current?.scrollToBottom()
        })
        await settle(120)

        resetPassHistogram()
        act(() => {
          moveRef.current?.()
        })
        await settle(120)

        const boxRectInvalidates = layoutInvalidateEdgeCount("boxRect")
        expect(
          boxRectInvalidates,
          getPassHistogram()
            .byCause.map(
              (entry) =>
                `${entry.cause}: ${entry.topEdges.map((edge) => `${edge.edge}=${edge.count}`).join(", ")}`,
            )
            .join(" | "),
        ).toBe(0)
      } finally {
        handle.unmount()
      }
    },
    20_000,
  )

  test("accumulates repeated captured upward flick bursts instead of dropping them", async () => {
    using term = createTermless({ cols: 302, rows: 117 })
    const listRef = React.createRef<ListViewHandle>()
    const items = makeUniformRows(2500)
    const handle: RunHandle = await run(<FlickList items={items} listRef={listRef} />, term, {
      mouse: true,
    })
    try {
      await settle(120)
      act(() => {
        listRef.current?.scrollToBottom()
      })
      await settle(120)

      const samples: { label: string; oldest: number | null; eventCount: number }[] = [
        { label: "initial", oldest: oldestVisibleLine(term.screen.getText()), eventCount: 0 },
      ]
      const result = await term.mouse.trackpadFlick(USER_LOG_20260517_REPEATED_UP_FLICK_PACKETS, {
        afterGroup(group) {
          samples.push({
            label: `packet-${group.atMs}`,
            oldest: oldestVisibleLine(term.screen.getText()),
            eventCount: group.eventCount,
          })
        },
      })
      const lastPacket = samples.at(-1)
      await settle(300)
      samples.push({
        label: "settled",
        oldest: oldestVisibleLine(term.screen.getText()),
        eventCount: result.eventCount,
      })

      const initial = samples[0]?.oldest
      const settled = samples.at(-1)?.oldest
      expect(result.eventCount).toBe(759)
      expect(initial).not.toBeNull()
      expect(settled).not.toBeNull()
      expect(
        initial! - settled!,
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeGreaterThanOrEqual(560)
      expect(
        upwardReversals(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toEqual([])
      expect(
        longestUnchangedOldestRun(samples),
        samples.map((sample) => `${sample.label}@${sample.eventCount}:${sample.oldest}`).join(", "),
      ).toBeLessThanOrEqual(4)
      if (
        lastPacket !== undefined &&
        lastPacket.oldest !== null &&
        settled !== null &&
        settled !== undefined
      ) {
        expect(Math.abs(settled - lastPacket.oldest)).toBeLessThanOrEqual(80)
      }
    } finally {
      handle.unmount()
    }
  }, 30_000)
})
