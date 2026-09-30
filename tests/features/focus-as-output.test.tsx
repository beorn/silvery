/**
 * Focus as layout output — Phase 4a invariants.
 *
 * Phase 4a of `km-silvery.view-as-layout-output` makes focus a layout output:
 * `<Box focused={…}>` writes the node's id into `LayoutSignals.focusedNodeId`,
 * `findActiveFocusedNodeId(root)` is the tree-walk lookup the focus-renderer
 * consumes. This file pins the invariants for the new path:
 *
 *  1. **Precedence** — deepest visible focused declarer in paint order wins.
 *     If multiple Boxes have `focused === true`, the post-order walk picks
 *     the deepest. Same shape as cursor invariant 1 (without the
 *     focused-editable tiebreak — focus has no equivalent disambiguator).
 *  2. **Recompute on prop change** — `focusedNodeId` updates when only
 *     `props.focused` toggles, even when no rect changed. Mirrors cursor
 *     invariant 2.
 *  3. **Cleanup on unmount** — when the owning AgNode unmounts, no stale
 *     id survives the next layout pass. Conditional mount/unmount cycles
 *     produce exactly one focused id at any frame (or null).
 *  4. **Identity** — the signal value is `id` if present, else `testID`,
 *     else the sentinel `"__focused__"`. Prop-driven apps that need stable
 *     focus identity should set one of those props.
 *  5. **No focused declarer → null** — apps that don't opt into the
 *     prop-driven path see `findActiveFocusedNodeId(root) === null` (the
 *     legacy `useFocus`/FocusManager path is independent and not exercised
 *     here).
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
  computeFocusedNodeId,
  findActiveFocusedNodeId,
  getLayoutSignals,
} from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Helpers
// ============================================================================

function getRoot(app: ReturnType<ReturnType<typeof createRenderer>>): AgNode {
  return (app as unknown as { getContainer: () => AgNode }).getContainer()
}

function findFirstFocused(node: AgNode): AgNode | null {
  const props = node.props as { focused?: boolean } | undefined
  if (props?.focused) return node
  for (const child of node.children) {
    const hit = findFirstFocused(child)
    if (hit) return hit
  }
  return null
}

// ============================================================================
// Invariant 1: Precedence — deepest in paint order wins
// ============================================================================

describe("invariant 1: focus precedence", () => {
  test("single focused declarer → its id wins", () => {
    const render = createRenderer({ cols: 40, rows: 8 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="alpha" focused={true}>
            <Text>alpha</Text>
          </Box>
          <Box id="beta">
            <Text>beta</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const id = findActiveFocusedNodeId(getRoot(app))
    expect(id).toBe("alpha")
  })

  test("two focused declarers → deeper wins", () => {
    const render = createRenderer({ cols: 50, rows: 12 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          {/* Shallow declarer */}
          <Box id="shallow" focused={true}>
            <Text>shallow</Text>
          </Box>
          {/* Deeper declarer wraps another focused box */}
          <Box flexDirection="column" padding={1}>
            <Box id="deep" focused={true}>
              <Text>deep</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const id = findActiveFocusedNodeId(getRoot(app))
    expect(id).toBe("deep")
  })

  test("two siblings both focused → later sibling wins (paint order)", () => {
    const render = createRenderer({ cols: 50, rows: 8 })

    function App() {
      return (
        <Box flexDirection="row" padding={1}>
          <Box id="left" focused={true}>
            <Text>left</Text>
          </Box>
          <Box id="right" focused={true}>
            <Text>right</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const id = findActiveFocusedNodeId(getRoot(app))
    // Post-order walk visits children in declared order. Last-write-wins →
    // the later sibling overwrites the earlier one.
    expect(id).toBe("right")
  })

  test("no focused declarers → null", () => {
    const render = createRenderer({ cols: 40, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="a">
            <Text>a</Text>
          </Box>
          <Box id="b">
            <Text>b</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBeNull()
  })
})

// ============================================================================
// Invariant 2: Recompute on prop change
// ============================================================================

describe("invariant 2: focusedNodeId recomputes on focused prop change", () => {
  test("toggling focused on a single Box updates the signal without rect change", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App({ focused }: { focused: boolean }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="target" width={20} height={2} focused={focused}>
            <Text>target</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App focused={false} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBeNull()

    app.rerender(<App focused={true} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("target")

    app.rerender(<App focused={false} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBeNull()
  })

  test("changing the focused box id while focused stays true updates the signal", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App({ id }: { id: string }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id={id} width={20} height={2} focused={true}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App id="alpha" />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("alpha")

    // Same Box, same layout — only the id changed. Signal must update.
    app.rerender(<App id="beta" />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("beta")
  })

  test("per-node signal reflects its own focused state across rerenders", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App({ focused }: { focused: boolean }) {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="probe" focused={focused}>
            <Text>probe</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App focused={true} />)
    const root = getRoot(app)
    const node = findFirstFocused(root)
    if (!node) throw new Error("test fixture: no focused node found")
    const sig = getLayoutSignals(node)
    expect(sig.focusedNodeId()).toBe("probe")

    app.rerender(<App focused={false} />)
    // After rerender, the focused-prop is gone; the per-node signal must
    // clear back to null even though the AgNode itself still exists.
    // findFirstFocused now walks again and may return null:
    const stillFocused = findFirstFocused(getRoot(app))
    expect(stillFocused).toBeNull()
    // The previously-allocated signal on the same node clears to null.
    expect(sig.focusedNodeId()).toBeNull()
  })

  // #26660: the same invariant in the live runtime, with a root the size of the
  // terminal. A focused-only change leaves every Flexily node clean, and the
  // layout-on-demand gate used to skip the notify step that writes the signal.
  // The createRenderer rows above relay out on every frame (content-sized root).
  test("live runtime: a focused-only change clears the node's focusedNodeId signal", async () => {
    using term = createTermless({ cols: 30, rows: 6 })

    function App(): React.ReactElement {
      const [focused, setFocused] = useState(true)
      useInput((input) => {
        if (input === "b") setFocused(false)
      })
      return (
        <Box width={30} height={6} flexDirection="column" padding={1}>
          <Box id="target" width={20} height={2} focused={focused}>
            <Text>target</Text>
          </Box>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    await handle.waitForLayoutStable()
    const node = findFirstFocused(handle.root)
    if (!node) throw new Error("test fixture: no focused node found")
    const sig = getLayoutSignals(node)
    expect(sig.focusedNodeId()).toBe("target")

    await handle.press("b")
    await handle.waitForLayoutStable()
    expect(sig.focusedNodeId(), "blurred Box clears its signal").toBeNull()

    handle.unmount()
  })
})

// ============================================================================
// Invariant 3: Cleanup on unmount
// ============================================================================

describe("invariant 3: stale-cleanup on unmount", () => {
  test("conditional mount/unmount cycle leaves no ghost focus", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ phase }: { phase: 0 | 1 | 2 | 3 }) {
      return (
        <Box flexDirection="column" padding={1}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Box key={i}>
              <Text>row {i}</Text>
            </Box>
          ))}
          {phase === 1 || phase === 3 ? (
            <Box id="ephemeral" focused={true}>
              <Text>focus me</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    const app = render(<App phase={0} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBeNull()

    app.rerender(<App phase={1} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("ephemeral")

    app.rerender(<App phase={2} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBeNull()

    // Re-mount: must produce a fresh focus, not a stale one held by a
    // previously-allocated signal map entry.
    app.rerender(<App phase={3} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("ephemeral")

    app.rerender(<App phase={0} />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBeNull()
  })

  test("only currently-mounted focused nodes contribute to the lookup", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ which }: { which: "a" | "b" }) {
      return (
        <Box flexDirection="column" padding={1}>
          {which === "a" ? (
            <Box id="alpha" focused={true}>
              <Text>A</Text>
            </Box>
          ) : (
            <Box id="beta" focused={true}>
              <Text>B</Text>
            </Box>
          )}
        </Box>
      )
    }

    const app = render(<App which="a" />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("alpha")

    app.rerender(<App which="b" />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("beta")

    app.rerender(<App which="a" />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("alpha")
  })
})

// ============================================================================
// Invariant 4: Identity priority — id > testID > sentinel
// ============================================================================

describe("invariant 4: focused-id identity priority", () => {
  test("id wins over testID", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="my-id" testID="my-test-id" focused={true}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("my-id")
  })

  test("testID is used when id is absent", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box testID="only-test-id" focused={true}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    expect(findActiveFocusedNodeId(getRoot(app))).toBe("only-test-id")
  })

  test("sentinel is returned for anonymous focused declarer", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box focused={true}>
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    // Anonymous focused declarer still produces a non-null signal — apps
    // that need stable identity should set id or testID. The sentinel value
    // is implementation-defined; assert non-null only.
    const id = findActiveFocusedNodeId(getRoot(app))
    expect(id).not.toBeNull()
    expect(typeof id).toBe("string")
  })
})

// ============================================================================
// Invariant 5: Direct compute helper agrees with tree walk
// ============================================================================

describe("invariant 5: computeFocusedNodeId matches tree-walk lookup", () => {
  test("single-node compute equals walk result", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="solo" focused={true}>
            <Text>solo</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const focusedNode = findFirstFocused(root)
    if (!focusedNode) throw new Error("test fixture: no focused node")
    expect(computeFocusedNodeId(focusedNode)).toBe(findActiveFocusedNodeId(root))
  })

  test("compute on a non-focused node returns null", () => {
    const render = createRenderer({ cols: 30, rows: 6 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box id="not-focused">
            <Text>x</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App />)
    const root = getRoot(app)
    const target = root.children[0]?.children[0]
    if (!target) throw new Error("test fixture: target node missing")
    expect(computeFocusedNodeId(target)).toBeNull()
  })
})
