/**
 * Ink 6 Benchmark Suite
 *
 * Mirrors the hightea benchmarks in run.ts with equivalent Ink workloads.
 * Must run in a SEPARATE process from run.ts since both register React reconcilers.
 *
 * Run:
 *   cd /Users/beorn/Code/pim/km && bun run vendor/hightea/benchmarks/ink-comparison/ink-bench.ts
 */

import { bench, group, run } from "mitata"
import React from "react"
import { render, Box, Text } from "ink"
import { Writable, Readable } from "stream"
import Yoga from "yoga-layout"

// ============================================================================
// Mock streams for headless rendering
// ============================================================================

function createMockStdout(cols: number, rows: number): NodeJS.WriteStream {
  const stream = new Writable({
    write(_chunk, _encoding, cb) {
      cb()
    },
  })
  Object.assign(stream, {
    columns: cols,
    rows: rows,
    isTTY: true,
    // Required by ink for resize detection
    getWindowSize: () => [cols, rows],
  })
  return stream as unknown as NodeJS.WriteStream
}

function createMockStdin(): NodeJS.ReadStream {
  const stream = new Readable({ read() {} })
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode() {
      return stream
    },
  })
  return stream as unknown as NodeJS.ReadStream
}

// Pre-create streams (reused across iterations)
const stdout80x24 = createMockStdout(80, 24)
const stdout120x40 = createMockStdout(120, 40)
const stdin = createMockStdin()

const inkOpts = {
  debug: true,
  patchConsole: false,
  exitOnCtrlC: false,
} as const

// ============================================================================
// 1. React Render: Full pipeline (reconcile → layout → output)
// ============================================================================

group("ink: React Render", () => {
  bench("1 Box+Text (80x24)", () => {
    const instance = render(React.createElement(Box, null, React.createElement(Text, null, "Hello")), {
      ...inkOpts,
      stdout: stdout80x24,
      stdin,
    })
    instance.unmount()
  })

  bench("100 Box+Text (80x24)", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      React.createElement(Box, { key: i }, React.createElement(Text, null, `Item ${i}: Some example text`)),
    )
    const instance = render(React.createElement(Box, { flexDirection: "column" }, ...items), {
      ...inkOpts,
      stdout: stdout80x24,
      stdin,
    })
    instance.unmount()
  })

  bench("1000 Box+Text (120x40)", () => {
    const items = Array.from({ length: 1000 }, (_, i) =>
      React.createElement(Box, { key: i }, React.createElement(Text, null, `Item ${i}: Some example text`)),
    )
    const instance = render(React.createElement(Box, { flexDirection: "column" }, ...items), {
      ...inkOpts,
      stdout: stdout120x40,
      stdin,
    })
    instance.unmount()
  })
})

// ============================================================================
// 2. Re-render: Measure update performance (rerender same tree)
// ============================================================================

group("ink: Re-render (update)", () => {
  // Pre-create instance, then measure rerender time
  const items100 = Array.from({ length: 100 }, (_, i) =>
    React.createElement(Box, { key: i }, React.createElement(Text, null, `Item ${i}: Some example text`)),
  )

  const instance100 = render(React.createElement(Box, { flexDirection: "column" }, ...items100), {
    ...inkOpts,
    stdout: stdout80x24,
    stdin,
  })

  let counter100 = 0
  bench("100 Box+Text rerender (80x24)", () => {
    counter100++
    const items = Array.from({ length: 100 }, (_, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, null, `Item ${i}: Some example text ${counter100}`),
      ),
    )
    instance100.rerender(React.createElement(Box, { flexDirection: "column" }, ...items))
  })

  const items1000 = Array.from({ length: 1000 }, (_, i) =>
    React.createElement(Box, { key: i }, React.createElement(Text, null, `Item ${i}: Some example text`)),
  )

  const instance1000 = render(React.createElement(Box, { flexDirection: "column" }, ...items1000), {
    ...inkOpts,
    stdout: stdout120x40,
    stdin,
  })

  let counter1000 = 0
  bench("1000 Box+Text rerender (120x40)", () => {
    counter1000++
    const items = Array.from({ length: 1000 }, (_, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, null, `Item ${i}: Some example text ${counter1000}`),
      ),
    )
    instance1000.rerender(React.createElement(Box, { flexDirection: "column" }, ...items))
  })
})

// ============================================================================
// 3. Pure Yoga Layout (no React, no rendering — just layout computation)
// ============================================================================

function createYogaTree(childCount: number, cols: number, rows: number) {
  const root = Yoga.Node.create()
  root.setWidth(cols)
  root.setHeight(rows)
  root.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN)

  for (let i = 0; i < childCount; i++) {
    const child = Yoga.Node.create()
    // Simulate text node: measure text, set height=1
    child.setHeight(1)
    root.insertChild(child, i)
  }
  return root
}

function createYogaKanban() {
  const root = Yoga.Node.create()
  root.setWidth(120)
  root.setHeight(40)
  root.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)

  for (let c = 0; c < 3; c++) {
    const col = Yoga.Node.create()
    col.setFlexGrow(1)
    col.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN)
    for (let i = 0; i < 17; i++) {
      const item = Yoga.Node.create()
      item.setHeight(1)
      col.insertChild(item, i)
    }
    root.insertChild(col, c)
  }
  return root
}

group("ink: Pure Yoga Layout", () => {
  bench("Yoga native: 100 nodes layout", () => {
    const root = createYogaTree(100, 80, 24)
    root.calculateLayout(80, 24, Yoga.DIRECTION_LTR)
    root.freeRecursive()
  })

  bench("Yoga native: 50-node kanban layout", () => {
    const root = createYogaKanban()
    root.calculateLayout(120, 40, Yoga.DIRECTION_LTR)
    root.freeRecursive()
  })
})

// ============================================================================
// 4. Memory: Heap snapshot
// ============================================================================

group("ink: Memory (heap snapshot)", () => {
  bench("100 Box+Text heap delta", () => {
    if (typeof globalThis.gc === "function") globalThis.gc()
    const before = process.memoryUsage().heapUsed
    const items = Array.from({ length: 100 }, (_, i) =>
      React.createElement(Box, { key: i }, React.createElement(Text, null, `Item ${i}: Some example text`)),
    )
    const instance = render(React.createElement(Box, { flexDirection: "column" }, ...items), {
      ...inkOpts,
      stdout: stdout80x24,
      stdin,
    })
    const after = process.memoryUsage().heapUsed
    instance.unmount()
    if (after < before) throw new Error("unexpected")
  })
})

// ============================================================================
// Run
// ============================================================================

console.log("Ink 6 Benchmark Suite")
console.log("=====================")
console.log(`Ink version: 6.6.0`)
console.log(`Layout engine: yoga-layout (native NAPI)`)
console.log(`Platform: ${process.platform} ${process.arch}`)
console.log()

await run()
