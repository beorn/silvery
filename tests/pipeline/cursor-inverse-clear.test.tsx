/**
 * Test for cursor inverse attribute clearing during incremental rendering.
 *
 * When text content changes and the cursor (rendered via <Text inverse>)
 * moves, the old cursor position's inverse attribute must be cleared in
 * the cloned buffer. Without proper clearing, stale inverse attributes
 * persist at the old cursor position.
 *
 * Bug: km-tui cursor inverse attr mismatch in inline-edit.spec.ts
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../../src/index.js"
import { createRenderer } from "../../src/testing/index.js"
import { compareBuffers, formatMismatch } from "../../src/testing/compare-buffers.js"
import { bufferToText } from "../../src/buffer.js"

describe("cursor inverse attribute clearing (incremental)", () => {
  test("inverse attr at old cursor position is cleared when cursor moves", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    // Simulate an inline edit field with a cursor character
    function EditField({ cursorPos }: { cursorPos: number }) {
      const text = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH"
      const before = text.slice(0, cursorPos)
      const cursorChar = cursorPos < text.length ? text[cursorPos] : " "
      const after = cursorPos < text.length - 1 ? text.slice(cursorPos + 1) : ""

      return (
        <Box width={30} height={4} flexDirection="column">
          <Text>
            {before}
            <Text inverse>{cursorChar}</Text>
            {after}
          </Text>
        </Box>
      )
    }

    // Render with cursor at end of text (pos 40 = past end, cursor char is " ")
    const app = render(<EditField cursorPos={40} />, { incremental: true })

    const buf1 = app.lastBuffer()
    expect(buf1).toBeTruthy()

    // Find the old cursor position (inverse space on the second line)
    let oldCursorX = -1
    for (let x = 0; x < 30; x++) {
      const cell = buf1!.getCell(x, 1)
      if (cell.attrs.inverse) {
        oldCursorX = x
        break
      }
    }
    expect(oldCursorX).toBeGreaterThan(0)

    // Now move cursor to start (pos 0)
    app.rerender(<EditField cursorPos={0} />)

    // Explicitly check the old cursor position - should NOT have inverse
    const incBuf = app.lastBuffer()!
    const oldCell = incBuf.getCell(oldCursorX, 1)
    expect(oldCell.attrs.inverse).toBeFalsy()

    // Also compare full buffers
    const freshBuf = app.freshRender()
    const mismatch = compareBuffers(incBuf, freshBuf)

    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        key: "rerender",
        incrementalText: bufferToText(incBuf),
        freshText: bufferToText(freshBuf),
      })
      expect.fail(`Incremental rendering mismatch:\n${msg}`)
    }
  })

  test("inverse attr cleared on wrapped text when cursor moves from end to start", () => {
    const render = createRenderer({ cols: 20, rows: 5 })

    function EditField({ cursorPos }: { cursorPos: number }) {
      const text = "AAAA BBBB CCCC DDDD EEEE"
      const before = text.slice(0, cursorPos)
      const cursorChar = cursorPos < text.length ? text[cursorPos] : " "
      const after = cursorPos + 1 < text.length ? text.slice(cursorPos + 1) : ""

      return (
        <Box width={20} height={4}>
          <Text wrap="wrap">
            {before}
            <Text inverse>{cursorChar}</Text>
            {after}
          </Text>
        </Box>
      )
    }

    // Cursor at end (past text length)
    const app = render(<EditField cursorPos={24} />, { incremental: true })

    // Move cursor to start
    app.rerender(<EditField cursorPos={0} />)

    const incBuf = app.lastBuffer()!
    const freshBuf = app.freshRender()
    const mismatch = compareBuffers(incBuf, freshBuf)

    if (mismatch) {
      const msg = formatMismatch(mismatch, { key: "rerender" })
      expect.fail(`Incremental rendering mismatch:\n${msg}`)
    }
  })

  test("inverse attr cleared in bordered card inside scroll container", () => {
    const render = createRenderer({ cols: 30, rows: 20 })

    // Mimic board structure: scroll container > card (bordered box) > text
    function Board({ cursorPos }: { cursorPos: number }) {
      const text = "AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH"
      const before = text.slice(0, cursorPos)
      const cursorChar = cursorPos < text.length ? text[cursorPos] : " "
      const after = cursorPos + 1 < text.length ? text.slice(cursorPos + 1) : ""

      return (
        <Box width={30} height={20} flexDirection="column">
          <Box overflow="scroll" height={18} flexDirection="column">
            <Box borderStyle="round" flexDirection="column">
              <Text wrap="wrap">
                {before}
                <Text inverse>{cursorChar}</Text>
                {after}
              </Text>
            </Box>
            <Box borderStyle="round" flexDirection="column">
              <Text>Other card</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    // Cursor at end of text (position 40 = past end, shows inverse space)
    const app = render(<Board cursorPos={40} />, { incremental: true })

    // Move cursor to start
    app.rerender(<Board cursorPos={0} />)

    const incBuf = app.lastBuffer()!
    const freshBuf = app.freshRender()
    const mismatch = compareBuffers(incBuf, freshBuf)

    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        key: "rerender",
        incrementalText: bufferToText(incBuf),
        freshText: bufferToText(freshBuf),
      })
      expect.fail(`Incremental rendering mismatch:\n${msg}`)
    }
  })
})
