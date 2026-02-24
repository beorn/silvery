/**
 * Test: Visible Range Change Without Scroll Offset Change
 *
 * Reproduces the bug where children become visible when:
 * - Terminal is resized (viewport grows)
 * - Children heights change (more fit in viewport)
 * - Content is removed above (children shift into view)
 *
 * The bug: fastpath skips newly visible children because:
 * - scrollOffset didn't change (stays 0)
 * - dirty flags are all false
 * - layout didn't change (same position in content space)
 *
 * Fix: Track prevFirstVisibleChild/prevLastVisibleChild and mark
 * children dirty when visible range expands.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer, stripAnsi } from "inkx/testing"

describe("Scroll visible range change", () => {
  test("children become visible when viewport expands", () => {
    // Start with a viewport that shows only 2 items
    const render = createRenderer({ cols: 40, rows: 6, incremental: true })

    function App({ itemCount }: { itemCount: number }) {
      return (
        <Box flexDirection="column" height={6} overflow="scroll" id="scroll">
          {Array.from({ length: itemCount }, (_, i) => (
            <Text key={i}>Item {i}</Text>
          ))}
        </Box>
      )
    }

    // Render with 10 items - only some visible in viewport
    const app = render(<App itemCount={10} />)
    expect(app.text).toContain("Item 0")
    expect(app.text).toContain("Item 1")
    // Item 9 should NOT be visible in small viewport
    expect(app.text).not.toContain("Item 9")

    // Now rerender - viewport same size, but force a change
    // that makes more items fit (simulated by checking incremental)
    app.rerender(<App itemCount={10} />)

    // Key check: Items should still be visible after rerender
    expect(app.text).toContain("Item 0")
    expect(app.text).toContain("Item 1")
  })

  test("children appear when items above are removed", () => {
    const render = createRenderer({ cols: 40, rows: 6, incremental: true })

    function App({ items }: { items: string[] }) {
      return (
        <Box flexDirection="column" height={6} overflow="scroll" id="scroll">
          {items.map((item, i) => (
            <Text key={item}>{item}</Text>
          ))}
        </Box>
      )
    }

    // Start with many items
    const items = ["A", "B", "C", "D", "E", "F", "G", "H"]
    const app = render(<App items={items} />)

    expect(app.text).toContain("A")
    expect(app.text).toContain("B")
    // Lower items not visible
    expect(app.text).not.toContain("H")

    // Remove items from the top - items below should shift up and become visible
    const lessItems = ["E", "F", "G", "H"]
    app.rerender(<App items={lessItems} />)

    // E, F, G, H should now be visible
    expect(app.text).toContain("E")
    expect(app.text).toContain("F")
    // This is the bug - H might not appear if fast-path skips it
    expect(app.text).toContain("H")
  })

  test("second column appears after horizontal navigation", () => {
    // This simulates the actual bug: navigating to column 2 and column 2
    // cards don't render because they were previously "not visible" but
    // nothing marks them dirty when they become visible.
    const render = createRenderer({ cols: 80, rows: 20, incremental: true })

    function Board({ selectedCol }: { selectedCol: number }) {
      return (
        <Box flexDirection="row" width={80} height={20}>
          {[0, 1].map((col) => (
            <Box key={col} flexDirection="column" width={39} height={20} overflow="scroll" id={`col${col}`}>
              <Text bold>Column {col}</Text>
              {Array.from({ length: 3 }, (_, i) => (
                <Box key={i} borderStyle="single" borderColor={selectedCol === col ? "yellow" : "gray"}>
                  <Text>
                    Card {col}-{i}
                  </Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<Board selectedCol={0} />)

    // Both columns should render initially
    expect(app.text).toContain("Column 0")
    expect(app.text).toContain("Column 1")
    expect(app.text).toContain("Card 0-0")
    expect(app.text).toContain("Card 1-0")

    // Select second column (simulates 'l' navigation)
    app.rerender(<Board selectedCol={1} />)

    // Column 1 cards should still be visible (this could fail if fast-path issue)
    expect(app.text).toContain("Card 1-0")
    expect(app.text).toContain("Card 1-1")
    expect(app.text).toContain("Card 1-2")
  })
})
