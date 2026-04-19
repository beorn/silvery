/**
 * Instrumentation test to find where time goes in memo'd re-renders.
 *
 * This is NOT a permanent test — it's a diagnostic to measure per-phase
 * timing and identify the root cause of the memo'd tree regression.
 */

import React from "react"
import { test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box as SBox, Text as SText } from "@silvery/ag-react"
import {
  silveryBenchStart,
  silveryBenchStop,
  silveryBenchOutputDetail,
} from "@silvery/ag-term/pipeline"

// Memo'd item — React skips reconciliation entirely for unchanged items
const SMemoItem = React.memo(
  ({ index, active }: { index: number; active: boolean }) =>
    React.createElement(
      SBox,
      { paddingLeft: 1, borderStyle: active ? "double" : "single" },
      React.createElement(
        SText,
        { bold: active, inverse: active },
        `Task ${index}: ${active ? "ACTIVE" : "idle"}`,
      ),
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

// Non-memo version for comparison
function silveryPlainList(count: number, activeIdx: number) {
  return React.createElement(
    SBox,
    { flexDirection: "column" },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement(
        SBox,
        { key: i, paddingLeft: 1, borderStyle: i === activeIdx ? "double" : "single" },
        React.createElement(
          SText,
          { bold: i === activeIdx, inverse: i === activeIdx },
          `Task ${i}: ${i === activeIdx ? "ACTIVE" : "idle"}`,
        ),
      ),
    ),
  )
}

test("memo'd 100-item list: per-phase timing breakdown", () => {
  // Force STRICT off at runtime to test real production perf
  const savedStrict = process.env.SILVERY_STRICT
  delete process.env.SILVERY_STRICT

  const render = createRenderer({ cols: 80, rows: 24 })

  // Initial render
  const app = render(silveryMemoList(100, 0))
  expect(app.text).toContain("Task 0: ACTIVE")

  // Now measure a single toggle rerender
  const phases = silveryBenchStart()

  const t0 = performance.now()
  app.rerender(silveryMemoList(100, 1))
  const totalMs = performance.now() - t0

  const outputDetail = silveryBenchOutputDetail()
  silveryBenchStop()

  // Restore env
  if (savedStrict !== undefined) process.env.SILVERY_STRICT = savedStrict
  else delete process.env.SILVERY_STRICT

  // With STRICT off, memo'd rerender should be fast (<10ms)
  expect(totalMs).toBeLessThan(50)
  expect(phases.output).toBeLessThan(10)
  expect(app.text).toContain("Task 1: ACTIVE")
})

test("NON-memo'd 100-item list: per-phase timing breakdown", () => {
  // Force STRICT off at runtime to test real production perf
  const savedStrict = process.env.SILVERY_STRICT
  delete process.env.SILVERY_STRICT

  const render = createRenderer({ cols: 80, rows: 24 })

  // Initial render
  const app = render(silveryPlainList(100, 0))
  expect(app.text).toContain("Task 0: ACTIVE")

  // Now measure a single toggle rerender
  const phases = silveryBenchStart()

  const t0 = performance.now()
  app.rerender(silveryPlainList(100, 1))
  const totalMs = performance.now() - t0

  const outputDetail = silveryBenchOutputDetail()
  silveryBenchStop()

  // Restore env
  if (savedStrict !== undefined) process.env.SILVERY_STRICT = savedStrict
  else delete process.env.SILVERY_STRICT

  expect(totalMs).toBeLessThan(50)
  expect(app.text).toContain("Task 1: ACTIVE")
})
