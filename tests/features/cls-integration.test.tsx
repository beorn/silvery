/**
 * CLS integration — end-to-end through createRenderer + termless capture API.
 *
 * Verifies the full Phase 1-5 stack together: pipeline records rects on
 * every layout pass, the recorder accumulates shifts, the termless API
 * brackets the capture window, the STRICT slug fires on unexpected.
 *
 * Pattern: intentionally-flickering app → non-zero unexpectedShifts.
 *          stable app → zero shifts.
 *          STRICT=cls + unexpected shifts → endCLSCapture throws.
 *
 * Bead: km-silvery.cls-instrumentation-primitive (Phase 6/7).
 */

import React from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createRenderer, UnexpectedLayoutShiftError } from "@silvery/test"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import { Box, Text } from "@silvery/ag-react"

const COLS = 40
const ROWS = 8

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
})

afterEach(() => {
  if (prevStrict === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = prevStrict
  }
  resetStrictCache()
})

// Helper: a flickering layout — left column's width changes between renders,
// shifting the right column's x position. The shift is the bug class CLS
// is designed to catch (think: a code fence that resizes mid-stream).
function FlickerApp({ leftLabel }: { leftLabel: string }) {
  return (
    <Box width={COLS} height={ROWS} flexDirection="row">
      <Box flexShrink={0}>
        <Text>{leftLabel}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text>RIGHT</Text>
      </Box>
    </Box>
  )
}

// Helper: a stable layout — same content on every render. Should produce
// zero shifts.
function StableApp({ label }: { label: string }) {
  return (
    <Box width={COLS} height={ROWS}>
      <Text>{label}</Text>
    </Box>
  )
}

describe("CLS integration — capture API + pipeline hook", () => {
  test("intentionally-flickering app produces non-zero unexpectedShifts", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<FlickerApp leftLabel="x" />)

    app.beginCLSCapture()
    // Force a re-layout by changing the left column's width.
    app.rerender(<FlickerApp leftLabel="xxxxxxxxxx" />)
    const report = app.endCLSCapture()

    // At least the right Box's x position shifted from the left column's
    // size change. Default classifier labels every shift "unexpected".
    expect(report.shifts.length).toBeGreaterThan(0)
    expect(report.unexpectedShifts.length).toBeGreaterThan(0)
    expect(report.cumulativeScore).toBeGreaterThan(0)
  })

  test("stable app (no rerender) produces zero shifts", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<StableApp label="hello" />)

    app.beginCLSCapture()
    // No rerender — capture window contains only the existing layout
    // (no new propagateLayout call), so no transitions are recorded.
    const report = app.endCLSCapture()

    expect(report.shifts).toHaveLength(0)
    expect(report.unexpectedShifts).toHaveLength(0)
    expect(report.cumulativeScore).toBe(0)
  })

  test("stable app with no-op rerender produces zero shifts", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<StableApp label="hello" />)

    app.beginCLSCapture()
    // Rerender with identical props — layoutPhase early-outs on dirty
    // check (not dirty + dimensions unchanged), so propagateLayout never
    // walks the tree. No rects recorded.
    app.rerender(<StableApp label="hello" />)
    const report = app.endCLSCapture()

    expect(report.unexpectedShifts).toHaveLength(0)
  })

  test("cancelCLSCapture discards the in-flight capture without producing a report", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<FlickerApp leftLabel="x" />)

    app.beginCLSCapture()
    app.rerender(<FlickerApp leftLabel="xxxxxx" />)
    app.cancelCLSCapture()

    // Idempotent — second cancel is a no-op (no active capture).
    app.cancelCLSCapture()

    // Subsequent beginCapture works (recorder slot is cleared).
    app.beginCLSCapture()
    const report = app.endCLSCapture()
    expect(report.unexpectedShifts).toHaveLength(0)
  })

  test("endCLSCapture without beginCLSCapture throws", () => {
    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<StableApp label="x" />)
    expect(() => app.endCLSCapture()).toThrow(/no active capture/)
  })
})

describe("CLS integration — SILVERY_STRICT=cls gate", () => {
  test("endCLSCapture throws UnexpectedLayoutShiftError under SILVERY_STRICT=cls", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()

    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<FlickerApp leftLabel="x" />)

    app.beginCLSCapture()
    app.rerender(<FlickerApp leftLabel="xxxxxxxxxx" />)
    expect(() => app.endCLSCapture()).toThrow(UnexpectedLayoutShiftError)
  })

  test("endCLSCapture is no-op under SILVERY_STRICT=cls when no shifts occur", () => {
    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()

    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<StableApp label="hello" />)

    app.beginCLSCapture()
    const report = app.endCLSCapture()
    expect(report.unexpectedShifts).toHaveLength(0)
  })

  test("SILVERY_STRICT=2,!cls per-check skip disables the assertion", () => {
    process.env.SILVERY_STRICT = "2,!cls"
    resetStrictCache()

    const r = createRenderer({ cols: COLS, rows: ROWS })
    const app = r(<FlickerApp leftLabel="x" />)

    app.beginCLSCapture()
    app.rerender(<FlickerApp leftLabel="xxxxxxxxxx" />)
    // Throws would have UnexpectedLayoutShiftError; per-check skip blocks it.
    const report = app.endCLSCapture()
    expect(report.unexpectedShifts.length).toBeGreaterThan(0)
  })
})
