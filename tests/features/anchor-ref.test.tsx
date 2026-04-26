/**
 * BoxProps.anchorRef — overlay-anchor v1 contract tests.
 *
 * Phase 4c of `km-silvery.view-as-layout-output`. Pins the contract for the
 * anchor-as-layout-output path:
 *
 *  1. **anchorRef registers** — a Box with `anchorRef="..."` produces a
 *     non-null `findAnchor(root, id)` rect on the FIRST frame, equal to its
 *     `contentRect` (border + padding excluded).
 *  2. **String + AnchorRef shorthand both work** — `anchorRef="id"` and
 *     `anchorRef={{ id: "id" }}` resolve identically.
 *  3. **Recompute on prop change** — toggling `anchorRef` clears/reinstates
 *     the rect in the same frame (mirrors cursor invariant 2 + focus
 *     invariant 2 + selection invariant 2).
 *  4. **Cleanup on unmount** — when the owning Box unmounts, no stale
 *     anchor survives the next layout pass.
 *  5. **Edge convenience** — `findAnchor(root, id, "top" | "bottom" | ...)`
 *     returns 1-cell-thick edge slices in the same coordinate space.
 *  6. **Deepest wins on duplicate id** — substrate doesn't enforce
 *     uniqueness; deeper / later-rendered anchor wins (matches cursor +
 *     focus deepest-wins convention).
 *
 * Tests run with `SILVERY_STRICT=1` (default) — every rerender is auto-
 * verified incremental ≡ fresh.
 *
 * Bead: km-silvery.overlay-anchor-impl-v1
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { findAnchor, getLayoutSignals } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findFirstWithAnchorRef(node: AgNode): AgNode | null {
  const props = node.props as { anchorRef?: unknown } | undefined
  if (props?.anchorRef) return node
  for (const child of node.children) {
    const hit = findFirstWithAnchorRef(child)
    if (hit) return hit
  }
  return null
}

// ============================================================================
// Invariant 1: anchorRef registers and returns contentRect on first frame
// ============================================================================

describe("invariant 1: anchorRef registers", () => {
  test("first frame: findAnchor returns the Box's contentRect", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box anchorRef="trigger" width={20} height={3}>
            <Text>trigger</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const rect = findAnchor(getRoot(app), "trigger")
    expect(rect).not.toBeNull()
    // Outer padding(1) — anchor box has no border/padding — content rect
    // origin is at (1, 1), full 20x3.
    expect(rect!.x).toBe(1)
    expect(rect!.y).toBe(1)
    expect(rect!.width).toBe(20)
    expect(rect!.height).toBe(3)
  })

  test("missing anchor returns null (not a thrown error)", () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <Box padding={1}>
        <Text>no anchors here</Text>
      </Box>,
    )
    expect(findAnchor(getRoot(app), "missing")).toBeNull()
  })
})

// ============================================================================
// Invariant 2: string + AnchorRef object shorthand
// ============================================================================

describe("invariant 2: shorthand forms", () => {
  test("anchorRef={{id: '...'}} resolves identically to anchorRef='...'", () => {
    const render = createRenderer({ cols: 40, rows: 8 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef={{ id: "via-object" }} width={10} height={2}>
          <Text>x</Text>
        </Box>
      </Box>,
    )
    const rect = findAnchor(getRoot(app), "via-object")
    expect(rect).not.toBeNull()
    expect(rect!.width).toBe(10)
    expect(rect!.height).toBe(2)
  })

  test("empty string id is treated as no anchor", () => {
    const render = createRenderer({ cols: 30, rows: 6 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef="" width={5} height={2}>
          <Text>x</Text>
        </Box>
      </Box>,
    )
    // Empty id resolves to null — substrate ignores it rather than
    // registering an empty-string key in the registry.
    expect(findAnchor(getRoot(app), "")).toBeNull()
  })
})

// ============================================================================
// Invariant 3: prop-change recompute
// ============================================================================

describe("invariant 3: anchorRect recomputes on prop change", () => {
  test("toggling anchorRef on/off updates findAnchor in the same frame", () => {
    const render = createRenderer({ cols: 30, rows: 8 })

    function App({ on }: { on: boolean }) {
      return (
        <Box padding={1}>
          <Box anchorRef={on ? "x" : undefined} width={10} height={2}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App on={false} />)
    expect(findAnchor(getRoot(app), "x")).toBeNull()

    app.rerender(<App on={true} />)
    expect(findAnchor(getRoot(app), "x")).not.toBeNull()

    app.rerender(<App on={false} />)
    expect(findAnchor(getRoot(app), "x")).toBeNull()
  })

  test("changing the id while anchorRef stays present updates the registry", () => {
    const render = createRenderer({ cols: 30, rows: 8 })

    function App({ id }: { id: string }) {
      return (
        <Box padding={1}>
          <Box anchorRef={id} width={10} height={2}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App id="alpha" />)
    expect(findAnchor(getRoot(app), "alpha")).not.toBeNull()
    expect(findAnchor(getRoot(app), "beta")).toBeNull()

    app.rerender(<App id="beta" />)
    expect(findAnchor(getRoot(app), "alpha")).toBeNull()
    expect(findAnchor(getRoot(app), "beta")).not.toBeNull()
  })

  test("per-node signal reflects anchorRect across rerenders", () => {
    const render = createRenderer({ cols: 30, rows: 8 })

    function App({ on }: { on: boolean }) {
      return (
        <Box padding={1}>
          <Box anchorRef={on ? "probe" : undefined} width={5} height={2}>
            <Text>p</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App on={true} />)
    const node = findFirstWithAnchorRef(getRoot(app))
    if (!node) throw new Error("test fixture: no anchor node")
    const sig = getLayoutSignals(node)
    expect(sig.anchorRect()).not.toBeNull()

    app.rerender(<App on={false} />)
    // The previously-allocated signal on the same node clears to null.
    expect(sig.anchorRect()).toBeNull()
  })
})

// ============================================================================
// Invariant 4: cleanup on unmount
// ============================================================================

describe("invariant 4: stale-cleanup on unmount", () => {
  test("conditional mount/unmount cycle leaves no ghost anchor", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ phase }: { phase: 0 | 1 | 2 }) {
      return (
        <Box flexDirection="column" padding={1}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Box key={i}>
              <Text>row {i}</Text>
            </Box>
          ))}
          {phase === 1 ? (
            <Box anchorRef="ephemeral" width={10} height={2}>
              <Text>x</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    const app = render(<App phase={0} />)
    expect(findAnchor(getRoot(app), "ephemeral")).toBeNull()

    app.rerender(<App phase={1} />)
    expect(findAnchor(getRoot(app), "ephemeral")).not.toBeNull()

    app.rerender(<App phase={2} />)
    expect(findAnchor(getRoot(app), "ephemeral")).toBeNull()
  })
})

// ============================================================================
// Invariant 5: edge convenience
// ============================================================================

describe("invariant 5: edge slices via findAnchor(root, id, edge)", () => {
  test("top edge is 1-row-thick at content rect's top", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef="t" width={10} height={4}>
          <Text>t</Text>
        </Box>
      </Box>,
    )
    const top = findAnchor(getRoot(app), "t", "top")
    expect(top).toEqual({ x: 1, y: 1, width: 10, height: 1 })
  })

  test("bottom edge is 1-row-thick at content rect's bottom", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef="b" width={10} height={4}>
          <Text>b</Text>
        </Box>
      </Box>,
    )
    const bottom = findAnchor(getRoot(app), "b", "bottom")
    expect(bottom).toEqual({ x: 1, y: 4, width: 10, height: 1 })
  })

  test("left edge is 1-col-thick at content rect's left", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef="l" width={10} height={4}>
          <Text>l</Text>
        </Box>
      </Box>,
    )
    const left = findAnchor(getRoot(app), "l", "left")
    expect(left).toEqual({ x: 1, y: 1, width: 1, height: 4 })
  })

  test("right edge is 1-col-thick at content rect's right", () => {
    const render = createRenderer({ cols: 30, rows: 10 })
    const app = render(
      <Box padding={1}>
        <Box anchorRef="r" width={10} height={4}>
          <Text>r</Text>
        </Box>
      </Box>,
    )
    const right = findAnchor(getRoot(app), "r", "right")
    expect(right).toEqual({ x: 10, y: 1, width: 1, height: 4 })
  })
})

// ============================================================================
// Invariant 6: deepest anchor wins on duplicate id
// ============================================================================

describe("invariant 6: duplicate id resolution", () => {
  test("two anchors with the same id → deeper / later in post-order wins", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box flexDirection="column" padding={1}>
        <Box anchorRef="dup" width={10} height={2}>
          <Text>shallow</Text>
        </Box>
        <Box flexDirection="column">
          <Box anchorRef="dup" width={20} height={3}>
            <Text>deeper</Text>
          </Box>
        </Box>
      </Box>,
    )
    const rect = findAnchor(getRoot(app), "dup")
    expect(rect).not.toBeNull()
    // Deeper anchor (width=20) wins over shallow anchor (width=10).
    expect(rect!.width).toBe(20)
    expect(rect!.height).toBe(3)
  })
})
