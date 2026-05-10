/**
 * Layout hook contract tests for the in-flight escape hatch + commit-boundary
 * callback observers introduced alongside the deferred-only `useBoxRect()`
 * family.
 *
 *  - `useBoxRectInFlight()` / `useScrollRectInFlight()` / `useScreenRectInFlight()`
 *    subscribe to the IN-FLIGHT rect signal — for silvery framework internals
 *    that need first-paint measurement.
 *  - `useOnBoxRectCommitted(cb)` / `useOnScrollRectCommitted(cb)` /
 *    `useOnScreenRectCommitted(cb)` subscribe to the committed signal but
 *    invoke `cb` without re-rendering the consumer.
 *
 * Bead: @km/silvery/usebox-rect-deferred-only-breaks-first-paint.
 */
import { describe, test, expect } from "vitest"
import React, { useRef } from "react"
import { createRenderer } from "@silvery/test"
import {
  Box,
  Text,
  useBoxRect,
  useBoxRectInFlight,
  useOnBoxRectCommitted,
  useScrollRect,
  useScrollRectInFlight,
  useOnScrollRectCommitted,
  useScreenRectInFlight,
  useOnScreenRectCommitted,
} from "silvery"
import type { Rect } from "@silvery/ag/types"

describe("useBoxRectInFlight / useOnBoxRectCommitted", () => {
  test("useBoxRectInFlight reports a non-zero rect on the first observed paint", () => {
    const r = createRenderer({ cols: 80, rows: 4 })

    let observedWidthsInFlight: number[] = []
    function ProbeInFlight() {
      const { width } = useBoxRectInFlight()
      observedWidthsInFlight.push(width)
      return <Text>w-inflight={width}</Text>
    }

    const app = r(
      <Box width={40} flexDirection="column">
        <ProbeInFlight />
      </Box>,
    )

    // The visible frame must show the measured width — the in-flight hook
    // gives the value during the first paint after layout, with no
    // one-frame fallback.
    expect(app.text).toContain("w-inflight=40")

    // The probe must have observed the real measured width at some point.
    expect(observedWidthsInFlight.some((w) => w === 40)).toBe(true)
  })

  test("useBoxRect (deferred form) starts at 0 and advances at the next commit", () => {
    const r = createRenderer({ cols: 80, rows: 4 })

    const observedWidthsDeferred: number[] = []
    function ProbeDeferred() {
      const { width } = useBoxRect()
      observedWidthsDeferred.push(width)
      return <Text>w-deferred={width}</Text>
    }

    const app = r(
      <Box width={40} flexDirection="column">
        <ProbeDeferred />
      </Box>,
    )

    // The deferred hook gives 0 on the very first render and the measured
    // value on the next commit. Both observations are present in history.
    expect(observedWidthsDeferred.some((w) => w === 0)).toBe(true)
    expect(observedWidthsDeferred.some((w) => w === 40)).toBe(true)

    // The final visible text reflects the measured width.
    expect(app.text).toContain("w-deferred=40")
  })

  test("useOnBoxRectCommitted fires with the committed rect and does NOT re-render", () => {
    const r = createRenderer({ cols: 60, rows: 4 })

    let observerRenderCount = 0
    let observedRects: Rect[] = []

    function Observer() {
      observerRenderCount++
      useOnBoxRectCommitted((rect) => {
        observedRects.push(rect)
      })
      return <Text>obs</Text>
    }

    // Comparison baseline: a peer using the deferred hook re-renders on the
    // commit boundary that brings the measured rect.
    let deferredRenderCount = 0
    function Deferred() {
      deferredRenderCount++
      const { width } = useBoxRect()
      return <Text>def-{width}</Text>
    }

    r(
      <Box width={30} flexDirection="column">
        <Observer />
        <Deferred />
      </Box>,
    )

    // The deferred hook's consumer re-renders at the commit boundary.
    // The observer's consumer must render strictly fewer times — that's
    // the whole point of the observer (subscribe without re-render).
    expect(observerRenderCount).toBeLessThan(deferredRenderCount)

    // The callback fired at least once with the measured (non-zero) rect.
    expect(observedRects.length).toBeGreaterThan(0)
    expect(observedRects[observedRects.length - 1].width).toBe(30)
    expect(observedRects[observedRects.length - 1].height).toBeGreaterThan(0)
  })
})

describe("useScrollRectInFlight / useOnScrollRectCommitted", () => {
  test("useScrollRectInFlight matches the node's measured screen-relative position", () => {
    const r = createRenderer({ cols: 60, rows: 6 })

    let observedY = -1
    function ProbeInFlight() {
      const { y } = useScrollRectInFlight()
      if (y > 0) observedY = y
      return <Text>y-inflight={y}</Text>
    }

    const app = r(
      <Box flexDirection="column">
        <Text>line0</Text>
        <Text>line1</Text>
        <Box>
          <ProbeInFlight />
        </Box>
      </Box>,
    )

    // ProbeInFlight is the third row (after two text lines).
    expect(observedY).toBe(2)
    expect(app.text).toMatch(/y-inflight=2/)
  })

  test("useOnScrollRectCommitted fires the callback without re-rendering", () => {
    const r = createRenderer({ cols: 60, rows: 4 })

    let observerRenderCount = 0
    let receivedRect: Rect | null = null
    function Observer() {
      observerRenderCount++
      useOnScrollRectCommitted((rect) => {
        receivedRect = rect
      })
      return <Text>scrollObs</Text>
    }

    let deferredRenderCount = 0
    function Deferred() {
      deferredRenderCount++
      const rect = useScrollRect()
      return <Text>def-y={rect.y}</Text>
    }

    r(
      <Box flexDirection="column">
        <Observer />
        <Deferred />
      </Box>,
    )

    // Observer must render strictly fewer times than the deferred peer —
    // it does not re-render when the rect advances.
    expect(observerRenderCount).toBeLessThan(deferredRenderCount)
    expect(receivedRect).not.toBeNull()
    expect(receivedRect!.x).toBe(0)
    expect(receivedRect!.y).toBe(0)
  })

  test("useOnScrollRectCommitted callback re-binding does not re-trigger past values", () => {
    const r = createRenderer({ cols: 60, rows: 4 })

    let renderCount = 0
    let observedCalls = 0

    function Observer() {
      renderCount++
      // Re-create the callback every render; the hook must hold a ref to
      // the latest callback rather than re-subscribing.
      useOnScrollRectCommitted((_rect) => {
        observedCalls++
      })
      return <Text>obs</Text>
    }

    r(
      <Box flexDirection="column">
        <Observer />
      </Box>,
    )

    // Observer rendered once for mount; commit-boundary callback fired once
    // (or possibly more if the test renderer settles in multiple batches —
    // but never zero, and never enough to suggest each render re-fires
    // historical commits).
    expect(renderCount).toBeLessThanOrEqual(2)
    expect(observedCalls).toBeGreaterThanOrEqual(1)
    expect(observedCalls).toBeLessThanOrEqual(renderCount + 1)
  })
})

describe("useScreenRectInFlight / useOnScreenRectCommitted", () => {
  test("useScreenRectInFlight matches the node's screen position on first observable paint", () => {
    const r = createRenderer({ cols: 60, rows: 6 })

    const observedXs: number[] = []
    function Probe() {
      const { x } = useScreenRectInFlight()
      observedXs.push(x)
      return <Text>x-inflight={x}</Text>
    }

    const app = r(
      <Box flexDirection="row" gap={5}>
        <Text>left</Text>
        <Box>
          <Probe />
        </Box>
      </Box>,
    )

    // Probe's NodeContext is the inner Box, which lays out to the right of
    // "left" (4 chars) plus the gap (5 cols).
    expect(observedXs.some((x) => x === 9)).toBe(true)
    expect(app.text).toMatch(/x-inflight=9/)
  })

  test("useOnScreenRectCommitted observer pattern (no re-render) for non-React consumers", () => {
    const r = createRenderer({ cols: 60, rows: 4 })

    let pushToRenderCount = 0
    const externalSink: Rect[] = []
    const sinkRef: { current: Rect[] } = { current: externalSink }

    function PushTo({ ref }: { ref: typeof sinkRef }) {
      pushToRenderCount++
      useOnScreenRectCommitted((rect) => {
        ref.current.push(rect)
      })
      return null
    }

    let peerRenderCount = 0
    function Peer() {
      peerRenderCount++
      const { y } = useScrollRect()
      return <Text>peer-y={y}</Text>
    }

    r(
      <Box flexDirection="column">
        <PushTo ref={sinkRef} />
        <Peer />
      </Box>,
    )

    // Observer must render strictly fewer times than the deferred-peer.
    expect(pushToRenderCount).toBeLessThan(peerRenderCount)
    expect(externalSink.length).toBeGreaterThan(0)
    expect(externalSink[externalSink.length - 1].x).toBe(0)
  })
})

describe("integration: in-flight + observer can coexist", () => {
  test("a single component reading useBoxRectInFlight + observer still mounts cleanly", () => {
    const r = createRenderer({ cols: 60, rows: 4 })

    const observerRects: Rect[] = []
    let inFlightWidthSeen = -1
    let renders = 0

    function Combo() {
      renders++
      const { width } = useBoxRectInFlight()
      const lastWidthRef = useRef(width)
      lastWidthRef.current = width
      if (width > 0) inFlightWidthSeen = width
      useOnBoxRectCommitted((rect) => {
        observerRects.push(rect)
      })
      return <Text>combo-w={width}</Text>
    }

    const app = r(
      <Box width={25} flexDirection="column">
        <Combo />
      </Box>,
    )

    // The in-flight hook saw the measured width.
    expect(inFlightWidthSeen).toBe(25)
    // The observer fired on the commit boundary too.
    expect(observerRects.length).toBeGreaterThan(0)
    expect(observerRects[observerRects.length - 1].width).toBe(25)
    // The component rendered a small finite number of times — the in-flight
    // form may settle through multiple convergence passes, but it does not
    // diverge.
    expect(renders).toBeGreaterThanOrEqual(1)
    expect(renders).toBeLessThanOrEqual(5)
    // Visible output reflects the final measurement.
    expect(app.text).toContain("combo-w=25")
  })
})
