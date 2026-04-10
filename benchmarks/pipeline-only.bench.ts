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
import { buildTextAnalysis, shrinkwrapWidth, balancedWidth, knuthPlassBreaks } from "@silvery/ag-term/pipeline/pretext"
import { graphemeWidth } from "@silvery/ag-term/unicode"

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
          return React.createElement(
            Box,
            { key: card, paddingLeft: 1, borderStyle: "round" },
            React.createElement(Text, null, text),
          )
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

// ============================================================================
// Resize (layout changes, text unchanged — exercises PreparedText cache)
//
// PreparedText caches collected text and formatted lines per node. Resize
// changes dimensions but not content, so:
//   - collected text cache: HIT (text unchanged)
//   - format cache: MISS on first width, HIT on repeat (LRU keyed by width)
//
// Compare with SILVERY_NO_TEXT_CACHE=1 to see the cache delta.
// Run with SILVERY_STRICT=0 for accurate timing.
// ============================================================================

describe("Resize — 100 items (80→120 cols)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(flatList(100, 5))
  bench("resize to 120 cols", () => {
    app.resize(120, 24)
  })
})

describe("Resize — 1000 items (80→120 cols)", () => {
  const render = createRenderer({ cols: 80, rows: 40 })
  const app = render(flatList(1000, 5))
  bench("resize to 120 cols", () => {
    app.resize(120, 40)
  })
})

describe("Resize kanban 5x20 (200→160 cols)", () => {
  const render = createRenderer({ cols: 200, rows: 60 })
  const app = render(kanban(5, 20, 2, 5))
  bench("resize to 160 cols", () => {
    app.resize(160, 60)
  })
})

// ============================================================================
// Width oscillation (resize back and forth — exercises format cache LRU)
//
// The PreparedText format cache stores entries keyed by width. On oscillation:
//   - First cycle: MISS at 120, MISS at 80 (populates both)
//   - Subsequent cycles: HIT at both widths (LRU retains both entries)
//
// Without cache, every oscillation re-collects AND re-formats.
// ============================================================================

describe("Width oscillation — 100 items (80↔120 cols)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(flatList(100, 5))
  let wide = false
  bench("alternate 80↔120", () => {
    wide = !wide
    app.resize(wide ? 120 : 80, 24)
  })
})

describe("Width oscillation — 1000 items (80↔120 cols)", () => {
  const render = createRenderer({ cols: 80, rows: 40 })
  const app = render(flatList(1000, 5))
  let wide = false
  bench("alternate 80↔120", () => {
    wide = !wide
    app.resize(wide ? 120 : 80, 40)
  })
})

describe("Width oscillation kanban 5x20 (160↔200 cols)", () => {
  const render = createRenderer({ cols: 200, rows: 60 })
  const app = render(kanban(5, 20, 2, 5))
  let wide = true
  bench("alternate 160↔200", () => {
    wide = !wide
    app.resize(wide ? 200 : 160, 60)
  })
})

// ============================================================================
// Scroll container (viewport culling opportunity — many off-screen nodes)
//
// Tests cursor move inside a scroll container where only 20 of 200 items
// are visible. Currently all 200 items exist in the tree (no VirtualList).
// This measures the cost of having off-screen nodes in the render tree.
// ============================================================================

function scrollList(count: number, cursor: number, viewportHeight: number) {
  return React.createElement(
    Box,
    { flexDirection: "column", height: viewportHeight, overflow: "scroll", scrollTo: cursor },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(SStyleItem, { key: i, index: i, selected: i === cursor }),
    ),
  )
}

describe("Scroll container — 200 items, 20 visible (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(scrollList(200, 0, 20))
  let cursor = 0
  bench("cursor move in scroll", () => {
    cursor = (cursor + 1) % 200
    app.rerender(scrollList(200, cursor, 20))
  })
})

describe("Scroll container — 1000 items, 20 visible (80x24)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  const app = render(scrollList(1000, 0, 20))
  let cursor = 0
  bench("cursor move in scroll", () => {
    cursor = (cursor + 1) % 1000
    app.rerender(scrollList(1000, cursor, 20))
  })
})

// ============================================================================
// Pretext algorithms (pure computation, no rendering)
//
// Measures the cost of text analysis and layout algorithms independently
// from the rendering pipeline. Useful for understanding the overhead of
// snug-content, balanced, and Knuth-Plass on various text sizes.
// ============================================================================

const SHORT_TEXT = "The quick brown fox jumps over the lazy dog"
const MEDIUM_TEXT =
  "The quick brown fox jumps over the lazy dog. " +
  "Pack my box with five dozen liquor jugs. " +
  "How vexingly quick daft zebras jump. " +
  "The five boxing wizards jump quickly."
const LONG_TEXT = Array.from({ length: 10 }, () => MEDIUM_TEXT).join(" ")

describe("Pretext — buildTextAnalysis", () => {
  bench("short (44 chars)", () => {
    buildTextAnalysis(SHORT_TEXT, graphemeWidth)
  })
  bench("medium (176 chars)", () => {
    buildTextAnalysis(MEDIUM_TEXT, graphemeWidth)
  })
  bench("long (1760 chars)", () => {
    buildTextAnalysis(LONG_TEXT, graphemeWidth)
  })
})

describe("Pretext — shrinkwrapWidth", () => {
  const shortA = buildTextAnalysis(SHORT_TEXT, graphemeWidth)
  const mediumA = buildTextAnalysis(MEDIUM_TEXT, graphemeWidth)
  const longA = buildTextAnalysis(LONG_TEXT, graphemeWidth)
  bench("short at width=20", () => {
    shrinkwrapWidth(shortA, 20)
  })
  bench("medium at width=40", () => {
    shrinkwrapWidth(mediumA, 40)
  })
  bench("long at width=80", () => {
    shrinkwrapWidth(longA, 80)
  })
})

describe("Pretext — balancedWidth", () => {
  const shortA = buildTextAnalysis(SHORT_TEXT, graphemeWidth)
  const mediumA = buildTextAnalysis(MEDIUM_TEXT, graphemeWidth)
  const longA = buildTextAnalysis(LONG_TEXT, graphemeWidth)
  bench("short at width=20", () => {
    balancedWidth(shortA, 20)
  })
  bench("medium at width=40", () => {
    balancedWidth(mediumA, 40)
  })
  bench("long at width=80", () => {
    balancedWidth(longA, 80)
  })
})

describe("Pretext — knuthPlassBreaks", () => {
  const shortA = buildTextAnalysis(SHORT_TEXT, graphemeWidth)
  const mediumA = buildTextAnalysis(MEDIUM_TEXT, graphemeWidth)
  const longA = buildTextAnalysis(LONG_TEXT, graphemeWidth)
  bench("short at width=20", () => {
    knuthPlassBreaks(shortA, 20)
  })
  bench("medium at width=40", () => {
    knuthPlassBreaks(mediumA, 40)
  })
  bench("long at width=80", () => {
    knuthPlassBreaks(longA, 80)
  })
})

// ============================================================================
// Pretext wrap modes — end-to-end rendering with wrap="even"
// ============================================================================

function wrappedParagraph(text: string, wrap: string, width: number) {
  return React.createElement(
    Box,
    { flexDirection: "column", width },
    React.createElement(Text, { wrap: wrap as any }, text),
  )
}

describe("Wrap mode comparison — medium text (width=40)", () => {
  const render = createRenderer({ cols: 80, rows: 24 })
  bench('wrap="wrap" (greedy)', () => {
    render(wrappedParagraph(MEDIUM_TEXT, "wrap", 40))
  })
  bench('wrap="even" (min-raggedness)', () => {
    render(wrappedParagraph(MEDIUM_TEXT, "even", 40))
  })
})

// ============================================================================
// Large terminal (400x200 — realistic for ultrawide / tiling WM users)
//
// At 400×200, the buffer has 80,000 cells. Clone cost: 320KB Uint32Array +
// sparse Maps. This tests whether the pipeline scales to large viewports.
// ============================================================================

describe("Large terminal — cursor move 100 items (400x200)", () => {
  const render = createRenderer({ cols: 400, rows: 200 })
  const app = render(memoList(100, 0))
  let cursor = 0
  bench("memo'd rerender", () => {
    cursor = (cursor + 1) % 100
    app.rerender(memoList(100, cursor))
  })
})

describe("Large terminal — cursor move 1000 items (400x200)", () => {
  const render = createRenderer({ cols: 400, rows: 200 })
  const app = render(memoList(1000, 0))
  let cursor = 0
  bench("memo'd rerender", () => {
    cursor = (cursor + 1) % 1000
    app.rerender(memoList(1000, cursor))
  })
})

describe("Large terminal — resize 1000 items (400→300 cols)", () => {
  const render = createRenderer({ cols: 400, rows: 200 })
  const app = render(flatList(1000, 5))
  bench("resize to 300 cols", () => {
    app.resize(300, 200)
  })
})

describe("Large terminal — kanban 5x50 (400x200)", () => {
  const render = createRenderer({ cols: 400, rows: 200 })
  const app = render(kanban(5, 50, 2, 10))
  let card = 10
  bench("move editing marker", () => {
    card = (card + 1) % 50
    app.rerender(kanban(5, 50, 2, card))
  })
})
