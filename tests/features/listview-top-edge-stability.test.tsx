/**
 * Regression: ListView scroll-to-top must be stable.
 *
 * Reported symptom (silvercode, follow="end" chat list):
 *   "scroll up — when I reach the top, it oscillates between scrollRow
 *    0 and 1 every 0.3-0.5s for a few cycles before settling."
 *
 * The cadence (300-500ms) is too slow for kinetic momentum (180ms τ,
 * stops at one decay) and too fast for the 800ms scrollbar fade. The
 * suspect surface is the auto-follow / at-end effect that runs on every
 * commit — a measure-driven re-render at the top edge could leave
 * `prevMaxScrollRowRef` and `scrollRow` ping-ponging.
 *
 * This test pins the contract: under follow="end", scrolling to row 0
 * should hold there without the scrollRow value bouncing in between
 * commits. We capture scrollRow over a short observation window and
 * assert it stays at 0 once it lands there.
 *
 * Bead: km-silvery.scroll-top-edge-oscillation.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text } from "../../src/index.js"

const settle = (ms = 50): Promise<void> => new Promise((r) => setTimeout(r, ms))
const makeItems = (n: number): string[] => Array.from({ length: n }, (_, i) => `Item ${i + 1}`)
const firstVisibleItemNumber = (text: string): number => {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? ""
  const match = /Item (\d+)/.exec(firstLine)
  return match ? Number(match[1]) : -1
}

describe("ListView: scroll-to-top edge stability", () => {
  test("after wheeling up to the top under follow=end, scrollRow does not oscillate", async () => {
    const render = createRenderer({ cols: 30, rows: 8 })
    const items = makeItems(40)
    const app = render(
      <Box flexDirection="column" height={8} width={30}>
        <ListView
          items={items}
          height={8}
          follow="end"
          renderItem={(label) => <Text>{label}</Text>}
        />
      </Box>,
    )
    await settle()

    // Wheel up enough to reach the top. 36 events × 1 row ≥ 32-row content
    // overflow, so we're solidly clamped at scrollRow=0.
    for (let i = 0; i < 36; i++) {
      await app.wheel(5, 3, -1)
    }
    await settle(120)

    // Capture the visible top item across several render samples spaced
    // ~80ms apart. If scrollRow oscillates between 0 and 1, the visible
    // top will alternate between "Item 1" (offset 0) and "Item 2" (offset
    // 1). Stability means the same item stays at the top across all
    // samples.
    const samples: string[] = []
    for (let i = 0; i < 6; i++) {
      // First non-empty line of the rendered viewport.
      const firstLine = app.text.split("\n").find((line) => line.trim().length > 0) ?? ""
      samples.push(firstLine.trim())
      await settle(80)
    }

    // All samples should show the same top item — Item 1 (the first
    // entry, since we wheeled to the top).
    const distinctSamples = new Set(samples)
    expect(
      distinctSamples.size,
      `top-row content oscillated across observation window. Samples: ${JSON.stringify(samples)}`,
    ).toBe(1)
    expect(samples[0]).toContain("Item 1")
  })

  test("idle-spaced alternating wheel tail does not bounce the viewport back and forth", async () => {
    const render = createRenderer({ cols: 30, rows: 12 })
    const items = makeItems(220)
    const app = render(
      <Box flexDirection="column" height={12} width={30}>
        <ListView
          items={items}
          height={12}
          follow="end"
          renderItem={(label) => <Text>{label}</Text>}
        />
      </Box>,
    )
    await settle()

    // Build a sustained upward gesture from the tail, then feed the
    // problematic shape from /tmp/sc-scroll.log: one-row alternating events
    // spaced far enough apart that the velocity buffer has emptied. Healthy
    // filtering may keep moving upward or pause, but it must not render
    // +1/-1/+1/-1 bounce by letting a lone bounce seed a new gesture.
    for (let i = 0; i < 10; i++) {
      await app.wheel(5, 6, -1)
    }
    const samples: number[] = [firstVisibleItemNumber(app.text)]
    for (const delta of [1, -1, 1, -1]) {
      await settle(220)
      await app.wheel(5, 6, delta)
      samples.push(firstVisibleItemNumber(app.text))
    }

    for (let i = 1; i < samples.length; i++) {
      expect(
        samples[i],
        `viewport bounced downward during alternating wheel tail. Samples: ${JSON.stringify(samples)}`,
      ).toBeLessThanOrEqual(samples[i - 1]!)
    }
  })
})
