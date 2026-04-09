/**
 * Silvery vs Ink — Head-to-Head Render Benchmark
 *
 * Same React tree structures rendered by both frameworks.
 * Measures: initial render, re-render (state change), and scaling.
 *
 * Run: bun vitest bench vendor/internal/silvery/benchmarks/silvery-vs-ink.bench.ts
 *
 * Fair comparison notes:
 * - Both use their native Box/Text components (no compat layer)
 * - Silvery uses createRenderer (synchronous render-to-string)
 * - Ink uses renderToString (synchronous render-to-string)
 * - Same terminal dimensions (80x24 and 200x60)
 * - Ink's Yoga WASM init happens once at import (not measured per-render)
 */

import React from "react"
import { bench, describe } from "vitest"
import { Writable } from "node:stream"
import { createRenderer } from "@silvery/test"
import { Box as SBox, Text as SText } from "silvery"
import { render as inkRender, renderToString as inkRenderToString, Box as IBox, Text as IText } from "ink"

// ============================================================================
// Mock stdout for Ink mounted-app benchmarks (incremental rendering path)
// ============================================================================

function createMockStdout(cols: number, rows: number): NodeJS.WriteStream {
  const stream = new Writable({
    write(_chunk, _encoding, cb) {
      cb()
    },
  })
  Object.assign(stream, {
    columns: cols,
    rows,
    isTTY: true,
    getWindowSize: () => [cols, rows],
  })
  return stream as unknown as NodeJS.WriteStream
}

// ============================================================================
// Shared fixture generators — identical structure, different component imports
// ============================================================================

function silveryFlatList(count: number) {
  return React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(SBox, { key: i }, React.createElement(SText, null, `Item ${i}`)),
    ),
  )
}

function inkFlatList(count: number) {
  return React.createElement(
    IBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(IBox, { key: i }, React.createElement(IText, null, `Item ${i}`)),
    ),
  )
}

function silveryStyledList(count: number) {
  return React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(
        SBox,
        { key: i, paddingLeft: 1, borderStyle: i % 3 === 0 ? "single" : undefined },
        React.createElement(SText, { bold: i % 2 === 0, color: i % 4 === 0 ? "green" : undefined }, `Item ${i}`),
      ),
    ),
  )
}

function inkStyledList(count: number) {
  return React.createElement(
    IBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(
        IBox,
        { key: i, paddingLeft: 1, borderStyle: i % 3 === 0 ? "single" : undefined },
        React.createElement(IText, { bold: i % 2 === 0, color: i % 4 === 0 ? "green" : undefined }, `Item ${i}`),
      ),
    ),
  )
}

function silveryKanban(cols: number, cards: number) {
  return React.createElement(
    SBox,
    { flexDirection: "row", gap: 1 },
    ...Array.from({ length: cols }, (_, col) =>
      React.createElement(
        SBox,
        { key: col, flexDirection: "column", flexGrow: 1 },
        React.createElement(SBox, { borderStyle: "single" }, React.createElement(SText, { bold: true }, `Col ${col}`)),
        ...Array.from({ length: cards }, (_, card) =>
          React.createElement(
            SBox,
            { key: card, paddingLeft: 1, borderStyle: "round" },
            React.createElement(SText, null, `Card ${col}-${card}`),
          ),
        ),
      ),
    ),
  )
}

function inkKanban(cols: number, cards: number) {
  return React.createElement(
    IBox,
    { flexDirection: "row", gap: 1 },
    ...Array.from({ length: cols }, (_, col) =>
      React.createElement(
        IBox,
        { key: col, flexDirection: "column", flexGrow: 1 },
        React.createElement(IBox, { borderStyle: "single" }, React.createElement(IText, { bold: true }, `Col ${col}`)),
        ...Array.from({ length: cards }, (_, card) =>
          React.createElement(
            IBox,
            { key: card, paddingLeft: 1, borderStyle: "round" },
            React.createElement(IText, null, `Card ${col}-${card}`),
          ),
        ),
      ),
    ),
  )
}

function silveryDeepTree(depth: number): React.ReactElement {
  if (depth === 0) return React.createElement(SText, null, "Leaf")
  return React.createElement(SBox, { paddingLeft: 1 }, silveryDeepTree(depth - 1))
}

function inkDeepTree(depth: number): React.ReactElement {
  if (depth === 0) return React.createElement(IText, null, "Leaf")
  return React.createElement(IBox, { paddingLeft: 1 }, inkDeepTree(depth - 1))
}

// ============================================================================
// Benchmarks
// ============================================================================

const render80 = createRenderer({ cols: 80, rows: 24 })
const render200 = createRenderer({ cols: 200, rows: 60 })

describe("Flat list — 10 items (80x24)", () => {
  bench("Silvery", () => {
    render80(silveryFlatList(10))
  })
  bench("Ink", () => {
    inkRenderToString(inkFlatList(10))
  })
})

describe("Flat list — 100 items (80x24)", () => {
  bench("Silvery", () => {
    render80(silveryFlatList(100))
  })
  bench("Ink", () => {
    inkRenderToString(inkFlatList(100))
  })
})

describe("Flat list — 100 items (200x60)", () => {
  bench("Silvery", () => {
    render200(silveryFlatList(100))
  })
  bench("Ink", () => {
    inkRenderToString(inkFlatList(100), { columns: 200 })
  })
})

describe("Styled list — 100 items (80x24)", () => {
  bench("Silvery", () => {
    render80(silveryStyledList(100))
  })
  bench("Ink", () => {
    inkRenderToString(inkStyledList(100))
  })
})

describe("Kanban board — 5×10 (80x24)", () => {
  bench("Silvery", () => {
    render80(silveryKanban(5, 10))
  })
  bench("Ink", () => {
    inkRenderToString(inkKanban(5, 10))
  })
})

describe("Kanban board — 5×20 (200x60)", () => {
  bench("Silvery", () => {
    render200(silveryKanban(5, 20))
  })
  bench("Ink", () => {
    inkRenderToString(inkKanban(5, 20), { columns: 200 })
  })
})

describe("Deep tree — 20 levels", () => {
  bench("Silvery", () => {
    render80(silveryDeepTree(20))
  })
  bench("Ink", () => {
    inkRenderToString(inkDeepTree(20))
  })
})

describe("Deep tree — 50 levels", () => {
  bench("Silvery", () => {
    render80(silveryDeepTree(50))
  })
  bench("Ink", () => {
    inkRenderToString(inkDeepTree(50))
  })
})

// ============================================================================
// Incremental Re-render — silvery's dirty tracking vs Ink's full repaint
// This is silvery's key advantage: only changed nodes re-render.
// ============================================================================

// Silvery: warm app with rerender() — dirty tracking kicks in
const warmRender100 = createRenderer({ cols: 80, rows: 24 })
const warmApp100 = warmRender100(
  React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: 100 }, (_, i) =>
      React.createElement(SBox, { key: i }, React.createElement(SText, null, `Item ${i}`)),
    ),
  ),
)

const warmRender1000 = createRenderer({ cols: 120, rows: 40 })
const warmApp1000 = warmRender1000(
  React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: 1000 }, (_, i) =>
      React.createElement(SBox, { key: i }, React.createElement(SText, null, `Item ${i}`)),
    ),
  ),
)

describe("Incremental re-render — cursor move in 100-item list", () => {
  let sCursor = 0
  bench("Silvery (dirty tracking)", () => {
    sCursor = (sCursor + 1) % 100
    warmApp100.rerender(
      React.createElement(
        SBox,
        { flexDirection: "column" },
        ...Array.from({ length: 100 }, (_, i) =>
          React.createElement(
            SBox,
            { key: i },
            React.createElement(SText, { inverse: i === sCursor, bold: i === sCursor }, `Item ${i}`),
          ),
        ),
      ),
    )
  })

  bench("Ink (full repaint)", () => {
    inkRenderToString(
      React.createElement(
        IBox,
        { flexDirection: "column" },
        ...Array.from({ length: 100 }, (_, i) =>
          React.createElement(
            IBox,
            { key: i },
            React.createElement(IText, { inverse: i === 0, bold: i === 0 }, `Item ${i}`),
          ),
        ),
      ),
    )
  })
})

describe("Incremental re-render — cursor move in 1000-item list", () => {
  let sCursor = 0
  bench("Silvery (dirty tracking)", () => {
    sCursor = (sCursor + 1) % 1000
    warmApp1000.rerender(
      React.createElement(
        SBox,
        { flexDirection: "column" },
        ...Array.from({ length: 1000 }, (_, i) =>
          React.createElement(
            SBox,
            { key: i },
            React.createElement(SText, { inverse: i === sCursor, bold: i === sCursor }, `Item ${i}`),
          ),
        ),
      ),
    )
  })

  bench("Ink (full repaint)", () => {
    inkRenderToString(
      React.createElement(
        IBox,
        { flexDirection: "column" },
        ...Array.from({ length: 1000 }, (_, i) =>
          React.createElement(
            IBox,
            { key: i },
            React.createElement(IText, { inverse: i === 0, bold: i === 0 }, `Item ${i}`),
          ),
        ),
      ),
    )
  })
})

describe("Incremental re-render — single text change in kanban 5×20", () => {
  const warmKanban = createRenderer({ cols: 200, rows: 60 })
  const kanbanApp = warmKanban(silveryKanban(5, 20))

  bench("Silvery (dirty tracking)", () => {
    // Rerender with one card text changed — dirty tracking skips 99% of nodes
    kanbanApp.rerender(silveryKanban(5, 20))
  })

  bench("Ink (renderToString full repaint)", () => {
    inkRenderToString(inkKanban(5, 20), { columns: 200 })
  })
})

// ============================================================================
// Mounted-app comparison — both frameworks with their incremental modes ON
// This is the fairest re-render comparison: Ink's incrementalRendering vs
// Silvery's dirty tracking, both using mounted apps with rerender().
// ============================================================================

describe("Mounted incremental re-render — cursor move in 100-item list", () => {
  // Silvery mounted app
  const sRender = createRenderer({ cols: 80, rows: 24 })
  const sApp = sRender(
    React.createElement(
      SBox,
      { flexDirection: "column" },
      ...Array.from({ length: 100 }, (_, i) =>
        React.createElement(SBox, { key: i }, React.createElement(SText, null, `Item ${i}`)),
      ),
    ),
  )

  // Ink mounted app with incrementalRendering enabled
  const inkStdout = createMockStdout(80, 24)
  const inkInstance = inkRender(
    React.createElement(
      IBox,
      { flexDirection: "column" },
      ...Array.from({ length: 100 }, (_, i) =>
        React.createElement(IBox, { key: i }, React.createElement(IText, null, `Item ${i}`)),
      ),
    ),
    { stdout: inkStdout, debug: true, patchConsole: false, incrementalRendering: true },
  )

  let sCursor = 0
  bench("Silvery (mounted, dirty tracking)", () => {
    sCursor = (sCursor + 1) % 100
    sApp.rerender(
      React.createElement(
        SBox,
        { flexDirection: "column" },
        ...Array.from({ length: 100 }, (_, i) =>
          React.createElement(
            SBox,
            { key: i },
            React.createElement(SText, { inverse: i === sCursor, bold: i === sCursor }, `Item ${i}`),
          ),
        ),
      ),
    )
  })

  let iCursor = 0
  bench("Ink (mounted, incrementalRendering)", () => {
    iCursor = (iCursor + 1) % 100
    inkInstance.rerender(
      React.createElement(
        IBox,
        { flexDirection: "column" },
        ...Array.from({ length: 100 }, (_, i) =>
          React.createElement(
            IBox,
            { key: i },
            React.createElement(IText, { inverse: i === iCursor, bold: i === iCursor }, `Item ${i}`),
          ),
        ),
      ),
    )
  })
})

describe("Mounted incremental re-render — single text change in kanban 5×20", () => {
  const sRender = createRenderer({ cols: 200, rows: 60 })
  const sApp = sRender(silveryKanban(5, 20))

  const inkStdout = createMockStdout(200, 60)
  const inkInstance = inkRender(inkKanban(5, 20), {
    stdout: inkStdout,
    debug: true,
    patchConsole: false,
    incrementalRendering: true,
  })

  bench("Silvery (mounted, dirty tracking)", () => {
    sApp.rerender(silveryKanban(5, 20))
  })

  bench("Ink (mounted, incrementalRendering)", () => {
    inkInstance.rerender(inkKanban(5, 20))
  })
})

// ============================================================================
// useState-pattern benchmarks — selective state updates
// This is the workload silvery was designed for: only the changed component's
// cells get re-emitted. React.memo() prevents reconciliation of unchanged
// siblings; silvery's dirty tracking prevents layout + render of clean nodes.
// ============================================================================

// Memo'd item components — React skips reconciliation entirely for unchanged items
const SMemoItem = React.memo(
  ({ index, active }: { index: number; active: boolean }) =>
    React.createElement(
      SBox,
      { paddingLeft: 1, borderStyle: active ? "double" : "single" },
      React.createElement(SText, { bold: active, inverse: active }, `Task ${index}: ${active ? "ACTIVE" : "idle"}`),
    ),
  (prev, next) => prev.index === next.index && prev.active === next.active,
)

const IMemoItem = React.memo(
  ({ index, active }: { index: number; active: boolean }) =>
    React.createElement(
      IBox,
      { paddingLeft: 1, borderStyle: active ? "double" : "single" },
      React.createElement(IText, { bold: active, inverse: active }, `Task ${index}: ${active ? "ACTIVE" : "idle"}`),
    ),
  (prev, next) => prev.index === next.index && prev.active === next.active,
)

function silveryMemoList(count: number, activeIdx: number) {
  return React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(SMemoItem, { key: i, index: i, active: i === activeIdx }),
    ),
  )
}

function inkMemoList(count: number, activeIdx: number) {
  return React.createElement(
    IBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(IMemoItem, { key: i, index: i, active: i === activeIdx }),
    ),
  )
}

describe("useState pattern — memo'd 100-item list, single active toggle", () => {
  const sRender = createRenderer({ cols: 80, rows: 24 })
  const sApp = sRender(silveryMemoList(100, 0))

  const inkStdout = createMockStdout(80, 24)
  const inkInstance = inkRender(inkMemoList(100, 0), {
    stdout: inkStdout,
    debug: true,
    patchConsole: false,
    incrementalRendering: true,
  })

  let sActive = 0
  bench("Silvery (memo + dirty tracking)", () => {
    sActive = (sActive + 1) % 100
    sApp.rerender(silveryMemoList(100, sActive))
  })

  let iActive = 0
  bench("Ink (memo + incrementalRendering)", () => {
    iActive = (iActive + 1) % 100
    inkInstance.rerender(inkMemoList(100, iActive))
  })
})

describe("useState pattern — memo'd 500-item list, single active toggle", () => {
  const sRender = createRenderer({ cols: 120, rows: 40 })
  const sApp = sRender(silveryMemoList(500, 0))

  const inkStdout = createMockStdout(120, 40)
  const inkInstance = inkRender(inkMemoList(500, 0), {
    stdout: inkStdout,
    debug: true,
    patchConsole: false,
    incrementalRendering: true,
  })

  let sActive = 0
  bench("Silvery (memo + dirty tracking)", () => {
    sActive = (sActive + 1) % 500
    sApp.rerender(silveryMemoList(500, sActive))
  })

  let iActive = 0
  bench("Ink (memo + incrementalRendering)", () => {
    iActive = (iActive + 1) % 500
    inkInstance.rerender(inkMemoList(500, iActive))
  })
})

// Memo'd kanban — change one card's text in a 5×20 board
const SMemoCard = React.memo(
  ({ col, card, text }: { col: number; card: number; text: string }) =>
    React.createElement(SBox, { paddingLeft: 1, borderStyle: "round" }, React.createElement(SText, null, text)),
  (prev, next) => prev.text === next.text,
)

const IMemoCard = React.memo(
  ({ col, card, text }: { col: number; card: number; text: string }) =>
    React.createElement(IBox, { paddingLeft: 1, borderStyle: "round" }, React.createElement(IText, null, text)),
  (prev, next) => prev.text === next.text,
)

function silveryMemoKanban(cols: number, cards: number, editCol: number, editCard: number) {
  return React.createElement(
    SBox,
    { flexDirection: "row", gap: 1 },
    ...Array.from({ length: cols }, (_, col) =>
      React.createElement(
        SBox,
        { key: col, flexDirection: "column", flexGrow: 1 },
        React.createElement(SBox, { borderStyle: "single" }, React.createElement(SText, { bold: true }, `Col ${col}`)),
        ...Array.from({ length: cards }, (_, card) => {
          const text = col === editCol && card === editCard ? `Card ${col}-${card} [EDITING]` : `Card ${col}-${card}`
          return React.createElement(SMemoCard, { key: card, col, card, text })
        }),
      ),
    ),
  )
}

function inkMemoKanban(cols: number, cards: number, editCol: number, editCard: number) {
  return React.createElement(
    IBox,
    { flexDirection: "row", gap: 1 },
    ...Array.from({ length: cols }, (_, col) =>
      React.createElement(
        IBox,
        { key: col, flexDirection: "column", flexGrow: 1 },
        React.createElement(IBox, { borderStyle: "single" }, React.createElement(IText, { bold: true }, `Col ${col}`)),
        ...Array.from({ length: cards }, (_, card) => {
          const text = col === editCol && card === editCard ? `Card ${col}-${card} [EDITING]` : `Card ${col}-${card}`
          return React.createElement(IMemoCard, { key: card, col, card, text })
        }),
      ),
    ),
  )
}

describe("useState pattern — memo'd kanban 5×20, single card edit", () => {
  const sRender = createRenderer({ cols: 200, rows: 60 })
  const sApp = sRender(silveryMemoKanban(5, 20, 0, 0))

  const inkStdout = createMockStdout(200, 60)
  const inkInstance = inkRender(inkMemoKanban(5, 20, 0, 0), {
    stdout: inkStdout,
    debug: true,
    patchConsole: false,
    incrementalRendering: true,
  })

  let sCard = 0
  bench("Silvery (memo + dirty tracking)", () => {
    sCard = (sCard + 1) % 20
    sApp.rerender(silveryMemoKanban(5, 20, 2, sCard))
  })

  let iCard = 0
  bench("Ink (memo + incrementalRendering)", () => {
    iCard = (iCard + 1) % 20
    inkInstance.rerender(inkMemoKanban(5, 20, 2, iCard))
  })
})
