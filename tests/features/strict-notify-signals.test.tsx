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

function findByTestId(node: AgNode, id: string): AgNode | null {
  const props = node.props as Record<string, unknown> | undefined
  if (props && (props.testID === id || props.id === id)) return node
  for (const child of node.children) {
    const found = findByTestId(child, id)
    if (found) return found
  }
  return null
}

async function mountApp() {
  const app = createApp(() => () => ({ tick: 0, decorations: ORIGINAL }))
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
      expect(diagnostic).toContain('decorationRects["hl"]')
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
})
