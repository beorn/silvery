/**
 * @failure Nested <Text> spans without a userSelect override emit a duplicate
 *   setCell paint op per character cell via applySelectableSpansToLine, doubling
 *   per-cell paint ops and object allocations in the sectioned render plan.
 * @invariant A <Text> line with nested <Text> spans and no nested userSelect
 *   override emits at most 1 setCell paint op per (x, y) cell when no nested
 *   backgroundColor segment is present; a line with a nested userSelect
 *   override still applies per-span selectability accurately.
 * @level l1
 * @consumer #34381 Silvery render plan per-cell allocation budget (render-text / render-sink)
 * @testonly none
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { renderPhase } from "@silvery/ag-term/pipeline/render-phase"
import { commitSectionedPlan } from "@silvery/ag-term/pipeline/render-plan"
import { BufferSink, PlanSink, withPlanCapture } from "@silvery/ag-term/pipeline/render-sink"
import { compareBuffers, createRenderer, formatMismatch } from "@silvery/test"

const STANDARD_ROW_COUNT = 30
const CONTROL_ROW_INDEX = STANDARD_ROW_COUNT

/**
 * Realistic-scale 50+ node fixture:
 * - 1 root Box
 * - 30 standard <Text> rows, each with 3 nested <Text color="..."> spans and
 *   no backgroundColor / no userSelect override (120 Text elements)
 * - 1 control <Text> row with a nested <Text userSelect="none"> span
 */
function RealisticNestedSpanScene({
  tick = 0,
  excludeControlSpan = true,
}: {
  tick?: number
  excludeControlSpan?: boolean
}) {
  return (
    <Box flexDirection="column" width={64} height={32}>
      {Array.from({ length: STANDARD_ROW_COUNT }, (_, i) => (
        <Text key={i}>
          {"["}
          <Text color="cyan">{`r${String(i).padStart(2, "0")}`}</Text>
          {"] "}
          <Text color="yellow">{`item-${tick}`}</Text> <Text color="green">ready</Text>
        </Text>
      ))}
      <Text>
        {"lead "}
        <Text userSelect={excludeControlSpan ? "none" : "text"} color="gray">
          NOSELECT
        </Text>{" "}
        <Text color="cyan">tail</Text>
      </Text>
    </Box>
  )
}

describe("render plan setCell op budget (#34381)", () => {
  test("nested <Text> spans without userSelect override emit at most 1 setCell paint op per cell", () => {
    const cols = 64
    const rows = 32
    const render = createRenderer({ cols, rows })
    const app = render(<RealisticNestedSpanScene tick={0} />)
    const root = app.getContainer()

    const captured = withPlanCapture(cols, rows, () => renderPhase(root, null))
    const direct = captured.result
    const replayed = new TerminalBuffer(cols, rows)
    commitSectionedPlan(replayed, captured.plan)

    const mismatch = compareBuffers(direct, replayed)
    if (mismatch) {
      throw new Error(`sectioned plan replay diverged:\n${formatMismatch(mismatch)}`)
    }

    // Count setCell paint ops per (x, y) across the 30 standard rows (y = 0..29).
    const standardRowCounts = new Map<string, number>()
    let maxMultiplicity = 0
    let duplicateCellCoord: string | null = null

    for (const op of captured.plan.paintOps) {
      if (op.kind !== "setCell") continue
      if (op.y >= 0 && op.y < STANDARD_ROW_COUNT) {
        const key = `${op.x},${op.y}`
        const count = (standardRowCounts.get(key) ?? 0) + 1
        standardRowCounts.set(key, count)
        if (count > maxMultiplicity) {
          maxMultiplicity = count
          if (count > 1) {
            duplicateCellCoord = key
          }
        }
      }
    }

    const opsAtDup = duplicateCellCoord
      ? captured.plan.paintOps.filter(
          (op) => op.kind === "setCell" && `${op.x},${op.y}` === duplicateCellCoord,
        )
      : []
    expect(standardRowCounts.size).toBeGreaterThan(STANDARD_ROW_COUNT * 10)
    expect(
      maxMultiplicity,
      `expected at most 1 setCell op per cell in rows 0..${STANDARD_ROW_COUNT - 1}, saw multiplicity ${maxMultiplicity} at (${duplicateCellCoord}): ${JSON.stringify(opsAtDup)}`,
    ).toBe(1)

    // Every painted text cell in rows 0..29 must still be selectable.
    for (let y = 0; y < STANDARD_ROW_COUNT; y++) {
      for (let x = 0; x < 17; x++) {
        expect(direct.isCellSelectable(x, y), `direct (${x},${y}) selectable`).toBe(true)
        expect(replayed.isCellSelectable(x, y), `replayed (${x},${y}) selectable`).toBe(true)
      }
    }

    // Control row (y = 30): "lead NOSELECT tail"
    // "lead " is cols 0..4 (selectable = true)
    // "NOSELECT" is cols 5..12 (selectable = false via nested userSelect="none")
    // " tail" is cols 13..17 (selectable = true)
    for (const buf of [direct, replayed]) {
      for (let x = 0; x <= 4; x++) {
        expect(buf.isCellSelectable(x, CONTROL_ROW_INDEX), `col ${x} in "lead "`).toBe(true)
      }
      for (let x = 5; x <= 12; x++) {
        expect(buf.isCellSelectable(x, CONTROL_ROW_INDEX), `col ${x} in "NOSELECT"`).toBe(false)
      }
      for (let x = 13; x <= 17; x++) {
        expect(buf.isCellSelectable(x, CONTROL_ROW_INDEX), `col ${x} in " tail"`).toBe(true)
      }
    }
  })

  test("incremental rerender under SILVERY_STRICT preserves selectability across standard and control rows", () => {
    const render = createRenderer({ cols: 64, rows: 32 })
    const app = render(<RealisticNestedSpanScene tick={0} excludeControlSpan={true} />)
    const buf1 = app.lastBuffer()
    if (!buf1) throw new Error("expected initial buffer")

    expect(buf1.isCellSelectable(1, 0)).toBe(true)
    expect(buf1.isCellSelectable(5, CONTROL_ROW_INDEX)).toBe(false)
    expect(buf1.isCellSelectable(14, CONTROL_ROW_INDEX)).toBe(true)

    // Rerender with updated text and flip control row userSelect="none" -> "text"
    app.rerender(<RealisticNestedSpanScene tick={1} excludeControlSpan={false} />)
    const buf2 = app.lastBuffer()
    if (!buf2) throw new Error("expected second buffer")
    expect(buf2.isCellSelectable(5, CONTROL_ROW_INDEX)).toBe(true)

    // Flip control row back to userSelect="none"
    app.rerender(<RealisticNestedSpanScene tick={2} excludeControlSpan={true} />)
    const buf3 = app.lastBuffer()
    if (!buf3) throw new Error("expected third buffer")
    expect(buf3.isCellSelectable(5, CONTROL_ROW_INDEX)).toBe(false)
    expect(buf3.isCellSelectable(14, CONTROL_ROW_INDEX)).toBe(true)
  })

  test("BufferSink and PlanSink emitSetCell honor selectable parameter without mutating caller CellPatch", () => {
    const viaBufferSink = new TerminalBuffer(6, 1)
    const bufferSink = new BufferSink(viaBufferSink)
    const planSink = new PlanSink(6, 1)

    const cases = [
      { x: 0, cell: { char: "a" }, selectable: undefined, expected: false },
      { x: 1, cell: { char: "b" }, selectable: true, expected: true },
      { x: 2, cell: { char: "c" }, selectable: false, expected: false },
      { x: 3, cell: { char: "d", selectable: true }, selectable: undefined, expected: true },
      { x: 4, cell: { char: "e", selectable: true }, selectable: false, expected: false },
      { x: 5, cell: { char: "f", selectable: false }, selectable: true, expected: true },
    ] as const

    for (const c of cases) {
      const frozenCell = Object.freeze({ ...c.cell })
      bufferSink.emitSetCell(c.x, 0, frozenCell, c.selectable)
      planSink.emitSetCell(c.x, 0, frozenCell, c.selectable)
    }

    const viaPlanSink = new TerminalBuffer(6, 1)
    commitSectionedPlan(viaPlanSink, planSink.toPlan())

    expect(compareBuffers(viaBufferSink, viaPlanSink)).toBeNull()
    for (const c of cases) {
      expect(viaBufferSink.isCellSelectable(c.x, 0), `BufferSink col ${c.x}`).toBe(c.expected)
      expect(viaPlanSink.isCellSelectable(c.x, 0), `PlanSink col ${c.x}`).toBe(c.expected)
    }
  })
})
