/**
 * Border Edge Clipping Tests
 *
 * Regression tests for borders at terminal edge when flexGrow
 * distributes space unevenly (e.g., 80 cols / 3 children).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { Box, Text } from "@silvery/ag-react"

describe("border rendering at terminal edge", () => {
  test("three flexGrow boxes: right border visible (headless)", () => {
    const cols = 80
    const r = createRenderer({ cols, rows: 5 })
    const app = r(
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>A</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>B</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>C</Text>
        </Box>
      </Box>,
    )

    const buffer = app.term.buffer
    expect(buffer.getCell(cols - 1, 0).char).toBe("┐")
    expect(buffer.getCell(cols - 1, 1).char).toBe("│")
    expect(buffer.getCell(cols - 1, 2).char).toBe("┘")
  })

  test("three flexGrow boxes: right border visible (termless)", async () => {
    const cols = 80
    using term = createTermless({ cols, rows: 5 })
    const handle = await run(
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>A</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>B</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>C</Text>
        </Box>
      </Box>,
      term,
    )

    // Verify via text that top border ends with ┐ and bottom ends with ┘
    const text = term.screen!.getText()
    const lines = text.split("\n")
    // Top border line should end with ┐
    expect(lines[0]!.trimEnd().endsWith("┐")).toBe(true)
    // Bottom border line should end with ┘
    expect(lines[2]!.trimEnd().endsWith("┘")).toBe(true)

    handle.unmount()
  })

  test("two flexGrow boxes: right border visible (headless)", () => {
    const cols = 80
    const r = createRenderer({ cols, rows: 5 })
    const app = r(
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>Left</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Right</Text>
        </Box>
      </Box>,
    )

    const buffer = app.term.buffer
    expect(buffer.getCell(cols - 1, 0).char).toBe("┐")
    expect(buffer.getCell(cols - 1, 1).char).toBe("│")
    expect(buffer.getCell(cols - 1, 2).char).toBe("┘")
  })

  test("two flexGrow boxes: right border visible (termless)", async () => {
    const cols = 80
    using term = createTermless({ cols, rows: 5 })
    const handle = await run(
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>Left</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>Right</Text>
        </Box>
      </Box>,
      term,
    )

    const text = term.screen!.getText()
    const lines = text.split("\n")
    expect(lines[0]!.trimEnd().endsWith("┐")).toBe(true)
    expect(lines[2]!.trimEnd().endsWith("┘")).toBe(true)

    handle.unmount()
  })

  test("two rows of bordered boxes in column layout (headless)", () => {
    const cols = 80
    const r = createRenderer({ cols, rows: 10 })
    const app = r(
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexGrow={1} borderStyle="single">
            <Text>Row1-A</Text>
          </Box>
          <Box flexGrow={1} borderStyle="single">
            <Text>Row1-B</Text>
          </Box>
          <Box flexGrow={1} borderStyle="single">
            <Text>Row1-C</Text>
          </Box>
        </Box>
        <Box flexDirection="row">
          <Box flexGrow={1} borderStyle="single">
            <Text>Row2-A</Text>
          </Box>
          <Box flexGrow={1} borderStyle="single">
            <Text>Row2-B</Text>
          </Box>
        </Box>
      </Box>,
    )

    const buffer = app.term.buffer
    // Row 5 is the bottom border of the two-column row
    expect(buffer.getCell(cols - 1, 5).char).toBe("┘")
    // Row 3 is the top border of the two-column row
    expect(buffer.getCell(cols - 1, 3).char).toBe("┐")
  })

  test("odd terminal width: three flexGrow bordered boxes (headless)", () => {
    const cols = 81
    const r = createRenderer({ cols, rows: 5 })
    const app = r(
      <Box flexDirection="row">
        <Box flexGrow={1} borderStyle="single">
          <Text>A</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>B</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single">
          <Text>C</Text>
        </Box>
      </Box>,
    )

    const buffer = app.term.buffer
    expect(buffer.getCell(cols - 1, 0).char).toBe("┐")
    expect(buffer.getCell(cols - 1, 2).char).toBe("┘")
  })
})
