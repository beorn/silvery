/**
 * Termless: a real Breadcrumb trail keeps its elision marker in a real
 * terminal emulator, at narrow widths and across a live terminal resize.
 *
 * `breadcrumb-narrow-elision.test.tsx` pins this property on the render tree and
 * reads each label's committed allocation; `layout-churn-leaks-pixels` showed
 * that only real ANSI through a real emulator catches an output-phase defect.
 * This file closes that gap for the narrow-width clipping bug: it renders the
 * real `Breadcrumb` in a row that fills the terminal, resizes the terminal down
 * through the widths where the label boxes get squeezed, and asserts on the
 * cells the reader actually sees.
 *
 * A field is acceptable when it is the whole label, or a prefix of the label
 * followed by "…". An EMPTY field is deliberately not asserted here: output
 * alone cannot tell "the box was allotted zero cells" (pre-existing, split to
 * `@si/text/27182-zero-cell-segment-paints-nothing`) from "content vanished
 * inside a box that had cells" — `breadcrumb-narrow-elision.test.tsx` carries
 * that distinction by reading the committed allocation. What this file adds is
 * the reader's-eye contract: a NON-empty field that is a cut with no marker is
 * a violation, and it is visible from the cells alone.
 *
 * @failure  A real Breadcrumb trail in a narrow real terminal paints a bare
 *           prefix with no "…", so the reader reads a wrong navigation name.
 * @level    l2-termless
 * @consumer maddoc's top-bar breadcrumb trail; any Silvery surface that renders
 *           `Breadcrumb` in a constrained row.
 * @testonly none
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless, waitFor, type TermlessTerm } from "@silvery/test"
import { Box, Breadcrumb, useWindowSize } from "silvery"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"

const ELLIPSIS = "…"
const SEPARATOR = "|"
const LABELS = ["@hh", "km", "apps", "maddoc", "src", "file-app.tsx"]
const FULL_TRAIL = LABELS.join(SEPARATOR)
/** One cell per element (each label plus each separator): the row's own minimum. */
const MIN_COLS = LABELS.length * 2 - 1
const MAX_COLS = FULL_TRAIL.length + 12
/**
 * The known narrow witness: the width the original defect was observed at, and
 * the one every sweep is required to actually inspect. `barePrefixes` cannot
 * judge a row whose separators did not all paint, so a regression that drops
 * separators at the narrow widths would otherwise skip every dangerous
 * observation and still pass on the comfortable ones.
 */
const WITNESS_COLS = 12

/**
 * The trail row is exactly as wide as the terminal, so the label boxes — not
 * the emulator's window — are what clips. Resizing the terminal is therefore a
 * real re-layout of the trail, not a viewport crop.
 */
function Trail({ actionable = false }: { actionable?: boolean }) {
  const { columns } = useWindowSize()
  return (
    <Box width={columns} height={1} flexDirection="row" overflow="hidden">
      <Breadcrumb
        items={LABELS.map((label) => (actionable ? { label, onPress: () => {} } : { label }))}
        separator={SEPARATOR}
        separatorSpacing="compact"
      />
    </Box>
  )
}

/**
 * The reader-visible defect: a cut field with nothing announcing the cut.
 * Shapes whose separators do not all paint are skipped — the split is not
 * parseable and the allocation test owns that regime.
 */
function barePrefixes(line: string): string[] {
  const fields = line.split(SEPARATOR)
  if (fields.length !== LABELS.length) return []
  const bad: string[] = []
  for (const [index, label] of LABELS.entries()) {
    const field = fields[index]!
    if (field === label) continue
    if (field === "") continue
    if (field.endsWith(ELLIPSIS) && label.startsWith(field.slice(0, -1))) continue
    bad.push(`"${label}" painted as ${JSON.stringify(field)}`)
  }
  return bad
}

/**
 * Resize, let layout converge, then read the trail's row. `run()` paints the
 * production first frame; the documented way to drain the extra commit/layout
 * cycles a resize needs is `waitForLayoutStable()`.
 */
async function resizeAndRead(term: TermlessTerm, handle: RunHandle, cols: number): Promise<string> {
  const resize = term.resize
  if (!resize) {
    throw new Error(
      "termless term exposes no resize(): the trail cannot be re-laid out for this test",
    )
  }
  resize.call(term, cols, 3)
  await handle.waitForLayoutStable()
  await new Promise((r) => setTimeout(r, 150))
  await waitFor(() => {
    const line = (term.screen.getLines()[0] ?? "").trimEnd()
    return line.length > 0 && line.length <= cols
  })
  return (term.screen.getLines()[0] ?? "").trimEnd()
}

describe("Breadcrumb — narrow-width elision in a real terminal", () => {
  for (const actionable of [false, true] as const) {
    test(`no bare prefix at any swept width (${actionable ? "actionable" : "plain"})`, async () => {
      using term = createTermless({ cols: MAX_COLS, rows: 3 })
      const handle = await run(<Trail actionable={actionable} />, term)
      try {
        const broken: string[] = []
        const widths: number[] = []
        for (let cols = MAX_COLS; cols >= MIN_COLS; cols--) widths.push(cols)
        for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) widths.push(cols)
        let witnessObservations = 0
        const witnessUnparseable: string[] = []
        for (const cols of widths) {
          const line = await resizeAndRead(term, handle, cols)
          if (cols === WITNESS_COLS) {
            witnessObservations++
            if (line.split(SEPARATOR).length !== LABELS.length) witnessUnparseable.push(line)
          }
          const bad = barePrefixes(line)
          if (bad.length > 0) broken.push(`cols=${cols} [${line}] — ${bad.join(", ")}`)
        }
        expect(
          broken.slice(0, 20),
          `a real Breadcrumb trail was cut with no elision marker in ${broken.length} of ${widths.length} swept widths:\n${broken.slice(0, 20).join("\n")}`,
        ).toEqual([])
        expect(
          witnessObservations,
          `the known ${WITNESS_COLS}-column witness was never swept`,
        ).toBeGreaterThan(0)
        expect(
          witnessUnparseable,
          `the known ${WITNESS_COLS}-column witness painted a row that is not a parseable trail, so no label there was inspected for an unmarked cut: ${JSON.stringify(witnessUnparseable)}`,
        ).toEqual([])
      } finally {
        handle.unmount()
      }
    })
  }

  test("the marker survives a live resize of the terminal, not just a fresh render", async () => {
    using term = createTermless({ cols: MAX_COLS, rows: 3 })
    const handle = await run(<Trail actionable />, term)
    try {
      await handle.waitForLayoutStable()
      const broken: string[] = []
      for (let i = 0; i < 2; i++) {
        for (let cols = MAX_COLS; cols >= MIN_COLS; cols -= 2) {
          const line = await resizeAndRead(term, handle, cols)
          const bad = barePrefixes(line)
          if (bad.length > 0) broken.push(`pass=${i} cols=${cols} [${line}] — ${bad.join(", ")}`)
        }
        for (let cols = MIN_COLS; cols <= MAX_COLS; cols += 2) {
          const line = await resizeAndRead(term, handle, cols)
          const bad = barePrefixes(line)
          if (bad.length > 0) broken.push(`pass=${i} cols=${cols} [${line}] — ${bad.join(", ")}`)
        }
      }
      expect(
        broken.slice(0, 20),
        `a real Breadcrumb trail was cut with no marker while the terminal re-laid out live at ${broken.length} steps:\n${broken.slice(0, 20).join("\n")}`,
      ).toEqual([])
    } finally {
      handle.unmount()
    }
  })
})
