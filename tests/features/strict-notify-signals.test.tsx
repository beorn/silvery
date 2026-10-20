/**
 * STRICT's fresh comparison must resolve notify-synced signals (#26812).
 *
 * @failure A notify-synced prop changes with no notify-dirty mark — the class
 *   a missed `markNotifyDirty` produces. On a frame whose layout phase is
 *   skipped, `decorations` (the root-only second pass of the notify step) is
 *   never re-resolved, so live signals keep the old rect; the STRICT fresh
 *   comparison also skipped the notify pass, read the same stale signal, and
 *   reported nothing. Measured: an injected `decorations` change keeps
 *   `collectOverlayLayer(root).decorations` at the old rect across a frame,
 *   while `cursorOffset` does not (the layout phase itself syncs rect signals).
 * @level contract
 * @consumer @si/layout/26388-numeric-max-caps-auto-before-content-measure/26660-prompt-regression/26812-strict-fresh-render-skips-notify
 * @testonly none
 *
 * Drives the real createApp runtime (`runtime/renderer.ts`), the path the bead
 * names. The store tick re-renders a sibling Text only, so Flexily stays clean
 * and the live notify step is gated off exactly as in production; a STRICT
 * mismatch surfaces through the app's panic diagnostic on stderr (the
 * established way the createApp path reports a render-time throw).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"

// `create-app.tsx` resolves STRICT_MODE once at module load, so the env has to
// be set before the imports below evaluate — beforeEach is too late and would
// silently test the non-STRICT path.
vi.hoisted(() => {
  process.env.SILVERY_STRICT = "2"
})

import React from "react"
import { createTermless } from "@silvery/test"
import { collectOverlayLayer } from "@silvery/ag/overlay-layer"
import { findAnchor, getLayoutSignals } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"
import { Box, Text } from "../../src/index.js"
import { createApp, useApp } from "../../packages/ag-term/src/runtime/create-app"

type Highlight = {
  kind: "highlight"
  id: string
  rect: { x: number; y: number; width: number; height: number }
}

function highlight(x: number): Highlight[] {
  return [{ kind: "highlight", id: "hl", rect: { x, y: 0, width: 2, height: 1 } }]
}

// Module-stable so a tick-only store change leaves this prop reference-equal;
// React.memo then bails and the injected props below survive the rerender.
const ORIGINAL: Highlight[] = highlight(0)

const DecoratedRow = React.memo(function DecoratedRow({
  decorations,
}: {
  decorations: Highlight[]
}) {
  return (
    <Box testID="decorated" width={20} height={1} decorations={decorations}>
      <Text>hello</Text>
    </Box>
  )
})

type State = { tick: number; decorations: Highlight[] }

function App(): React.ReactElement {
  const tick = useApp<State, number>((s) => s.tick)
  const decorations = useApp<State, Highlight[]>((s) => s.decorations)
  return (
    <Box flexDirection="column" width={40} height={60}>
      <DecoratedRow decorations={decorations} />
      <Text testID="sibling" color={tick % 2 === 0 ? "red" : "blue"}>
        gray text
      </Text>
      {Array.from({ length: 55 }, (_, i) => (
        <Text key={i}>filler row {i}</Text>
      ))}
    </Box>
  )
}

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms))

type AnchorState = { tick: number; lead: string }

/**
 * Anchor fixture: the `anchor` Box declares `anchorRef="a1"` and the `popper`
 * Box consumes it through a popover decoration. `lead` is the only layout
 * input that moves the anchor; the style-only `tick` lets a frame run with the
 * live notify step gated off.
 */
// Memoised with no props: a tick must not re-commit this subtree, or the
// reconciler's own prop-commit sync would refresh the anchor signal and hide
// the stale value this fixture is about.
const AnchorRow = React.memo(function AnchorRow() {
  return (
    <>
      <Box testID="anchor" anchorRef="a1" width={8} height={1}>
        <Text>anchor</Text>
      </Box>
      <Box
        testID="popper"
        width={1}
        height={1}
        decorations={[
          {
            kind: "popover",
            id: "p1",
            anchorId: "a1",
            placement: "bottom-start",
            size: { width: 3, height: 1 },
          },
        ]}
      />
    </>
  )
})

function AnchorApp(): React.ReactElement {
  const lead = useApp<AnchorState, string>((s) => s.lead)
  const tick = useApp<AnchorState, number>((s) => s.tick)
  return (
    <Box flexDirection="column" width={40} height={60}>
      <Text>{lead}</Text>
      <AnchorRow />
      <Text testID="sibling" color={tick % 2 === 0 ? "red" : "blue"}>
        gray text
      </Text>
    </Box>
  )
}

async function mountAnchorApp() {
  const app = createApp(() => () => ({ tick: 0, lead: "line" }) as AnchorState)
  const term = createTermless({ cols: 40, rows: 60 })
  const handle = await app.run(<AnchorApp />, {
    term,
    cols: 40,
    rows: 60,
    writable: { write: (data: string) => term.write(data) },
  })
  await settle()
  return { term, handle }
}

function findByTestId(node: AgNode, id: string): AgNode | null {
  const props = node.props as Record<string, unknown> | undefined
  if (props && (props.testID === id || props.id === id)) return node
  for (const child of node.children) {
    const found = findByTestId(child, id)
    if (found) return found
  }
  return null
}

async function mountApp(decorations: Highlight[] = ORIGINAL) {
  const app = createApp(() => () => ({ tick: 0, decorations }))
  const term = createTermless({ cols: 40, rows: 60 })
  const handle = await app.run(<App />, {
    term,
    cols: 40,
    rows: 60,
    writable: { write: (data: string) => term.write(data) },
  })
  await settle()
  return { term, handle }
}

describe("STRICT fresh comparison resolves notify-synced signals (#26812)", () => {
  let stderr: string[]
  let originalStderrWrite: typeof process.stderr.write
  let originalExitCode: typeof process.exitCode

  beforeEach(() => {
    stderr = []
    originalExitCode = process.exitCode
    originalStderrWrite = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      stderr.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write
  })

  afterEach(() => {
    process.stderr.write = originalStderrWrite
    process.exitCode = originalExitCode
  })

  test("RED→GREEN: a decorations change with no notify mark is reported, not left stale twice", async () => {
    const { handle } = await mountApp()
    try {
      const root = handle.root
      const target = findByTestId(root, "decorated")
      if (!target) throw new Error("test setup: decorated node not found")
      expect(collectOverlayLayer(root).decorations[0]?.rects[0]).toMatchObject({ x: 0 })

      // Below the reconciler on purpose: the one desync the public API cannot
      // express — a notify-synced prop changed with no notify-dirty mark.
      ;(target as unknown as { props: Record<string, unknown> }).props = {
        ...(target.props as Record<string, unknown>),
        decorations: highlight(3),
      }

      // A style-only sibling tick: Flexily stays clean and the live notify step
      // is gated off, so the live signal keeps x:0. The fresh comparison must
      // resolve the prop and report the disagreement.
      handle.store.setState({ tick: 1 })
      await settle()

      const diagnostic = stderr.join("")
      expect(diagnostic).toContain("NOTIFY-SIGNAL MISMATCH")
      expect(diagnostic).toContain("silvery-box#decorated")
      expect(diagnostic).toContain("decorationRects[#0]")
      expect(diagnostic).toContain('id="hl"')
      expect(diagnostic).toContain('"x":3')
    } finally {
      handle.unmount()
    }
  })

  test("no false positive: an ordinary decorations change through React stays green", async () => {
    const { handle } = await mountApp()
    try {
      const root = handle.root
      handle.store.setState({ tick: 1, decorations: highlight(3) })
      await settle()

      expect(stderr.join("")).not.toContain("NOTIFY-SIGNAL MISMATCH")
      expect(collectOverlayLayer(root).decorations[0]?.rects[0]).toMatchObject({ x: 3 })
    } finally {
      handle.unmount()
    }
  })

  test("ordered comparison: an order-only decorations change is reported", async () => {
    const first: Highlight = {
      kind: "highlight",
      id: "a",
      rect: { x: 0, y: 0, width: 2, height: 1 },
    }
    const second: Highlight = {
      kind: "highlight",
      id: "b",
      rect: { x: 4, y: 0, width: 2, height: 1 },
    }
    const { handle } = await mountApp([first, second])
    try {
      const root = handle.root
      const target = findByTestId(root, "decorated")
      if (!target) throw new Error("test setup: decorated node not found")

      // Same entries, reversed order, no notify mark: the id-keyed diagnostic
      // lookup used to erase this difference before deciding the frame matched.
      const decorated = target as unknown as { props: Record<string, unknown> }
      decorated.props = {
        ...decorated.props,
        decorations: [second, first],
      }

      handle.store.setState({ tick: 1 })
      await settle()

      const diagnostic = stderr.join("")
      expect(diagnostic).toContain("NOTIFY-SIGNAL MISMATCH")
      expect(diagnostic).toContain("decorationRects[#0]")
    } finally {
      handle.unmount()
    }
  })

  test("ordered comparison: a change to the first duplicate id is reported", async () => {
    const dupA: Highlight = {
      kind: "highlight",
      id: "dup",
      rect: { x: 0, y: 0, width: 2, height: 1 },
    }
    const dupB: Highlight = {
      kind: "highlight",
      id: "dup",
      rect: { x: 5, y: 0, width: 2, height: 1 },
    }
    const { handle } = await mountApp([dupA, dupB])
    try {
      const root = handle.root
      const target = findByTestId(root, "decorated")
      if (!target) throw new Error("test setup: decorated node not found")

      // The first occurrence changes while the last one stays put: a Map keyed
      // by id keeps only the last entry and saw nothing to report.
      const decorated = target as unknown as { props: Record<string, unknown> }
      decorated.props = {
        ...decorated.props,
        decorations: [{ ...dupA, rect: { x: 1, y: 0, width: 2, height: 1 } }, dupB],
      }

      handle.store.setState({ tick: 1 })
      await settle()

      const diagnostic = stderr.join("")
      expect(diagnostic).toContain("NOTIFY-SIGNAL MISMATCH")
      expect(diagnostic).toContain("decorationRects[#0]")
      expect(diagnostic).toContain('"x":1')
    } finally {
      handle.unmount()
    }
  })

  test("anchor coverage: the consumer's cached anchor is compared against the fresh value", async () => {
    const { handle } = await mountAnchorApp()
    try {
      const root = handle.root
      const anchor = findByTestId(root, "anchor")
      if (!anchor) throw new Error("test setup: anchor node not found")
      const signals = getLayoutSignals(anchor)
      const truth = signals.anchorRect()
      expect(truth).not.toBeNull()

      // The missed-notify state itself: the live signal holds a rect that is no
      // longer what the node's geometry produces. A style-only tick keeps
      // Flexily clean, so nothing re-synchronises it; the fresh read must still
      // resolve the true value and report the disagreement.
      signals.anchorRect({ x: 0, y: 99, width: 1, height: 1 })

      handle.store.setState({ tick: 1 })
      await settle()

      const diagnostic = stderr.join("")
      expect(diagnostic).toContain("NOTIFY-SIGNAL MISMATCH")
      expect(diagnostic).toContain('anchorRect["a1"]')
      expect(diagnostic).toContain('"y":99')
    } finally {
      handle.unmount()
    }
  })

  test("nonpublication: a strict frame writes no live rect signal", async () => {
    const { handle } = await mountAnchorApp()
    try {
      const root = handle.root
      const anchor = findByTestId(root, "anchor")
      if (!anchor) throw new Error("test setup: anchor node not found")
      const signals = getLayoutSignals(anchor)

      // A style-only tick runs no layout, so this identity is stable across the
      // frame unless the comparison publishes fresh values into the live map.
      const beforeBoxRect = signals.boxRect()
      handle.store.setState({ tick: 1 })
      await settle()
      expect(signals.boxRect()).toBe(beforeBoxRect)
      expect(stderr.join("")).not.toContain("NOTIFY-SIGNAL MISMATCH")
    } finally {
      handle.unmount()
    }
  })
})
