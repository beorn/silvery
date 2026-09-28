/**
 * @failure  A fullscreen app whose content-sized root is taller than the
 *           terminal crashes under SILVERY_STRICT on an ordinary tick: the
 *           output oracle judges rows below the terminal that the diff rightly
 *           never writes, throws STRICT_OUTPUT, and panics the app (yrd watch
 *           2026-09-28, 149 rows in a 200x40 screen, mismatch at (40,129)).
 * @level    l2 (a real render: run() through createApp and the output phase
 *           into a termless terminal, with the STRICT output oracle live)
 * @consumer yrd watch, and every fullscreen silvery app whose root is not
 *           pinned to the terminal height
 * @testonly none
 */
/**
 * A fullscreen app whose root is taller than the terminal, driven through the
 * real runtime (`run()` → createApp → output phase) under SILVERY_STRICT.
 *
 * The root is content-sized, so a long column lays out below the alternate
 * screen's last row. The output phase shows only the top `termRows` rows: the
 * first render stops there and the diff drops changes below it. The STRICT
 * output oracles must judge that same terminal.
 *
 * Live case, 2026-09-28: `yrd watch` laid out 149 rows in a 200x40 terminal.
 * Its header clock and a runner duration 129 rows down ticked in one frame,
 * and the vt100 oracle threw `STRICT_OUTPUT char mismatch at (40,129)`. It had
 * replayed an uncapped 149-row fresh frame into a 149-row terminal, while the
 * diff had rightly written only the clock.
 *
 * The fixture is realistic in scale (40 list rows of Box + two Texts, a header
 * and a footer line, 120+ nodes), and it ticks the way yrd does: one change on
 * screen and one far below the terminal in the same frame.
 */
import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const COLS = 60
const ROWS = 12
const LIST_ROWS = 40

let setTick: ((tick: number) => void) | null = null

function TallWatch(): React.ReactElement {
  const [tick, set] = useState(0)
  setTick = set
  const two = (n: number): string => String(n).padStart(2, "0")
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>WATCH</Text>
        <Text color="$muted">00:54:{two(20 + tick)}</Text>
      </Box>
      {Array.from({ length: LIST_ROWS }, (_, i) => (
        <Box key={i} flexDirection="row" gap={1}>
          <Text color="$muted">{two(i)}</Text>
          <Text>change {i}</Text>
        </Box>
      ))}
      <Text>RUNNER provisioning (provisioning 2:{two(tick)})</Text>
    </Box>
  )
}

describe("fullscreen root taller than the terminal", () => {
  test("a tick on screen and a tick below the terminal in one frame verify under STRICT", async () => {
    expect(process.env.SILVERY_STRICT, "the oracle under test must be on").toBeTruthy()
    using term = createTermless({ cols: COLS, rows: ROWS })
    const handle = await run(<TallWatch />, term)
    try {
      await handle.waitForLayoutStable()
      await expect(term.screen).toContainText("00:54:20", { timeout: 1000 })
      // The condition under test: the buffer is taller than the terminal.
      expect(handle.buffer?.height).toBe(LIST_ROWS + 2)
      expect(handle.buffer?.height).toBeGreaterThan(ROWS)

      for (let tick = 1; tick <= 3; tick++) {
        setTick?.(tick)
        await expect(term.screen).toContainText(`00:54:${20 + tick}`, { timeout: 1000 })
        await handle.waitForLayoutStable()
      }

      // Rows below the terminal never reach the screen, and the rows on it
      // are exactly the buffer's top rows.
      expect(term.screen).not.toContainText("RUNNER")
      expect(term.screen).toContainText("00:54:23")
      expect(term.screen).toContainText(`change ${ROWS - 2}`)
      expect(term.screen).not.toContainText(`change ${ROWS - 1}`)
    } finally {
      handle.unmount()
    }
  })
})
