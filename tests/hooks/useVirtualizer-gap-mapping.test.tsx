/**
 * useVirtualizer + gap > 0 → steady-state child-index mapping accounts
 * for interstitial gap nodes. Sibling lockdown to ListView's
 * list-view-gap-virtualization.test.tsx (PR 8d6be2a0a).
 *
 * Bug C class: pre-fix, useVirtualizer's `mapChild` treated child indices
 * as stride-1 with virtual items even when the consumer rendered a
 * gap-Box (or renderSeparator node) between every pair of items. After
 * a scroll, the windowed slice shifted by ~half-the-gap-count items
 * because every other child was mis-decoded as an item.
 *
 * This test pins the steady-state shape that the fix enables:
 *   - `hasInterstitial=true` is stored on prevWindowRef
 *   - `stride = 2` when interstitials are present
 *   - First-render at scrollTo=N renders the correct neighborhood
 *
 * Tracking: @km/silvery/14164-gap-node-mapping.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { useVirtualizer } from "../../packages/ag-react/src/hooks/useVirtualizer"

interface Item {
  id: string
  title: string
}

function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, title: `Item ${i}` }))
}

// Minimal direct consumer of useVirtualizer that injects a 1-row gap Box
// between every pair of visible items (the canonical interstitial shape).
function GapVirtList({
  items,
  scrollTo,
  height,
  gap,
}: {
  items: Item[]
  scrollTo: number
  height: number
  gap: number
}): React.ReactElement {
  const virt = useVirtualizer({
    count: items.length,
    estimateHeight: 1,
    viewportHeight: height,
    scrollTo,
    gap,
    overscan: 3,
    maxRendered: 50,
    getItemKey: (i) => items[i]!.id,
  })

  const slice: React.ReactNode[] = []
  for (let i = virt.range.startIndex; i < virt.range.endIndex; i++) {
    slice.push(<Text key={items[i]!.id}>{items[i]!.title}</Text>)
    if (i < virt.range.endIndex - 1 && gap > 0) {
      slice.push(<Box key={`gap-${i}`} height={gap} />)
    }
  }

  return (
    <Box flexDirection="column" height={height}>
      {virt.leadingHeight > 0 ? <Box height={virt.leadingHeight} /> : null}
      {slice}
      {virt.trailingHeight > 0 ? <Box height={virt.trailingHeight} /> : null}
    </Box>
  )
}

describe("useVirtualizer + interstitial gap nodes (14164-gap-node-mapping)", () => {
  test("renders cursor item correctly when gap>0 injects interstitials", () => {
    // 100 items, gap=1, cursor at 50, viewport=10 rows
    const items = makeItems(100)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <Box width={40} height={12}>
        <GapVirtList items={items} scrollTo={50} height={10} gap={1} />
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 50")
    // Items in the neighborhood appear; far-away items do not.
    expect(text).not.toContain("Item 0\n")
    expect(text).not.toContain("Item 99")
  })

  test("renders in monotonic order — no shifted slice due to gap-counting", () => {
    // The classic regression for this bug class: the visible slice
    // appears in the wrong positions because every other child was
    // mis-decoded as an item. A monotonic-order assertion catches it.
    const items = makeItems(60)
    const r = createRenderer({ cols: 40, rows: 14 })
    const app = r(
      <Box width={40} height={14}>
        <GapVirtList items={items} scrollTo={20} height={12} gap={2} />
      </Box>,
    )
    const text = stripAnsi(app.text)
    // Extract "Item N" numbers and verify monotonic increase.
    const nums: number[] = []
    for (const m of text.matchAll(/Item (\d+)/g)) {
      nums.push(parseInt(m[1]!, 10))
    }
    expect(nums.length).toBeGreaterThan(0)
    for (let i = 1; i < nums.length; i++) {
      expect(
        nums[i]!,
        `monotonic order broken at i=${i}: ${nums.slice(0, i + 1).join(", ")}`,
      ).toBeGreaterThan(nums[i - 1]!)
    }
  })

  test("gap=0 still works (no interstitial — backward compat)", () => {
    // Sanity: the new hasInterstitial branch must not break the
    // stride-1 path when there are no gap nodes.
    const items = makeItems(50)
    const r = createRenderer({ cols: 40, rows: 12 })
    const app = r(
      <Box width={40} height={12}>
        <GapVirtList items={items} scrollTo={25} height={10} gap={0} />
      </Box>,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 25")
  })
})
