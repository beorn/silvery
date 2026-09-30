/**
 * @failure  A frame whose only change is a notify-synced Box prop (decorations,
 *           cursorOffset, focused, selectionIntent, anchorRef, parkOffset) keeps
 *           that prop's layout signal stale, or a frame without such a change
 *           pays for a notify pass it does not need.
 * @level    l2 (createRenderer through the ag.ts layout-on-demand gate; the
 *           notify step is counted by wrapping the real layout-phase export)
 * @consumer #26660: the notify set in dirty-tracking.ts, the shallow prop check
 *           in host-config.ts commitUpdate, and the gate's skip branch in ag.ts
 * @testonly none
 */
/**
 * The layout-on-demand gate in ag.ts skips measure and layout when Flexily is
 * clean and the root keeps its size. A notify-synced prop changes no dimension,
 * so the gate runs the notify step alone when one changed, and never otherwise.
 *
 * "Changed" means not shallow-equal: TextInput, TextArea and Terminal rebuild
 * `cursorOffset` on every render, and an identity check would run the notify
 * step on each of those re-renders. The root here is the size of the terminal,
 * so no frame changes its size and opens the gate for that reason.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

// vitest hoists both calls above the imports, so ag.ts binds the wrapped export.
const counts = vi.hoisted(() => ({ notify: 0 }))

vi.mock("../../packages/ag-term/src/pipeline/layout-phase", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../../packages/ag-term/src/pipeline/layout-phase")>()
  return {
    ...mod,
    notifyLayoutSubscribers: (...args: Parameters<typeof mod.notifyLayoutSubscribers>) => {
      counts.notify++
      return mod.notifyLayoutSubscribers(...args)
    },
  }
})

type Caret = { col: number; row: number; visible: boolean }

// 6 rows of 10 cells (130+ nodes) above an input row that declares the caret.
function Screen({ highlight, caret }: { highlight: number; caret: Caret }): React.ReactElement {
  return (
    <Box width={80} height={24} flexDirection="column">
      {Array.from({ length: 6 }).map((_, r) => (
        <Box key={r} flexDirection="row" gap={1}>
          {Array.from({ length: 10 }).map((_, c) => (
            <Box key={c} backgroundColor={r * 10 + c === highlight ? "blue" : undefined}>
              <Text>{`r${r}c${c}`}</Text>
            </Box>
          ))}
        </Box>
      ))}
      <Box cursorOffset={caret}>
        <Text>input row</Text>
      </Box>
    </Box>
  )
}

describe("the layout-on-demand gate and the notify step", () => {
  test("a frame runs the notify step only when a notify-synced prop changed", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const caret: Caret = { col: 0, row: 0, visible: true }
    const app = render(<Screen highlight={0} caret={caret} />)

    const notifyPasses = (frame: (i: number) => React.ReactElement): number => {
      counts.notify = 0
      for (let i = 1; i <= 20; i++) app.rerender(frame(i))
      return counts.notify
    }

    // Only the highlighted cell moves; the caret prop is the same object.
    expect(notifyPasses((i) => <Screen highlight={i} caret={caret} />)).toBe(0)
    // The caret prop is rebuilt with the same value on every render.
    expect(
      notifyPasses((i) => <Screen highlight={20 + i} caret={{ col: 0, row: 0, visible: true }} />),
    ).toBe(0)
    // Only the caret moves: one notify pass per frame.
    expect(
      notifyPasses((i) => <Screen highlight={40} caret={{ col: i % 8, row: 0, visible: true }} />),
    ).toBe(20)
    expect(app.getCursorState()?.x).toBe(20 % 8)
  })
})
