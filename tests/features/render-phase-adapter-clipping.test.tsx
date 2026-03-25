/**
 * Render Phase Adapter — Text Clipping Tests
 *
 * Tests that the adapter-path (used by renderToXterm) correctly clips
 * text to Box bounds and overflow="hidden" containers.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import { renderPhaseAdapter } from "@silvery/ag-term/pipeline/render-phase-adapter"
import { setRenderAdapter, hasRenderAdapter } from "@silvery/ag-term/render-adapter"
import { terminalAdapter, TerminalRenderBuffer } from "@silvery/ag-term/adapters/terminal-adapter"
import { setLayoutEngine } from "@silvery/ag-term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "@silvery/ag-react/reconciler"
import {
  measurePhase,
  layoutPhase,
  scrollPhase,
  stickyPhase,
  screenRectPhase,
  notifyLayoutSubscribers,
} from "@silvery/ag-term/pipeline"

function setupAdapter() {
  if (!hasRenderAdapter()) {
    setLayoutEngine(createFlexilyZeroEngine())
    setRenderAdapter(terminalAdapter)
  }
}

/** Render a React element through the adapter pipeline and return the buffer. */
function renderViaAdapter(element: React.ReactElement, cols: number, rows: number): TerminalRenderBuffer {
  setupAdapter()

  const container = createContainer(() => {})
  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)

  reconciler.updateContainerSync(element, fiberRoot, null, null)
  reconciler.flushSyncWork()

  // Run pipeline phases
  measurePhase(root)
  layoutPhase(root, cols, rows)
  scrollPhase(root)
  stickyPhase(root)
  screenRectPhase(root)
  notifyLayoutSubscribers(root)

  // Second pass for layout feedback
  reconciler.flushSyncWork()
  measurePhase(root)
  layoutPhase(root, cols, rows)
  scrollPhase(root)
  stickyPhase(root)
  screenRectPhase(root)
  notifyLayoutSubscribers(root)

  return renderPhaseAdapter(root) as TerminalRenderBuffer
}

/** Extract visible text from a buffer row. */
function rowText(buffer: TerminalRenderBuffer, row: number): string {
  const tb = buffer.getTerminalBuffer()
  let text = ""
  for (let col = 0; col < buffer.width; col++) {
    const cell = tb.getCell(col, row)
    if (cell.continuation) continue
    text += cell.char
  }
  return text.replace(/ +$/, "") // trim trailing spaces
}

describe("render-phase-adapter border clipping", () => {
  test("horizontal border is clipped by overflow=hidden parent", () => {
    // A bordered Box wider than its overflow=hidden parent — border chars
    // should not extend past the parent's clip bounds
    const buffer = renderViaAdapter(
      <Box overflow="hidden" width={20} height={6} padding={1}>
        <Box borderStyle="round" width={30} height={3}>
          <Text>Content</Text>
        </Box>
      </Box>,
      80,
      10,
    )

    // The parent is 20 cols wide with padding=1, so content area is cols 1-18.
    // The inner Box wants 30 cols but should be clipped at col 19 (exclusive).
    const tb = buffer.getTerminalBuffer()
    for (let row = 0; row < 6; row++) {
      for (let col = 20; col < 80; col++) {
        const cell = tb.getCell(col, row)
        expect(cell.char, `row ${row} col ${col} should be empty`).toBe(" ")
      }
    }
  })

  test("outline is clipped by overflow=hidden parent", () => {
    const buffer = renderViaAdapter(
      <Box overflow="hidden" width={20} height={6} padding={1}>
        <Box outlineStyle="single" outlineColor="red" width={30} height={3}>
          <Text>Content</Text>
        </Box>
      </Box>,
      80,
      10,
    )

    const tb = buffer.getTerminalBuffer()
    for (let row = 0; row < 6; row++) {
      for (let col = 20; col < 80; col++) {
        const cell = tb.getCell(col, row)
        expect(cell.char, `row ${row} col ${col} should be empty`).toBe(" ")
      }
    }
  })
})

describe("render-phase-adapter text clipping", () => {
  test("text is clipped to its layout width", () => {
    // A Text node inside a narrow Box — text should not extend past the Box
    const buffer = renderViaAdapter(
      <Box width={10}>
        <Text>This is a very long text that should be truncated</Text>
      </Box>,
      80,
      5,
    )

    // Text should not extend past column 10
    const row0 = rowText(buffer, 0)
    expect(row0.length).toBeLessThanOrEqual(10)
  })

  test("text inside overflow=hidden Box is clipped horizontally", () => {
    const buffer = renderViaAdapter(
      <Box overflow="hidden" width={15} height={3}>
        <Text>AAAAAAAAAAAAAAAAAAAAAAAAA</Text>
      </Box>,
      80,
      5,
    )

    // All content on row 0 should be within the 15-column Box
    const tb = buffer.getTerminalBuffer()
    for (let col = 15; col < 80; col++) {
      const cell = tb.getCell(col, 0)
      expect(cell.char).toBe(" ")
    }
  })

  test("nested overflow=hidden clips children", () => {
    const buffer = renderViaAdapter(
      <Box flexDirection="column" width={80}>
        <Box overflow="hidden" width={20} height={3}>
          <Box width={50}>
            <Text>This text is way too long for the container and should be clipped</Text>
          </Box>
        </Box>
      </Box>,
      80,
      5,
    )

    // Check that no text appears beyond column 20
    const tb = buffer.getTerminalBuffer()
    for (let col = 20; col < 80; col++) {
      const cell = tb.getCell(col, 0)
      expect(cell.char, `col ${col} should be empty`).toBe(" ")
    }
  })
})

describe("render-phase-adapter outline side flags", () => {
  test("outlineTop=false hides top border", () => {
    const buffer = renderViaAdapter(
      <Box outlineStyle="single" outlineTop={false} width={10} height={4}>
        <Text>Hi</Text>
      </Box>,
      20,
      6,
    )

    const tb = buffer.getTerminalBuffer()
    // Row 0 should NOT have outline chars (top border hidden)
    const topRow = rowText(buffer, 0)
    expect(topRow).not.toContain("┌")
    expect(topRow).not.toContain("┐")
    expect(topRow).not.toContain("─")

    // But left side should still render at row 0 (extends up when top hidden)
    const cell00 = tb.getCell(0, 0)
    expect(cell00.char).toBe("│")
  })

  test("outlineBottom=false hides bottom border", () => {
    const buffer = renderViaAdapter(
      <Box outlineStyle="single" outlineBottom={false} width={10} height={4}>
        <Text>Hi</Text>
      </Box>,
      20,
      6,
    )

    const tb = buffer.getTerminalBuffer()
    // Row 3 (bottom) should NOT have outline chars
    const bottomRow = rowText(buffer, 3)
    expect(bottomRow).not.toContain("└")
    expect(bottomRow).not.toContain("┘")
    // But left side should extend to row 3
    const cell03 = tb.getCell(0, 3)
    expect(cell03.char).toBe("│")
  })

  test("outlineLeft=false hides left border", () => {
    const buffer = renderViaAdapter(
      <Box outlineStyle="single" outlineLeft={false} width={10} height={4}>
        <Text>Hi</Text>
      </Box>,
      20,
      6,
    )

    const tb = buffer.getTerminalBuffer()
    // Left column should not have vertical border chars
    for (let row = 1; row < 3; row++) {
      const cell = tb.getCell(0, row)
      expect(cell.char, `row ${row} col 0 should not be │`).not.toBe("│")
    }
    // Corners should not render
    expect(tb.getCell(0, 0).char).not.toBe("┌")
    expect(tb.getCell(0, 3).char).not.toBe("└")
  })

  test("outlineRight=false hides right border", () => {
    const buffer = renderViaAdapter(
      <Box outlineStyle="single" outlineRight={false} width={10} height={4}>
        <Text>Hi</Text>
      </Box>,
      20,
      6,
    )

    const tb = buffer.getTerminalBuffer()
    // Right column (col 9) should not have vertical border chars
    for (let row = 1; row < 3; row++) {
      const cell = tb.getCell(9, row)
      expect(cell.char, `row ${row} col 9 should not be │`).not.toBe("│")
    }
    // Right corners should not render
    expect(tb.getCell(9, 0).char).not.toBe("┐")
    expect(tb.getCell(9, 3).char).not.toBe("┘")
  })
})

describe("render-phase-adapter text wrapping", () => {
  test("text wraps to multiple lines when wrap='wrap'", () => {
    const buffer = renderViaAdapter(
      <Box width={10} height={5}>
        <Text wrap="wrap">Hello world this wraps</Text>
      </Box>,
      20,
      8,
    )

    // With width=10 and wrap, "Hello world this wraps" should be split across lines
    const row0 = rowText(buffer, 0)
    const row1 = rowText(buffer, 1)
    expect(row0.length).toBeLessThanOrEqual(10)
    expect(row1.length).toBeGreaterThan(0) // text should continue on line 2
  })

  test("text wraps with wrap={true}", () => {
    const buffer = renderViaAdapter(
      <Box width={10} height={5}>
        <Text wrap={true}>Hello world this wraps</Text>
      </Box>,
      20,
      8,
    )

    const row0 = rowText(buffer, 0)
    const row1 = rowText(buffer, 1)
    expect(row0.length).toBeLessThanOrEqual(10)
    expect(row1.length).toBeGreaterThan(0)
  })

  test("text truncates with wrap='truncate'", () => {
    const buffer = renderViaAdapter(
      <Box width={10} height={3}>
        <Text wrap="truncate">Hello world this is long</Text>
      </Box>,
      20,
      5,
    )

    const row0 = rowText(buffer, 0)
    expect(row0.length).toBeLessThanOrEqual(10)
    // Should have ellipsis at end
    expect(row0).toContain("\u2026")
    // No text on row 1
    const row1 = rowText(buffer, 1)
    expect(row1).toBe("")
  })

  test("text with newlines renders multiple lines", () => {
    const buffer = renderViaAdapter(
      <Box width={20} height={5}>
        <Text>{"Line one\nLine two\nLine three"}</Text>
      </Box>,
      30,
      8,
    )

    expect(rowText(buffer, 0)).toContain("Line one")
    expect(rowText(buffer, 1)).toContain("Line two")
    expect(rowText(buffer, 2)).toContain("Line three")
  })
})
