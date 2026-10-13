/**
 * ClsMonitor capture API — unit tests for Phase 8 of CLS consolidation.
 *
 * These exercise the `beginCapture` / `endCapture` / `cancelCapture`
 * methods directly via `createClsMonitor()`. The methods are the Option C
 * consolidation surface; the old boxRect-based test-capture primitive
 * (cls-recorder + cls-active + layout-phase hook) was deleted in Phase 9.
 *
 * Integration tests through createRenderer → App.beginCLSCapture live in
 * cls-integration.test.tsx and cls-screenrect-domain.test.tsx. These unit
 * tests cover the state machine + onCommit capture path in isolation.
 *
 * Bead: @km/silvery/cls-instrumentation-primitive (REOPENED 2026-05-13)
 */

import { afterEach, describe, expect, test } from "vitest"
import { createClsMonitor } from "@silvery/ag-term/runtime/cls-monitor"
import { UnexpectedLayoutShiftError } from "@silvery/ag-term/strict-cls"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { AgNode, Rect } from "@silvery/ag/types"
import { fakeNode } from "../../packages/ag/tests/support/fake-node"
import {
  addWriter,
  getDebugFilter,
  getLogLevel,
  setDebugFilter,
  setLogLevel,
  setSuppressConsole,
  type Event,
  type LogEvent,
  type LogLevel,
} from "loggily"

// AgNode fixture for the cls-monitor walk — built from the owner's fakeNode
// (@silvery/ag) with only the props/rect shape these unit tests read.
function buildNode(opts: {
  type?: AgNode["type"]
  id?: string
  props?: Record<string, unknown>
  prevRect?: Rect | null
  rect?: Rect | null
  children?: AgNode[]
}): AgNode {
  const children = opts.children ?? []
  const node = fakeNode(opts.props ?? (opts.id ? { id: opts.id } : {}), null, children, {
    type: opts.type ?? "silvery-box",
    screenRect: opts.rect ?? null,
    prevScreenRect: opts.prevRect ?? null,
  })
  // The owner fake deliberately leaves parent links null; cls-monitor's
  // nodePath walks n.parent (runtime/cls-monitor.ts:235), so this fixture
  // wires the tree it builds.
  for (const child of children) child.parent = node
  return node
}

afterEach(() => {
  delete process.env.SILVERY_STRICT
  resetStrictCache()
})

function withClsLogging<T>(
  run: (events: LogEvent[]) => T,
  {
    debugFilter = ["silvery:cls"],
    writers = ["silvery:cls"],
  }: { debugFilter?: string[]; writers?: string[] } = {},
): T {
  const prevInstrument = process.env.SILVERY_INSTRUMENT
  const prevDebugFilter = getDebugFilter()
  const prevLogLevel: LogLevel = getLogLevel()
  const events: LogEvent[] = []
  process.env.SILVERY_INSTRUMENT = "cls"
  setDebugFilter(debugFilter)
  setLogLevel("debug")
  setSuppressConsole(true)
  const unsubscribes = writers.map((ns) =>
    addWriter(
      { ns, level: "debug" },
      (_formatted: string, _level: string, _namespace: string, event: Event) => {
        if (event.kind === "log") events.push(event)
      },
    ),
  )
  try {
    return run(events)
  } finally {
    for (const unsubscribe of unsubscribes) unsubscribe()
    if (prevInstrument === undefined) delete process.env.SILVERY_INSTRUMENT
    else process.env.SILVERY_INSTRUMENT = prevInstrument
    setDebugFilter(prevDebugFilter)
    setLogLevel(prevLogLevel)
    setSuppressConsole(false)
  }
}

function primeMonitor(m: ReturnType<typeof createClsMonitor>): void {
  const primer = buildNode({
    type: "silvery-root",
    id: "root",
    rect: { x: 0, y: 0, width: 80, height: 24 },
    children: [],
  })
  m.onCommit(primer, 80, 24, false)
}

describe("ClsMonitor capture API (Phase 8 Option C consolidation)", () => {
  test("beginCapture → endCapture returns empty report when no shifts", () => {
    const m = createClsMonitor()
    m.beginCapture()
    const report = m.endCapture()
    expect(report.shifts).toHaveLength(0)
    expect(report.unexpectedShifts).toHaveLength(0)
    expect(report.cumulativeScore).toBe(0)
  })

  test("double-begin throws", () => {
    const m = createClsMonitor()
    m.beginCapture()
    expect(() => m.beginCapture()).toThrow(/already capturing/)
  })

  test("endCapture without beginCapture throws", () => {
    const m = createClsMonitor()
    expect(() => m.endCapture()).toThrow(/not capturing/)
  })

  test("cancelCapture is idempotent (no-op when not capturing)", () => {
    const m = createClsMonitor()
    expect(() => m.cancelCapture()).not.toThrow()
    m.beginCapture()
    expect(() => m.cancelCapture()).not.toThrow()
    expect(() => m.cancelCapture()).not.toThrow()
  })

  test("cancelCapture clears state — subsequent beginCapture works", () => {
    const m = createClsMonitor()
    m.beginCapture()
    m.cancelCapture()
    expect(() => m.beginCapture()).not.toThrow()
    expect(() => m.endCapture()).not.toThrow()
  })

  test("capture-pushed shifts appear in report (via onCommit walk)", () => {
    const m = createClsMonitor()
    // Prime prevCols/prevRows so the first real commit isn't dropped via
    // first-paint suppressShift gate.
    const primer = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [],
    })
    m.onCommit(primer, 80, 24, false)

    m.beginCapture()
    const root = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [
        buildNode({
          type: "silvery-box",
          id: "movable",
          prevRect: { x: 0, y: 0, width: 10, height: 1 },
          rect: { x: 5, y: 0, width: 10, height: 1 },
        }),
      ],
    })
    m.onCommit(root, 80, 24, false)
    const report = m.endCapture()

    expect(report.shifts.length).toBe(1)
    expect(report.unexpectedShifts.length).toBe(1) // default classifier
    // cls-monitor's nodePath walks n.parent (runtime/cls-monitor.ts:235), so the
    // fixture must carry the full ancestry, not just the leaf id.
    expect(report.shifts[0]!.blockId).toBe("root#root > #movable")
    expect(report.shifts[0]!.reflowReason).toBe("unexpected")
    expect(report.cumulativeScore).toBeGreaterThan(0)
  })

  test("custom classifier labels shifts; non-unexpected stays out of unexpectedShifts", () => {
    const m = createClsMonitor()
    const primer = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [],
    })
    m.onCommit(primer, 80, 24, false)

    m.beginCapture(() => "content-arrival")
    const root = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [
        buildNode({
          type: "silvery-box",
          id: "streaming-block",
          prevRect: { x: 0, y: 0, width: 10, height: 1 },
          rect: { x: 0, y: 1, width: 10, height: 1 },
        }),
      ],
    })
    m.onCommit(root, 80, 24, false)
    const report = m.endCapture()

    expect(report.shifts.length).toBe(1)
    expect(report.shifts[0]!.reflowReason).toBe("content-arrival")
    expect(report.unexpectedShifts.length).toBe(0)
  })

  test("scroll-suppressed commits do NOT push to sessionShifts", () => {
    const m = createClsMonitor()
    const primer = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [],
    })
    m.onCommit(primer, 80, 24, false)

    m.beginCapture()
    const root = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [
        buildNode({
          type: "silvery-box",
          id: "scroll-shifted",
          prevRect: { x: 0, y: 5, width: 10, height: 1 },
          rect: { x: 0, y: 2, width: 10, height: 1 },
        }),
      ],
    })
    // scrollOrResize=true → suppressShift filters this from sessionShifts
    m.onCommit(root, 80, 24, true)
    const report = m.endCapture()

    expect(report.shifts.length).toBe(0)
    expect(report.unexpectedShifts.length).toBe(0)
  })

  test("SILVERY_STRICT=cls causes endCapture to throw on unexpected shifts", () => {
    const m = createClsMonitor()
    const primer = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [],
    })
    m.onCommit(primer, 80, 24, false)

    m.beginCapture()
    const root = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [
        buildNode({
          type: "silvery-box",
          id: "flicker",
          prevRect: { x: 0, y: 0, width: 10, height: 1 },
          rect: { x: 5, y: 0, width: 10, height: 1 },
        }),
      ],
    })
    m.onCommit(root, 80, 24, false)

    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    expect(() => m.endCapture()).toThrow(UnexpectedLayoutShiftError)
  })

  test("SILVERY_STRICT=cls passes when classifier labels all shifts non-unexpected", () => {
    const m = createClsMonitor()
    const primer = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [],
    })
    m.onCommit(primer, 80, 24, false)

    m.beginCapture(() => "user-action")
    const root = buildNode({
      type: "silvery-root",
      id: "root",
      rect: { x: 0, y: 0, width: 80, height: 24 },
      children: [
        buildNode({
          type: "silvery-box",
          id: "shifted",
          prevRect: { x: 0, y: 0, width: 10, height: 1 },
          rect: { x: 5, y: 0, width: 10, height: 1 },
        }),
      ],
    })
    m.onCommit(root, 80, 24, false)

    process.env.SILVERY_STRICT = "cls"
    resetStrictCache()
    const report = m.endCapture()
    expect(report.shifts.length).toBe(1)
    expect(report.unexpectedShifts.length).toBe(0)
  })

  test("capture works without DEBUG=silvery:cls — envEnabled gate bypassed", () => {
    // Ensure no DEBUG/SILVERY_INSTRUMENT env vars active.
    const prevDebug = process.env.DEBUG
    const prevInstrument = process.env.SILVERY_INSTRUMENT
    delete process.env.DEBUG
    delete process.env.SILVERY_INSTRUMENT
    try {
      const m = createClsMonitor()
      const primer = buildNode({
        type: "silvery-root",
        id: "root",
        rect: { x: 0, y: 0, width: 80, height: 24 },
        children: [],
      })
      m.onCommit(primer, 80, 24, false)

      m.beginCapture()
      const root = buildNode({
        type: "silvery-root",
        id: "root",
        rect: { x: 0, y: 0, width: 80, height: 24 },
        children: [
          buildNode({
            type: "silvery-box",
            id: "moved",
            prevRect: { x: 0, y: 0, width: 10, height: 1 },
            rect: { x: 5, y: 0, width: 10, height: 1 },
          }),
        ],
      })
      m.onCommit(root, 80, 24, false)
      const report = m.endCapture()

      expect(report.shifts.length).toBe(1)
    } finally {
      if (prevDebug !== undefined) process.env.DEBUG = prevDebug
      if (prevInstrument !== undefined) process.env.SILVERY_INSTRUMENT = prevInstrument
    }
  })
})

describe("ClsMonitor production diagnostics (layout-shift instrumentation bead)", () => {
  test("DEBUG-gated summary log counts shifts without per-node firehose", () => {
    withClsLogging((events) => {
      const m = createClsMonitor()
      primeMonitor(m)

      const root = buildNode({
        type: "silvery-root",
        id: "root",
        rect: { x: 0, y: 0, width: 80, height: 24 },
        children: [
          buildNode({
            type: "silvery-box",
            id: "movable",
            prevRect: { x: 0, y: 0, width: 10, height: 1 },
            rect: { x: 3, y: 0, width: 10, height: 1 },
          }),
        ],
      })
      m.onCommit(root, 80, 24, false)

      const shiftCount = events.find((event) => event.message === "shift-count")
      expect(shiftCount?.props).toMatchObject({
        shifts: 1,
      })
      expect(String(shiftCount?.props?.firstPaths)).toContain("movable")
      expect(events.some((event) => event.message === "shift")).toBe(false)
    })
  })

  test("narrow DEBUG namespace keeps full per-node shift details available", () => {
    withClsLogging(
      (events) => {
        const m = createClsMonitor()
        primeMonitor(m)

        const root = buildNode({
          type: "silvery-root",
          id: "root",
          rect: { x: 0, y: 0, width: 80, height: 24 },
          children: [
            buildNode({
              type: "silvery-box",
              id: "movable",
              prevRect: { x: 0, y: 0, width: 10, height: 1 },
              rect: { x: 3, y: 0, width: 10, height: 1 },
            }),
          ],
        })
        m.onCommit(root, 80, 24, false)

        const shift = events.find((event) => event.message === "shift")
        expect(shift?.props).toMatchObject({
          prev: { x: 0, y: 0, width: 10, height: 1 },
          next: { x: 3, y: 0, width: 10, height: 1 },
        })
        expect(String(shift?.props?.path)).toContain("movable")
        expect(shift?.props).toHaveProperty("dtMs")
      },
      { debugFilter: ["silvery:cls-detail"], writers: ["silvery:cls-detail"] },
    )
  })

  test("per-path quick-reflow storm emits one warning for one continuous storm", () => {
    withClsLogging((events) => {
      const m = createClsMonitor()
      primeMonitor(m)

      for (let i = 0; i < 6; i++) {
        const root = buildNode({
          type: "silvery-root",
          id: "root",
          rect: { x: 0, y: 0, width: 80, height: 24 },
          children: [
            buildNode({
              type: "silvery-box",
              id: "stormy",
              prevRect: { x: i, y: 0, width: 10, height: 1 },
              rect: { x: i + 1, y: 0, width: 10, height: 1 },
            }),
          ],
        })
        m.onCommit(root, 80, 24, false)
      }

      const stormWarnings = events.filter((event) => event.message === "reflow-storm-per-path")
      expect(stormWarnings).toHaveLength(1)
      expect(stormWarnings[0]?.props).toMatchObject({
        stormPaths: 1,
        threshold: 3,
      })
    })
  })

  test("size sentinels warn for zero-area visible content and terminal overflow", () => {
    withClsLogging((events) => {
      const m = createClsMonitor()
      const root = buildNode({
        type: "silvery-root",
        id: "root",
        rect: { x: 0, y: 0, width: 80, height: 24 },
        children: [
          buildNode({
            type: "silvery-box",
            id: "collapsed",
            rect: { x: 0, y: 0, width: 0, height: 1 },
            children: [
              buildNode({
                type: "silvery-text",
                rect: { x: 0, y: 0, width: 0, height: 0 },
              }),
            ],
          }),
          buildNode({
            type: "silvery-box",
            id: "overflowing",
            rect: { x: 0, y: 0, width: 120, height: 1 },
          }),
        ],
      })
      m.onCommit(root, 80, 24, false)

      expect(events.some((event) => event.message === "zero-area-with-content")).toBe(true)
      expect(events.some((event) => event.message === "rect-overflows-terminal")).toBe(true)
    })
  })

  test("scroll-driven shifts are suppressed from production shift logs", () => {
    withClsLogging((events) => {
      const m = createClsMonitor()
      primeMonitor(m)

      const root = buildNode({
        type: "silvery-root",
        id: "root",
        rect: { x: 0, y: 0, width: 80, height: 24 },
        children: [
          buildNode({
            type: "silvery-box",
            id: "scrolled",
            prevRect: { x: 0, y: 10, width: 10, height: 1 },
            rect: { x: 0, y: 2, width: 10, height: 1 },
          }),
        ],
      })
      m.onCommit(root, 80, 24, true)

      expect(events.some((event) => event.message === "shift")).toBe(false)
      expect(events.some((event) => event.message === "reflow-storm-per-path")).toBe(false)
    })
  })
})
