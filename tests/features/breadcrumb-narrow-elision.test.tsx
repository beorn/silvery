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
 * Assertions are on the OUTCOME — what the trail painted — never on layout
 * numbers. A field is acceptable when it is the whole label, a prefix of the
 * label plus a marker, or empty because its box was allotted no cells. This
 * component turns out to reach no empty field at all: at every swept width the
 * trail is either whole or marked. The empty-field regime is pinned, and proven
 * to be a zero-cell allocation rather than lost content, in
 * `box-wrapped-truncate-elision-sweep` where the hand-built shape does reach it.
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
function describeBadFields(line: string): string[] {
  const fields = line.split(SEPARATOR)
  if (fields.length !== LABELS.length) {
    return [`row split into ${fields.length} segments, expected ${LABELS.length}: ${JSON.stringify(fields)}`]
  }
  const bad: string[] = []
  for (const [index, label] of LABELS.entries()) {
    const field = fields[index]!
    if (field === label) continue
    // A zero-cell box paints nothing and has no cell to hold a marker; proven
    // by the substitution test below, not merely accepted here.
    if (field === "") continue
    if (field.endsWith(ELLIPSIS) && label.startsWith(field.slice(0, -1))) continue
    bad.push(`"${label}" painted as ${JSON.stringify(field)}`)
  }
  return bad
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
          items={labels.map((label) =>
            actionable ? { label, onPress: () => {} } : { label },
          )}
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
      for (let rowWidth = MIN_ROW_WIDTH; rowWidth <= MAX_ROW_WIDTH; rowWidth++) {
        for (let containerWidth = rowWidth; containerWidth <= SWEEP_MAX; containerWidth++) {
          swept++
          const app = render(trail(containerWidth, rowWidth, LABELS, actionable))
          const line = (app.lines[0] ?? "").replace(/\s+$/, "")
          const bad = describeBadFields(line)
          if (bad.length > 0) {
            broken.push(`container=${containerWidth} row=${rowWidth} [${line}] — ${bad.join(", ")}`)
          }
        }
      }
      expect(
        broken.slice(0, 20),
        `a real Breadcrumb trail (${actionable ? "actionable" : "plain"} items) was cut with no elision marker at ${broken.length} of ${swept} swept shapes:\n${broken.slice(0, 20).join("\n")}`,
      ).toEqual([])
    }
  })

  test("the marker survives a live re-layout of a real trail, not just a fresh render", () => {
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    const broken: string[] = []
    const app = render(trail(SWEEP_MAX, 12, LABELS, true))
    for (let containerWidth = SWEEP_MAX; containerWidth >= 12; containerWidth--) {
      app.rerender(trail(containerWidth, 12, LABELS, true))
      const line = (app.lines[0] ?? "").replace(/\s+$/, "")
      const bad = describeBadFields(line)
      if (bad.length > 0) broken.push(`container=${containerWidth} [${line}] — ${bad.join(", ")}`)
    }
    expect(
      broken.slice(0, 20),
      `a real Breadcrumb trail was cut with no marker while re-laying out live at ${broken.length} widths:\n${broken.slice(0, 20).join("\n")}`,
    ).toEqual([])
  })

})
