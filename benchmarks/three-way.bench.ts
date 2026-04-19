/**
 * Three-way benchmark: Silvery (reactive) vs Silvery (imperative) vs Ink
 *
 * Compares all three rendering paths in one run.
 * Shows the perf impact of reactive signals vs imperative cascade vs Ink.
 *
 * Run: bun vitest bench benchmarks/three-way.bench.ts
 */

import React from "react"
import { bench, describe } from "vitest"
import { Writable } from "node:stream"
import { createRenderer } from "@silvery/test"
import { Box as SBox, Text as SText } from "silvery"
import { render as inkRender, Box as IBox, Text as IText } from "ink"
import { setReactiveEnabled } from "@silvery/ag-term/pipeline/render-phase"

// ============================================================================
// Mock stdout for Ink
// ============================================================================

function createMockStdout(cols: number, rows: number) {
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
// Memo'd item (React skips unchanged children)
// ============================================================================

const SItem = React.memo(
  ({ index, selected }: { index: number; selected: boolean }) =>
    React.createElement(
      SBox,
      { key: index },
      React.createElement(SText, { inverse: selected }, `Item ${index}`),
    ),
  (prev, next) => prev.index === next.index && prev.selected === next.selected,
)

const IItem = React.memo(
  ({ index, selected }: { index: number; selected: boolean }) =>
    React.createElement(
      IBox,
      { key: index },
      React.createElement(IText, { inverse: selected }, `Item ${index}`),
    ),
  (prev, next) => prev.index === next.index && prev.selected === next.selected,
)

function silveryList(count: number, cursor: number) {
  return React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(SItem, { key: i, index: i, selected: i === cursor }),
    ),
  )
}

function inkList(count: number, cursor: number) {
  return React.createElement(
    IBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(IItem, { key: i, index: i, selected: i === cursor }),
    ),
  )
}

// ============================================================================
// Three-way: cursor move in 100-item list
// ============================================================================

describe("Three-way — cursor move 100 items (80x24)", () => {
  // Silvery reactive app
  setReactiveEnabled(true)
  const sReactiveRender = createRenderer({ cols: 80, rows: 24 })
  const sReactiveApp = sReactiveRender(silveryList(100, 0))

  // Silvery imperative app
  setReactiveEnabled(false)
  const sImperativeRender = createRenderer({ cols: 80, rows: 24 })
  const sImperativeApp = sImperativeRender(silveryList(100, 0))

  // Ink app
  const inkStdout = createMockStdout(80, 24)
  const inkApp = inkRender(inkList(100, 0), {
    stdout: inkStdout,
    debug: true,
    patchConsole: false,
    incrementalRendering: true,
    maxFps: 10000,
  })

  let c1 = 0,
    c2 = 0,
    c3 = 0

  bench("Silvery (reactive)", () => {
    setReactiveEnabled(true)
    c1 = (c1 + 1) % 100
    sReactiveApp.rerender(silveryList(100, c1))
  })

  bench("Silvery (imperative)", () => {
    setReactiveEnabled(false)
    c2 = (c2 + 1) % 100
    sImperativeApp.rerender(silveryList(100, c2))
  })

  bench("Ink", () => {
    c3 = (c3 + 1) % 100
    inkApp.rerender(inkList(100, c3))
  })
})

// ============================================================================
// Three-way: cursor move in 1000-item list
// ============================================================================

describe("Three-way — cursor move 1000 items (80x24)", () => {
  setReactiveEnabled(true)
  const sReactiveRender = createRenderer({ cols: 80, rows: 24 })
  const sReactiveApp = sReactiveRender(silveryList(1000, 0))

  setReactiveEnabled(false)
  const sImperativeRender = createRenderer({ cols: 80, rows: 24 })
  const sImperativeApp = sImperativeRender(silveryList(1000, 0))

  const inkStdout = createMockStdout(80, 24)
  const inkApp = inkRender(inkList(1000, 0), {
    stdout: inkStdout,
    debug: true,
    patchConsole: false,
    incrementalRendering: true,
    maxFps: 10000,
  })

  let c1 = 0,
    c2 = 0,
    c3 = 0

  bench("Silvery (reactive)", () => {
    setReactiveEnabled(true)
    c1 = (c1 + 1) % 1000
    sReactiveApp.rerender(silveryList(1000, c1))
  })

  bench("Silvery (imperative)", () => {
    setReactiveEnabled(false)
    c2 = (c2 + 1) % 1000
    sImperativeApp.rerender(silveryList(1000, c2))
  })

  bench("Ink", () => {
    c3 = (c3 + 1) % 1000
    inkApp.rerender(inkList(1000, c3))
  })
})
