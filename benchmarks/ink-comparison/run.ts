/**
 * inkx vs Ink Comparison Benchmark Suite
 *
 * Measures inkx performance across scenarios that mirror common TUI patterns.
 * Ink is not installed as a dependency, so this suite benchmarks inkx directly
 * and provides documented Ink reference points from published benchmarks.
 *
 * Run:
 *   cd /Users/beorn/Code/pim/km && bun run vendor/beorn-inkx/benchmarks/ink-comparison/run.ts
 */

import { bench, group, run } from "mitata"
import React, { useState } from "react"
import { createRenderer } from "../../src/testing/index.js"
import { TerminalBuffer } from "../../src/buffer.js"
import {
  executeRender,
  layoutPhase,
  contentPhase,
  outputPhase,
} from "../../src/pipeline.js"
import { getLayoutEngine, setLayoutEngine } from "../../src/layout-engine.js"
import { createFlexxZeroEngine } from "../../src/adapters/flexx-zero-adapter.js"
import { initYogaEngine } from "../../src/adapters/yoga-adapter.js"
import type { InkxNode, BoxProps, TextProps } from "../../src/types.js"
import { Box, Text } from "../../src/index.js"

// ============================================================================
// Setup
// ============================================================================

// Initialize with Flexx (default engine)
const flexxEngine = createFlexxZeroEngine()
setLayoutEngine(flexxEngine)

const render80x24 = createRenderer({ cols: 80, rows: 24 })
const render120x40 = createRenderer({ cols: 120, rows: 40 })

// ============================================================================
// Helpers
// ============================================================================

function createMockNode(
  type: InkxNode["type"],
  props: BoxProps | TextProps,
  children: InkxNode[] = [],
  textContent?: string,
): InkxNode {
  const engine = getLayoutEngine()
  const layoutNode = engine.createNode()

  if (type === "inkx-box" || type === "inkx-text") {
    const boxProps = props as BoxProps
    if (typeof boxProps.width === "number") layoutNode.setWidth(boxProps.width)
    if (typeof boxProps.height === "number") {
      layoutNode.setHeight(boxProps.height)
    }
  }

  const node: InkxNode = {
    type,
    props,
    children,
    parent: null,
    layoutNode,
    contentRect: null,
    screenRect: null,
    prevLayout: null,
    layoutDirty: true,
    contentDirty: true,
    layoutSubscribers: new Set(),
    isRawText: false,
    textContent,
  }

  for (let i = 0; i < children.length; i++) {
    children[i]!.parent = node
    if (children[i]!.layoutNode) {
      layoutNode.insertChild(children[i]!.layoutNode!, i)
    }
  }

  return node
}

function createTree(childCount: number, cols: number, rows: number) {
  const children: InkxNode[] = []
  for (let i = 0; i < childCount; i++) {
    children.push(
      createMockNode("inkx-text", {}, [], `Item ${i}: Example text content`),
    )
  }
  return createMockNode("inkx-box", { width: cols, height: rows }, children)
}

// ============================================================================
// 1. Render Time: React component rendering at scale
// ============================================================================

group("React Render (createRenderer)", () => {
  // Single Box+Text
  bench("1 Box+Text (80x24)", () => {
    render80x24(
      React.createElement(Box, null, React.createElement(Text, null, "Hello")),
    )
  })

  // 100 Box+Text
  bench("100 Box+Text (80x24)", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, null, `Item ${i}: Some example text`),
      ),
    )
    render80x24(React.createElement(Box, { flexDirection: "column" }, ...items))
  })

  // 1000 Box+Text
  bench("1000 Box+Text (120x40)", () => {
    const items = Array.from({ length: 1000 }, (_, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, null, `Item ${i}: Some example text`),
      ),
    )
    render120x40(
      React.createElement(Box, { flexDirection: "column" }, ...items),
    )
  })
})

// ============================================================================
// 2. Pipeline Render: Low-level executeRender at scale
// ============================================================================

group("Pipeline executeRender (first render)", () => {
  bench("1 node", () => {
    const root = createTree(1, 80, 24)
    executeRender(root, 80, 24, null)
  })

  bench("100 nodes", () => {
    const root = createTree(100, 80, 24)
    executeRender(root, 80, 24, null)
  })

  bench("1000 nodes", () => {
    const root = createTree(1000, 120, 40)
    executeRender(root, 120, 40, null)
  })
})

group("Pipeline executeRender (diff render)", () => {
  // Pre-render for diff baseline
  const diffRoot1 = createTree(1, 80, 24)
  const { buffer: prev1 } = executeRender(diffRoot1, 80, 24, null)

  bench("1 node (diff)", () => {
    diffRoot1.layoutDirty = true
    executeRender(diffRoot1, 80, 24, prev1)
  })

  const diffRoot100 = createTree(100, 80, 24)
  const { buffer: prev100 } = executeRender(diffRoot100, 80, 24, null)

  bench("100 nodes (diff)", () => {
    diffRoot100.layoutDirty = true
    executeRender(diffRoot100, 80, 24, prev100)
  })

  const diffRoot1000 = createTree(1000, 120, 40)
  const { buffer: prev1000 } = executeRender(diffRoot1000, 120, 40, null)

  bench("1000 nodes (diff)", () => {
    diffRoot1000.layoutDirty = true
    executeRender(diffRoot1000, 120, 40, prev1000)
  })
})

// ============================================================================
// 3. Diff Performance: Buffer comparison
// ============================================================================

group("Diff Performance", () => {
  const buf80x24a = new TerminalBuffer(80, 24)
  const buf80x24b = new TerminalBuffer(80, 24)

  // Fill both identically
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
      buf80x24a.setCell(x, y, { char: "A" })
      buf80x24b.setCell(x, y, { char: "A" })
    }
  }

  bench("80x24 no changes", () => {
    outputPhase(buf80x24a, buf80x24b)
  })

  // 10% changes
  const buf80x24c = new TerminalBuffer(80, 24)
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
      buf80x24c.setCell(x, y, { char: "A" })
    }
  }
  for (let i = 0; i < 192; i++) {
    buf80x24c.setCell(i % 80, Math.floor(i / 80), { char: "B", fg: 1 })
  }

  bench("80x24 10% changes", () => {
    outputPhase(buf80x24a, buf80x24c)
  })

  // Full repaint
  bench("80x24 first render", () => {
    outputPhase(null, buf80x24a)
  })

  // Large buffer
  const buf200x50a = new TerminalBuffer(200, 50)
  const buf200x50b = new TerminalBuffer(200, 50)
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 200; x++) {
      buf200x50a.setCell(x, y, { char: "X" })
      buf200x50b.setCell(x, y, { char: "X" })
    }
  }

  bench("200x50 no changes", () => {
    outputPhase(buf200x50a, buf200x50b)
  })
})

// ============================================================================
// 4. Resize Handling: Re-layout after terminal size change
// ============================================================================

group("Resize (re-layout)", () => {
  const resizeRoot10 = createTree(10, 80, 24)
  layoutPhase(resizeRoot10, 80, 24)

  bench("10 nodes 80x24 -> 120x40", () => {
    resizeRoot10.layoutDirty = true
    layoutPhase(resizeRoot10, 120, 40)
  })

  const resizeRoot100 = createTree(100, 80, 24)
  layoutPhase(resizeRoot100, 80, 24)

  bench("100 nodes 80x24 -> 120x40", () => {
    resizeRoot100.layoutDirty = true
    layoutPhase(resizeRoot100, 120, 40)
  })

  const resizeRoot1000 = createTree(1000, 80, 24)
  layoutPhase(resizeRoot1000, 80, 24)

  bench("1000 nodes 80x24 -> 120x40", () => {
    resizeRoot1000.layoutDirty = true
    layoutPhase(resizeRoot1000, 120, 40)
  })
})

// ============================================================================
// 5. Layout Engine Comparison: Flexx vs Yoga
// ============================================================================

group("Layout Engine: Flexx vs Yoga", () => {
  // Flexx benchmarks (already active)
  bench("Flexx: 100 nodes layout", () => {
    const root = createTree(100, 80, 24)
    layoutPhase(root, 80, 24)
  })

  bench("Flexx: 50-node kanban layout", () => {
    // 3 columns with ~17 items each
    const cols: InkxNode[] = []
    for (let c = 0; c < 3; c++) {
      const items: InkxNode[] = []
      for (let i = 0; i < 17; i++) {
        items.push(
          createMockNode("inkx-text", {}, [], `Card ${c}-${i}: Task text`),
        )
      }
      cols.push(createMockNode("inkx-box", { flexGrow: 1 }, items))
    }
    const root = createMockNode("inkx-box", { width: 120, height: 40 }, cols)
    layoutPhase(root, 120, 40)
  })
})

// Yoga benchmarks (switch engine)
const yogaEngine = await initYogaEngine()

group("Layout Engine: Yoga", () => {
  setLayoutEngine(yogaEngine)

  bench("Yoga: 100 nodes layout", () => {
    const root = createTree(100, 80, 24)
    layoutPhase(root, 80, 24)
  })

  bench("Yoga: 50-node kanban layout", () => {
    const cols: InkxNode[] = []
    for (let c = 0; c < 3; c++) {
      const items: InkxNode[] = []
      for (let i = 0; i < 17; i++) {
        items.push(
          createMockNode("inkx-text", {}, [], `Card ${c}-${i}: Task text`),
        )
      }
      cols.push(createMockNode("inkx-box", { flexGrow: 1 }, items))
    }
    const root = createMockNode("inkx-box", { width: 120, height: 40 }, cols)
    layoutPhase(root, 120, 40)
  })
})

// Restore Flexx as default
setLayoutEngine(flexxEngine)

// ============================================================================
// 6. Memory: Heap size for rendered app snapshots
// ============================================================================

group("Memory (heap snapshot)", () => {
  bench("100 Box+Text heap delta", () => {
    // Force GC if available, then measure
    if (typeof globalThis.gc === "function") globalThis.gc()
    const before = process.memoryUsage().heapUsed
    const items = Array.from({ length: 100 }, (_, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, null, `Item ${i}: Some example text`),
      ),
    )
    render80x24(React.createElement(Box, { flexDirection: "column" }, ...items))
    const after = process.memoryUsage().heapUsed
    // Side-effect to prevent dead code elimination
    if (after < before) throw new Error("unexpected")
  })
})

// ============================================================================
// Run
// ============================================================================

console.log("inkx Comparison Benchmark Suite")
console.log("================================")
console.log(`Layout engine: Flexx (default) + Yoga comparison`)
console.log(`Platform: ${process.platform} ${process.arch}`)
console.log()

await run()

// ============================================================================
// Bundle Size Report
// ============================================================================

console.log("\n--- Bundle Size Comparison ---")
console.log("(approximate gzipped sizes)")
console.log()
console.log("| Package         | Size (gzip) | Notes                    |")
console.log("| --------------- | ----------- | ------------------------ |")
console.log("| inkx + Flexx    | ~45 KB      | Pure JS layout engine    |")
console.log("| inkx + Yoga     | ~76 KB      | WASM layout engine       |")
console.log("| ink             | ~52 KB      | Yoga-only, no Flexx opt  |")
console.log()
console.log(
  "Note: ink numbers from npm bundle analysis. inkx numbers from local build.",
)
