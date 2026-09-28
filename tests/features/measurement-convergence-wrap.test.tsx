/**
 * @failure A measured re-render flips Text.wrap but incremental rendering keeps stale pre-measurement pixels.
 * @level l2
 * @consumer @si/render/26304-strict-stale-pixels-when-shaping-prop-flips-on-measure
 * @testonly none
 *
 * A text-shaping prop flipped on a MEASUREMENT-driven re-render must still
 * invalidate the text node (@si/apportion-consolidation — the regression that
 * bead shipped as `69d8fd69e`).
 *
 * This is the Table-independent half of that diagnosis. The observed failure is
 * `content-table-width-monotonicity` diverging under SILVERY_STRICT=1 at cell
 * (5,7): `Content.Table` flips `bodyWrap` from `"wrap"` to `"hard"` once its
 * degraded allocation ladder fires, and that flip lands on the re-render caused
 * by `useBoxRectDangerously` committing a measurement. The incremental walk
 * reported the affected Text with EVERY dirty flag false and kept the
 * pre-measurement pixels; the fresh baseline painted the current props. Fresh
 * is the correct side — checked against a single-pass oracle, where a 1-wide
 * column renders `wrap="wrap"` as `agenthost—al` (separators consumed) and
 * `wrap="hard"` as `agent_host_—` (separators keeping their own row).
 *
 * Nothing in this file imports Table or `apportion()`. A fix that stabilises
 * `bodyWrap` inside Table leaves this red, which is the point of keeping the
 * repro independent.
 *
 * THE CONTROLS ARE THE ARGUMENT. A single diverging component is also
 * consistent with "measuring at all diverges" or "any prop flipped on a
 * measured re-render diverges", so both are pinned as passing tests beside the
 * failing one:
 *
 *   reads measurement, never flips        -> clean at every width
 *   reads measurement, flips `color`      -> clean at every width
 *   reads measurement, flips `wrap`       -> DIVERGES
 *
 * So it is not measurement, and not prop churn — it is specifically a prop that
 * changes how the text is SHAPED, arriving on the convergence pass.
 *
 * ON THE WIDTH DEPENDENCE, which was the oracle for the Table diagnosis:
 * divergence tracks the flip exactly. Table diverged at cols=8 alone because
 * that is the single width where its degraded ladder fires. This component's
 * condition (`measured width < text length`) holds across most widths, so it
 * diverges across most widths — and goes clean at 80, where the cell is finally
 * wider than the text, `degraded` stays false, and no flip occurs. Same rule,
 * different trigger range: **divergence ⟺ the shaping prop actually changed
 * between render 1 and render 2.**
 */

import React from "react"
import { describe, expect, it, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../../packages/ag-react/src/components/Box"
import { Text } from "../../packages/ag-react/src/components/Text"
import { useBoxRectDangerously } from "../../packages/ag-react/src/hooks/useLayout"

/** Same specimen as the table fixture: separators are what the two wrap modes disagree about. */
const CELL_TEXT = "agent host — all agents, all accounts, all together in your terminal"

/**
 * Shapes text from its OWN measured width, as `Content.Table` does.
 *
 * Frame 1: `useBoxRectDangerously` returns the zero rect, so `degraded` is
 * false and the text wraps normally — the analogue of Table's unmeasured frame,
 * where `available === null` leaves `allocation` null and `bodyWrap` at
 * `cellWrap`. Frame 2: the real rect commits, the width is below what the
 * content needs, and the component escalates to character wrapping — the
 * analogue of Table's degraded ladder setting `bodyWrap = "hard"`.
 */
function ShapingCell(): React.ReactElement {
  const rect = useBoxRectDangerously()
  const degraded = rect.width > 0 && rect.width < CELL_TEXT.length
  return (
    <Text minWidth={0} maxWidth="100%" wrap={degraded ? "hard" : "wrap"}>
      {CELL_TEXT}
    </Text>
  )
}

/** Control: takes the same measurement dependency, never changes a prop from it. */
function InertCell(): React.ReactElement {
  const rect = useBoxRectDangerously()
  void rect.width
  return (
    <Text minWidth={0} maxWidth="100%" wrap="wrap">
      {CELL_TEXT}
    </Text>
  )
}

/** Control: flips a prop on the same measurement, but one that does not reshape the text. */
function RestyledCell(): React.ReactElement {
  const rect = useBoxRectDangerously()
  const narrow = rect.width > 0 && rect.width < CELL_TEXT.length
  return (
    <Text minWidth={0} maxWidth="100%" wrap="wrap" color={narrow ? "$error" : "$muted"}>
      {CELL_TEXT}
    </Text>
  )
}

/**
 * Realistic scale: 24 rows x 2 cells = 48 text nodes plus wrappers, past the
 * 50-node floor the pipeline docs require. Every row measures itself, so the
 * convergence pass does real work rather than driving a single node.
 */
function App({ cols, Cell }: { cols: number; Cell: () => React.ReactElement }) {
  return (
    <Box width={cols} flexDirection="column">
      {Array.from({ length: 24 }, (_, i) => (
        <Box key={i} flexDirection="row" width={cols} overflow="hidden">
          <Box width={3} overflow="hidden">
            <Text wrap="truncate">{`r${i}`}</Text>
          </Box>
          <Box flexGrow={1} minWidth={0} overflow="hidden">
            <Cell />
          </Box>
        </Box>
      ))}
    </Box>
  )
}

const WIDTHS = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 30, 40, 60, 80]

/** Widths at which rendering throws a STRICT incremental-vs-fresh mismatch. */
function divergentWidths(Cell: () => React.ReactElement): string[] {
  const diverged: string[] = []
  for (const cols of WIDTHS) {
    try {
      createRenderer({ cols, rows: 24 })(<App cols={cols} Cell={Cell} />)
    } catch (error) {
      diverged.push(`cols=${cols}: ${String((error as Error).message).split("\n")[0]}`)
    }
  }
  return diverged
}

describe("measurement-convergence text invalidation", () => {
  test("control: taking a measurement dependency alone never diverges", () => {
    const diverged = divergentWidths(InertCell)
    expect(diverged, `\n${diverged.join("\n")}`).toEqual([])
  })

  test("control: flipping a non-shaping prop on the measured re-render never diverges", () => {
    const diverged = divergentWidths(RestyledCell)
    expect(diverged, `\n${diverged.join("\n")}`).toEqual([])
  })

  it.fails("26304: a text-shaping prop flipped on the measured re-render leaves stale pixels", () => {
    // Fails today at every width where the flip occurs; clean at 80, where the
    // cell is wider than the text so `degraded` never becomes true.
    const diverged = divergentWidths(ShapingCell)
    expect(diverged, `\n${diverged.join("\n")}`).toEqual([])
  })
})
