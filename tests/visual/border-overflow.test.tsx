/**
 * Border Text Overflow Tests
 *
 * Bead: km-silvery.border-overflow
 *
 * Verifies that text rendered on border lines (scroll indicators, padCenter)
 * is truncated when the box is narrower than the text content.
 *
 * The bug: renderScrollIndicators passes indicator text (e.g., "▲100") to
 * renderTextLine without a maxCol limit. When the box is narrower than the
 * indicator text, it overflows past the border boundary — overwriting the
 * right border character and leaking into adjacent sibling boxes.
 *
 * The padCenter function also doesn't truncate: when text.length >= width,
 * it returns the text unchanged instead of slicing it.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("border text overflow", () => {
  test("scroll indicator does not overwrite right border character", () => {
    // width=5: left border (1) + content (3) + right border (1)
    // With scrollOffset=50 and 100 items, indicator is "▲50" (3 chars)
    // padCenter("▲50", 3) returns "▲50" — exactly fits.
    // But with "▲100" (4 chars), padCenter returns "▲100" unchanged,
    // and renderTextLine writes it starting at the content area start,
    // overwriting the right border cell.
    const r = createRenderer({ cols: 30, rows: 10 })

    function App() {
      return (
        <Box flexDirection="row">
          <Box
            width={5}
            height={5}
            borderStyle="single"
            overflow="scroll"
            overflowIndicator
            scrollOffset={900}
          >
            {Array.from({ length: 1000 }, (_, i) => (
              <Text key={i}>Item {i}</Text>
            ))}
          </Box>
          <Box width={20}>
            <Text>safe zone</Text>
          </Box>
        </Box>
      )
    }

    const app = r(<App />)

    // Border box is at x=0..4. Right border is at x=4.
    // Top border row is y=0.
    const buffer = app.term.buffer

    // The right border character on the top row should be a border char (┐),
    // not a digit from the scroll indicator
    const topRightCell = buffer.getCell(4, 0)
    expect(topRightCell.char).toBe("┐")

    // The cell at x=5 (outside the bordered box) should not contain
    // any scroll indicator characters
    const outsideCell = buffer.getCell(5, 0)
    expect(outsideCell.char).not.toMatch(/[▲▼\d]/)

    // "safe zone" must remain intact
    expect(app.text).toContain("safe zone")
  })

  test("scroll indicator does not overwrite bottom right border", () => {
    const r = createRenderer({ cols: 30, rows: 10 })

    function App() {
      return (
        <Box flexDirection="row">
          <Box
            width={5}
            height={5}
            borderStyle="single"
            overflow="scroll"
            overflowIndicator
            scrollOffset={0}
          >
            {Array.from({ length: 1000 }, (_, i) => (
              <Text key={i}>Item {i}</Text>
            ))}
          </Box>
          <Box width={20}>
            <Text>intact</Text>
          </Box>
        </Box>
      )
    }

    const app = r(<App />)
    const buffer = app.term.buffer

    // Bottom border row is y=4 (height=5, so rows 0-4)
    // Right border char should be ┘, not a digit
    const bottomRightCell = buffer.getCell(4, 4)
    expect(bottomRightCell.char).toBe("┘")

    // Outside the box should not have indicator chars
    const outsideCell = buffer.getCell(5, 4)
    expect(outsideCell.char).not.toMatch(/[▲▼\d]/)

    expect(app.text).toContain("intact")
  })

  test("borderless scroll indicator does not overflow narrow box", () => {
    // Borderless container with overflowIndicator — width=3.
    // Indicator text must be truncated to fit 3 columns.
    const r = createRenderer({ cols: 30, rows: 10 })

    function App() {
      return (
        <Box flexDirection="row">
          <Box width={3} height={5} overflow="scroll" overflowIndicator scrollOffset={500}>
            {Array.from({ length: 1000 }, (_, i) => (
              <Text key={i}>X</Text>
            ))}
          </Box>
          <Text>Y</Text>
        </Box>
      )
    }

    const app = r(<App />)
    const buffer = app.term.buffer

    // The box is at x=0..2 (width=3). x=3 should not have indicator chars.
    for (let row = 0; row < 5; row++) {
      const cell = buffer.getCell(3, row)
      if (cell.char === "▲" || cell.char === "▼") {
        throw new Error(`Indicator character "${cell.char}" leaked to x=3, row ${row}`)
      }
    }

    // Y should still be visible
    expect(app.text).toContain("Y")
  })

  test("padCenter truncates when text wider than available space", () => {
    // width=4: left border + 2 content cols + right border
    // indicator "▲500" is 4 chars, content width is 2 — must truncate
    const r = createRenderer({ cols: 30, rows: 8 })

    function App() {
      return (
        <Box flexDirection="row">
          <Box
            width={4}
            height={6}
            borderStyle="single"
            overflow="scroll"
            overflowIndicator
            scrollOffset={500}
          >
            {Array.from({ length: 1000 }, (_, i) => (
              <Text key={i}>Z{i}</Text>
            ))}
          </Box>
          <Text>W</Text>
        </Box>
      )
    }

    const app = r(<App />)
    const buffer = app.term.buffer

    // Right border at x=3, top row y=0: should be ┐
    const topRight = buffer.getCell(3, 0)
    expect(topRight.char).toBe("┐")

    // Outside at x=4 should not be indicator
    const outside = buffer.getCell(4, 0)
    expect(outside.char).not.toMatch(/[▲▼\d]/)

    expect(app.text).toContain("W")
  })
})
