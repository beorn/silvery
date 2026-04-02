/**
 * Dashboard example — pixel-perfect snapshot test via Termless.
 *
 * Renders the dashboard with STATIC data (no useInterval jitter) and
 * compares the full text output against a saved snapshot. Any change
 * to layout, borders, labels, or spacing will fail the snapshot.
 *
 * To update the snapshot after an intentional change:
 *   bun vitest run --project vendor --update vendor/silvery/tests/examples/dashboard.test.tsx
 *
 * Approved mockup: vendor/internal/silvery/design/mockups/dashboard-mockup.ansi
 */

import React from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { Dashboard } from "../../examples/layout/dashboard"

describe("dashboard snapshot", () => {
  let handle: RunHandle

  afterEach(() => {
    handle?.unmount()
  })

  test("full render at 137x40 matches snapshot", async () => {
    // 137x40 = mockup dimensions (no ExampleBanner overhead)
    using term = createTermless({ cols: 137, rows: 43 })
    handle = await run(<Dashboard static />, term)

    // Wait for layout to stabilize (useContentRect needs one cycle)
    await new Promise((r) => setTimeout(r, 400))

    const lines = term.screen!.getLines()
    const output = lines.join("\n")

    // Full text snapshot — any visual change breaks this
    expect(output).toMatchSnapshot("dashboard-137x40")
  })

  test("narrow layout at 80x40 matches snapshot", async () => {
    using term = createTermless({ cols: 80, rows: 40 })
    handle = await run(<Dashboard static />, term)
    await new Promise((r) => setTimeout(r, 400))

    const lines = term.screen!.getLines()
    const output = lines.join("\n")

    expect(output).toMatchSnapshot("dashboard-80x40")
  })

  // ==========================================================================
  // Structural invariants (fast-fail before snapshot diff)
  // ==========================================================================

  test("all four panel titles present", async () => {
    using term = createTermless({ cols: 137, rows: 43 })
    handle = await run(<Dashboard static />, term)
    await new Promise((r) => setTimeout(r, 400))

    expect(term.screen).toContainText("CPU / Compute")
    expect(term.screen).toContainText("Memory")
    expect(term.screen).toContainText("Network")
    expect(term.screen).toContainText("Processes")
  })

  test("border integrity — no overlapping top borders", async () => {
    using term = createTermless({ cols: 137, rows: 43 })
    handle = await run(<Dashboard static />, term)
    await new Promise((r) => setTimeout(r, 400))

    const lines = term.screen!.getLines()
    let lastTopRow = -10
    for (let row = 0; row < lines.length; row++) {
      const line = lines[row]!.trimStart()
      if (line.startsWith("╭")) {
        if (row - lastTopRow === 1) {
          const between = lines[row - 1]!.trimStart()
          if (!between.startsWith("╰")) {
            throw new Error(`Overlapping borders at rows ${lastTopRow} and ${row}`)
          }
        }
        lastTopRow = row
      }
    }
  })
})
