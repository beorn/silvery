/**
 * ListView scrollTo={undefined} freeze contract.
 *
 * Documented at:
 *   - packages/ag-react/src/hooks/useVirtualizer.ts:332
 *     "When scrollTo is undefined, scroll state freezes at the last known
 *      position."
 *   - packages/ag-term/src/pipeline/layout-phase.ts:854
 *     edge-based ensure-visible only when scrollToChanged.
 *
 * These tests assert the contract holds. They currently pass at this
 * isolation level — passing scrollTo={undefined} freezes the viewport in a
 * standalone ListView. The km-tui click-suppress regression
 * (@km/tui/click-suppress-cursor-follow-scroll) showed the freeze leaking
 * under more complex conditions (per-card state subscriptions, multi-pass
 * height measurement, click-cascade re-renders). The leak point is in
 * ListView's projection of virtualizer state into Box.scrollTo when the
 * external prop is undefined (ListView.tsx:1894-1897, :2268-2273).
 *
 * Bead: @km/silvery/scrollto-undefined-freeze-leak
 * Lens: @km/silvery/scroll-authority-decoupling
 *
 * Treat this as the contract floor. Add cases that reproduce the
 * click-cascade leak as new tests; do not relax these.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import type { AgNode } from "@silvery/ag/types"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

const ITEMS = Array.from({ length: 30 }, (_, i) => ({ id: `r-${i}` }))

function FixedList({ scrollTo }: { scrollTo: number | undefined }) {
  return (
    <Box flexDirection="column" height={15}>
      <ListView
        items={ITEMS}
        height={15}
        width={20}
        estimateHeight={3}
        scrollTo={scrollTo}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={3} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />
    </Box>
  )
}

function findListViewNodeFromText(app: ReturnType<ReturnType<typeof createRenderer>>, id: string) {
  let node: AgNode | null = app.getByText(id).resolve()
  while (node !== null) {
    const props = node.props as Record<string, unknown>
    if (props["data-component"] === "ListView") return node
    node = node.parent
  }
  return null
}

function rowOfId(text: string, id: string): number {
  const stripped = stripAnsi(text)
  const lines = stripped.split("\n")
  const re = new RegExp(`(^|[^0-9])${id}([^0-9]|$)`)
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]!)) return i
  }
  return -1
}

describe("ListView scrollTo={undefined} freezes the viewport", () => {
  test("passive freeze does not project the stored virtualizer anchor into Box.scrollTo", () => {
    const render = createRenderer({ cols: 30, rows: 15 })
    const app = render(<FixedList scrollTo={10} />)

    const before = findListViewNodeFromText(app, "r-10")
    expect(before?.props).toMatchObject({
      scrollOffset: expect.any(Number),
      scrollTo: undefined,
    })

    app.rerender(<FixedList scrollTo={undefined} />)

    const after = findListViewNodeFromText(app, "r-10")
    expect(after?.props).toMatchObject({
      scrollOffset: undefined,
      scrollTo: undefined,
    })
  })

  test("transition scrollTo: number → undefined preserves the row offset of every visible card", () => {
    // 1. scrollTo=10 — virtualizer scrolls so r-10 is in the viewport with
    //    earlier items (r-0..r-?) pushed off the top.
    const render = createRenderer({ cols: 30, rows: 15 })
    const app = render(<FixedList scrollTo={10} />)

    const yPre10 = rowOfId(app.text, "r-10")
    expect(
      yPre10,
      `r-10 should be visible after scrollTo=10. text was:\n${stripAnsi(app.text)}`,
    ).toBeGreaterThanOrEqual(0)

    // Snapshot row of every visible item (id appears between │ borders).
    const preLines = stripAnsi(app.text).split("\n")
    const preRowsByLabel = new Map<string, number>()
    for (let i = 0; i < preLines.length; i++) {
      const match = preLines[i]!.match(/r-(\d+)/)
      if (match) preRowsByLabel.set(`r-${match[1]}`, i)
    }
    expect(preRowsByLabel.size, "at least 2 cards visible pre-transition").toBeGreaterThanOrEqual(2)

    // 2. Re-render with scrollTo=undefined — per documented contract this
    //    freezes the viewport at the last known position.
    app.rerender(<FixedList scrollTo={undefined} />)

    // 3. Every label that was visible before is at the same row after.
    for (const [label, preRow] of preRowsByLabel) {
      const postRow = rowOfId(app.text, label)
      expect(
        postRow,
        `${label} should stay at row ${preRow} after scrollTo→undefined; got ${postRow}.\nPost-text:\n${stripAnsi(
          app.text,
        )}`,
      ).toBe(preRow)
    }
  })

  test("scrollTo={undefined} initial mount renders item 0 at the top of the viewport", () => {
    // Sanity-floor: undefined as initial scrollTo isn't broken — viewport
    // starts at item 0. Guards against regressions when fixing the
    // transition case.
    const render = createRenderer({ cols: 30, rows: 15 })
    const app = render(<FixedList scrollTo={undefined} />)
    const y = rowOfId(app.text, "r-0")
    expect(
      y,
      `r-0 should be visible at fresh mount with scrollTo=undefined; text was:\n${stripAnsi(app.text)}`,
    ).toBeGreaterThanOrEqual(0)
  })
})
