/**
 * Regression: visible-content anchoring must not stomp the declarative
 * `scrollTo` prop during the pre-measurement → measured transition.
 *
 * Symptom (real bug, observed via `listview-variable-heights` test #7):
 *   ListView with declarative `scrollTo={5}` on 10 uniformly tall (height=20)
 *   items + viewport=60 must scroll the inner Box so item 5 lands inside
 *   the viewport. Instead the viewport stayed pinned at the top with
 *   items g-0..g-2 visible and `▼8` indicator — `scrollTo` was silently
 *   suppressed.
 *
 * Root cause:
 *   On the first commit, useVirtualizer reports estimate-based heights
 *   (10 × 3 = 30 rows) so `scrollableRows = max(0, 30 - 60) = 0`. The
 *   visible-content anchor (`useScrollAnchoring`) computes a desired top
 *   row of 15 (rowOfIndex(5) under estimate=3), clamps it against
 *   `maxTopRow = 0`, and returns `0` as the maintained top row. ListView's
 *   `boxScrollTo` resolution treats a non-null `renderScrollRow` as
 *   authoritative and drops the declarative `scrollTo` — the next render
 *   passes `scrollTo=undefined` to the inner Box, leaving the offset at 0.
 *
 * Fix:
 *   `resolveMaintainedTopRow` returns `null` when `maxTopRow <= 0`.
 *   With nothing to scroll, anchoring has no work to do, and the
 *   declarative `scrollTo` survives the transient pre-measurement frame.
 *
 * Bead: km-silvery.listview-scrollto-anchoring-stomp.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

describe("ListView scrollTo vs anchoring", () => {
  test("declarative scrollTo at viewport-mid survives pre-measurement (no anchor stomp)", () => {
    // 10 items × height 20 → 200 rows of content, viewport=60.
    // estimateHeight=3 → totalRows under estimate = 30 (< viewport 60),
    // so first commit sees `scrollableRows = 0`. Without the anchor guard,
    // the maintained top row clamps to 0 and stomps the declarative
    // `scrollTo`, leaving the viewport pinned at the top.
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `g-${i}`, height: 20 }))
    const render = createRenderer({ cols: 60, rows: 65 })
    const app = render(
      <ListView
        items={items}
        height={60}
        width={58}
        estimateHeight={3}
        overflowIndicator
        scrollTo={5}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />,
    )
    const text = stripAnsi(app.text)
    // `scrollTo=5` must scroll the viewport — at least one of items 0..4
    // must be hidden above (so `▲N`) and at least one of 6..9 hidden
    // below (so `▼N`). With the bug, only items 0..2 render with `▼8`.
    expect(text, "must show ▲N indicator (items above viewport)").toMatch(/▲\d+/)
    expect(text, "must show ▼N indicator (items below viewport)").toMatch(/▼\d+/)
    // The viewport must reveal item 5 itself (the scroll target).
    expect(text).toContain("g-5")
  })
})
