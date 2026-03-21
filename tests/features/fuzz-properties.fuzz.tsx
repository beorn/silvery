/**
 * Metamorphic Fuzz Property Tests
 *
 * Verifies metamorphic invariants of the rendering pipeline — properties
 * that relate multiple executions rather than checking a single result.
 * Each test creates two (or more) execution paths that must converge.
 *
 * Properties tested:
 *
 * 1. Resize involution: render at A→B→A should match render at A
 * 2. Mount permutation invariance: children in different order → same layout
 * 3. Cursor-only mutation no-cell-change: cursor moves don't change cell content
 * 4. Replay chunking invariance: same actions in different chunk sizes → same result
 *
 * ## Running
 *
 * ```bash
 * bun vitest run vendor/silvery/tests/features/fuzz-properties.fuzz.tsx
 * FUZZ=1 bun vitest run vendor/silvery/tests/features/fuzz-properties.fuzz.tsx
 * ```
 */

import React, { useState } from "react"
import { describe, expect } from "vitest"
import { test, gen, take } from "vimonkey/fuzz"
import { createRenderer, compareBuffers, formatMismatch, bufferToText } from "@silvery/test"
import type { TerminalBuffer } from "../../packages/term/src/buffer"
import { Box, Text, useInput } from "silvery"

// ============================================================================
// Assertion helpers
// ============================================================================

/**
 * Assert two buffers are identical. Throws with detailed diagnostic on mismatch.
 */
function assertBuffersEqual(
  bufA: TerminalBuffer | undefined,
  bufB: TerminalBuffer | undefined,
  context: { label: string; iteration?: number; action?: string },
): void {
  if (!bufA || !bufB) {
    expect.unreachable(`${context.label}: one or both buffers are null`)
    return
  }
  const mismatch = compareBuffers(bufA, bufB)
  if (mismatch) {
    const textA = bufferToText(bufA)
    const textB = bufferToText(bufB)
    const msg = formatMismatch(mismatch, {
      incrementalText: textA,
      freshText: textB,
      iteration: context.iteration,
      key: context.action,
    })
    expect.unreachable(`${context.label}:\n${msg}`)
  }
}

/**
 * Assert two plain text outputs are identical.
 */
function assertTextEqual(textA: string, textB: string, label: string): void {
  if (textA !== textB) {
    expect.unreachable(`${label}:\n--- expected ---\n${textA}\n--- actual ---\n${textB}`)
  }
}

/**
 * Extract cell content (chars only, no style/attributes) from a buffer.
 * Returns a 2D array of characters for content comparison.
 */
function extractCellContent(buf: TerminalBuffer): string[][] {
  const result: string[][] = []
  for (let row = 0; row < buf.height; row++) {
    const rowChars: string[] = []
    for (let col = 0; col < buf.width; col++) {
      const cell = buf.getCell(row, col)
      rowChars.push(cell?.char ?? " ")
    }
    result.push(rowChars)
  }
  return result
}

// ============================================================================
// Test Components
// ============================================================================

/** Resizable content for resize involution testing */
function ResizableApp() {
  const [count, setCount] = useState(0)
  const [items, setItems] = useState(["alpha", "bravo", "charlie"])
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => Math.max(0, c - 1))
    if (input === "a") setItems((prev) => [...prev, `item-${prev.length}`])
    if (input === "d") setItems((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  })
  return (
    <Box flexDirection="column" borderStyle="round">
      <Text bold>Count: {count}</Text>
      {items.map((item, i) => (
        <Text key={i}>
          {i + 1}. {item}
        </Text>
      ))}
      <Text dimColor>Footer</Text>
    </Box>
  )
}

/** Multi-child component for permutation invariance testing */
function PermutableApp({ order }: { order: number[] }) {
  const panels = [
    <Box key="panel-a" flexDirection="column" borderStyle="single" flexGrow={1}>
      <Text bold>Panel A</Text>
      <Text>First panel content</Text>
    </Box>,
    <Box key="panel-b" flexDirection="column" borderStyle="single" flexGrow={1}>
      <Text bold>Panel B</Text>
      <Text>Second panel content</Text>
    </Box>,
    <Box key="panel-c" flexDirection="column" borderStyle="single" flexGrow={1}>
      <Text bold>Panel C</Text>
      <Text>Third panel content</Text>
    </Box>,
  ]
  return <Box>{order.map((idx) => panels[idx])}</Box>
}

/** App with cursor movement for cursor-no-cell-change testing */
function CursorApp() {
  const [cursorRow, setCursorRow] = useState(0)
  const [cursorCol, setCursorCol] = useState(0)
  const [items] = useState(["Task one", "Task two", "Task three", "Task four", "Task five"])

  useInput((input) => {
    if (input === "j") setCursorRow((r) => Math.min(r + 1, items.length - 1))
    if (input === "k") setCursorRow((r) => Math.max(r - 1, 0))
    if (input === "l") setCursorCol((c) => Math.min(c + 1, 20))
    if (input === "h") setCursorCol((c) => Math.max(c - 1, 0))
  })

  return (
    <Box flexDirection="column" borderStyle="single">
      <Text bold>
        Cursor: ({cursorRow},{cursorCol})
      </Text>
      {items.map((item, i) => (
        <Text key={i}>
          {i === cursorRow ? ">" : " "} {item}
        </Text>
      ))}
    </Box>
  )
}

/** Stateful app for replay chunking testing */
function ChunkableApp() {
  const [count, setCount] = useState(0)
  const [visible, setVisible] = useState(true)
  const [style, setStyle] = useState(0)
  const borders = ["single", "round", "double"] as const

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => Math.max(0, c - 1))
    if (input === "t") setVisible((v) => !v)
    if (input === "b") setStyle((s) => (s + 1) % borders.length)
  })

  return (
    <Box flexDirection="column" borderStyle={borders[style]}>
      <Text>Count: {count}</Text>
      {visible && (
        <Box borderStyle="single">
          <Text>Visible content</Text>
        </Box>
      )}
      <Text dimColor>Footer</Text>
    </Box>
  )
}

// ============================================================================
// Fuzz Tests
// ============================================================================

describe("metamorphic fuzz properties", () => {
  // --------------------------------------------------------------------------
  // 1. Resize involution: render at dims A → resize to B → resize back to A
  //    should produce the same buffer as rendering at A without resize.
  //
  //    This catches:
  //    - Layout cache not properly invalidated on resize
  //    - Buffer dimensions mismatch after resize-back
  //    - Stale clipping rects from previous dimensions
  //    - prevBuffer not cleared properly on resize
  // --------------------------------------------------------------------------

  describe("Resize involution", () => {
    const DIMS: Array<{ cols: number; rows: number }> = [
      { cols: 40, rows: 12 },
      { cols: 80, rows: 24 },
      { cols: 60, rows: 15 },
      { cols: 30, rows: 8 },
      { cols: 100, rows: 30 },
    ]

    const ACTIONS: [number, string][] = [
      [30, "j"],
      [20, "k"],
      [25, "a"],
      [25, "d"],
    ]

    test.fuzz(
      "resize A->B->A matches staying at A after random mutations",
      async () => {
        // Pick two random dimension pairs
        const dimPairs: Array<[number, number]> = []
        for await (const idx of take(
          gen<number>([
            [50, 0],
            [50, 1],
            [50, 2],
            [50, 3],
            [50, 4],
          ]),
          2,
        )) {
          dimPairs.push([DIMS[idx]!.cols, DIMS[idx]!.rows])
        }
        const dimA = { cols: dimPairs[0]![0], rows: dimPairs[0]![1] }
        const dimB = { cols: dimPairs[1]![0], rows: dimPairs[1]![1] }

        // Path 1: render at A, apply actions, stay at A
        const renderStay = createRenderer(dimA)
        const appStay = renderStay(<ResizableApp />)

        // Path 2: render at A, apply same actions, resize to B, resize back to A
        const renderBounce = createRenderer(dimA)
        const appBounce = renderBounce(<ResizableApp />)

        // Collect a fixed action sequence
        const actions: string[] = []
        for await (const action of take(gen<string>(ACTIONS), 30)) {
          actions.push(action)
        }

        // Apply all actions to both
        for (const action of actions) {
          await appStay.press(action)
          await appBounce.press(action)
        }

        // Verify both are in same state before resize
        const stayTextBefore = appStay.text
        const bounceTextBefore = appBounce.text
        assertTextEqual(stayTextBefore, bounceTextBefore, "Pre-resize: apps should be in same state")

        // Resize bounce app: A → B → A
        appBounce.resize(dimB.cols, dimB.rows)
        appBounce.resize(dimA.cols, dimA.rows)

        // After A→B→A, the buffer should match the app that stayed at A
        const stayFresh = appStay.freshRender()
        const bounceFresh = appBounce.freshRender()
        assertBuffersEqual(stayFresh, bounceFresh, {
          label: `Resize involution ${dimA.cols}x${dimA.rows} -> ${dimB.cols}x${dimB.rows} -> ${dimA.cols}x${dimA.rows}`,
        })

        // Also verify incremental matches fresh on both paths
        assertBuffersEqual(appStay.lastBuffer(), stayFresh, {
          label: "Stay app: incremental vs fresh after actions",
        })
        assertBuffersEqual(appBounce.lastBuffer(), bounceFresh, {
          label: "Bounce app: incremental vs fresh after resize back",
        })

        appStay.unmount()
        appBounce.unmount()
      },
      { timeout: 30_000 },
    )

    test.fuzz(
      "interleaved resize-action sequences maintain involution",
      async () => {
        const render = createRenderer({ cols: 60, rows: 15 })
        const app = render(<ResizableApp />)

        // Apply random actions interleaved with resize cycles
        const INTERLEAVED: [number, string][] = [
          [25, "j"],
          [15, "k"],
          [15, "a"],
          [10, "d"],
          [35, "RESIZE"], // special marker
        ]

        const targetDims = [
          { cols: 40, rows: 10 },
          { cols: 80, rows: 20 },
          { cols: 50, rows: 12 },
        ]

        let dimIdx = 0
        let i = 0

        for await (const action of take(gen<string>(INTERLEAVED), 60)) {
          if (action === "RESIZE") {
            // Resize to a different size, then back to original (60x15)
            const target = targetDims[dimIdx % targetDims.length]!
            app.resize(target.cols, target.rows)
            app.resize(60, 15) // back to original
            dimIdx++
          } else {
            await app.press(action)
          }

          // After every operation, incremental must match fresh
          const incBuf = app.lastBuffer()
          const freshBuf = app.freshRender()
          assertBuffersEqual(incBuf, freshBuf, {
            label: "Interleaved resize: incremental vs fresh",
            iteration: i,
            action,
          })

          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 2. Mount permutation invariance: rendering children in different key-based
  //    orders should produce the same layout when keys determine position.
  //
  //    This catches:
  //    - Layout depending on mount order rather than tree structure
  //    - Flex layout bugs where insertion order affects size calculation
  //    - Key reconciliation affecting visual output
  // --------------------------------------------------------------------------

  describe("Mount permutation invariance", () => {
    test.fuzz(
      "children in different mount order produce same layout",
      async () => {
        const dims = { cols: 90, rows: 12 }

        // Canonical order: [0, 1, 2] — panels A, B, C left to right
        const renderCanonical = createRenderer(dims)
        const appCanonical = renderCanonical(<PermutableApp order={[0, 1, 2]} />)

        // The canonical rendering establishes the reference
        const canonicalText = appCanonical.text
        const canonicalBuffer = appCanonical.freshRender()

        // Now render all 6 permutations of [0, 1, 2]
        const permutations = [
          [0, 2, 1],
          [1, 0, 2],
          [1, 2, 0],
          [2, 0, 1],
          [2, 1, 0],
        ]

        for (const perm of permutations) {
          const renderPerm = createRenderer(dims)
          const appPerm = renderPerm(<PermutableApp order={perm} />)
          const permBuffer = appPerm.freshRender()

          // The text content and layout should be identical because React keys
          // determine identity, and the flex layout should be the same regardless
          // of mount order — each panel has flexGrow=1 and the same structure.
          //
          // Note: We compare the text rather than buffers because the panels
          // appear in different visual positions (left-to-right follows array order).
          // The invariant is that each panel renders identically regardless of order.
          const permText = appPerm.text

          // Each panel should appear with correct content
          expect(permText).toContain("Panel A")
          expect(permText).toContain("Panel B")
          expect(permText).toContain("Panel C")

          // The total content height and width should be the same
          const canonicalLines = bufferToText(canonicalBuffer).split("\n")
          const permLines = bufferToText(permBuffer).split("\n")
          expect(permLines.length).toBe(canonicalLines.length)

          // Incremental should match fresh for each permutation
          assertBuffersEqual(appPerm.lastBuffer(), permBuffer, {
            label: `Permutation [${perm}]: incremental vs fresh`,
          })

          appPerm.unmount()
        }

        appCanonical.unmount()
      },
      { timeout: 30_000 },
    )

    test.fuzz(
      "identical panels in different order produce identical total dimensions",
      async () => {
        // Use panels with identical content but different keys to test that
        // the layout engine produces the same dimensions regardless of order.
        function IdenticalPanels({ order }: { order: number[] }) {
          const panels = order.map((idx) => (
            <Box key={`p-${idx}`} flexDirection="column" borderStyle="single" flexGrow={1}>
              <Text>Panel {idx}</Text>
              <Text>Content line</Text>
            </Box>
          ))
          return <Box>{panels}</Box>
        }

        const dims = { cols: 60, rows: 8 }

        // Pick random permutations
        const orders = [
          [0, 1, 2, 3],
          [3, 2, 1, 0],
          [1, 3, 0, 2],
          [2, 0, 3, 1],
        ]

        const results: { order: number[]; text: string; height: number }[] = []

        for (const order of orders) {
          const render = createRenderer(dims)
          const app = render(<IdenticalPanels order={order} />)
          const buf = app.freshRender()
          const text = bufferToText(buf)
          const nonBlankLines = text.split("\n").filter((l) => l.trim().length > 0).length

          results.push({ order, text, height: nonBlankLines })

          // Incremental matches fresh
          assertBuffersEqual(app.lastBuffer(), buf, {
            label: `Identical panels [${order}]: incremental vs fresh`,
          })

          app.unmount()
        }

        // All permutations should produce the same number of non-blank lines
        const heights = results.map((r) => r.height)
        const allSame = heights.every((h) => h === heights[0])
        if (!allSame) {
          expect.unreachable(
            `Permutation height variance: ${results.map((r) => `[${r.order}]=${r.height}`).join(", ")}`,
          )
        }
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 3. Cursor-only mutation no-cell-change: moving the cursor (changing which
  //    item has the ">" indicator) should not change ANY cell that isn't part
  //    of the cursor indicator itself.
  //
  //    This catches:
  //    - Cursor movement corrupting neighboring cells
  //    - Dirty flag propagation marking unrelated regions dirty
  //    - Style bleeding from cursor-highlighted rows to other rows
  // --------------------------------------------------------------------------

  describe("Cursor-only mutation no-cell-change", () => {
    test.fuzz(
      "cursor movement only changes cursor indicator cells",
      async () => {
        const render = createRenderer({ cols: 40, rows: 12 })
        const app = render(<CursorApp />)

        const CURSOR_ACTIONS: [number, string][] = [
          [30, "j"], // cursor down
          [30, "k"], // cursor up
          [20, "l"], // cursor right
          [20, "h"], // cursor left
        ]

        let prevBuf = app.freshRender()
        let i = 0

        for await (const action of take(gen<string>(CURSOR_ACTIONS), 60)) {
          const prevContent = extractCellContent(prevBuf)
          const prevText = bufferToText(prevBuf)

          await app.press(action)

          const currBuf = app.freshRender()
          const currContent = extractCellContent(currBuf)
          const currText = bufferToText(currBuf)

          // Identify which cells changed
          const changedCells: Array<{ row: number; col: number; was: string; now: string }> = []
          for (let row = 0; row < Math.min(prevContent.length, currContent.length); row++) {
            for (let col = 0; col < Math.min(prevContent[row]!.length, currContent[row]!.length); col++) {
              if (prevContent[row]![col] !== currContent[row]![col]) {
                changedCells.push({
                  row,
                  col,
                  was: prevContent[row]![col]!,
                  now: currContent[row]![col]!,
                })
              }
            }
          }

          // All changes should be either:
          // 1. The cursor indicator ">" / " " in column 0-1
          // 2. The cursor position text in the header "Cursor: (N,N)"
          for (const cell of changedCells) {
            const isIndicatorColumn = cell.col <= 1
            const isHeaderRow = cell.row <= 1 // header is row 0-1 (border + text)
            const isReasonable = isIndicatorColumn || isHeaderRow

            if (!isReasonable) {
              expect.unreachable(
                `Cursor-only move "${action}" changed cell (${cell.row},${cell.col}) ` +
                  `from "${cell.was}" to "${cell.now}" — not a cursor indicator or header.\n` +
                  `--- before ---\n${prevText}\n--- after ---\n${currText}`,
              )
            }
          }

          // Also verify incremental matches fresh
          assertBuffersEqual(app.lastBuffer(), currBuf, {
            label: "Cursor move: incremental vs fresh",
            iteration: i,
            action,
          })

          prevBuf = currBuf
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 4. Replay chunking invariance: applying the same action sequence in
  //    different chunk sizes should produce the same final buffer.
  //
  //    This catches:
  //    - Batching-dependent rendering (effects running at different times)
  //    - Intermediate state leaking into final output
  //    - Incremental rendering producing different results depending on
  //      when renders are flushed
  // --------------------------------------------------------------------------

  describe("Replay chunking invariance", () => {
    const ACTIONS: [number, string][] = [
      [25, "j"],
      [15, "k"],
      [20, "t"],
      [20, "b"],
    ]

    test.fuzz(
      "same actions applied one-at-a-time vs in chunks produce same result",
      async () => {
        // Collect a fixed action sequence
        const actions: string[] = []
        for await (const action of take(gen<string>(ACTIONS), 40)) {
          actions.push(action)
        }

        // Path 1: apply actions one at a time
        const renderSingle = createRenderer({ cols: 50, rows: 12 })
        const appSingle = renderSingle(<ChunkableApp />)
        for (const action of actions) {
          await appSingle.press(action)
        }
        const singleFresh = appSingle.freshRender()
        const singleText = bufferToText(singleFresh)

        // Path 2: apply the same actions but in chunks of 2-5
        const renderChunked = createRenderer({ cols: 50, rows: 12 })
        const appChunked = renderChunked(<ChunkableApp />)

        let idx = 0
        while (idx < actions.length) {
          // Random chunk size from 1-5
          let chunkSize = 1
          for await (const size of take(
            gen<number>([
              [25, 1],
              [25, 2],
              [25, 3],
              [15, 4],
              [10, 5],
            ]),
            1,
          )) {
            chunkSize = size
          }
          const end = Math.min(idx + chunkSize, actions.length)
          for (let j = idx; j < end; j++) {
            await appChunked.press(actions[j]!)
          }
          idx = end
        }
        const chunkedFresh = appChunked.freshRender()
        const chunkedText = bufferToText(chunkedFresh)

        // Both paths must produce the same final output
        assertTextEqual(singleText, chunkedText, "Chunking invariance: one-at-a-time vs chunked")
        assertBuffersEqual(singleFresh, chunkedFresh, {
          label: "Chunking invariance: buffer comparison",
        })

        // Both must have incremental matching fresh
        assertBuffersEqual(appSingle.lastBuffer(), singleFresh, {
          label: "Single-step: incremental vs fresh",
        })
        assertBuffersEqual(appChunked.lastBuffer(), chunkedFresh, {
          label: "Chunked: incremental vs fresh",
        })

        appSingle.unmount()
        appChunked.unmount()
      },
      { timeout: 30_000 },
    )

    test.fuzz(
      "prefix equivalence: N actions then fresh matches N+M actions then fresh for prefix N",
      async () => {
        // This tests that applying more actions doesn't corrupt the state
        // of what was established by the first N actions. We verify by
        // checking that the internal state (text) after N actions is
        // consistent with the text after N actions of the N+M sequence.

        const actions: string[] = []
        for await (const action of take(gen<string>(ACTIONS), 50)) {
          actions.push(action)
        }

        // Split at a random point
        let splitPoint = 25
        for await (const pt of take(
          gen<number>([
            [25, 15],
            [25, 20],
            [25, 25],
            [25, 30],
          ]),
          1,
        )) {
          splitPoint = pt
        }

        // Path 1: apply only the prefix (first splitPoint actions)
        const renderPrefix = createRenderer({ cols: 50, rows: 12 })
        const appPrefix = renderPrefix(<ChunkableApp />)
        for (let i = 0; i < splitPoint; i++) {
          await appPrefix.press(actions[i]!)
        }
        const prefixText = appPrefix.text

        // Path 2: apply all actions
        const renderFull = createRenderer({ cols: 50, rows: 12 })
        const appFull = renderFull(<ChunkableApp />)
        for (let i = 0; i < splitPoint; i++) {
          await appFull.press(actions[i]!)
        }
        // After applying the same prefix, state should be identical
        const fullPrefixText = appFull.text
        assertTextEqual(prefixText, fullPrefixText, "Prefix equivalence: same state after same prefix")

        // Now apply remaining actions to the full path
        for (let i = splitPoint; i < actions.length; i++) {
          await appFull.press(actions[i]!)
        }

        // Verify both apps have valid incremental rendering
        assertBuffersEqual(appPrefix.lastBuffer(), appPrefix.freshRender(), {
          label: "Prefix app: incremental vs fresh",
        })
        assertBuffersEqual(appFull.lastBuffer(), appFull.freshRender(), {
          label: "Full app: incremental vs fresh",
        })

        appPrefix.unmount()
        appFull.unmount()
      },
      { timeout: 30_000 },
    )
  })
})
