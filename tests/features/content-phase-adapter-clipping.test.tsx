/**
 * Content Phase Adapter — Text Clipping Tests
 *
 * Tests that the adapter-path (used by renderToXterm) correctly clips
 * text to Box bounds and overflow="hidden" containers.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "@silvery/react"
import { contentPhaseAdapter } from "@silvery/term/pipeline/content-phase-adapter"
import { setRenderAdapter, hasRenderAdapter } from "@silvery/term/render-adapter"
import { terminalAdapter, TerminalRenderBuffer } from "@silvery/term/adapters/terminal-adapter"
import { setLayoutEngine } from "@silvery/term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/term/adapters/flexily-zero-adapter"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
} from "@silvery/react/reconciler"
import {
  measurePhase,
  layoutPhase,
  scrollPhase,
  stickyPhase,
  screenRectPhase,
  notifyLayoutSubscribers,
} from "@silvery/term/pipeline"

function setupAdapter() {
  if (!hasRenderAdapter()) {
    setLayoutEngine(createFlexilyZeroEngine())
    setRenderAdapter(terminalAdapter)
  }
}

/** Render a React element through the adapter pipeline and return the buffer. */
function renderViaAdapter(
  element: React.ReactElement,
  cols: number,
  rows: number,
): TerminalRenderBuffer {
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

  return contentPhaseAdapter(root) as TerminalRenderBuffer
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

describe("content-phase-adapter border clipping", () => {
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

describe("content-phase-adapter text clipping", () => {
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
