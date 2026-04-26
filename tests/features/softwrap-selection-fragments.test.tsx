/**
 * Soft-wrap-aware selection fragments — closes Phase 4b deferred wrap-spanning.
 *
 * Phase 4b shipped `selectionIntent` → `selectionFragments` with `\n`-only
 * line splitting, leaving soft-wrap-spanning selections as a known gap
 * (see `selection-fragments.test.tsx` invariant 1 docstring). A 60-char
 * paragraph rendered at width 20 produces 3 visual lines but only 1
 * fragment rectangle, which visually overflows the viewport.
 *
 * This file pins the Option-B implementation (per
 * `hub/silvery/design/overlay-anchor-system.md` § 8): a runtime-supplied
 * wrap measurer registered in `@silvery/ag` lets `computeSelectionFragments`
 * call back into terminal-grade wrap geometry without inverting the
 * layering. `@silvery/ag-term` registers the adapter at module load; the
 * fallback path (`\n`-only split) is preserved when no measurer is
 * registered so pure-`@silvery/ag` consumers and tests aren't disturbed.
 *
 * Tests run with `SILVERY_STRICT=2` (every-action invariants on top of
 * the standard incremental ≡ fresh check). Bead:
 * `km-silvery.softwrap-selection-fragments`.
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach, afterAll } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { computeSelectionFragments, findActiveSelectionFragments } from "@silvery/ag/layout-signals"
import { setWrapMeasurer, getWrapMeasurer } from "@silvery/ag/wrap-measurer"
import {
  installTerminalWrapMeasurer,
  uninstallTerminalWrapMeasurer,
  isTerminalWrapMeasurerInstalled,
} from "@silvery/ag-term/runtime"
import type { AgNode, BoxProps } from "@silvery/ag/types"

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

// `@silvery/ag-term` registers the terminal wrap measurer at module load
// (`runtime/wrap-measurer-registration.ts`'s side-effect call). The
// `installTerminalWrapMeasurer()` call here is defensive — if a sibling
// test file ran `setWrapMeasurer(null)` and forgot to restore, this
// re-arms before our suite runs. The `afterAll` block restores again so
// downstream test files inherit the production default.
beforeEach(() => {
  installTerminalWrapMeasurer()
  expect(isTerminalWrapMeasurerInstalled()).toBe(true)
})

afterAll(() => {
  installTerminalWrapMeasurer()
})

// ============================================================================
// Acceptance test: the canonical 60-char paragraph at width 20
// ============================================================================

describe("acceptance: 60-char paragraph wrapped at width 20", () => {
  test("selection (5,35) emits 2 fragments — first y=0 width 15, second y=1 width 15", () => {
    // Build a 60-char paragraph that wraps cleanly at width 20. Use 'a' so
    // there are no word boundaries to confuse the wrap algorithm — the
    // wrapper falls back to char-wrap and produces three slices of 20
    // chars each at offsets [0,20), [20,40), [40,60).
    const text = "a".repeat(60)

    // Pin the content-rect width to exactly 20 cells. We give the Box an
    // explicit `width={20}` so flexbox sizes the content rect to 20
    // independent of the outer padding/terminal cols. A 30-col terminal
    // leaves room for absolute-position math without forcing borders.
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="paragraph" width={20} selectionIntent={{ from: 5, to: 35 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const target = findFirstWithSelection(root)
    if (!target) throw new Error("test fixture: no selection node found")

    const fragments = findActiveSelectionFragments(root)

    // Three visual lines: [0,20), [20,40), [40,60).
    // Selection [5,35) overlaps line 0 (cols 5..20 → width 15) and line 1
    // (cols 0..15 → width 15). Line 2 starts at offset 40, beyond the
    // selection end, so it contributes nothing.
    expect(fragments).toHaveLength(2)

    const [first, second] = fragments
    expect(first?.height).toBe(1)
    expect(first?.width).toBe(15)
    expect(second?.height).toBe(1)
    expect(second?.width).toBe(15)

    // y advances by 1 per visual line — second fragment is exactly one
    // row below the first.
    expect((second?.y ?? 0) - (first?.y ?? 0)).toBe(1)

    // First fragment's x is offset by 5 cells (selection starts col 5);
    // second fragment's x is the content rect's left edge (the selection
    // continues from col 0 on line 1).
    const content = target.boxRect ?? { x: 0, y: 0, width: 0, height: 0 }
    expect(first?.x).toBe(content.x + 5)
    expect(second?.x).toBe(content.x)
  })

  test("computeSelectionFragments direct compute agrees with tree walk", () => {
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="paragraph" width={20} selectionIntent={{ from: 5, to: 35 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const target = findFirstWithSelection(root)
    if (!target) throw new Error("test fixture: no selection node found")

    const direct = computeSelectionFragments(target)
    const walked = findActiveSelectionFragments(root)
    expect(walked).toHaveLength(direct.length)
    for (let i = 0; i < walked.length; i++) {
      expect(walked[i]).toEqual(direct[i])
    }
  })
})

// ============================================================================
// Multi-line spanning more than 2 visual lines
// ============================================================================

describe("multi-line wrap spanning", () => {
  test("selection across 4 visual lines emits 4 fragments", () => {
    // 80-char paragraph at width 20 wraps to 4 visual lines of 20 chars.
    // Selection [5, 75) covers parts of all four lines.
    const text = "a".repeat(80)
    const render = createRenderer({ cols: 30, rows: 8 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="paragraph" width={20} selectionIntent={{ from: 5, to: 75 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))

    expect(fragments).toHaveLength(4)
    // Line 0: cols 5..20 (width 15) — first partial.
    expect(fragments[0]?.width).toBe(15)
    // Lines 1, 2: full 20-char width.
    expect(fragments[1]?.width).toBe(20)
    expect(fragments[2]?.width).toBe(20)
    // Line 3: cols 0..15 (width 15) — last partial.
    expect(fragments[3]?.width).toBe(15)

    // y monotonically advances.
    for (let i = 1; i < fragments.length; i++) {
      expect((fragments[i]?.y ?? 0) - (fragments[i - 1]?.y ?? 0)).toBe(1)
    }
  })

  test("3 visual lines with full-coverage selection emits 3 fragments", () => {
    // Confirm middle-line full-width emission with a less-edge-y selection.
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="paragraph" width={20} selectionIntent={{ from: 0, to: 60 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))

    expect(fragments).toHaveLength(3)
    expect(fragments[0]?.width).toBe(20)
    expect(fragments[1]?.width).toBe(20)
    expect(fragments[2]?.width).toBe(20)
  })
})

// ============================================================================
// Selection within a single visual line — unchanged behavior
// ============================================================================

describe("single visual line", () => {
  test("selection within one wrap segment still produces one fragment", () => {
    // 60-char text at width 20 → 3 visual lines. Selection [22, 28)
    // sits entirely inside the second visual line ([20, 40)) — should
    // produce ONE fragment of width 6 at y = content.y + 1.
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="paragraph" width={20} selectionIntent={{ from: 22, to: 28 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const target = findFirstWithSelection(root)
    if (!target) throw new Error("test fixture: no selection node found")

    const fragments = findActiveSelectionFragments(root)
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(6)
    expect(fragments[0]?.height).toBe(1)

    const content = target.boxRect ?? { x: 0, y: 0, width: 0, height: 0 }
    // x offset = 22 - 20 = 2 cells into the second visual line.
    expect(fragments[0]?.x).toBe(content.x + 2)
    // y offset = 1 (second visual line).
    expect(fragments[0]?.y).toBe(content.y + 1)
  })

  test("selection fully inside a non-wrapping short text → one fragment", () => {
    // "hello world" at width 20 fits on one line — wrapper returns []
    // (the "no wrap" passthrough) — fragment computation falls through
    // the single-slice path.
    const render = createRenderer({ cols: 40, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="short" width={20} selectionIntent={{ from: 0, to: 5 }}>
            <Text>hello world</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(5)
    expect(fragments[0]?.height).toBe(1)
  })
})

// ============================================================================
// Wrap-boundary edge cases
// ============================================================================

describe("wrap-boundary edge cases", () => {
  test("selection end exactly at wrap boundary emits no zero-width tail", () => {
    // Selection [0, 20) in a 60-char paragraph at width 20 is exactly the
    // first visual line — should emit ONE fragment, not a fragment plus
    // a zero-width artifact at line 1.
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="boundary-end" width={20} selectionIntent={{ from: 0, to: 20 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(20)
    expect(fragments[0]?.height).toBe(1)
  })

  test("selection start exactly at wrap boundary skips empty preamble", () => {
    // Selection [20, 40) is exactly the second visual line.
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="boundary-start" width={20} selectionIntent={{ from: 20, to: 40 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const target = findFirstWithSelection(root)
    if (!target) throw new Error("test fixture: no selection node found")

    const fragments = findActiveSelectionFragments(root)
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(20)

    const content = target.boxRect ?? { x: 0, y: 0, width: 0, height: 0 }
    expect(fragments[0]?.x).toBe(content.x)
    expect(fragments[0]?.y).toBe(content.y + 1)
  })

  test("selection spans wrap boundary with one cell on each side → 2 fragments", () => {
    // Selection [19, 21) is one cell of line 0 + one cell of line 1.
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="straddle" width={20} selectionIntent={{ from: 19, to: 21 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(2)
    expect(fragments[0]?.width).toBe(1) // tail of line 0
    expect(fragments[1]?.width).toBe(1) // head of line 1
  })
})

// ============================================================================
// Fallback test: `\n`-split preserved when no measurer registered
// ============================================================================

describe("fallback: no measurer → `\\n`-only splitting", () => {
  // Drop the registration for these tests; restore in afterEach so other
  // describes run with the registered path.
  beforeEach(() => {
    uninstallTerminalWrapMeasurer()
    expect(getWrapMeasurer()).toBeNull()
  })

  afterEach(() => {
    installTerminalWrapMeasurer()
  })

  test("60-char paragraph at width 20 → ONE wide rect (pre-Option-B behavior)", () => {
    // Without a measurer, `computeSelectionFragments` only splits on
    // `\n`. The 60-char paragraph has no newlines so the whole selection
    // collapses to a single rect of `to - from` width — preserving the
    // exact pre-Option-B behavior bit-for-bit.
    const text = "a".repeat(60)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="paragraph" width={20} selectionIntent={{ from: 5, to: 35 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(1)
    expect(fragments[0]?.width).toBe(30) // 35 - 5 = 30 (one wide rect)
    expect(fragments[0]?.height).toBe(1)
  })

  test("`\\n`-bearing text still produces multi-line fragments without measurer", () => {
    // The Phase-4b multi-line path (split on `\n`) must keep working
    // when the measurer is absent — that's the whole point of the
    // fallback.
    const render = createRenderer({ cols: 40, rows: 6 })

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
    // 3 lines: alpha, beta, gamma. Selection [2, 13):
    //   line 0 "alpha" cols 2..5 → 3 chars
    //   line 1 "beta"  cols 0..4 → 4 chars
    //   line 2 "gamma" cols 0..2 → 2 chars
    expect(fragments).toHaveLength(3)
    expect(fragments[0]?.width).toBe(3)
    expect(fragments[2]?.width).toBe(2)
  })
})

// ============================================================================
// Test isolation: re-arming after a manual setWrapMeasurer(null)
// ============================================================================

describe("test isolation", () => {
  test("setWrapMeasurer(null) → installTerminalWrapMeasurer() restores soft-wrap", () => {
    setWrapMeasurer(null)
    expect(getWrapMeasurer()).toBeNull()

    installTerminalWrapMeasurer()
    expect(getWrapMeasurer()).not.toBeNull()
    expect(isTerminalWrapMeasurerInstalled()).toBe(true)

    // Confirm the registered measurer actually drives geometry by
    // running a smoke render and asserting multi-fragment output.
    const text = "a".repeat(40)
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column">
          <Box id="smoke" width={20} selectionIntent={{ from: 0, to: 40 }}>
            <Text>{text}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const fragments = findActiveSelectionFragments(getRoot(app))
    expect(fragments).toHaveLength(2)
  })
})
