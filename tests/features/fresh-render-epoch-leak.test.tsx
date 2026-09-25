/**
 * Regression: Fresh render advances the live tree's render epoch and clears
 * dirty tracking, breaking incremental rendering.
 *
 * Bead: @km/silvery/fresh-render-epoch-leak
 *
 * When `app.freshRender()` or `ag.render({ fresh: true })` is called on a live
 * tree that has pending React commits (or dirty flags), it must NOT:
 * 1. Advance the tree's render epoch (`advanceRenderEpoch(root)`),
 * 2. Clear dirty tracking sets (`clearDirtyTracking(root)`),
 * 3. Prematurely sync layout history (`syncPrevLayout(root)`).
 *
 * If any of those leak into the live tree, subsequent incremental renders
 * consider the changed nodes clean, fast-path skip them, leave stale pixels
 * from `prevBuffer`, and fail SILVERY_STRICT verification.
 */

import React, { act, useState } from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import {
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  getRenderEpoch,
  isDirty,
  isAnyDirty,
} from "@silvery/ag/epoch"
import { createAg } from "@silvery/ag-term"

async function withStrictEnv<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.SILVERY_STRICT
  process.env.SILVERY_STRICT = value
  resetStrictCache()
  try {
    return await fn()
  } finally {
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  }
}

beforeEach(() => resetStrictCache())
afterEach(() => resetStrictCache())

const ROW_COUNT = 60

describe("fresh render epoch leak regression", () => {
  test("direct ag.render({ fresh: true }) does not advance epoch or clear dirty tracking", () => {
    let updateText!: (text: string) => void
    function SimpleApp() {
      const [msg, setMsg] = useState("initial")
      updateText = setMsg
      return (
        <Box flexDirection="column" width={80} height={ROW_COUNT}>
          {Array.from({ length: ROW_COUNT }, (_, i) => (
            <Box key={i} height={1}>
              <Text>{i === 5 ? msg : `Item ${i}`}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const render = createRenderer({ cols: 80, rows: ROW_COUNT })
    const app = render(<SimpleApp />)
    const root = app.getContainer()
    const epochBefore = getRenderEpoch(root)

    // Trigger state update — stamps dirty flags on the text node
    act(() => {
      updateText("updated")
    })

    // Find the updated text node
    const outerBox = root.children[0]!
    const row5Box = outerBox.children[5]!
    const textNode = row5Box.children[0]!
    expect(isAnyDirty(textNode)).toBe(true)
    expect(isDirty(textNode, STYLE_PROPS_BIT)).toBe(true)

    // Run ag.render({ fresh: true }) on the live tree
    const ag = createAg(root)
    ag.layout({ cols: 80, rows: ROW_COUNT })
    const freshResult = ag.render({ fresh: true })
    expect(freshResult.buffer).toBeDefined()

    // Invariants:
    // 1. Render epoch MUST NOT advance
    expect(getRenderEpoch(root)).toBe(epochBefore)
    // 2. Dirty bit MUST still be set (STYLE_PROPS_BIT survives measure phase, and raw text child retains CONTENT_BIT)
    expect(isAnyDirty(textNode)).toBe(true)
    expect(isDirty(textNode, STYLE_PROPS_BIT)).toBe(true)
    expect(isDirty(textNode.children[0]!, CONTENT_BIT)).toBe(true)

    app.unmount()
  })

  test("component retains dirty flags and renders correctly under incremental render after app.freshRender()", async () => {
    await withStrictEnv("1", async () => {
      let updateCount!: (val: number) => void
      function CounterList() {
        const [count, setCount] = useState(0)
        updateCount = setCount
        return (
          <Box flexDirection="column" width={80} height={ROW_COUNT}>
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <Box key={i} height={1}>
                <Text>{i === 10 ? `Target Row: ${count}` : `Row ${i} static content`}</Text>
              </Box>
            ))}
          </Box>
        )
      }

      const render = createRenderer({ cols: 80, rows: ROW_COUNT })
      const app = render(<CounterList />)
      expect(app.text).toContain("Target Row: 0")

      // React state update committed in act()
      act(() => {
        updateCount(1)
      })

      const root = app.getContainer()
      const outerBox = root.children[0]!
      const row10 = outerBox.children[10]!
      const textNode = row10.children[0]!
      const epochBefore = getRenderEpoch(root)
      expect(isAnyDirty(textNode)).toBe(true)
      expect(isDirty(textNode, STYLE_PROPS_BIT)).toBe(true)

      // Interleaved app.freshRender() before incremental frame / waitForLayoutStable
      const freshBuf = app.freshRender()
      expect(freshBuf).toBeDefined()

      // Dirty flags and epoch must remain intact on the live tree
      expect(getRenderEpoch(root)).toBe(epochBefore)
      expect(isAnyDirty(textNode)).toBe(true)
      expect(isDirty(textNode, STYLE_PROPS_BIT)).toBe(true)
      expect(isDirty(textNode.children[0]!, CONTENT_BIT)).toBe(true)

      // The real incremental frame via waitForLayoutStable.
      // Under SILVERY_STRICT=1, this verifies incremental === fresh.
      // If freshRender leaked epoch / cleared dirty flags, this would fail with
      // an IncrementalRenderMismatchError.
      await app.waitForLayoutStable()

      expect(app.text).toContain("Target Row: 1")
      expect(app.lines[10]).toContain("Target Row: 1")

      app.unmount()
    })
  })

  test("multiple state update cycles with interleaved freshRender calls maintain SILVERY_STRICT parity", async () => {
    await withStrictEnv("1", async () => {
      let setCursor!: (c: number) => void
      function DynamicRows() {
        const [cursor, setC] = useState(0)
        setCursor = setC
        return (
          <Box flexDirection="column" width={80} height={ROW_COUNT}>
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <Box key={i} height={1} backgroundColor={i === cursor ? "$primary" : undefined}>
                <Text color={i === cursor ? "$inverse" : "$fg"}>
                  {`row ${i} `.padEnd(70, i === cursor ? "=" : "-")}
                </Text>
              </Box>
            ))}
          </Box>
        )
      }

      const render = createRenderer({ cols: 80, rows: ROW_COUNT })
      const app = render(<DynamicRows />)

      for (let cycle = 1; cycle <= 5; cycle++) {
        act(() => {
          setCursor(cycle)
        })

        // Call freshRender right after commit, before the incremental pipeline runs
        const snapshot = app.freshRender()
        expect(snapshot).toBeDefined()

        // Incremental frame must correctly apply changes with zero STRICT mismatch
        await app.waitForLayoutStable()
        expect(app.text).toContain(`row ${cycle}`)
      }

      app.unmount()
    })
  })
})
