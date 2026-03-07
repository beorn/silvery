/**
 * hightea vs Ink Head-to-Head Comparison
 *
 * Runs both benchmark suites in separate processes (each registers its own
 * React reconciler) and prints a side-by-side comparison table.
 *
 * Run:
 *   cd /Users/beorn/Code/pim/km && bun run vendor/hightea/benchmarks/ink-comparison/compare.ts
 *
 * Prerequisites:
 *   cd vendor/hightea/benchmarks/ink-comparison && bun install
 */

import { $ } from "bun"
import { dirname, join } from "path"

const benchDir = dirname(new URL(import.meta.url).pathname)
const kmRoot = join(benchDir, "../../../..")

interface BenchResult {
  name: string
  avg: string
}

function parseResults(output: string): BenchResult[] {
  const results: BenchResult[] = []
  for (const line of output.split("\n")) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "")
    const match = clean.match(/^(.+?)\s{2,}([\d',]+\s*(?:ns|µs|ms)\/iter)\s+\(/)
    if (match) {
      results.push({
        name: match[1]!.trim(),
        avg: match[2]!.trim(),
      })
    }
  }
  return results
}

function parseToUs(s: string): number {
  const clean = s
    .replace(/[',]/g, "")
    .replace(/\/iter$/, "")
    .trim()
  const match = clean.match(/([\d.]+)\s*(ns|µs|ms|s)/)
  if (!match) return 0
  const val = parseFloat(match[1]!)
  switch (match[2]) {
    case "ns":
      return val / 1000
    case "µs":
      return val
    case "ms":
      return val * 1000
    case "s":
      return val * 1000000
    default:
      return val
  }
}

function formatUs(us: number): string {
  if (us < 1) return `${(us * 1000).toFixed(0)} ns`
  if (us < 1000) return `${us.toFixed(0)} µs`
  if (us < 1000000) return `${(us / 1000).toFixed(1)} ms`
  return `${(us / 1000000).toFixed(1)} s`
}

function ratio(highteaUs: number, inkUs: number): string {
  const r = inkUs / highteaUs
  if (r > 1.05) return `hightea ${r.toFixed(1)}×`
  if (r < 0.95) return `ink ${(1 / r).toFixed(1)}×`
  return "~equal"
}

console.log("Running hightea benchmark...")
const highteaProc = await $`bun run ${join(benchDir, "run.ts")}`.cwd(kmRoot).quiet()
const highteaOutput = highteaProc.stdout.toString()

console.log("Running ink benchmark...")
const inkProc = await $`bun run ${join(benchDir, "ink-bench.ts")}`.cwd(kmRoot).quiet()
const inkOutput = inkProc.stdout.toString()

const highteaMap = new Map(parseResults(highteaOutput).map((r) => [r.name, r]))
const inkMap = new Map(parseResults(inkOutput).map((r) => [r.name, r]))

function get(map: Map<string, BenchResult>, name: string): number {
  const r = map.get(name)
  return r ? parseToUs(r.avg) : 0
}

// ════════════════════════════════════════════════════════════════════════════

console.log()
console.log("═══════════════════════════════════════════════════════════════════════════")
console.log("  hightea (Flexture) vs Ink 6 (Yoga native)  —  Head-to-Head Comparison")
console.log("═══════════════════════════════════════════════════════════════════════════")

// Section 1: Full pipeline (React → layout → output)
console.log()
console.log("Full pipeline: React reconciliation → layout → string output")
console.log("─────────────────────────────────────────────────────────────────────")

const fullPipeline = [
  {
    label: "1 Box+Text (80×24)",
    hightea: "1 Box+Text (80x24)",
    ink: "1 Box+Text (80x24)",
  },
  {
    label: "100 Box+Text (80×24)",
    hightea: "100 Box+Text (80x24)",
    ink: "100 Box+Text (80x24)",
  },
  {
    label: "1000 Box+Text (120×40)",
    hightea: "1000 Box+Text (120x40)",
    ink: "1000 Box+Text (120x40)",
  },
]

const W = { l: 28, v: 14, r: 14 }
console.log(`${"".padEnd(W.l)}  ${"hightea".padStart(W.v)}  ${"ink".padStart(W.v)}  ${"Winner".padStart(W.r)}`)

for (const cmp of fullPipeline) {
  const x = get(highteaMap, cmp.hightea)
  const k = get(inkMap, cmp.ink)
  if (!x || !k) continue
  console.log(
    `${cmp.label.padEnd(W.l)}  ${formatUs(x).padStart(W.v)}  ${formatUs(k).padStart(W.v)}  ${ratio(x, k).padStart(W.r)}`,
  )
}

// Note about fairness
console.log()
console.log("  Note: hightea uses createRenderer() (headless). Ink uses render() with")
console.log("  mock stdout + unmount per iteration. Both include React reconciliation.")

// Section 2: Layout engine (pure layout, no React)
console.log()
console.log("Layout engine only (no React, no rendering)")
console.log("─────────────────────────────────────────────────────────────────────")
console.log(
  `${"".padEnd(W.l)}  ${"Flexture".padStart(W.v)}  ${"Yoga WASM".padStart(W.v)}  ${"Yoga NAPI".padStart(W.r)}`,
)

const layoutComps = [
  {
    label: "100 nodes",
    flexture: "Flexture: 100 nodes layout",
    yogaW: "Yoga: 100 nodes layout",
    yogaN: "Yoga native: 100 nodes layout",
  },
  {
    label: "50-node kanban",
    flexture: "Flexture: 50-node kanban layout",
    yogaW: "Yoga: 50-node kanban layout",
    yogaN: "Yoga native: 50-node kanban layout",
  },
]

for (const cmp of layoutComps) {
  const f = get(highteaMap, cmp.flexture)
  const yw = get(highteaMap, cmp.yogaW)
  const yn = get(inkMap, cmp.yogaN)
  console.log(
    `${cmp.label.padEnd(W.l)}  ${formatUs(f).padStart(W.v)}  ${formatUs(yw).padStart(W.v)}  ${formatUs(yn).padStart(W.r)}`,
  )
}

console.log()
console.log("  Flexture = pure JS (7 KB). Yoga WASM = yoga-wasm-web. Yoga NAPI = yoga-layout (C++).")

// Section 3: React re-render (apples-to-apples)
console.log()
console.log("React re-render (apples-to-apples: full React reconciliation + layout + output)")
console.log("─────────────────────────────────────────────────────────────────────")
console.log(`${"".padEnd(W.l)}  ${"hightea".padStart(W.v)}  ${"ink".padStart(W.v)}  ${"Ratio".padStart(W.r)}`)

const rerenderComps = [
  {
    label: "100 Box+Text (80×24)",
    hightea: "100 Box+Text re-render (80x24)",
    ink: "100 Box+Text rerender (80x24)",
  },
  {
    label: "1000 Box+Text (120×40)",
    hightea: "1000 Box+Text re-render (120x40)",
    ink: "1000 Box+Text rerender (120x40)",
  },
]

for (const cmp of rerenderComps) {
  const x = get(highteaMap, cmp.hightea)
  const k = get(inkMap, cmp.ink)
  if (x && k) {
    console.log(
      `${cmp.label.padEnd(W.l)}  ${formatUs(x).padStart(W.v)}  ${formatUs(k).padStart(W.v)}  ${ratio(x, k).padStart(W.r)}`,
    )
  } else if (k) {
    console.log(`${cmp.label.padEnd(W.l)}  ${"—".padStart(W.v)}  ${formatUs(k).padStart(W.v)}`)
  }
}

console.log()
console.log("  Both trigger full React reconciliation of the component tree.")

// Section 4: hightea diff render (no ink equivalent)
console.log()
console.log("hightea dirty-tracking diff render (no ink equivalent)")
console.log("─────────────────────────────────────────────────────────────────────")
const diffs = [
  { label: "1 node", name: "1 node (diff)" },
  { label: "100 nodes", name: "100 nodes (diff)" },
  { label: "1000 nodes", name: "1000 nodes (diff)" },
]
for (const d of diffs) {
  const v = get(highteaMap, d.name)
  if (v) console.log(`  ${d.label.padEnd(14)} ${formatUs(v)}`)
}

// Section 5: hightea resize
console.log()
console.log("hightea resize re-layout (no ink equivalent)")
console.log("─────────────────────────────────────────────────────────────────────")
const resizes = [
  { label: "10 nodes", name: "10 nodes 80x24 -> 120x40" },
  { label: "100 nodes", name: "100 nodes 80x24 -> 120x40" },
  { label: "1000 nodes", name: "1000 nodes 80x24 -> 120x40" },
]
for (const r of resizes) {
  const v = get(highteaMap, r.name)
  if (v) console.log(`  ${r.label.padEnd(14)} ${formatUs(v)}`)
}

// Section 6: Memory
const highteaHeap = get(highteaMap, "100 Box+Text heap delta")
const inkHeap = get(inkMap, "100 Box+Text heap delta")
if (highteaHeap && inkHeap) {
  console.log()
  console.log("Memory (100 Box+Text heap delta)")
  console.log("─────────────────────────────────────────────────────────────────────")
  console.log(`  hightea: ${formatUs(highteaHeap)}    ink: ${formatUs(inkHeap)}    ${ratio(highteaHeap, inkHeap)}`)
}

console.log()
console.log("─────────────────────────────────────────────────────────────────────")
console.log("Platform: Apple M1 Max, Bun 1.3.9, macOS")
console.log("hightea: Flexture layout (pure JS). Ink 6.6.0: yoga-layout 3.2.1 (native).")
