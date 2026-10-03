/**
 * Box-wrapped truncating Text never loses content without a marker.
 *
 * The sibling case — two truncating Texts sharing a shrinking row's edge — is
 * covered by `shrunk-row-elision-sweep`. This is the same harm one level down:
 * a truncating Text inside a Box that CLIPS it. The Box apportions its content
 * against the size it committed, but the Text's committed width used to round
 * from the Text's own float edge (`round(floatStart + size) - round(floatStart)`)
 * while the Box's rounded from the Box's float origin. When the row sits at a
 * fractional absolute position the Text can commit one cell more than the Box
 * has, and `overflow="hidden"` clips exactly that cell — for an elision, the
 * cell holding the "…".
 *
 * The shape is what a breadcrumb trail renders: a fixed-width row, narrower
 * than its container, of segments wrapped in
 * `minWidth: 1, flexShrink: 1, overflow: hidden` boxes with one-cell separators
 * between them. A fixed row inside a wider container is exactly how the row
 * lands on a fractional absolute position, so both widths are swept: which
 * segment is affected depends on the fractional part the container gives the
 * row.
 *
 * The sweeps assert on the OUTCOME — what the row painted — never on layout
 * numbers. A field is acceptable when it is the whole label, or a prefix of the
 * label followed by a marker; an empty field is never acceptable. The wrapper
 * keeps a one-cell floor so a shrunken segment always has a cell in which to
 * hold its marker (@si/text/27182-zero-cell-segment-paints-nothing): a segment
 * allotted zero cells is a silent loss, because the reader sees a missing name
 * and nothing announces it. `Breadcrumb`'s `ActionableBreadcrumbItem` carries
 * the same floor.
 *
 * The marker sweep covers the regime where the row can fit one cell per
 * element. Below that it cannot, so the row's `overflow="hidden"` ancestor
 * clips the tail; the last test requires that clipped row to keep a marker
 * visible and to never paint wider than its container.
 *
 * @failure  A `wrap="truncate"` Text inside a clipped Box paints a bare prefix
 *           with no "…" — or nothing at all — so a narrow width shows the reader
 *           a wrong or missing name.
 * @level    l2
 * @consumer maddoc's top-bar breadcrumb trail; any Silvery surface that puts
 *           truncated text inside an `overflow="hidden"` box.
 * @testonly none
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

const ELLIPSIS = "…"
const SEPARATOR = "|"
const LABELS = ["@hh", "km", "apps", "maddoc", "src", "file-app.tsx"]
const SWEEP_MAX = 80
const MAX_ROW_WIDTH = 24
/**
 * One cell per element (each label plus each separator). At and above this the
 * row fits its own minimum, so the overflow="hidden" row is not clipping the
 * tail — the marker sweep's regime. Below it the row genuinely cannot show one
 * cell per element and its ancestor clips the tail, which the last test covers.
 */
const MIN_ROW_WIDTH = LABELS.length * 2 - 1

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
    if (field.endsWith(ELLIPSIS) && label.startsWith(field.slice(0, -1))) continue
    bad.push(`"${label}" painted as ${JSON.stringify(field)}`)
  }
  return bad
}

function trail(containerWidth: number, rowWidth: number) {
  return (
    <Box width={containerWidth} height={1} flexDirection="column">
      <Box width={rowWidth} height={1} flexDirection="row" overflow="hidden">
        {LABELS.map((label, index) => (
          <React.Fragment key={label}>
            {index > 0 && <Text wrap="truncate">{SEPARATOR}</Text>}
            <Box minWidth={1} flexShrink={1} overflow="hidden" height={1}>
              <Text wrap="truncate">{label}</Text>
            </Box>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  )
}

describe("Box-wrapped truncating Text — elision sweep", () => {
  test("no segment is painted as a bare prefix at any swept row and container width", () => {
    // One renderer for the whole sweep: each render() unmounts the previous one,
    // so the sweep runs as a live re-layout rather than 1300 fresh mounts, and
    // SILVERY_STRICT compares the incremental result against a fresh one.
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    const broken: string[] = []
    const overflow: string[] = []
    let swept = 0
    for (let rowWidth = MIN_ROW_WIDTH; rowWidth <= MAX_ROW_WIDTH; rowWidth++) {
      for (let containerWidth = rowWidth; containerWidth <= SWEEP_MAX; containerWidth++) {
        swept++
        const app = render(trail(containerWidth, rowWidth))
        const line = (app.lines[0] ?? "").replace(/\s+$/, "")
        const bad = describeBadFields(line)
        if (bad.length > 0) {
          broken.push(`container=${containerWidth} row=${rowWidth} [${line}] — ${bad.join(", ")}`)
        }
        if (line.length > containerWidth) {
          overflow.push(
            `container=${containerWidth} row=${rowWidth} painted ${line.length} cells [${line}]`,
          )
        }
      }
    }
    expect(
      broken.slice(0, 20),
      `content was cut with no elision marker at ${broken.length} of ${swept} swept shapes:\n${broken.slice(0, 20).join("\n")}`,
    ).toEqual([])
    expect(
      overflow.slice(0, 20),
      `the row painted wider than its container at ${overflow.length} of ${swept} swept shapes:\n${overflow.slice(0, 20).join("\n")}`,
    ).toEqual([])
  })

  test("the marker survives a live re-layout, not just a fresh render", () => {
    // A real terminal resizes an app that is already mounted. The row keeps its
    // width here and the CONTAINER moves, which is what slides the row onto a
    // fractional absolute position; SILVERY_STRICT compares incremental against
    // fresh on each rerender underneath this assertion.
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    const broken: string[] = []
    const app = render(trail(SWEEP_MAX, 12))
    for (let containerWidth = SWEEP_MAX; containerWidth >= 12; containerWidth--) {
      app.rerender(trail(containerWidth, 12))
      const line = (app.lines[0] ?? "").replace(/\s+$/, "")
      const bad = describeBadFields(line)
      if (bad.length > 0) broken.push(`container=${containerWidth} [${line}] — ${bad.join(", ")}`)
      if (line.length > containerWidth) {
        broken.push(`container=${containerWidth} painted ${line.length} cells [${line}]`)
      }
    }
    expect(
      broken.slice(0, 20),
      `content was cut with no marker or painted wider than its container while re-laying out live at ${broken.length} widths:\n${broken.slice(0, 20).join("\n")}`,
    ).toEqual([])
  })

  test("below one cell per element the row keeps a marker and never overflows", () => {
    // The row cannot fit one cell per element here, so it genuinely cannot give
    // every segment a cell and its ancestor clips the tail. What must not happen
    // is a row that hides the cut or spills past its container: the reader has
    // to be able to tell the trail is incomplete, and the parent's layout must
    // not be pushed wider than the columns it was given.
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    const unexplained: string[] = []
    let clipped = 0
    for (let rowWidth = 1; rowWidth < MIN_ROW_WIDTH; rowWidth++) {
      for (let containerWidth = rowWidth; containerWidth <= SWEEP_MAX; containerWidth++) {
        const line = (render(trail(containerWidth, rowWidth)).lines[0] ?? "").replace(/\s+$/, "")
        if (line.length > containerWidth) {
          unexplained.push(
            `container=${containerWidth} row=${rowWidth} painted ${line.length} cells [${line}]`,
          )
        }
        if (containerWidth === rowWidth) {
          clipped++
          if (!line.includes(ELLIPSIS)) {
            unexplained.push(`container=${containerWidth} row=${rowWidth} hides the cut [${line}]`)
          }
        }
      }
    }
    expect(
      unexplained.slice(0, 20),
      `${unexplained.length} of ${clipped} clipped shapes overflowed or hid the cut:\n${unexplained.slice(0, 20).join("\n")}`,
    ).toEqual([])
    // The sweep must actually reach the clipped regime, or this proves nothing.
    expect(clipped, "the sweep never reached a clipped shape").toBeGreaterThan(0)
  })
})
