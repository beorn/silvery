/**
 * The REAL Breadcrumb surface in a REAL terminal emulator (#27182).
 *
 * SUPPLEMENTAL component/emulator evidence for
 * `@si/text/27182-zero-cell-segment-paints-nothing` — NOT the canonical
 * visual-close Layer 1, which requires a real `km view` fixture integration of
 * a product surface. The sibling `breadcrumb-narrow-elision.test.tsx` pins the
 * same acceptance on the buffer through `@silvery/test`; this file takes the
 * constructed trail through real ANSI bytes and the emulator's own screen
 * (`createTermless` + `run()`), which is the layer a buffer test cannot
 * certify. The full product proof stays a separate, open requirement.
 *
 * The ruled acceptance: a shrunken segment keeps a one-cell floor, so no width
 * delivers an empty segment field, and the row never paints wider than the
 * terminal it was given. Before the fix the segment wrapper carried an explicit
 * `minWidth={0}` plus `flexShrink={1}`, so flex could allot it zero cells: it
 * painted nothing and had no cell in which to hold an elision marker, and the
 * reader saw a missing navigation name with nothing announcing the loss.
 *
 * @failure  A real Breadcrumb trail in a constrained row paints a bare prefix
 *           with no "…", or nothing at all, when the terminal is narrow.
 * @level    l2
 * @consumer maddoc's top-bar breadcrumb trail; any Silvery surface that renders
 *           Breadcrumb in a constrained row.
 * @testonly none
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless, waitFor } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Breadcrumb } from "silvery"
import { run } from "../../packages/ag-term/src/runtime/run"

const ELLIPSIS = "…"
const SEPARATOR = "|"
const LABELS = ["@hh", "km", "apps", "maddoc", "src", "file-app.tsx"]
/** One cell per element (each label plus each separator): the row's own minimum. */
const MIN_ROW_WIDTH = LABELS.length * 2 - 1
const MAX_COLS = 47

function Trail({ rowWidth }: { rowWidth: number }) {
  return (
    <Box width="100%" height={1} flexDirection="column">
      <Box width={rowWidth} height={1} flexDirection="row" overflow="hidden">
        <Breadcrumb
          items={LABELS.map((label) => ({ label, onPress: () => {} }))}
          separator={SEPARATOR}
          separatorSpacing="compact"
        />
      </Box>
    </Box>
  )
}

/** A field is bad when the reader is shown a cut with nothing announcing it. */
function describeBadFields(line: string): string[] {
  const fields = line.split(SEPARATOR)
  if (fields.length !== LABELS.length) {
    return [
      `row split into ${fields.length} segments, expected ${LABELS.length}: ${JSON.stringify(fields)}`,
    ]
  }
  const bad: string[] = []
  for (const [index, label] of LABELS.entries()) {
    const field = fields[index]!
    if (field === label) continue
    if (field === "") {
      bad.push(`"${label}" painted nothing`)
      continue
    }
    if (field.endsWith(ELLIPSIS) && label.startsWith(field.slice(0, -1))) continue
    bad.push(`"${label}" painted as ${JSON.stringify(field)}`)
  }
  return bad
}

function firstLine(term: { screen: { getText(): string } | undefined }): string {
  return (term.screen?.getText().split("\n")[0] ?? "").replace(/\s+$/, "")
}

/** Render the trail in a fresh emulator of exactly `cols` and read row 0. */
async function paintedLineAt(cols: number, rowWidth: number): Promise<string> {
  using term = createTermless({ cols, rows: 3 })
  const handle = await run(<Trail rowWidth={rowWidth} />, term)
  try {
    await handle.waitForLayoutStable()
    return firstLine(term)
  } finally {
    handle.unmount()
  }
}

describe("Breadcrumb narrow elision in a real terminal (#27182)", () => {
  test("no segment paints nothing across the width ladder", async () => {
    const problems: string[] = []
    let swept = 0
    let clipped = 0
    for (const rowWidth of [MIN_ROW_WIDTH, 12, 14, 16, 20, 24]) {
      const colsSet = new Set([rowWidth, rowWidth + 1, rowWidth + 3, rowWidth + 7, 30, MAX_COLS])
      for (const cols of [...colsSet].filter((c) => c >= rowWidth).sort((a, b) => a - b)) {
        swept++
        const line = await paintedLineAt(cols, rowWidth)
        const bad = describeBadFields(line)
        if (bad.length > 0) {
          problems.push(`cols=${cols} row=${rowWidth} [${line}] — ${bad.join(", ")}`)
        }
        if (line.length > cols) {
          problems.push(`cols=${cols} row=${rowWidth} painted ${line.length} cells [${line}]`)
        }
        if (line.includes(ELLIPSIS)) clipped++
      }
    }
    expect(
      problems.slice(0, 20),
      `a real Breadcrumb trail in a real terminal was cut with no elision marker, or painted nothing, at ${problems.length} of ${swept} shapes:\n${problems.slice(0, 20).join("\n")}`,
    ).toEqual([])
    // The sweep must actually reach a shrunken segment, or it proves nothing.
    expect(clipped, "the sweep never reached a shrunken segment").toBeGreaterThan(0)
  })
})
