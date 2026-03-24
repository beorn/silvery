/**
 * Inline incremental rendering benchmark
 *
 * Measures output phase bytes and timing for inline mode:
 * - Full render (bare outputPhase — always full render, no instance state)
 * - Incremental render (createOutputPhase — instance-scoped cursor tracking)
 *
 * Usage:
 *   bun examples/apps/inline-bench.tsx
 */

import { TerminalBuffer } from "silvery"
import { createOutputPhase, outputPhase } from "silvery/pipeline/output-phase"

const RUNS = 500

function fillBuffer(buf: TerminalBuffer, rows: number, prefix = ""): void {
  for (let y = 0; y < rows; y++) {
    const text = `${prefix}Item ${y}: Content line with some styling and longer text here`
    for (let x = 0; x < Math.min(text.length, buf.width); x++) {
      buf.setCell(x, y, { char: text[x]! })
    }
  }
}

interface BenchResult {
  name: string
  timings: number[]
  bytes: number[]
}

function benchmarkOutputPhase(
  name: string,
  width: number,
  height: number,
  contentRows: number,
  changedCells: number,
  forceFullRender: boolean,
): BenchResult {
  const timings: number[] = []
  const bytes: number[] = []

  for (let i = 0; i < RUNS; i++) {
    // Create fresh buffers each iteration
    const prev = new TerminalBuffer(width, height)
    fillBuffer(prev, contentRows)

    const next = new TerminalBuffer(width, height)
    fillBuffer(next, contentRows)

    // Apply changes
    for (let c = 0; c < changedCells; c++) {
      const row = Math.floor((c / Math.max(changedCells, 1)) * contentRows)
      const col = c % Math.min(10, width)
      next.setCell(col, row, { char: "X" })
    }

    if (forceFullRender) {
      // Bare outputPhase always uses fresh state → full render
      outputPhase(null, prev, "inline", 0, height)
      const t0 = performance.now()
      const output = outputPhase(prev, next, "inline", 0, height)
      const t1 = performance.now()
      timings.push(t1 - t0)
      bytes.push(output.length)
    } else {
      // createOutputPhase captures instance state → incremental after first render
      const render = createOutputPhase({})
      render(null, prev, "inline", 0, height) // first render (inits tracking)
      const t0 = performance.now()
      const output = render(prev, next, "inline", 0, height) // incremental
      const t1 = performance.now()
      timings.push(t1 - t0)
      bytes.push(output.length)
    }
  }

  timings.sort((a, b) => a - b)
  bytes.sort((a, b) => a - b)

  return { name, timings, bytes }
}

function printResult(r: BenchResult): void {
  const p50t = r.timings[Math.floor(r.timings.length * 0.5)]!
  const p95t = r.timings[Math.floor(r.timings.length * 0.95)]!
  const p50b = r.bytes[Math.floor(r.bytes.length * 0.5)]!
  const avgB = r.bytes.reduce((a, b) => a + b, 0) / r.bytes.length

  console.log(
    `  ${r.name.padEnd(40)} ` +
      `p50=${p50t.toFixed(3).padStart(7)}ms  ` +
      `p95=${p95t.toFixed(3).padStart(7)}ms  ` +
      `bytes=${Math.round(p50b).toString().padStart(6)} (avg ${Math.round(avgB)})`,
  )
}

function printComparison(full: BenchResult, incr: BenchResult): void {
  const fullP50b = full.bytes[Math.floor(full.bytes.length * 0.5)]!
  const incrP50b = incr.bytes[Math.floor(incr.bytes.length * 0.5)]!
  const fullP50t = full.timings[Math.floor(full.timings.length * 0.5)]!
  const incrP50t = incr.timings[Math.floor(incr.timings.length * 0.5)]!

  const byteRatio = fullP50b / Math.max(incrP50b, 1)
  const timeRatio = fullP50t / Math.max(incrP50t, 0.001)

  console.log(
    `  ${"→ savings".padEnd(40)} ` +
      `time=${timeRatio.toFixed(1)}x faster  ` +
      `bytes=${byteRatio.toFixed(0)}x fewer (${fullP50b} → ${incrP50b})`,
  )
}

async function main() {
  console.log(`\n═══ Inline Output Phase: Full vs Incremental (${RUNS} runs) ═══\n`)

  const configs = [
    { label: "10 rows, 1 change", w: 80, h: 20, rows: 10, changes: 1 },
    { label: "30 rows, 1 change", w: 120, h: 40, rows: 30, changes: 1 },
    { label: "50 rows, 1 change", w: 120, h: 60, rows: 50, changes: 1 },
    { label: "50 rows, 3 changes", w: 120, h: 60, rows: 50, changes: 3 },
    { label: "50 rows, 10 changes", w: 120, h: 60, rows: 50, changes: 10 },
  ]

  for (const cfg of configs) {
    console.log(`--- ${cfg.label} ---`)
    const full = benchmarkOutputPhase(`full render`, cfg.w, cfg.h, cfg.rows, cfg.changes, true)
    const incr = benchmarkOutputPhase(`incremental`, cfg.w, cfg.h, cfg.rows, cfg.changes, false)
    printResult(full)
    printResult(incr)
    printComparison(full, incr)
    console.log()
  }
}

main().catch(console.error)
