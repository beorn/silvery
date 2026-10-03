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
 * `minWidth: 0, flexShrink: 1, overflow: hidden` boxes with one-cell separators
 * between them. A fixed row inside a wider container is exactly how the row
 * lands on a fractional absolute position, so both widths are swept: which
 * segment is affected depends on the fractional part the container gives the
 * row.
 *
 * The two marker sweeps assert on the OUTCOME — what the row painted — never on
 * layout numbers. A field is acceptable when it is the whole label, a prefix of
 * the label plus a marker, or empty because its box was allotted no cells at
 * all: a zero-cell box has nowhere to paint a marker, which is a separate,
 * pre-existing regime, not the clipping defect this sweep pins
 * (@si/text/clip-drops-the-marker). Rendered output alone cannot tell "the box
 * got no cells" from "content vanished inside a box that had cells", so the
 * third test reads each box's committed allocation directly and requires an
 * empty field to be a zero-cell allocation.
 *
 * The wrapper below keeps `minWidth={0}` deliberately: the engine's explicit
 * `minWidth=0`/`overflow="hidden"` escape hatch can allot a box zero cells, and
 * this sweep still pins that the box then paints nothing rather than a clipped
 * bare prefix. What a *reader* must never get is a segment that had cells and
 * lost its marker. `@si/text/27182-zero-cell-segment-paints-nothing` covers the
 * zero-cell regime for a reader-facing trail: the `Breadcrumb` component no
 * longer opts into `minWidth={0}` on a one-cell-must-paint segment, and
 * `breadcrumb-narrow-elision` fails if a real trail paints an empty segment.
 *
 * @failure  A `wrap="truncate"` Text inside a clipped Box paints a bare prefix
 *           with no "…", so a narrow width shows the reader a wrong name.
 * @level    l2
 * @consumer maddoc's top-bar breadcrumb trail; any Silvery surface that puts
 *           truncated text inside an `overflow="hidden"` box.
 * @testonly none
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { getLayoutSignals } from "@silvery/ag/layout-signals"
import { Box, Text, type BoxHandle } from "silvery"

const ELLIPSIS = "…"
const SEPARATOR = "|"
const LABELS = ["@hh", "km", "apps", "maddoc", "src", "file-app.tsx"]
const SWEEP_MAX = 80
const MAX_ROW_WIDTH = 24
/**
 * One cell per element (each label plus each separator). At and above this the
 * row fits its own minimum, so the overflow="hidden" row is not clipping the
 * tail — the regime this sweep pins. Below it the row genuinely cannot show one
 * cell per element and the row clips whole segments, which is a different
 * regime (see `shrunk-row-elision-sweep`).
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
    // A zero-cell box paints nothing and has no cell to hold a marker.
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
  refs?: readonly React.RefObject<BoxHandle | null>[],
) {
  return (
    <Box width={containerWidth} height={1} flexDirection="column">
      <Box width={rowWidth} height={1} flexDirection="row" overflow="hidden">
        {labels.map((label, index) => (
          <React.Fragment key={label}>
            {index > 0 && <Text wrap="truncate">{SEPARATOR}</Text>}
            <Box ref={refs?.[index]} minWidth={0} flexShrink={1} overflow="hidden" height={1}>
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
      }
    }
    expect(
      broken.slice(0, 20),
      `content was cut with no elision marker at ${broken.length} of ${swept} swept shapes:\n${broken.slice(0, 20).join("\n")}`,
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
    }
    expect(
      broken.slice(0, 20),
      `content cut with no marker while re-laying out live at ${broken.length} widths:\n${broken.slice(0, 20).join("\n")}`,
    ).toEqual([])
  })

  test("every painted-empty field is a zero-cell allocation, not lost content", () => {
    // `describeBadFields` accepts an empty field because a zero-cell box has
    // nowhere to paint — but that acceptance must not hide a positive-width box
    // whose content vanished, which is the whole harm this file exists for.
    // Painted output cannot tell those apart, and neither can a same-length
    // substitute (a clip/paint bug independent of the label would blank both).
    // So read the box's COMMITTED allocation — the width the parent granted,
    // which is exactly what `overflow="hidden"` clips against — through the
    // existing ref surface, and require it to be zero.
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 3 })
    const refs = LABELS.map(() => React.createRef<BoxHandle>())
    const unexplained: string[] = []
    let empties = 0
    let shapes = 0
    for (let rowWidth = MIN_ROW_WIDTH; rowWidth <= MAX_ROW_WIDTH; rowWidth++) {
      for (let containerWidth = rowWidth; containerWidth <= SWEEP_MAX; containerWidth++) {
        const line = (render(trail(containerWidth, rowWidth, LABELS, refs)).lines[0] ?? "").replace(
          /\s+$/,
          "",
        )
        const fields = line.split(SEPARATOR)
        if (fields.length !== LABELS.length) continue
        shapes++
        for (const [index, field] of fields.entries()) {
          const node = refs[index]!.current?.getNode()
          const committed = node ? getLayoutSignals(node).boxRectCommitted() : null
          if (!committed) {
            unexplained.push(
              `container=${containerWidth} row=${rowWidth} slot ${index} has no committed allocation`,
            )
            continue
          }
          if (field === "") {
            empties++
            if (committed.width !== 0) {
              unexplained.push(
                `container=${containerWidth} row=${rowWidth} slot ${index} painted nothing but was allocated ${committed.width} cells`,
              )
            }
          } else if (committed.width === 0) {
            unexplained.push(
              `container=${containerWidth} row=${rowWidth} slot ${index} was allocated zero cells yet painted ${JSON.stringify(field)}`,
            )
          }
        }
      }
    }
    expect(
      unexplained.slice(0, 20),
      `${unexplained.length} of ${empties} empty fields (${shapes} shapes) were not zero-cell allocations:\n${unexplained.slice(0, 20).join("\n")}`,
    ).toEqual([])
    // The sweep must actually reach the empty case, or this proves nothing.
    expect(empties, "the sweep never reached an empty field").toBeGreaterThan(0)
  })
})
