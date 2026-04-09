/**
 * Render Phase Adapter — Text Style Tests
 *
 * Tests that the adapter-path (used by renderToXterm) correctly handles
 * nested text styles, internal_transform, and hidden child skipping.
 *
 * Bug: km-silvery.adapter-text-styles — collectTextContent() in
 * render-phase-adapter.ts just concatenates raw textContent recursively,
 * losing nested styles, transforms, and hidden-child skipping.
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

// ============================================================================
// Test 1: Nested styled Text
// ============================================================================

describe("render-phase-adapter nested text styles", () => {
  test("nested bold Text applies bold attribute to buffer cells", () => {
    const buffer = renderViaAdapter(
      <Box width={30}>
        <Text>
          Hello <Text bold>world</Text>
        </Text>
      </Box>,
      40,
      5,
    )

    const tb = buffer.getTerminalBuffer()
    const row0 = rowText(buffer, 0)
    expect(row0).toContain("Hello world")

    // "Hello " (cols 0-5) should NOT be bold
    const cellH = tb.getCell(0, 0)
    expect(cellH.attrs.bold, "H should not be bold").toBeFalsy()

    // "world" (cols 6-10) SHOULD be bold
    const cellW = tb.getCell(6, 0)
    expect(cellW.char).toBe("w")
    expect(cellW.attrs.bold, "w in 'world' should be bold").toBe(true)

    const cellD = tb.getCell(10, 0)
    expect(cellD.char).toBe("d")
    expect(cellD.attrs.bold, "d in 'world' should be bold").toBe(true)
  })

  test("nested colored Text applies foreground color to buffer cells", () => {
    const buffer = renderViaAdapter(
      <Box width={30}>
        <Text>
          Hello <Text color="red">world</Text>
        </Text>
      </Box>,
      40,
      5,
    )

    const tb = buffer.getTerminalBuffer()

    // "Hello " should have default fg (null)
    const cellH = tb.getCell(0, 0)
    expect(cellH.fg, "H should have no fg color").toBeNull()

    // "world" should have red fg (ANSI 256-color index 1)
    const cellW = tb.getCell(6, 0)
    expect(cellW.char).toBe("w")
    expect(cellW.fg, "w should have red fg color").toBe(1) // 1 = red in named ANSI colors
  })

  test("deeply nested styles are applied correctly", () => {
    const buffer = renderViaAdapter(
      <Box width={40}>
        <Text>
          A
          <Text bold>
            B<Text italic>C</Text>D
          </Text>
          E
        </Text>
      </Box>,
      40,
      5,
    )

    const tb = buffer.getTerminalBuffer()

    // A: no style
    expect(tb.getCell(0, 0).attrs.bold).toBeFalsy()
    expect(tb.getCell(0, 0).attrs.italic).toBeFalsy()

    // B: bold only
    expect(tb.getCell(1, 0).attrs.bold).toBe(true)
    expect(tb.getCell(1, 0).attrs.italic).toBeFalsy()

    // C: bold + italic
    expect(tb.getCell(2, 0).attrs.bold).toBe(true)
    expect(tb.getCell(2, 0).attrs.italic).toBe(true)

    // D: bold only (italic popped)
    expect(tb.getCell(3, 0).attrs.bold).toBe(true)
    expect(tb.getCell(3, 0).attrs.italic).toBeFalsy()

    // E: no style (bold popped)
    expect(tb.getCell(4, 0).attrs.bold).toBeFalsy()
    expect(tb.getCell(4, 0).attrs.italic).toBeFalsy()
  })

  test("parent Text style is inherited by nested children", () => {
    const buffer = renderViaAdapter(
      <Box width={30}>
        <Text color="green">
          Hello <Text bold>world</Text>
        </Text>
      </Box>,
      40,
      5,
    )

    const tb = buffer.getTerminalBuffer()

    // "Hello " should have green fg
    const cellH = tb.getCell(0, 0)
    expect(cellH.fg, "H should have green fg").toBe(2) // 2 = green

    // "world" should have green fg AND be bold
    const cellW = tb.getCell(6, 0)
    expect(cellW.fg, "w should inherit green fg from parent").toBe(2)
    expect(cellW.attrs.bold, "w should be bold").toBe(true)
  })
})

// ============================================================================
// Test 2: internal_transform
// ============================================================================

describe("render-phase-adapter internal_transform", () => {
  test("internal_transform is applied to nested Text content", () => {
    // internal_transform is set by the Transform component internally.
    // We simulate it by using it on a Text props directly.
    const Transform = ({ children, transform }: { children: React.ReactNode; transform: (s: string) => string }) => (
      <Text internal_transform={(s: string) => transform(s)}>{children}</Text>
    )

    const buffer = renderViaAdapter(
      <Box width={30}>
        <Text>
          <Transform transform={(s) => s.toUpperCase()}>hello</Transform>
        </Text>
      </Box>,
      40,
      5,
    )

    const row0 = rowText(buffer, 0)
    expect(row0).toContain("HELLO")
    expect(row0).not.toContain("hello")
  })

  test("internal_transform with index argument", () => {
    // Transform gets the child index as the second argument
    const buffer = renderViaAdapter(
      <Box width={40}>
        <Text>
          <Text internal_transform={(s: string, i: number) => `[${i}:${s}]`}>first</Text>
          <Text internal_transform={(s: string, i: number) => `[${i}:${s}]`}>second</Text>
        </Text>
      </Box>,
      50,
      5,
    )

    const row0 = rowText(buffer, 0)
    expect(row0).toContain("[0:first]")
    expect(row0).toContain("[1:second]")
  })
})

// ============================================================================
// Test 3: Hidden child skipping
// ============================================================================

describe("render-phase-adapter hidden child skipping", () => {
  test("display='none' Text children are excluded from collected text", () => {
    const buffer = renderViaAdapter(
      <Box width={30}>
        <Text>
          visible
          {/* display is a BoxProps property, but the adapter checks it on any node */}
          <Text {...({ display: "none" } as Record<string, unknown>)}>HIDDEN</Text>
          also visible
        </Text>
      </Box>,
      40,
      5,
    )

    const row0 = rowText(buffer, 0)
    expect(row0).toContain("visible")
    expect(row0).toContain("also visible")
    expect(row0).not.toContain("HIDDEN")
  })

  test("hidden nodes (Suspense) are excluded from collected text", () => {
    // node.hidden is set by Suspense. We can test this pattern via
    // display="none" since the adapter checks props.display before
    // collecting text. The semantic is the same: skip the subtree.
    const buffer = renderViaAdapter(
      <Box width={40}>
        <Text>
          before<Text {...({ display: "none" } as Record<string, unknown>)}> NOPE </Text>after
        </Text>
      </Box>,
      50,
      5,
    )

    const row0 = rowText(buffer, 0)
    expect(row0).toBe("beforeafter")
  })
})
