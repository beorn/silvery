/**
 * Wide Character Overflow Clipping in Incremental Rendering
 *
 * Bug: Wide characters (grapheme width 2) in a narrow container (width 1)
 * would write a continuation cell outside the container's layout bounds.
 * On incremental renders, this continuation cell was never cleared because:
 * 1. The owning container's dirty flag tracking only covers its own bounds
 * 2. The adjacent container at that position might not be dirty
 * 3. The stale continuation cell persists from a previous frame
 *
 * Fix: renderGraphemes clips wide characters at the text node's layout
 * right edge (maxCol parameter). Wide chars whose continuation would
 * overflow are replaced with a space, matching terminal behavior for
 * wide chars at the screen edge.
 *
 * Regression: km-e3rwl (breadcrumb stale after h/l navigation)
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useInput } from "../src/index.js"
import { bufferToText } from "../src/buffer.js"
import { createRenderer, compareBuffers, formatMismatch } from "inkx/testing"

const render = createRenderer({ incremental: true, cols: 40, rows: 20 })

function assertBuffersMatch(app: ReturnType<typeof render>, context?: string): void {
  const fresh = app.freshRender()
  const current = app.lastBuffer()!
  const mismatch = compareBuffers(current, fresh)
  if (mismatch) {
    const msg = formatMismatch(mismatch, {
      incrementalText: bufferToText(current),
      freshText: bufferToText(fresh),
    })
    expect.unreachable(`${context ? context + ": " : ""}${msg}`)
  }
}

describe("Wide character shift incremental rendering", () => {
  test("wide chars in flexGrow column update when height changes", async () => {
    function App() {
      const [tall, setTall] = useState(true)

      useInput((input) => {
        if (input === "t") setTall((v) => !v)
      })

      return (
        <Box flexDirection="column" width={40} height={20}>
          {/* Variable height content */}
          {tall && (
            <Box flexDirection="column">
              <Text>Line A</Text>
              <Text>Line B</Text>
              <Text>Line C</Text>
            </Box>
          )}
          {/* Indicator column with wide chars distributed by space-evenly */}
          <Box flexDirection="column" width={2} flexGrow={1} backgroundColor="gray" justifyContent="space-evenly">
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial render")

    // Toggle: remove the tall content, indicator should grow
    await app.press("t")
    assertBuffersMatch(app, "after toggle off")

    // Toggle back: add content, indicator should shrink
    await app.press("t")
    assertBuffersMatch(app, "after toggle on")
  })

  test("wide chars in row layout update when siblings change", async () => {
    function App() {
      const [section, setSection] = useState(0)

      useInput((input) => {
        if (input === "j") setSection((s) => Math.min(s + 1, 2))
        if (input === "k") setSection((s) => Math.max(s - 1, 0))
      })

      const contents = [
        ["Long section A content", "A line 2", "A line 3"],
        ["Short B"],
        ["Medium C content", "C line 2"],
      ]

      return (
        <Box flexDirection="row" width={40} height={15}>
          {/* Left indicator */}
          <Box flexDirection="column" width={1} flexGrow={1} backgroundColor="gray" justifyContent="space-evenly">
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
          </Box>
          {/* Main content */}
          <Box flexDirection="column" flexGrow={1}>
            {contents[section]!.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial")

    await app.press("j")
    assertBuffersMatch(app, "after j to section B")

    await app.press("j")
    assertBuffersMatch(app, "after j to section C")

    await app.press("k")
    assertBuffersMatch(app, "after k back to section B")
  })

  test("continuation cells cleared when wide char content shifts", async () => {
    // Simulates the exact VerticalScrollIndicator pattern
    function App() {
      const [extra, setExtra] = useState(false)

      useInput((input) => {
        if (input === "x") setExtra((v) => !v)
      })

      return (
        <Box flexDirection="row" width={30} height={10}>
          {/* Indicator with wide chars */}
          <Box
            flexDirection="column"
            width={2}
            flexGrow={1}
            backgroundColor="gray"
            justifyContent="space-evenly"
            alignItems="center"
          >
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
          </Box>
          {/* Content that changes height */}
          <Box flexDirection="column" flexGrow={1}>
            <Text>Header</Text>
            {extra && <Text>Extra line 1</Text>}
            {extra && <Text>Extra line 2</Text>}
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial")

    await app.press("x")
    assertBuffersMatch(app, "after adding extra lines")

    await app.press("x")
    assertBuffersMatch(app, "after removing extra lines")
  })

  test("wide char in width-1 container does not write continuation outside bounds", () => {
    // Core regression test: ◀ (width 2) in a width-1 Box must NOT write
    // a continuation cell at col+1, which would be in the sibling's area.
    // The wide char should be replaced with a space at the boundary.
    function App({ section }: { section: number }) {
      return (
        <Box flexDirection="row" width={30} height={8}>
          {/* Narrow indicator: width=1 but ◀ is width-2 */}
          <Box flexDirection="column" width={1} backgroundColor="gray" justifyContent="space-evenly">
            <Text color="white">◀</Text>
            <Text color="white">◀</Text>
          </Box>
          {/* Sibling content that changes */}
          <Box flexDirection="column" flexGrow={1}>
            {section === 0 ? (
              <>
                <Text>Section A line 1</Text>
                <Text>Section A line 2</Text>
                <Text>Section A line 3</Text>
                <Text>Section A line 4</Text>
                <Text>Section A line 5</Text>
              </>
            ) : (
              <Text>Section B</Text>
            )}
          </Box>
        </Box>
      )
    }

    const app = render(<App section={0} />)

    // Verify no continuation cells leaked into the sibling area (col 1).
    // The wide char ◀ should be clipped to a space since width-1 can't
    // fit a width-2 character.
    const buf = app.lastBuffer()!
    for (let y = 0; y < buf.height; y++) {
      const cell = buf.getCell(1, y)
      // Col 1 belongs to the sibling Box, not the indicator.
      // It must never have a continuation cell from the indicator.
      expect(cell.continuation, `row ${y} col 1 should not be continuation`).toBe(false)
    }

    // After switching content, incremental must still match fresh
    app.rerender(<App section={1} />)
    assertBuffersMatch(app, "after switching to section B")

    app.rerender(<App section={0} />)
    assertBuffersMatch(app, "after switching back to section A")
  })
})
