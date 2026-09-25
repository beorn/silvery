/**
 * @failure The incremental frame kept a cell the fresh frame had cleared: removing a trailing line left stale content or tripped a SILVERY_STRICT incremental-render mismatch.
 * @level l2
 * @consumer @i/10-yrd/24169-yrd-watch-and-list-display/25483-removing-the-yrd-watch-help-line-trips-a-silvery-strict-incremental-render-mismatch
 * @testonly none
 *
 * Regression — removing a trailing line between frames must clear the line cleanly
 * with no SILVERY_STRICT mismatch between incremental and fresh renders.
 *
 * Found by yrd watch (25483 / 25417): removing the bottom help line
 * ("? for help · q leaves") between frames previously tripped a SILVERY_STRICT
 * incremental-render mismatch.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

function AppWithTrailingLine({
  lines,
  showHelpLine,
  width = 80,
  height = 10,
}: {
  lines: readonly string[]
  showHelpLine: boolean
  width?: number
  height?: number
}) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor="#102124"
      color="#d8dee9"
    >
      <Box height={1} flexShrink={0}>
        <Text bold>Header Title</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        {lines.map((line, idx) => (
          <Box key={idx} height={1}>
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>
      {showHelpLine ? (
        <Box height={1} flexShrink={0}>
          <Text color="$fg-muted">? for help · q leaves</Text>
        </Box>
      ) : null}
    </Box>
  )
}

describe("trailing line clear between frames (25483)", () => {
  test("removing a trailing help line clears trailing cells under SILVERY_STRICT", () => {
    const prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "1"
    try {
      const render = createRenderer({ cols: 80, rows: 10 })
      const sampleLines = ["Row 1: change task/a", "Row 2: change task/b", "Row 3: change task/c"]

      // Frame 1: Trailing help line is rendered
      const app = render(<AppWithTrailingLine lines={sampleLines} showHelpLine={true} />)
      expect(app.text).toContain("? for help · q leaves")
      expect(app.lines[9]).toContain("? for help · q leaves")

      // Frame 2: Trailing help line is removed between frames
      app.rerender(<AppWithTrailingLine lines={sampleLines} showHelpLine={false} />)

      // Must be absent in text and on the bottom row
      expect(app.text).not.toContain("? for help · q leaves")
      expect(app.lines[9]?.trim()).toBe("")

      // The cleared bottom row cells must match fresh background-only cells
      for (let x = 0; x < 80; x++) {
        const cell = app.cell(x, 9)
        expect(cell.char).toBe(" ")
        expect(cell.fg).toBeNull()
      }
    } finally {
      if (prevStrict === undefined) {
        delete process.env.SILVERY_STRICT
      } else {
        process.env.SILVERY_STRICT = prevStrict
      }
    }
  })

  test("toggling trailing line back and forth maintains incremental≡fresh parity", () => {
    const prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "1"
    try {
      const render = createRenderer({ cols: 80, rows: 10 })
      const sampleLines = ["Line 1", "Line 2"]

      const app = render(<AppWithTrailingLine lines={sampleLines} showHelpLine={true} />)
      expect(app.text).toContain("? for help")

      // Remove
      app.rerender(<AppWithTrailingLine lines={sampleLines} showHelpLine={false} />)
      expect(app.text).not.toContain("? for help")

      // Restore
      app.rerender(<AppWithTrailingLine lines={sampleLines} showHelpLine={true} />)
      expect(app.text).toContain("? for help")

      // Remove again
      app.rerender(<AppWithTrailingLine lines={sampleLines} showHelpLine={false} />)
      expect(app.text).not.toContain("? for help")
    } finally {
      if (prevStrict === undefined) {
        delete process.env.SILVERY_STRICT
      } else {
        process.env.SILVERY_STRICT = prevStrict
      }
    }
  })
})
