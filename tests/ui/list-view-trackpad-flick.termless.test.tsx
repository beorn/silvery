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
}: {
  items: readonly RowItem[]
  listRef: React.RefObject<ListViewHandle | null>
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
})
