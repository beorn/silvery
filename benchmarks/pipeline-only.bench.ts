/**
 * Pipeline-only benchmark — measures absolute Silvery rerender time
 *
 * Unlike silvery-vs-ink.bench.ts (which measures ratios), this bench
 * measures absolute time per operation in microseconds. Use to track
 * the impact of individual pipeline optimizations.
 *
 * Run: SILVERY_STRICT=0 bun vitest bench vendor/silvery/benchmarks/pipeline-only.bench.ts
 */

import React from "react"
import { bench, describe } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

// ============================================================================
// Fixtures
// ============================================================================

const SStyleItem = React.memo(
  ({ index, selected }: { index: number; selected: boolean }) =>
    React.createElement(Box, { key: index }, React.createElement(Text, { inverse: selected }, `Item ${index}`)),
  (prev, next) => prev.index === next.index && prev.selected === next.selected,
)

function memoList(count: number, cursor: number) {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(SStyleItem, { key: i, index: i, selected: i === cursor }),
    ),
  )
}

function flatList(count: number, cursor: number) {
  return React.createElement(
    Box,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, { inverse: i === cursor, bold: i === cursor }, `Item ${i}`),
      ),
    ),
  )
}

function kanban(cols: number, cards: number, editCol: number, editCard: number) {
  return React.createElement(
    Box,
    { flexDirection: "row", gap: 1 },
    ...Array.from({ length: cols }, (_, col) =>
      React.createElement(
        Box,
        { key: col, flexDirection: "column", flexGrow: 1 },
        React.createElement(Box, { borderStyle: "single" }, React.createElement(Text, { bold: true }, `Col ${col}`)),
        ...Array.from({ length: cards }, (_, card) => {
          const text = col === editCol && card === editCard ? `Card ${col}-${card} [EDITING]` : `Card ${col}-${card}`
          return React.createElement(Box, { key: card, paddingLeft: 1, borderStyle: "round" }, React.createElement(Text, null, text))
        }),
      ),
    ),
  )
}

// ============================================================================
// Cursor move (style-only — exercises layout-on-demand skip + epoch flags)
// ============================================================================

describe("Cursor move — 20 items (all visible, 80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(memoList(20, 0))
  let cursor = 0
  bench("memo'd rerender", () => {
    cursor = (cursor + 1) % 20
    app.rerender(memoList(20, cursor))
  })
})

describe("Cursor move — 100 items (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(memoList(100, 0))
  let cursor = 0
  bench("memo'd rerender", () => {
    cursor = (cursor + 1) % 100
    app.rerender(memoList(100, cursor))
  })
})

describe("Cursor move — 500 items (120x40)", () => {
  const render = createRenderer({ cols: 120, rows: 40 })
  const app = render(memoList(500, 0))
  let cursor = 0
  bench("memo'd rerender", () => {
    cursor = (cursor + 1) % 500
    app.rerender(memoList(500, cursor))
  })
})

describe("Cursor move — 1000 items (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(memoList(1000, 0))
  let cursor = 0
  bench("memo'd rerender", () => {
    cursor = (cursor + 1) % 1000
    app.rerender(memoList(1000, cursor))
  })
})

// ============================================================================
// Non-memo'd cursor (React reconciles all children — isolates pipeline cost)
// ============================================================================

describe("Cursor move (no memo) — 100 items (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(flatList(100, 0))
  let cursor = 0
  bench("full reconcile + render", () => {
    cursor = (cursor + 1) % 100
    app.rerender(flatList(100, cursor))
  })
})

describe("Cursor move (no memo) — 500 items (120x40)", () => {
  const render = createRenderer({ cols: 120, rows: 40 })
  const app = render(flatList(500, 0))
  let cursor = 0
  bench("full reconcile + render", () => {
    cursor = (cursor + 1) % 500
    app.rerender(flatList(500, cursor))
  })
})

// ============================================================================
// Kanban (complex layout — exercises container-level layout skip)
// ============================================================================

describe("Kanban 5x20 — move editing marker (200x60)", () => {
  const render = createRenderer({ cols: 200, rows: 60 })
  const app = render(kanban(5, 20, 2, 0))
  let card = 0
  bench("rerender", () => {
    card = (card + 1) % 20
    app.rerender(kanban(5, 20, 2, card))
  })
})

describe("Kanban 5x50 — move editing marker (200x60)", () => {
  const render = createRenderer({ cols: 200, rows: 60 })
  const app = render(kanban(5, 50, 2, 0))
  let card = 0
  bench("rerender", () => {
    card = (card + 1) % 50
    app.rerender(kanban(5, 50, 2, card))
  })
})

// ============================================================================
// Style-only change (no content, no layout — purest pipeline-skip test)
// ============================================================================

describe("Style-only (inverse toggle) — 100 items (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(memoList(100, 0))
  let on = false
  bench("toggle inverse on item 50", () => {
    on = !on
    app.rerender(memoList(100, on ? 50 : -1))
  })
})

describe("Style-only (inverse toggle) — 1000 items (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(memoList(1000, 0))
  let on = false
  bench("toggle inverse on item 500", () => {
    on = !on
    app.rerender(memoList(1000, on ? 500 : -1))
  })
})
