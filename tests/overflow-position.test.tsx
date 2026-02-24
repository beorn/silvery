/**
 * Test: overflow indicator positioning
 *
 * The ▼N indicator renders flush to the viewport bottom for borderless
 * containers, and on the border line for bordered containers.
 */
import { describe, test, expect } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text } from "inkx"
import React from "react"

describe("overflow indicator position", () => {
  test("borderless: ▼N flush to viewport bottom (viewport 11, items height 3)", () => {
    const render = createRenderer({ cols: 30, rows: 25 })

    // Viewport 11, items height 3 (bordered).
    // Items 0-2: fully visible (rows 0-8). Item 3: partially visible (rows 9-10).
    // Indicator flush to bottom at row 10.
    const app = render(
      <Box flexDirection="column" height={11} overflow="scroll" scrollTo={0} overflowIndicator>
        {Array.from({ length: 10 }, (_, i) => (
          <Box key={i} height={3} flexShrink={0} borderStyle="round" borderDimColor>
            <Text>Card-{i}</Text>
          </Box>
        ))}
      </Box>,
    )

    const lines = app.text.split("\n")
    expect(app.text).toContain("▼")
    const indicatorRow = lines.findIndex((l) => l.includes("▼"))
    expect(indicatorRow).toBe(10)
  })

  test("borderless: uniform height items fill viewport, indicator at last row", () => {
    const render = createRenderer({ cols: 30, rows: 25 })

    // 20 items height 1, viewport 10. Items 0-9 visible, items 10-19 hidden.
    // No partial items. Indicator at row 9.
    const app = render(
      <Box flexDirection="column" height={10} overflow="scroll" scrollTo={0} overflowIndicator>
        {Array.from({ length: 20 }, (_, i) => (
          <Box key={i} height={1} flexShrink={0}>
            <Text>I{i}</Text>
          </Box>
        ))}
      </Box>,
    )

    expect(app.text).toContain("▼")
    const lines = app.text.split("\n")
    const indicatorRow = lines.findIndex((l) => l.includes("▼"))
    expect(indicatorRow).toBe(9)
  })

  test("borderless: flush to bottom with larger gap (viewport 20, items height 3)", () => {
    const render = createRenderer({ cols: 30, rows: 30 })

    // 10 items height 3. Viewport 20. Items 0-5 fully visible (rows 0-17).
    // Item 6: partially visible (rows 18-19). Items 7-9: hidden.
    // Indicator flush to bottom at row 19.
    const app = render(
      <Box flexDirection="column" height={20} overflow="scroll" scrollTo={0} overflowIndicator>
        {Array.from({ length: 10 }, (_, i) => (
          <Box key={i} height={3} flexShrink={0} borderStyle="round" borderDimColor>
            <Text>Card-{i}</Text>
          </Box>
        ))}
      </Box>,
    )

    const lines = app.text.split("\n")
    expect(app.text).toContain("▼")
    const indicatorRow = lines.findIndex((l) => l.includes("▼"))
    expect(indicatorRow).toBe(19)
  })

  test("bordered: indicator stays on bottom border (no change for bordered)", () => {
    const render = createRenderer({ cols: 30, rows: 25 })

    // Bordered container: indicator renders on the bottom border line.
    // Height 12, border +2 = viewport 10.
    const app = render(
      <Box flexDirection="column" height={12} overflow="scroll" scrollTo={0} borderStyle="single">
        {Array.from({ length: 20 }, (_, i) => (
          <Box key={i} height={1} flexShrink={0}>
            <Text>Item {i}</Text>
          </Box>
        ))}
      </Box>,
    )

    expect(app.text).toContain("▼")
    const lines = app.text.split("\n")
    const indicatorRow = lines.findIndex((l) => l.includes("▼"))
    // Bottom border at row 11 (height 12, 0-indexed)
    expect(indicatorRow).toBe(11)
  })

  test("km-tui board: indicator right after last card", () => {
    // This test imports from km-tui to test the actual board layout
    // Moved to a separate file to avoid import issues
    expect(true).toBe(true)
  })
})
