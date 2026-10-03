/**
 * The REAL Breadcrumb surface never loses a label without an elision marker.
 *
 * `box-wrapped-truncate-elision-sweep` pins the harm on a hand-built Box/Text
 * shape. This file pins it on the product component that shape was read off:
 * `Breadcrumb` renders its root as `<Box minWidth={0} flexShrink={1}
 * overflow="hidden">` with a `wrap="truncate"` Text per label and per
 * separator, so the same committed-box rounding that let a segment paint as a
 * bare prefix in the hand-built shape reaches the real navigation trail too.
 *
 * The trail is placed in a fixed-width row inside a wider container — exactly
 * how a breadcrumb trail sits in maddoc's top bar — and BOTH widths are swept,
 * because the container's width decides the fractional absolute position the
 * row's children land on.
 *
 * The painted line decides pass/fail: a field is acceptable only when it is the
 * whole label or a prefix of the label followed by a marker. An empty field is
 * never acceptable: a segment allotted zero cells paints nothing and has no cell
 * in which to hold a marker, so the reader sees a missing name.
 * `@si/text/27182-zero-cell-segment-paints-nothing` rules that a shrunken
 * segment keeps a one-cell floor, so the element it is given can always show the
 * marker. `committedWidths` still reads each label's committed allocation so a
 * failure names the cells the segment was actually granted.
 *
 * @failure  A real `Breadcrumb` trail in a constrained row paints a bare
 *           prefix with no "…", so a narrow width shows the reader a wrong
 *           navigation name.
 * @level    l2
 * @consumer maddoc's top-bar breadcrumb trail; any Silvery surface that renders
 *           `Breadcrumb` in a constrained row.
 * @testonly none
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { getLayoutSignals } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"
import { Box, Breadcrumb } from "silvery"

const ELLIPSIS = "…"
const SEPARATOR = "|"
const LABELS = ["@hh", "km", "apps", "maddoc", "src", "file-app.tsx"]
const SWEEP_MAX = 80
const MAX_ROW_WIDTH = 24
/**
 * One cell per element (each label plus each separator), the row's own minimum.
 * At and above this the row is not clipping its tail — the regime this file
 * pins. Below it the row genuinely cannot show one cell per element.
 */
const MIN_ROW_WIDTH = LABELS.length * 2 - 1

/** A field is bad when the reader is shown a cut with nothing announcing it. */
function describeBadFields(line: string, allocations: readonly number[]): string[] {
  const fields = line.split(SEPARATOR)
  if (fields.length !== LABELS.length) {
    return [
      `row split into ${fields.length} segments, expected ${LABELS.length}: ${JSON.stringify(fields)}`,
    ]
  }
  const bad: string[] = []
  for (const [index, label] of LABELS.entries()) {
    const field = fields[index]!
    const width = allocations[index]!
    if (field === label) continue
    if (field === "") {
      bad.push(`"${label}" painted nothing with ${width} cell(s) allotted`)
      continue
    }
    if (width === 0) {
      bad.push(`"${label}" was allotted zero cells yet the row painted ${JSON.stringify(field)}`)
      continue
    }
    if (field.endsWith(ELLIPSIS) && label.startsWith(field.slice(0, -1))) continue
    bad.push(`"${label}" painted as ${JSON.stringify(field)} with ${width} allotted cell(s)`)
  }
  return bad
}

/**
 * The label element for each segment, read from the tree the test built: the
 * Breadcrumb root's children alternate label element, separator, label element.
 * The component's internals carry no ref of ours, so the allocation is read
 * through the node tree rather than a handle.
 */
function labelElements(app: { getContainer(): AgNode }, actionable: boolean): AgNode[] {
  const container = app.getContainer().children[0]
  const row = container?.children[0]
  const trail = row?.children[0]
  const elements = trail?.children
  const expected = LABELS.length * 2 - 1
  if (!elements || elements.length !== expected) {
    throw new Error(
      `Breadcrumb trail shape changed (actionable=${actionable}): expected ${expected} children under the trail root, found ${elements?.length ?? "none"}`,
    )
  }
  return LABELS.map((_, index) => elements[2 * index]!)
}

/** Each label's committed allocation — the width `overflow="hidden"` clips against. */
function committedWidths(app: { getContainer(): AgNode }, actionable: boolean): number[] {
  return labelElements(app, actionable).map((node) => {
    const committed = getLayoutSignals(node).boxRectCommitted()
    if (!committed) throw new Error("a Breadcrumb label element has no committed box rect")
    return committed.width
  })
}

function trail(
  containerWidth: number,
  rowWidth: number,
  labels: readonly string[] = LABELS,
  actionable = false,
) {
  return (
    <Box width={containerWidth} height={1} flexDirection="column">
      <Box width={rowWidth} height={1} flexDirection="row" overflow="hidden">
        <Breadcrumb
          items={labels.map((label) => (actionable ? { label, onPress: () => {} } : { label }))}
          separator={SEPARATOR}
          separatorSpacing="compact"
        />
      </Box>
    </Box>
  )
}

describe("Breadcrumb — narrow-width elision", () => {
  test("no segment of a real trail is painted as a bare prefix at any swept width", () => {
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    for (const actionable of [false, true] as const) {
      const broken: string[] = []
      let swept = 0
      let markers = 0
      for (let rowWidth = MIN_ROW_WIDTH; rowWidth <= MAX_ROW_WIDTH; rowWidth++) {
        for (let containerWidth = rowWidth; containerWidth <= SWEEP_MAX; containerWidth++) {
          swept++
          const app = render(trail(containerWidth, rowWidth, LABELS, actionable))
          const line = (app.lines[0] ?? "").replace(/\s+$/, "")
          const allocations = committedWidths(app, actionable)
          const fields = line.split(SEPARATOR)
          if (fields.length === LABELS.length) {
            markers += fields.filter((field) => field.endsWith(ELLIPSIS)).length
          }
          const bad = describeBadFields(line, allocations)
          if (bad.length > 0) {
            broken.push(`container=${containerWidth} row=${rowWidth} [${line}] — ${bad.join(", ")}`)
          }
        }
      }
      expect(
        broken.slice(0, 20),
        `a real Breadcrumb trail (${actionable ? "actionable" : "plain"} items) was cut with no elision marker at ${broken.length} of ${swept} swept shapes:\n${broken.slice(0, 20).join("\n")}`,
      ).toEqual([])
      if (actionable) {
        // The floor this file pins must actually be exercised: the sweep has to
        // squeeze some segment far enough that it paints a marker.
        expect(markers, "the actionable sweep never reached a shrunken segment").toBeGreaterThan(0)
      }
    }
  })

  test("the marker survives a live re-layout of a real trail, not just a fresh render", () => {
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    const broken: string[] = []
    const app = render(trail(SWEEP_MAX, 12, LABELS, true))
    for (let containerWidth = SWEEP_MAX; containerWidth >= 12; containerWidth--) {
      app.rerender(trail(containerWidth, 12, LABELS, true))
      const line = (app.lines[0] ?? "").replace(/\s+$/, "")
      const bad = describeBadFields(line, committedWidths(app, true))
      if (bad.length > 0) broken.push(`container=${containerWidth} [${line}] — ${bad.join(", ")}`)
    }
    expect(
      broken.slice(0, 20),
      `a real Breadcrumb trail was cut with no marker while re-laying out live at ${broken.length} widths:\n${broken.slice(0, 20).join("\n")}`,
    ).toEqual([])
  })
})
