/**
 * ListView overflow-indicator behavior when content fits in viewport.
 *
 * Regression for `km-tui.column-top-disappears` (symptom: spurious `▼N`
 * indicator + blank gap at the bottom of a column when cards fit entirely
 * within the viewport).
 *
 * When total content height ≤ viewport height, no overflow indicator
 * (▲N above / ▼N below) should render — there's nothing hidden.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

describe("ListView overflowIndicator: content fits viewport", () => {
  test("20 mixed-height items in a 3x-oversized viewport: no ▼N indicator, no ▲N indicator", () => {
    // Mixed-height items: 20 items, avg ~5 rows each -> ~100 rows total.
    // Viewport: 300 rows -> 3x taller than content. Nothing should be hidden.
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i}`,
      height: i % 3 === 0 ? 7 : 3, // tall / short
    }))

    const r = createRenderer({ cols: 60, rows: 300 })
    const app = r(
      <Box flexDirection="column" height={300}>
        <ListView
          items={items}
          height={295}
          width={58}
          estimateHeight={5}
          overflowIndicator
          getKey={(item) => item.id}
          renderItem={(item) => (
            // Render each item as a Box of its configured height so the
            // scroll container sees real heights matching estimateHeight.
            <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
              <Text>{item.id}</Text>
            </Box>
          )}
        />
      </Box>,
    )

    const text = stripAnsi(app.text)

    // Canonical: no overflow indicators when everything fits.
    expect(text, "bottom overflow indicator must NOT appear when content fits").not.toMatch(/▼\d+/)
    expect(text, "top overflow indicator must NOT appear when content fits").not.toMatch(/▲\d+/)

    // Sanity: all items rendered.
    for (let i = 0; i < 20; i++) {
      expect(text).toContain(`item-${i}`)
    }
  })

  test("20 items in a viewport exactly equal to content height: no indicator", () => {
    // 20 * 3 = 60 rows of content, viewport = 60 rows.
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `x-${i}` }))

    const r = createRenderer({ cols: 40, rows: 80 })
    const app = r(
      <ListView
        items={items}
        height={60}
        width={40}
        estimateHeight={3}
        overflowIndicator
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={3} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />,
    )

    const text = stripAnsi(app.text)
    expect(text).not.toMatch(/▼\d+/)
    expect(text).not.toMatch(/▲\d+/)
  })

  test("20 items overflowing viewport: ▼N indicator DOES appear (positive control)", () => {
    // 20 * 3 = 60 rows of content, viewport = 15 rows -> content exceeds.
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `y-${i}` }))

    const r = createRenderer({ cols: 40, rows: 30 })
    const app = r(
      <ListView
        items={items}
        height={15}
        width={40}
        estimateHeight={3}
        overflowIndicator
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={3} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />,
    )

    const text = stripAnsi(app.text)
    // Positive control: when content genuinely overflows, indicator SHOULD render.
    expect(text, "positive control: overflow indicator should appear when content exceeds viewport").toMatch(/▼\d+/)
  })

  test("content barely exceeds viewport: indicator reserves its row — last card's content not overwritten", () => {
    // Edge case that reproduces the user-reported "▼1 covers the last card's
    // text" bug: `contentHeight === viewportHeight + 1` → hasOverflow=true,
    // indicatorReserve=1.
    //
    // 10 cards × 3 rows = 30 total. Viewport = 29 → hasOverflow. Card 9 sits
    // at rows [27, 28, 29] (border/text/border). The viewport extends rows
    // [0, 28]. Before the fix, the ▼1 indicator rendered at row 28 ON TOP of
    // card 9's text (the `z-9` row), producing a lone top-border (╭) with a
    // broken `▼1` beneath.
    //
    // After the fix, children are clipped at row 27 (one row above the
    // indicator), so card 9's top border at row 27 renders, but its text at
    // row 28 is correctly clipped. The indicator occupies row 28 by itself.
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `z-${i}` }))

    const r = createRenderer({ cols: 40, rows: 50 })
    const app = r(
      <ListView
        items={items}
        height={29}
        width={40}
        estimateHeight={3}
        overflowIndicator
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={3} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />,
    )

    const text = stripAnsi(app.text)

    // Cards 0-8 fully fit (rows 0-26, each card 3 rows). Card 9 is the one
    // that doesn't fit — the indicator reserves its text row.
    for (let i = 0; i < 9; i++) {
      expect(text, `fully-visible card z-${i} should render`).toContain(`z-${i}`)
    }

    // Positive control: `▼N` indicator renders for the card that didn't fit.
    expect(text, "▼N indicator should render — card 9 is clipped by the reserve").toMatch(/▼\d+/)

    // Key assertion: the indicator renders on its own row, not overlaying
    // card content. Find the line containing `▼` and verify no card ID
    // lives on it (which would indicate overwrite).
    const lines = text.split("\n")
    const indicatorLineIndex = lines.findIndex((l) => /▼\d+/.test(l))
    expect(indicatorLineIndex, "indicator line should exist").toBeGreaterThan(-1)
    const indicatorLine = lines[indicatorLineIndex] ?? ""
    expect(indicatorLine, "indicator must NOT share a row with card text").not.toMatch(/z-\d/)
  })
})
