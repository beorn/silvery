/**
 * Tests for keyed child reordering in React reconciliation.
 *
 * Bug: When keyed children with nested content change positions,
 * content can disappear from remaining children.
 */

import React from "react"
import { describe, expect, it } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 40, rows: 5 })

describe("keyed child reordering", () => {
  it("preserves content when sliding window shifts (nested content)", () => {
    // Initial: items 0, 1, 2
    const app = render(
      <Box flexDirection="row">
        <Box key="item-0" width={10}>
          <Text>Item0</Text>
        </Box>
        <Box key="item-1" width={10}>
          <Text>Item1</Text>
        </Box>
        <Box key="item-2" width={10}>
          <Text>Item2</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("Item0")
    expect(app.text).toContain("Item1")
    expect(app.text).toContain("Item2")

    // Shift right: items 1, 2, 3 (0 removed, 3 added)
    app.rerender(
      <Box flexDirection="row">
        <Box key="item-1" width={10}>
          <Text>Item1</Text>
        </Box>
        <Box key="item-2" width={10}>
          <Text>Item2</Text>
        </Box>
        <Box key="item-3" width={10}>
          <Text>Item3</Text>
        </Box>
      </Box>,
    )

    // BUG: Item1 may be missing even though key="item-1" was kept
    expect(app.text).toContain("Item1")
    expect(app.text).toContain("Item2")
    expect(app.text).toContain("Item3")
  })
})
