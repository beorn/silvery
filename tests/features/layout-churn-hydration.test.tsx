/**
 * Regression: km-silvery.layout-churn-leaks-pixels — hydration variant.
 *
 * The original `layout-churn-leaks-pixels.test.tsx` covers the simple case:
 * column set replaced wholesale (wave-1 columns gone, wave-2 columns mounted).
 * That cascade now passes — `SILVERY_STRICT` verifies incremental === fresh.
 *
 * This file adds the *hydration* shape that matches the real km repro
 * (km bead km-silvery.layout-churn-leaks-pixels):
 *
 *   wave 0 (T=0):    shell columns rendered as skeleton placeholders (loading)
 *   wave 1 (T=300ms): file-board pass — columns `@next | @someday | archive`
 *                     parsed; their cards render with content
 *   wave 2 (T=1500ms): folder-board pass — column set reflows to
 *                     `archive | done | inbox` (column id at index 0 changes
 *                     identity, columns 1+ are entirely new ids), AND each
 *                     column transitions skeleton → loaded with different
 *                     card counts than wave 1 had.
 *
 * Each transition is a separate `rerender()` call so we can assert mid-flight
 * AND post-hydration that no stale cells leak through. Realistic-scale
 * fixture (5 columns × up to 3 cards each at the largest wave + bg-bearing
 * outer wrapper + overflow=hidden flex wrapper) — matches km's BoardView →
 * HVL → CardColumn chain.
 *
 * Per `vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md`: any pipeline
 * change MUST have a STRICT test that exercises the new behavior. This file
 * pre-stages the canonical hydration shape so future render-phase tweaks
 * stay safe against the bead's known regression class.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

interface ColumnSpec {
  id: string
  title: string
  // null = column is in skeleton/loading state; array = real cards
  cards: string[] | null
}

// Wave 0: just a shell with skeleton-loading placeholders, no real titles yet.
// Mirrors km's "isLoading || backgroundParsing || !watcherStatus" gate which
// renders "░░░" placeholder cards in every column before discovery completes.
const WAVE_0_SHELL: ColumnSpec[] = [
  { id: "loading-0", title: "loading…", cards: null },
  { id: "loading-1", title: "loading…", cards: null },
  { id: "loading-2", title: "loading…", cards: null },
]

// Wave 1: file-boards parsed first (km parses .md files at the vault root
// before recursing into sub-folders). Three columns from @next.md, @someday.md,
// and the archive/ folder. archive/ is empty so it stays in skeleton mode.
const WAVE_1_FILE_BOARDS: ColumnSpec[] = [
  { id: "@next", title: "@next", cards: ["Inbox"] },
  { id: "@someday", title: "@someday", cards: ["Ideas"] },
  { id: "archive", title: "archive", cards: null },
]

// Wave 2: folder-boards hydrated. Column-set reshuffles — `@next/@someday` go
// away (their cards become a different node shape after folder hydration);
// `archive` stays but moves position (was index 2, now index 0); `done` and
// `inbox` arrive as new columns with real content.
const WAVE_2_HYDRATED: ColumnSpec[] = [
  { id: "archive", title: "archive", cards: [] },
  { id: "done", title: "done", cards: ["t1", "t2", "t3"] },
  { id: "inbox", title: "inbox", cards: ["t1", "t2", "t3"] },
  { id: "next", title: "next", cards: ["t1", "t2", "t3"] },
]

const COLS = 160
const ROWS = 30

function SkeletonCard({ width }: { width: number }) {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} minHeight={3} flexShrink={0}>
      <Text>{"░".repeat(width)}</Text>
    </Box>
  )
}

function Card({ title }: { title: string }) {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} minHeight={3} flexShrink={0}>
      <Text>· {title}</Text>
    </Box>
  )
}

function EmptyMarker() {
  return <Text>(empty)</Text>
}

function Column({ spec, hasOverflow }: { spec: ColumnSpec; hasOverflow: boolean }) {
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
        {spec.cards === null ? (
          // Skeleton placeholders — variable widths to mimic km's randomized loading state.
          <>
            <SkeletonCard width={6} />
            <SkeletonCard width={11} />
            <SkeletonCard width={16} />
          </>
        ) : spec.cards.length === 0 ? (
          <EmptyMarker />
        ) : (
          spec.cards.map((c) => <Card key={c} title={c} />)
        )}
      </Box>
      {hasOverflow ? <Text>▸</Text> : null}
    </Box>
  )
}

function Board({ columns }: { columns: ColumnSpec[] }) {
  // Match km's BoardView: outer bg Box wraps an overflow="hidden" flex row.
  // Each column wrapper is a fixed-width flexShrink={0} Box (mirrors km's
  // CardColumn allocation strategy). Width=40 columns at COLS=160 means we
  // fit exactly 4 columns; 5+ overflow horizontally.
  const hasOverflow = columns.length > 4
  return (
    <Box flexDirection="column" width={COLS} height={ROWS} backgroundColor="#111111">
      <Text>BOARD</Text>
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {columns.map((col) => (
          <Box key={col.id} flexShrink={0} width={40}>
            <Column spec={col} hasOverflow={hasOverflow} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function pixelMismatches(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  fresh: ReturnType<ReturnType<typeof createRenderer>>,
  cap = 20,
): string[] {
  const mismatches: string[] = []
  for (let y = 0; y < ROWS && mismatches.length < cap; y++) {
    for (let x = 0; x < COLS && mismatches.length < cap; x++) {
      const a = app.cell(x, y)
      const b = fresh.cell(x, y)
      if (a.char !== b.char) {
        mismatches.push(`(${x},${y}): incremental='${a.char}' fresh='${b.char}'`)
      }
    }
  }
  return mismatches
}

describe("km-silvery.layout-churn-leaks-pixels — staged hydration", () => {
  test("wave 0 → wave 1 (skeleton → file-boards, same column count)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Board columns={WAVE_0_SHELL} />)
    expect(app.text).toContain("loading…")
    expect(app.text).toContain("░░░")

    app.rerender(<Board columns={WAVE_1_FILE_BOARDS} />)

    expect(app.text).toContain("@next")
    expect(app.text).toContain("@someday")
    expect(app.text).toContain("archive")
    // "loading…" must be fully purged.
    expect(app.text).not.toContain("loading…")
    // archive is still skeleton in wave 1 (no folder content yet) — placeholders should still render.
    expect(app.text).toContain("░░░░░░░░░░░░░░░░")

    const fresh = createRenderer({ cols: COLS, rows: ROWS })(<Board columns={WAVE_1_FILE_BOARDS} />)
    const mismatches = pixelMismatches(app, fresh)
    expect(mismatches, `wave-0→1 leaked pixels:\n  ${mismatches.join("\n  ")}`).toEqual([])
  })

  test("wave 1 → wave 2 (file-boards → folder-boards, column set reflows)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Board columns={WAVE_1_FILE_BOARDS} />)
    expect(app.text).toContain("@next")

    app.rerender(<Board columns={WAVE_2_HYDRATED} />)

    expect(app.text).toContain("archive")
    expect(app.text).toContain("done")
    expect(app.text).toContain("inbox")
    expect(app.text).not.toContain("@next")
    expect(app.text).not.toContain("@someday")
    expect(app.text).not.toContain("Inbox")
    expect(app.text).not.toContain("Ideas")
    // archive went from skeleton → empty.
    expect(app.text).not.toContain("░░░")
    expect(app.text).toContain("(empty)")

    const fresh = createRenderer({ cols: COLS, rows: ROWS })(<Board columns={WAVE_2_HYDRATED} />)
    const mismatches = pixelMismatches(app, fresh)
    expect(mismatches, `wave-1→2 leaked pixels:\n  ${mismatches.join("\n  ")}`).toEqual([])
  })

  test("full hydration sequence: shell → file → folder, no stale cells", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Board columns={WAVE_0_SHELL} />)
    app.rerender(<Board columns={WAVE_1_FILE_BOARDS} />)
    app.rerender(<Board columns={WAVE_2_HYDRATED} />)

    const fresh = createRenderer({ cols: COLS, rows: ROWS })(<Board columns={WAVE_2_HYDRATED} />)
    const mismatches = pixelMismatches(app, fresh)
    expect(mismatches, `staged hydration leaked pixels:\n  ${mismatches.join("\n  ")}`).toEqual([])
  })

  test("orphan border-corner glyphs scan: wave 1 → wave 2 reflow", () => {
    // Specifically check for the bead's signature artifact: orphan ╯ / ╰ / ╮ / ╭
    // glyphs that don't pair with a vertical edge in their column.
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Board columns={WAVE_1_FILE_BOARDS} />)
    app.rerender(<Board columns={WAVE_2_HYDRATED} />)

    const orphans: string[] = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = app.cell(x, y).char
        if (ch === "╯" || ch === "╰") {
          // Bottom corner: must have `│` directly above (same column).
          const above = y > 0 ? app.cell(x, y - 1).char : " "
          if (above !== "│" && above !== " ") {
            orphans.push(`bottom corner '${ch}' at (${x},${y}): above='${above}'`)
          }
        }
        if (ch === "╭" || ch === "╮") {
          // Top corner: must have `│` directly below (same column).
          const below = y < ROWS - 1 ? app.cell(x, y + 1).char : " "
          if (below !== "│" && below !== " ") {
            orphans.push(`top corner '${ch}' at (${x},${y}): below='${below}'`)
          }
        }
      }
    }
    expect(orphans, `orphan border glyphs:\n  ${orphans.join("\n  ")}`).toEqual([])
  })

  test("horizontal separator dashes do not leak mid-card", () => {
    // Bead signature: column separator dashes (─) appear mid-card after reflow.
    // Card body rows should not contain ─ chars (bg fill for empty cells is space).
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Board columns={WAVE_1_FILE_BOARDS} />)
    app.rerender(<Board columns={WAVE_2_HYDRATED} />)

    // For each card, find the row pattern: ╭───╮ at top, │…│ in body, ╰───╯ at bottom.
    // A row that is sandwiched between │…│ rows must not be a ─── dash row.
    const seenLines: string[] = []
    for (let y = 0; y < ROWS; y++) {
      let line = ""
      for (let x = 0; x < COLS; x++) line += app.cell(x, y).char
      seenLines.push(line)
    }

    const stale: string[] = []
    for (let y = 1; y < ROWS - 1; y++) {
      const above = seenLines[y - 1]!
      const here = seenLines[y]!
      const below = seenLines[y + 1]!
      // If above and below contain `│ … │` (vertical card edges), here should
      // also be content, not a top/bottom border row of a phantom card.
      const aboveHasV = /│/.test(above)
      const belowHasV = /│/.test(below)
      const hereLooksLikeBorder = /───────/.test(here) && !/│/.test(here)
      if (aboveHasV && belowHasV && hereLooksLikeBorder) {
        stale.push(
          `row ${y}: dash sandwich between vertical-edge rows: '${here.trim().slice(0, 80)}'`,
        )
      }
    }
    expect(stale, `mid-card separator dashes:\n  ${stale.join("\n  ")}`).toEqual([])
  })
})
