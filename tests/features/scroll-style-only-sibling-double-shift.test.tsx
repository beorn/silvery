/**
 * @failure A pure-scroll frame followed by a style-only sibling frame replays
 *   the Tier-1 buffer shift because prevOffset is not settled after scrollPhase
 *   is skipped in the style-only fast path.
 * @level l1
 * @consumer scrollPhase / ag.ts layout gate
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

function S({ scroll }: { scroll: number }) {
  return (
    <Box width={30} height={12} overflow="scroll" scrollOffset={scroll}>
      {Array.from({ length: 40 }, (_, i) => (
        <Box key={i} height={1} flexShrink={0}>
          <Text>{`item-${i}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

function App({ scroll, color }: { scroll: number; color: string }) {
  return (
    <Box width={60} height={20} flexDirection="row">
      <Box width={6} flexDirection="column">
        <Text color={color}>SIDE</Text>
      </Box>
      <S scroll={scroll} />
    </Box>
  )
}

describe("scroll stale prevOffset (#26832)", () => {
  test("STRICT incremental == fresh: scroll-then-sibling-style", () => {
    // Incremental path: frame1 → scroll → style-only
    const app = createRenderer({ cols: 60, rows: 20 })(<App scroll={10} color="red" />)

    // Frame 2: pure scroll (sets scrollDirty, full pipeline, scrollPhase runs,
    // scrollState = {offset:11, prevOffset:10} after this frame)
    app.rerender(<App scroll={11} color="red" />)

    // Frame 3: style-only sibling change (scroll unchanged, no scrollDirty).
    // BUG: early-return skips scrollPhase; render sees offset(11)!==prevOffset(10)
    // and replays Tier-1 shift spuriously.
    app.rerender(<App scroll={11} color="blue" />)

    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()

    // Fresh ground truth: separate renderer instance, no scroll history.
    // Renders at the final state (scroll=11, color=blue) in one pass.
    // scrollState is initialized fresh: prevOffset = offset = 11.
    // No spurious Tier-1 shift.
    const freshApp = createRenderer({ cols: 60, rows: 20 })(<App scroll={11} color="blue" />)
    const fresh = freshApp.lastBuffer()
    expect(fresh).toBeDefined()

    const mismatch = compareBuffers(incremental!, fresh!)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh!),
          key: "scroll 10→11, then style-only sibling color change",
        }),
      )
    }
  })

  test("STRICT incremental == fresh: two style-only frames after scroll", () => {
    const app = createRenderer({ cols: 60, rows: 20 })(<App scroll={10} color="red" />)

    // Frame 2: scroll 10→12
    app.rerender(<App scroll={12} color="red" />)
    // Frame 3: style-only #1
    app.rerender(<App scroll={12} color="blue" />)
    // Frame 4: style-only #2 — still has stale prevOffset on unfixed code
    app.rerender(<App scroll={12} color="green" />)

    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()

    const freshApp = createRenderer({ cols: 60, rows: 20 })(<App scroll={12} color="green" />)
    const fresh = freshApp.lastBuffer()
    expect(fresh).toBeDefined()

    const mismatch = compareBuffers(incremental!, fresh!)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh!),
          key: "scroll 10→12, then two style-only sibling color changes",
        }),
      )
    }
  })
})
