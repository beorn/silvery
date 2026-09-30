/**
 * Selection as overlay/decoration — Phase 4b invariants.
 *
 * Phase 4b of `km-silvery.view-as-layout-output` makes selection a layout
 * output: `<Box selectionIntent={{ from, to }}>` writes a list of rectangles
 * (one per visual line spanned) into `LayoutSignals.selectionFragments`,
 * and `findActiveSelectionFragments(root)` is the tree-walk lookup the
 * selection-renderer consumes. This file pins the invariants for the new
 * path:
 *
 *  1. **Wrap-spanning fragments** — a multi-line selection (text contains
 *     `\n`) produces one rectangle per visual line. First line: from
 *     `from` to end-of-line. Middle lines: full content-rect width. Last
 *     line: from start-of-line to `to`. v1 covers embedded-newline
 *     multi-line; soft-wrap awareness awaits a registered measurer in
 *     `@silvery/ag` (see `computeSelectionFragments` JSDoc).
 *  2. **Recompute on prop change** — `selectionFragments` updates when only
 *     `from`/`to` toggles, even when no rect changed. Mirrors cursor
 *     invariant 2 + focus invariant 2.
 *  3. **Cleanup on unmount** — when the owning AgNode unmounts, no stale
 *     fragments survive the next layout pass. Conditional mount/unmount
 *     cycles produce exactly one set of fragments at any frame (or empty).
 *  4. **Empty/collapsed selection** — `from === to` produces zero
 *     fragments (caret rendering is `cursorOffset`'s job; collapsed
 *     selection should not paint a highlight rectangle).
 *  5. **Multi-node selection** — two adjacent nodes both declaring
 *     `selectionIntent` produce concatenated fragments via
 *     `findActiveSelectionFragments`. Full cross-node range selection (mid
 *     of A through mid of B) is a future enhancement; this test covers
 *     concatenation across declarers.
 *  6. **Cross-target hygiene** — `selectionFragments` is a list of plain
 *     `Rect`s (geometric only). The tests assert only on the rect shape;
 *     terminal-specific bg highlight rendering lives in the selection
 *     renderer (`@silvery/ag-term`) and is not exercised here.
 *
 * Tests run with `SILVERY_STRICT=1` (default) — every rerender is
 * auto-verified incremental ≡ fresh.
 *
 * Bead: km-silvery.phase4-split-focus-selection
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { run, useInput } from "@silvery/ag-term/runtime"
import {
  computeSelectionFragments,
  findActiveSelectionFragments,
  getLayoutSignals,
} from "@silvery/ag/layout-signals"
import type { AgNode, BoxProps, SelectionIntent } from "@silvery/ag/types"

// ============================================================================
// Helpers
// ============================================================================

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findFirstWithSelection(node: AgNode): AgNode | null {
  const props = node.props as BoxProps | undefined
  if (props?.selectionIntent) return node
  for (const child of node.children) {
    const hit = findFirstWithSelection(child)
    if (hit) return hit
  }
  return null
}

// ============================================================================
// Invariant 1: Wrap-spanning fragments (multi-line via embedded \n)
// ============================================================================

describe("invariant 1: wrap-spanning fragments", () => {
  test("single-line selection → one rectangle", () => {
    const render = createRenderer({ cols: 40, rows: 6 })

    function App({ intent }: { intent: SelectionIntent }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="line" selectionIntent={intent}>
            <Text>hello world</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App intent={{ from: 0, to: 5 }} />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.height).toBe(1)
    expect(fragments[0]?.width).toBe(5)
  })

  test("multi-line selection (3 lines) → 3 rectangles", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    // Three lines: "alpha\nbeta\ngamma" (5 + 1 + 4 + 1 + 5 = 16 chars).
    // Selection from offset 2 (in "alpha") to offset 13 (mid "gamma"):
    //   - line 0 "alpha": from col 2 to end → "pha" (3 chars)
    //   - line 1 "beta":  full line → 4 chars wide (we report content.width)
    //   - line 2 "gamma": from col 0 to col 2 → "ga" (2 chars)
    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="multi" selectionIntent={{ from: 2, to: 13 }}>
            <Text>{"alpha\nbeta\ngamma"}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(3)
    // First line: starts at col 2 of line 0, runs to end-of-line (3 chars).
    expect(fragments[0]?.width).toBe(3)
    expect(fragments[0]?.height).toBe(1)
    // Second line: middle, full content width.
    expect(fragments[1]?.height).toBe(1)
    expect(fragments[1]?.width).toBeGreaterThanOrEqual(4)
    // Third line: starts at col 0, runs to col 2 (2 chars).
    expect(fragments[2]?.width).toBe(2)
    expect(fragments[2]?.height).toBe(1)
  })

  test("two-line selection → 2 rectangles (first partial + last partial)", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="two" selectionIntent={{ from: 3, to: 9 }}>
            <Text>{"hello\nworld"}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(2)
    // First line: "lo" (cols 3-5 of "hello", 2 chars).
    expect(fragments[0]?.width).toBe(2)
    // Last line: "wor" (cols 0-3 of "world", 3 chars).
    expect(fragments[1]?.width).toBe(3)
  })
})

// ============================================================================
// Invariant 2: Recompute on prop change
// ============================================================================

describe("invariant 2: selectionFragments recomputes on intent prop change", () => {
  test("changing from/to without layout change updates the signal", () => {
    const render = createRenderer({ cols: 40, rows: 6 })

    function App({ intent }: { intent: SelectionIntent | undefined }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="target" width={20} height={1} selectionIntent={intent}>
            <Text>hello world here</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App intent={undefined} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)

    // Add intent: should produce one fragment.
    app.rerender(<App intent={{ from: 0, to: 5 }} />)
    let fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(5)

    // Change `to` only — same Box, same layout. Signal must update.
    app.rerender(<App intent={{ from: 0, to: 11 }} />)
    fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(11)

    // Change `from` only.
    app.rerender(<App intent={{ from: 6, to: 11 }} />)
    fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(5)

    // Remove intent — signal clears to empty.
    app.rerender(<App intent={undefined} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)
  })

  test("per-node signal reflects its own selectionIntent across rerenders", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App({ intent }: { intent: SelectionIntent | undefined }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="probe" selectionIntent={intent}>
            <Text>probe text</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App intent={{ from: 0, to: 5 }} />)
    const root = getRoot(app)
    const node = findFirstWithSelection(root)
    if (!node) throw new Error("test fixture: no selection node found")
    const sig = getLayoutSignals(node)
    expect(sig.selectionFragments()).toHaveLength(1)

    // Remove the prop — per-node signal must clear back to empty.
    app.rerender(<App intent={undefined} />)
    expect(sig.selectionFragments()).toHaveLength(0)
  })

  // #26660: the same invariant in the live runtime, with a root the size of the
  // terminal. A selectionIntent-only change leaves every Flexily node clean, and
  // the layout-on-demand gate used to skip the notify step that writes the
  // signal. The createRenderer rows above relay out on every frame
  // (content-sized root).
  test("live runtime: a selectionIntent-only change moves the node's fragments", async () => {
    using term = createTermless({ cols: 40, rows: 6 })

    function App(): React.ReactElement {
      const [intent, setIntent] = useState<SelectionIntent>({ from: 0, to: 5 })
      useInput((input) => {
        if (input === "w") setIntent({ from: 6, to: 11 })
      })
      return (
        <Box width={40} height={6} flexDirection="column" padding={1}>
          <Box id="target" width={20} height={1} selectionIntent={intent}>
            <Text>hello world here</Text>
          </Box>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    await handle.waitForLayoutStable()
    const node = findFirstWithSelection(handle.root)
    if (!node) throw new Error("test fixture: no selection node found")
    const sig = getLayoutSignals(node)
    expect(sig.selectionFragments()).toEqual([{ x: 1, y: 1, width: 5, height: 1 }])

    await handle.press("w")
    await handle.waitForLayoutStable()
    expect(sig.selectionFragments(), "the fragment covers 'world'").toEqual([
      { x: 7, y: 1, width: 5, height: 1 },
    ])

    handle.unmount()
  })
})

// ============================================================================
// Invariant 3: Cleanup on unmount
// ============================================================================

describe("invariant 3: stale-cleanup on unmount", () => {
  test("conditional mount/unmount cycle leaves no ghost fragments", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ phase }: { phase: 0 | 1 | 2 | 3 }) {
      return (
        <Box flexDirection="column" padding={1}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Box key={i}>
              <Text>row {i}</Text>
            </Box>
          ))}
          {phase === 1 || phase === 3 ? (
            <Box id="ephemeral" selectionIntent={{ from: 0, to: 5 }}>
              <Text>select me</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    const app = render(<App phase={0} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)

    app.rerender(<App phase={1} />)
    expect(findActiveSelectionFragments(getRoot(app)).length).toBeGreaterThan(0)

    app.rerender(<App phase={2} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)

    // Re-mount: must produce a fresh selection, not a stale one held by a
    // previously-allocated signal map entry.
    app.rerender(<App phase={3} />)
    expect(findActiveSelectionFragments(getRoot(app)).length).toBeGreaterThan(0)

    app.rerender(<App phase={0} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)
  })

  test("only currently-mounted selection nodes contribute to the lookup", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ which }: { which: "a" | "b" }) {
      return (
        <Box flexDirection="column" padding={1}>
          {which === "a" ? (
            <Box id="alpha" selectionIntent={{ from: 0, to: 3 }}>
              <Text>AAAA</Text>
            </Box>
          ) : (
            <Box id="beta" selectionIntent={{ from: 0, to: 5 }}>
              <Text>BBBBB</Text>
            </Box>
          )}
        </Box>
      )
    }

    const app = render(<App which="a" />)
    let fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(3)

    app.rerender(<App which="b" />)
    fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(5)

    app.rerender(<App which="a" />)
    fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(3)
  })
})

// ============================================================================
// Invariant 4: Empty / collapsed selection produces zero fragments
// ============================================================================

describe("invariant 4: empty / collapsed selection", () => {
  test("from === to produces zero fragments", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App({ intent }: { intent: SelectionIntent }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="collapsed" selectionIntent={intent}>
            <Text>some text</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App intent={{ from: 3, to: 3 }} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)

    // Same offsets, both 0.
    app.rerender(<App intent={{ from: 0, to: 0 }} />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)
  })

  test("from > to (degenerate) produces zero fragments", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="reversed" selectionIntent={{ from: 5, to: 2 }}>
            <Text>some text</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)
  })

  test("no selectionIntent prop → zero fragments", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="plain">
            <Text>nothing selected</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)
  })

  test("text is empty → zero fragments even when intent is non-degenerate", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          {/* Empty text content. Fragments must collapse to empty even
              though `from`/`to` declare a non-zero range — clamp to text
              length, then run the same `from >= to` short-circuit. */}
          <Box id="empty" selectionIntent={{ from: 0, to: 5 }}>
            <Text>{""}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(findActiveSelectionFragments(getRoot(app))).toHaveLength(0)
  })
})

// ============================================================================
// Invariant 5: Multi-node selection (basic concatenation)
// ============================================================================

describe("invariant 5: multi-node selection concatenation", () => {
  test("two adjacent declarers → fragments from both are concatenated", () => {
    const render = createRenderer({ cols: 40, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="left" selectionIntent={{ from: 0, to: 4 }}>
            <Text>aaaa</Text>
          </Box>
          <Box id="right" selectionIntent={{ from: 0, to: 6 }}>
            <Text>bbbbbb</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(2)
    // Each declarer contributes its single rect.
    expect(fragments[0]?.width).toBe(4)
    expect(fragments[1]?.width).toBe(6)
  })

  test("declarer with collapsed intent contributes nothing; sibling still produces fragments", () => {
    const render = createRenderer({ cols: 40, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="collapsed" selectionIntent={{ from: 2, to: 2 }}>
            <Text>aaaa</Text>
          </Box>
          <Box id="real" selectionIntent={{ from: 0, to: 3 }}>
            <Text>bbbbbb</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(3)
  })
})

// ============================================================================
// Invariant 6: Cross-target hygiene — fragments are pure Rects
// ============================================================================

describe("invariant 6: cross-target hygiene (geometry only)", () => {
  test("fragments are plain Rects with x/y/width/height, no styling", () => {
    const render = createRenderer({ cols: 40, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="solo" selectionIntent={{ from: 0, to: 5 }}>
            <Text>hello</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    const rect = fragments[0]!
    expect(typeof rect.x).toBe("number")
    expect(typeof rect.y).toBe("number")
    expect(typeof rect.width).toBe("number")
    expect(typeof rect.height).toBe("number")
    // No theme/color/style fields leak into the geometric output —
    // selection-renderer (terminal-specific) owns highlight bg.
    expect(Object.keys(rect).sort()).toEqual(["height", "width", "x", "y"])
  })

  test("direct compute helper agrees with tree-walk lookup", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="solo" selectionIntent={{ from: 1, to: 4 }}>
            <Text>solo</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const target = findFirstWithSelection(root)
    if (!target) throw new Error("test fixture: no selection node")
    const computed = computeSelectionFragments(target)
    const walked = findActiveSelectionFragments(root)
    expect(walked).toHaveLength(computed.length)
    for (let i = 0; i < walked.length; i++) {
      expect(walked[i]).toEqual(computed[i])
    }
  })
})
