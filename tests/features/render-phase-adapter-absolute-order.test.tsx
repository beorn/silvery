/**
 * Render Phase Adapter — Absolute Paint Order Tests
 *
 * Tests that the adapter renders absolute children AFTER normal-flow children,
 * matching CSS paint order (and the main render-phase.ts behavior).
 *
 * Bug: renderNormalChildren() in render-phase-adapter.ts has only two passes:
 *   1. Non-sticky children (includes absolute — should NOT)
 *   2. Sticky children
 *
 * Expected: three passes (matching render-phase.ts):
 *   1. Normal-flow children (skip sticky AND absolute)
 *   2. Sticky children
 *   3. Absolute children (painted on top)
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import { renderPhaseAdapter } from "@silvery/ag-term/pipeline/render-phase-adapter"
import { setRenderAdapter, hasRenderAdapter } from "@silvery/ag-term/render-adapter"
import { terminalAdapter, TerminalRenderBuffer } from "@silvery/ag-term/adapters/terminal-adapter"
import { setLayoutEngine } from "@silvery/ag-term/layout-engine"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
} from "@silvery/ag-react/reconciler"
import {
  measurePhase,
  layoutPhase,
  scrollPhase,
  stickyPhase,
  scrollrectPhase,
  notifyLayoutSubscribers,
} from "@silvery/ag-term/pipeline"

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
  scrollrectPhase(root)
  notifyLayoutSubscribers(root)

  // Second pass for layout feedback
  reconciler.flushSyncWork()
  measurePhase(root)
  layoutPhase(root, cols, rows)
  scrollPhase(root)
  stickyPhase(root)
  scrollrectPhase(root)
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

describe("render-phase-adapter absolute paint order", () => {
  test("absolute child paints on top even when declared before normal-flow sibling", () => {
    // The absolute child is declared FIRST in DOM order, but should still paint
    // ON TOP of the normal-flow sibling (which overlaps at the same position).
    //
    // Bug: Without a separate third pass for absolute children, the absolute child
    // renders first (DOM order), then the normal-flow sibling paints over it.
    const buffer = renderViaAdapter(
      <Box width={20} height={3}>
        {/* Absolute child at row 0 — should paint on top regardless of DOM order */}
        <Box position="absolute" top={0} left={0} width={10} height={1}>
          <Text>AAAAAAAAAA</Text>
        </Box>
        {/* Normal-flow child also at row 0 — should be underneath the absolute child */}
        <Box width={20} height={1}>
          <Text>NNNNNNNNNNNNNNNNNNNN</Text>
        </Box>
      </Box>,
      20,
      3,
    )

    const row0 = rowText(buffer, 0)
    // Absolute child (10 "A"s) should paint on top of the normal-flow child's first 10 chars.
    // The remaining 10 chars from the normal-flow child should be visible.
    expect(row0).toBe("AAAAAAAAAANNNNNNNNNN")
  })

  test("absolute child with background paints on top of normal-flow sibling", () => {
    // Same test with background colors to verify bg paint order.
    const buffer = renderViaAdapter(
      <Box width={20} height={3}>
        {/* Absolute child with blue bg — should be on top */}
        <Box position="absolute" top={0} left={0} width={10} height={1} backgroundColor="blue">
          <Text>AAAAAAAAAA</Text>
        </Box>
        {/* Normal-flow child with red bg — should be underneath in overlap area */}
        <Box width={20} height={1} backgroundColor="red">
          <Text>NNNNNNNNNNNNNNNNNNNN</Text>
        </Box>
      </Box>,
      20,
      3,
    )

    const row0 = rowText(buffer, 0)
    // Absolute child text should be visible in the overlap area
    expect(row0.slice(0, 10)).toBe("AAAAAAAAAA")

    // Normal-flow child text should be visible outside the overlap
    expect(row0.slice(10)).toBe("NNNNNNNNNN")
  })
})
