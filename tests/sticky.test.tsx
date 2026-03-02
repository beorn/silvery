/**
 * Sticky Bottom Outside Scroll Containers
 *
 * Tests for position="sticky" with stickyBottom on children of non-scroll containers.
 * When a parent has explicit height and a child has position="sticky" stickyBottom={N},
 * the child pins to the parent's bottom edge (offset by N rows) when content is short,
 * and stays at its natural position when content fills the parent.
 *
 * Note: boundingBox() returns layout position, NOT paint position. Sticky rendering
 * changes where content is painted via scroll offset, not the node's contentRect.
 * All position checks use bufferToText with trimEmptyLines=false to verify row content.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.ts"
import { bufferToText, createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 40, rows: 24 })

/** Get text lines from the rendered buffer, preserving empty lines for position checks */
function getLines(app: ReturnType<typeof render>): string[] {
  const buf = app.freshRender()
  return bufferToText(buf, { trimEmptyLines: false }).split("\n")
}

/** Find the row index where text appears in rendered output */
function findRow(lines: string[], text: string): number {
  return lines.findIndex((line) => line.includes(text))
}

describe("stickyBottom outside scroll containers", () => {
  test("stickyBottom={0} pins child to parent bottom when content is short", () => {
    function App() {
      return (
        <Box height={6} flexDirection="column">
          <Text>Hello</Text>
          <Box position="sticky" stickyBottom={0} height={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const lines = getLines(app)

    expect(findRow(lines, "Hello")).toBe(0)
    // Footer should be pinned to the bottom of the 6-row parent (row 5)
    expect(findRow(lines, "Footer")).toBe(5)
  })

  test("no-op when content fills parent", () => {
    function App() {
      return (
        <Box height={4} flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          <Box position="sticky" stickyBottom={0} height={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const lines = getLines(app)

    expect(findRow(lines, "Line 1")).toBe(0)
    // Content fills the parent, so footer stays at its natural position (row 3)
    expect(findRow(lines, "Footer")).toBe(3)
  })

  test("stickyBottom={N} offsets by N rows from bottom", () => {
    function App() {
      return (
        <Box height={6} flexDirection="column">
          <Text>Hello</Text>
          <Box position="sticky" stickyBottom={1} height={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const lines = getLines(app)

    // Footer should be one row above the bottom edge: row 4 (height 6 - offset 1 - height 1)
    expect(findRow(lines, "Footer")).toBe(4)
  })

  test("incremental rendering correct after state change", () => {
    function App({ showExtra }: { showExtra: boolean }) {
      return (
        <Box height={6} flexDirection="column">
          <Text>Hello</Text>
          {showExtra && <Text>Extra</Text>}
          <Box position="sticky" stickyBottom={0} height={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    // Initial render: content is short, footer pins to bottom
    const app = render(<App showExtra={false} />)
    expect(app.text).toContain("Hello")
    expect(app.text).toContain("Footer")

    let lines = getLines(app)
    expect(findRow(lines, "Footer")).toBe(5)

    // Re-render with extra content: footer still pins to bottom (content still short)
    app.rerender(<App showExtra={true} />)
    expect(app.text).toContain("Extra")

    lines = getLines(app)
    expect(findRow(lines, "Footer")).toBe(5)
  })

  test("scroll-container sticky still works (no regression)", () => {
    function App() {
      return (
        <Box overflow="scroll" height={5} flexDirection="column">
          <Box position="sticky" stickyTop={0} height={1}>
            <Text>Header</Text>
          </Box>
          {Array.from({ length: 10 }, (_, i) => (
            <Text key={i}>Item {i}</Text>
          ))}
        </Box>
      )
    }

    const app = render(<App />)
    expect(app.text).toContain("Header")

    // Sticky header layout position is at top (row 0)
    const header = app.getByText("Header")
    expect(header.boundingBox()?.y).toBe(0)
  })

  test("parent with no explicit height (auto-size) — sticky is no-op", () => {
    function App() {
      return (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <Box position="sticky" stickyBottom={0} height={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const lines = getLines(app)

    // Without explicit parent height, footer appears immediately after "Hello"
    expect(findRow(lines, "Hello")).toBe(0)
    expect(findRow(lines, "Footer")).toBe(1)
  })

  test("multiple sticky children computed independently", () => {
    function App() {
      return (
        <Box height={10} flexDirection="column">
          <Text>Content</Text>
          <Box position="sticky" stickyBottom={2} height={1}>
            <Text>Status</Text>
          </Box>
          <Box position="sticky" stickyBottom={0} height={1}>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const lines = getLines(app)

    expect(findRow(lines, "Content")).toBe(0)
    // Footer at bottom: row 9 (height 10 - stickyBottom 0 - childHeight 1 = 9)
    expect(findRow(lines, "Footer")).toBe(9)
    // Status offset by 2 from bottom: row 7 (height 10 - stickyBottom 2 - childHeight 1 = 7)
    expect(findRow(lines, "Status")).toBe(7)
  })
})
