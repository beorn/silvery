/**
 * Regression: km-silvery.layout-churn-leaks-pixels
 *
 * Trigger vault (km bead): first render shows `@next | @someday | archive`;
 * ~1 second later folder-boards hydrate and the layout reflows to
 * `archive | done | inbox`. The incremental render leaves pixel artifacts —
 * column separator dashes appear mid-card, orphan border-corner fragments
 * persist where previous columns used to be.
 *
 * Root cause (post-fix): `bufferToAnsi` is used as the baseline for the next
 * frame's diff, but it reads EVERY cell in the buffer — including cells that
 * were never touched in the current frame. That means when the prev buffer
 * carried stale pixels from a previous-wave render (the clone), and no node
 * writes to them in the new frame, the row-level dirty filter in
 * `diffBuffers` skips the row and leaves the stale pixels on screen.
 *
 * This test simulates the two-wave column-set reflow at the pipeline level.
 * SILVERY_STRICT=1 verifies incremental === fresh for the buffer content;
 * the cell-level assertions below catch both buffer drift AND output-phase
 * dirty-row skips.
 *
 * Realistic-scale fixture (50+ AgNodes): 3 wave-1 columns × 2 cards each
 * replaced with 3 wave-2 columns × 3 cards each, nested inside an
 * `overflow="hidden"` flex wrapper and an outer bg-bearing Box (mirroring
 * km's BoardView → HVL → CardColumn chain).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

interface ColumnSpec {
  id: string
  title: string
  cards: string[]
}

// Wave 1: file-boards only (pre-hydration, 3 columns).
const WAVE_1: ColumnSpec[] = [
  { id: "next", title: "@next", cards: ["Inbox"] },
  { id: "someday", title: "@someday", cards: ["Ideas"] },
  { id: "archive", title: "archive", cards: [] },
]

// Wave 2: folder-boards hydrated, column order/count changes.
const WAVE_2: ColumnSpec[] = [
  { id: "archive", title: "archive", cards: [] },
  { id: "done", title: "done", cards: ["t1", "t2", "t3"] },
  { id: "inbox", title: "inbox", cards: ["t1", "t2", "t3"] },
]

function Card({ title }: { title: string }) {
  return (
    <Box
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      minHeight={3}
      flexShrink={0}
    >
      <Text>{title}</Text>
    </Box>
  )
}

function Column({ spec }: { spec: ColumnSpec }) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      paddingX={1}
      overflow="hidden"
      backgroundColor="#223344"
    >
      <Text bold>{spec.title}</Text>
      <Text>{"─".repeat(38)}</Text>
      <Box flexDirection="column" gap={1} marginTop={1}>
        {spec.cards.map((c) => (
          <Card key={c} title={c} />
        ))}
      </Box>
    </Box>
  )
}

function Board({ columns }: { columns: ColumnSpec[] }) {
  // Mirror km's BoardView chain: outer bg Box → flex row with overflow
  // → column wrappers (flexShrink={0} to pin widths) → Column with bg.
  return (
    <Box
      flexDirection="column"
      width={120}
      height={20}
      backgroundColor="#111111"
    >
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {columns.map((col) => (
          <React.Fragment key={col.id}>
            <Box flexShrink={0} width={40}>
              <Column spec={col} />
            </Box>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  )
}

describe("km-silvery.layout-churn-leaks-pixels", () => {
  test("reflowing the column set does not leak cells from the previous wave", () => {
    const render = createRenderer({ cols: 120, rows: 20 })

    // Frame 1: wave-1 layout (next | someday | archive)
    const app = render(<Board columns={WAVE_1} />)
    expect(app.text).toContain("@next")
    expect(app.text).toContain("@someday")
    expect(app.text).toContain("archive")

    // Frame 2: wave-2 layout (archive | done | inbox) — full column-set reflow.
    // SILVERY_STRICT verifies incremental === fresh on the buffer. If the
    // buffer diverges, IncrementalRenderMismatchError throws. If the buffer
    // matches but stale characters linger (rare, output-phase dirty-row skip
    // bug) the cell-level assertions below catch it by comparing against a
    // baseline fresh render of the final state.
    app.rerender(<Board columns={WAVE_2} />)

    // Sanity: post-reflow column titles are present; wave-1 titles are gone.
    expect(app.text).toContain("archive")
    expect(app.text).toContain("done")
    expect(app.text).toContain("inbox")
    expect(app.text).not.toContain("@next")
    expect(app.text).not.toContain("@someday")

    // Cell-level assertion: compare against a fresh render of the final state.
    // Any divergence means stale cells leaked through.
    const freshRender = createRenderer({ cols: 120, rows: 20 })
    const fresh = freshRender(<Board columns={WAVE_2} />)
    const mismatches: string[] = []
    for (let y = 0; y < 20 && mismatches.length < 10; y++) {
      for (let x = 0; x < 120 && mismatches.length < 10; x++) {
        const a = app.cell(x, y)
        const b = fresh.cell(x, y)
        if (a.char !== b.char) {
          mismatches.push(
            `(${x},${y}): incremental='${a.char}' fresh='${b.char}'`,
          )
        }
      }
    }
    expect(
      mismatches,
      `incremental render left stale pixels:\n  ${mismatches.join("\n  ")}`,
    ).toEqual([])
  })

  test("three-wave churn stays clean", () => {
    const render = createRenderer({ cols: 120, rows: 20 })
    const app = render(<Board columns={WAVE_1} />)
    app.rerender(<Board columns={WAVE_2} />)

    const WAVE_3: ColumnSpec[] = [
      { id: "archive", title: "archive", cards: ["a1", "a2"] },
      { id: "done", title: "done", cards: ["t1", "t2"] },
      { id: "later", title: "later", cards: ["x1", "x2", "x3"] },
    ]
    app.rerender(<Board columns={WAVE_3} />)

    // Final wave correctness — compare against fresh render.
    const fresh = createRenderer({ cols: 120, rows: 20 })(<Board columns={WAVE_3} />)
    const mismatches: string[] = []
    for (let y = 0; y < 20 && mismatches.length < 10; y++) {
      for (let x = 0; x < 120 && mismatches.length < 10; x++) {
        const a = app.cell(x, y)
        const b = fresh.cell(x, y)
        if (a.char !== b.char) {
          mismatches.push(
            `(${x},${y}): incremental='${a.char}' fresh='${b.char}'`,
          )
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})
