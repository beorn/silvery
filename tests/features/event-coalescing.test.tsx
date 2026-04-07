/**
 * Event coalescing — drain-then-render for rapid keypresses.
 *
 * Verifies that the create-app event loop drains ALL pending stdin events
 * before yielding to render. When many keys arrive in a burst (e.g., the
 * user jumping from fold level 1 to 10, or OS-buffered auto-repeat keys
 * like "jjjjjjjjjj"), the final state must be painted once — not N times
 * with one intermediate render per key.
 *
 * Architecture: stdin `data` handler parses the chunk into individual key
 * events and pushes them synchronously into term-provider's internal queue.
 * The async iterator pipeline (term-provider → merge → map → takeUntil →
 * pumpEvents) then moves them one at a time into createApp's `eventQueue`.
 * Each hop costs a microtask tick, so a single `await Promise.resolve()`
 * only drains a handful of events. The event loop must loop-yield until
 * the queue is stable, then process the whole batch in `processEventBatch`,
 * which runs all handlers followed by a single doRender().
 *
 * Bead: km-tui.view-coalescing
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Text, useInput } from "@silvery/ag-react"
import { run } from "@silvery/ag-term/runtime"

// Small helper — let microtasks and pending stdin data propagate through
// the async-iterator pipeline, and give the render loop time to settle.
const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

describe("event coalescing (drain-then-render)", () => {
  test("burst of stdin keys coalesces into a single processEventBatch call", async () => {
    function Counter() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") setCount((n) => n + 1)
      })
      return <Text>count={count}</Text>
    }

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(<Counter />, term)
    await settle(50)

    // Reset batch-count diagnostic after mount
    const batchCountBefore = g.__silvery_batch_count ?? 0

    // Send 10 'j' keys as a single stdin chunk — simulates OS auto-repeat.
    ;(term as unknown as { sendInput: (data: string) => void }).sendInput("jjjjjjjjjj")

    // Let the full pipeline drain and render.
    await settle(300)

    // Final state must be visible.
    expect(term.screen).toContainText("count=10")

    const batchCountAfter = g.__silvery_batch_count ?? 0
    const batchesForBurst = batchCountAfter - batchCountBefore

    // The key assertion: 10 keys should result in ≤ 2 processEventBatch calls.
    // Without the drain loop this number was 10 (each key = 1 batch).
    // We allow up to 2 to absorb a rare race where the first event arrives
    // slightly before the remaining 9 finish propagating through the
    // async-iterator chain.
    expect(batchesForBurst).toBeLessThanOrEqual(2)

    handle.unmount()
  })

  test("two sequential chunks still coalesce into few batches", async () => {
    function Counter() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") setCount((n) => n + 1)
      })
      return <Text>count={count}</Text>
    }

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(<Counter />, term)
    await settle(50)
    const batchCountBefore = g.__silvery_batch_count ?? 0

    // Two back-to-back chunks — they land in the term-provider's queue in
    // quick succession. The drain loop should absorb both.
    const si = term as unknown as { sendInput: (data: string) => void }
    si.sendInput("jjjjj")
    si.sendInput("jjjjj")

    await settle(300)

    expect(term.screen).toContainText("count=10")
    const batchesForBurst = (g.__silvery_batch_count ?? 0) - batchCountBefore
    expect(batchesForBurst).toBeLessThanOrEqual(2)

    handle.unmount()
  })

  test("larger burst (25 keys) still coalesces", async () => {
    function Counter() {
      const [count, setCount] = useState(0)
      useInput((input) => {
        if (input === "j") setCount((n) => n + 1)
      })
      return <Text>count={count}</Text>
    }

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(<Counter />, term)
    await settle(50)
    const batchCountBefore = g.__silvery_batch_count ?? 0

    ;(term as unknown as { sendInput: (data: string) => void }).sendInput("j".repeat(25))

    await settle(400)

    expect(term.screen).toContainText("count=25")
    const batchesForBurst = (g.__silvery_batch_count ?? 0) - batchCountBefore
    // Should still coalesce into ≤2 batches — if not, the drain loop is
    // giving up too early for larger bursts.
    expect(batchesForBurst).toBeLessThanOrEqual(2)

    handle.unmount()
  })
})
