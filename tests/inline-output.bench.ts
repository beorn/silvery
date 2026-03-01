/**
 * Inline Mode Output Phase Benchmarks
 *
 * Measures the output phase cost for inline rendering:
 * - Full render (inlineFullRender): baseline
 * - Incremental render (inlineIncrementalRender): optimized path
 *
 * Run: bun bench vendor/beorn-inkx/tests/inline-output.bench.ts
 * Compare: bun bench vendor/beorn-inkx/tests/inline-output.bench.ts -- --reporter=verbose
 */

import { bench, describe } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { createOutputPhase, outputPhase } from "../src/pipeline/output-phase.js"

// ============================================================================
// Helpers
// ============================================================================

function fillBufferWithContent(buf: TerminalBuffer, rows: number, prefix = ""): void {
  for (let y = 0; y < rows; y++) {
    const text = `${prefix}Item ${y}: This is a line of content with some styling`
    for (let x = 0; x < Math.min(text.length, buf.width); x++) {
      buf.setCell(x, y, { char: text[x]! })
    }
  }
}

function createPair(
  width: number,
  height: number,
  contentRows: number,
  changedCells: number,
): { prev: TerminalBuffer; next: TerminalBuffer } {
  const prev = new TerminalBuffer(width, height)
  fillBufferWithContent(prev, contentRows)

  const next = new TerminalBuffer(width, height)
  fillBufferWithContent(next, contentRows)

  // Change N cells (spread across different rows)
  for (let i = 0; i < changedCells; i++) {
    const row = Math.floor((i / changedCells) * contentRows)
    next.setCell(0, row, { char: "X" })
  }

  return { prev, next }
}

// ============================================================================
// Output Phase: Full vs Incremental
// ============================================================================

describe("inline output: full render", () => {
  // Bare outputPhase() always falls back to full render (no instance state)
  bench("10 rows, 1 change", () => {
    const { prev, next } = createPair(80, 20, 10, 1)
    outputPhase(null, prev, "inline")
    outputPhase(prev, next, "inline")
  })

  bench("30 rows, 1 change", () => {
    const { prev, next } = createPair(120, 40, 30, 1)
    outputPhase(null, prev, "inline")
    outputPhase(prev, next, "inline")
  })

  bench("50 rows, 1 change", () => {
    const { prev, next } = createPair(120, 60, 50, 1)
    outputPhase(null, prev, "inline")
    outputPhase(prev, next, "inline")
  })
})

describe("inline output: incremental render", () => {
  // createOutputPhase() captures instance state for incremental rendering
  bench("10 rows, 1 change", () => {
    const render = createOutputPhase({})
    const { prev, next } = createPair(80, 20, 10, 1)
    render(null, prev, "inline") // first render (inits tracking)
    render(prev, next, "inline") // incremental path
  })

  bench("30 rows, 1 change", () => {
    const render = createOutputPhase({})
    const { prev, next } = createPair(120, 40, 30, 1)
    render(null, prev, "inline")
    render(prev, next, "inline")
  })

  bench("50 rows, 1 change", () => {
    const render = createOutputPhase({})
    const { prev, next } = createPair(120, 60, 50, 1)
    render(null, prev, "inline")
    render(prev, next, "inline")
  })
})

// ============================================================================
// Output byte comparison
// ============================================================================

describe("inline output: byte counts", () => {
  bench("10 rows full render bytes", () => {
    const { prev, next } = createPair(80, 20, 10, 1)
    outputPhase(null, prev, "inline")
    const output = outputPhase(prev, next, "inline") // bare = always full render
    // @ts-expect-error - vitest bench context
    globalThis.__lastFullBytes10 = output.length
  })

  bench("10 rows incremental bytes", () => {
    const render = createOutputPhase({})
    const { prev, next } = createPair(80, 20, 10, 1)
    render(null, prev, "inline") // inits tracking
    const output = render(prev, next, "inline") // incremental
    // @ts-expect-error - vitest bench context
    globalThis.__lastIncrBytes10 = output.length
  })

  bench("50 rows full render bytes", () => {
    const { prev, next } = createPair(120, 60, 50, 1)
    outputPhase(null, prev, "inline")
    const output = outputPhase(prev, next, "inline") // bare = always full render
    // @ts-expect-error - vitest bench context
    globalThis.__lastFullBytes50 = output.length
  })

  bench("50 rows incremental bytes", () => {
    const render = createOutputPhase({})
    const { prev, next } = createPair(120, 60, 50, 1)
    render(null, prev, "inline") // inits tracking
    const output = render(prev, next, "inline") // incremental
    // @ts-expect-error - vitest bench context
    globalThis.__lastIncrBytes50 = output.length
  })
})
