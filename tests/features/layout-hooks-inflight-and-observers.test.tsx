/**
 * Layout hook contract tests for the in-flight escape hatch + commit-boundary
 * callback observers introduced alongside the deferred-only `useBoxRectDangerously()`
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
import "./strict-first.ts"
import { describe, test, expect } from "vitest"
import React, { useRef } from "react"
import { createRenderer } from "@silvery/test"
import {
  Box,
  Text,
  useBoxRectDangerously,
  useBoxRectInFlight,
  useOnBoxRectCommitted,
  useScrollRect,
  useScrollRectInFlight,
  useOnScrollRectCommitted,
  useScreenRectInFlight,
  useOnScreenRectCommitted,
} from "silvery"
import { useBoxSize } from "../../packages/ag-react/src/hooks/useLayout"
import type { Rect } from "@silvery/ag/types"

describe("useBoxRectInFlight / useOnBoxRectCommitted", () => {
  test("useBoxRectInFlight keeps the complete converged frame's diagnostics and expires its predecessor", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const observedWidthsInFlight: number[] = []
    function ProbeInFlight() {
      const { width } = useBoxRectInFlight()
      observedWidthsInFlight.push(width)
      return <Text>w-inflight={width}</Text>
    }
    const frame = (width: number) => (
      <Box width={width} flexDirection="column">
        {Array.from({ length: 24 }, (_, i) => (
          <Box key={i} id={`measured-row-${i}`} width={width}>
            <ProbeInFlight />
          </Box>
        ))}
      </Box>
    )
    const app = r(frame(40))
    const diagnostics = globalThis as {
      __silvery_content_all?: Array<{
        _hasPrevBuffer: number
        flagLayoutChanged: number
        flagContentDirty: number
      }>
      __silvery_node_trace?: Array<Array<{ id: string }>>
    }
    try {
      // The first visible paint already contains the measured width.
      expect(app.text).toContain("w-inflight=40")
      expect(observedWidthsInFlight.some((w) => w === 40)).toBe(true)
      const previousStats = [...(diagnostics.__silvery_content_all ?? [])]
      const previousTraces = [...(diagnostics.__silvery_node_trace ?? [])]
      expect(previousStats.length).toBeGreaterThan(0)
      expect(previousTraces.flat().some((node) => node.id === "measured-row-0")).toBe(true)

      app.rerender(frame(30))
      expect(app.text).toContain("w-inflight=30")
      const stats = diagnostics.__silvery_content_all ?? []
      const traces = diagnostics.__silvery_node_trace ?? []
      // Expiry first: old entries must not supply the current-frame witnesses.
      expect.soft(stats.some((pass) => previousStats.includes(pass))).toBe(false)
      expect.soft(traces.some((pass) => previousTraces.includes(pass))).toBe(false)
      const incremental = stats.filter((pass) => pass._hasPrevBuffer === 1)
      // Preserve the layout pass, its measurement-driven content update and
      // STRICT's fresh pass; a release on every pipeline pass loses this evidence.
      expect(incremental.length).toBeGreaterThan(1)
      expect(incremental.some((pass) => pass.flagLayoutChanged > 0)).toBe(true)
      expect(incremental.some((pass) => pass.flagContentDirty > 0)).toBe(true)
      expect(stats.some((pass) => pass._hasPrevBuffer === 0)).toBe(true)
      expect(traces.flat().some((node) => node.id === "measured-row-0")).toBe(true)
    } finally {
      app.unmount()
    }
  })

  test("useBoxRectDangerously (deferred form) starts at 0 and advances at the next commit", () => {
    const r = createRenderer({ cols: 80, rows: 4 })

    const observedWidthsDeferred: number[] = []
    function ProbeDeferred() {
      const { width } = useBoxRectDangerously()
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
      const { width } = useBoxRectDangerously()
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
    const lastObservedRect = observedRects[observedRects.length - 1]
    if (!lastObservedRect) throw new Error("expected at least one observed rect")
    expect(lastObservedRect.width).toBe(30)
    expect(lastObservedRect.height).toBeGreaterThan(0)
  })

  test("useBoxSize does not re-render on y-only box movement", () => {
    const r = createRenderer({ cols: 60, rows: 8 })
    let renderCount = 0

    const WidthOnlyProbe = React.memo(function WidthOnlyProbe() {
      renderCount++
      const { width } = useBoxSize()
      return <Text>width={width}</Text>
    })

    function App({ spacerHeight }: { spacerHeight: number }): React.ReactElement {
      return (
        <Box width={40} flexDirection="column">
          <Box height={spacerHeight} flexShrink={0} />
          <Box flexDirection="column">
            <WidthOnlyProbe />
          </Box>
        </Box>
      )
    }

    const app = r(<App spacerHeight={1} />)
    expect(app.text).toContain("width=40")
    const rendersAfterMeasurement = renderCount

    app.rerender(<App spacerHeight={2} />)

    expect(app.text).toContain("width=40")
    expect(renderCount).toBe(rendersAfterMeasurement)
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
    const lastExternalRect = externalSink[externalSink.length - 1]
    if (!lastExternalRect) throw new Error("expected at least one external sink rect")
    expect(lastExternalRect.x).toBe(0)
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
    const lastObserverRect = observerRects[observerRects.length - 1]
    if (!lastObserverRect) throw new Error("expected at least one observer rect")
    expect(lastObserverRect.width).toBe(25)
    // The component rendered a small finite number of times — the in-flight
    // form may settle through multiple convergence passes, but it does not
    // diverge.
    expect(renders).toBeGreaterThanOrEqual(1)
    expect(renders).toBeLessThanOrEqual(5)
    // Visible output reflects the final measurement.
    expect(app.text).toContain("combo-w=25")
  })
})
