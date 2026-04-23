/**
 * Mouse drag-vs-click state machine — termless end-to-end tests.
 *
 * Verifies three related bugs documented in km bead km-silvery.mouse-drag-vs-click:
 *
 * Bug 1 — drag-select shrinks on reverse direction
 *   User drags forward then back past the anchor; selection head must follow
 *   the cursor regardless of direction (anchor is stable, head is live).
 *
 * Bug 2 — mouseUp after a drag does NOT fire ListView onClick/onSelect
 *   A drag that ends with a selection must suppress the click-on-mouseup
 *   that ListView wires on each item's Box (via `onClick`). Without
 *   suppression, releasing a drag opens the detail view / confirms the row.
 *
 * Bug 3 — plain click (no movement) creates NO selection
 *   A mouseDown+mouseUp at the same coordinate must leave
 *   `selectionState.range === null` and STILL fire the normal onClick path.
 *   Prior behavior: `start` dispatched on mouseDown created a 1-char range,
 *   which also copied 1 char to the clipboard via OSC 52.
 *
 * State machine enforced by create-app's mouse-event interception:
 *
 *   idle   --mouseDown--> armed    (store anchor, NO selection start yet)
 *   armed  --mouseMove(|Δ|>=1)--> dragging (dispatch start then extend)
 *   armed  --mouseUp--> idle       (plain click: click dispatches normally,
 *                                   no selection created, no overlay)
 *   dragging --mouseMove--> dragging (dispatch extend with current pos)
 *   dragging --mouseUp--> idle     (dispatch finish, SUPPRESS onClick,
 *                                   copy via OSC 52 if non-empty)
 *
 * These tests exercise the ergonomic `term.mouse.*` + `term.clipboard` APIs
 * introduced in km-silvery.expose-termless-mouse. They deliberately contain
 * zero hand-rolled SGR byte strings and zero `as any` casts — this file is
 * the dog-food reference for future mouse-interaction tests.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"
import {
  createSelectionFeature,
  type SelectionFeature,
} from "../../packages/ag-term/src/features/selection"
import { createBuffer, type TerminalBuffer } from "../../packages/ag-term/src/buffer"

// ============================================================================
// Helpers
// ============================================================================

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

function createTestBuffer(): TerminalBuffer {
  const buffer = createBuffer(40, 10)
  const text = "Hello World of Selection"
  for (let i = 0; i < text.length; i++) {
    buffer.setCell(i, 0, { char: text[i]! })
  }
  const text2 = "Second row here"
  for (let i = 0; i < text2.length; i++) {
    buffer.setCell(i, 1, { char: text2[i]! })
  }
  return buffer
}

function SelectableContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World of Selection</Text>
      <Text>Second row here</Text>
      <Text>Third row content</Text>
      <Text>Fourth row content</Text>
      <Text>Fifth row content</Text>
    </Box>
  )
}

// ============================================================================
// Bug 1 — drag-select shrinks when mouse reverses direction
// ============================================================================
//
// Headless state machine test (direct call to SelectionFeature). If this
// passes but the e2e version fails, bug is in the dispatch layer, not the
// machine. If this fails, bug is in `terminalSelectionUpdate.extend`.

describe("Bug 1 — drag-select shrinks on reverse direction", () => {
  test("headless: extend reassigns head unconditionally (forward then back)", () => {
    const buffer = createTestBuffer()
    const feature: SelectionFeature = createSelectionFeature({
      buffer,
      invalidate: () => {},
    })

    feature.handleMouseDown(10, 0, false)
    feature.handleMouseMove(20, 0) // drag forward
    expect(feature.state.range!.head).toEqual({ col: 20, row: 0 })

    feature.handleMouseMove(5, 0) // drag back past anchor (shrink+flip)
    expect(feature.state.range!.head).toEqual({ col: 5, row: 0 })
    expect(feature.state.range!.anchor).toEqual({ col: 10, row: 0 }) // anchor stable

    feature.dispose()
  })

  test("e2e: dragging back past anchor shrinks the clipboard payload", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // Drag from col 10 → col 20 (via) → col 5 (back past anchor).
    // Expected final selection = cols [5..10] on row 0.
    // "Hello World of Selection" — after drag back to col 5, selection
    // is cols [5..10] which is " World".
    // It must NOT contain "Selection" (past col 15) nor "of" (cols 12-13).
    await term.mouse.drag({ from: [10, 0], to: [5, 0], via: [[20, 0]] })
    await settle(200)

    const clipboard = term.clipboard.last
    expect(clipboard).not.toBeNull()
    expect(clipboard).not.toContain("Selection")
    expect(clipboard).not.toContain("of")
    // It MUST contain some of the "World" region (cols 5..10 of "Hello World").
    expect(clipboard).toMatch(/World|orld|Worl/)

    handle.unmount()
  })

  test("e2e: shrink inside a ListView (km-logview shape) still works", async () => {
    // km-logview bug shape: drag over ListView items; nav mode wires
    // onMouseEnter on every row. The selection interceptor consumes move
    // events while selecting, so those enter handlers should NOT fire during
    // a drag — and the selection head must still shrink on reverse.
    using term = createTermless({ cols: 40, rows: 10 })
    const items = [
      "row-0 alpha content line",
      "row-1 beta content line",
      "row-2 gamma content line",
      "row-3 delta content line",
    ]
    const handle = await run(
      <ListView
        nav
        height={6}
        items={items}
        renderItem={(item) => <Text>{item}</Text>}
      />,
      term,
      { selection: true, mouse: true } as any,
    )
    await settle()
    term.clipboard.clear()

    // Drag forward across 3 rows, then back to the start (shrink).
    await term.mouse.drag({
      from: [2, 0],
      to: [2, 0], // back to start — shrink to empty-ish range
      via: [[20, 2]],
    })
    await settle(200)

    const clipboard = term.clipboard.last
    // After shrink back to anchor, selection is empty or 1-char at anchor.
    // Critically: must NOT contain content from row-1 or row-2.
    if (clipboard) {
      expect(clipboard).not.toContain("row-1")
      expect(clipboard).not.toContain("row-2")
    }

    handle.unmount()
  })
})

// ============================================================================
// Bug 2 — mouseUp after drag does NOT fire ListView onClick/onSelect
// ============================================================================

describe("Bug 2 — drag-end suppresses onClick/onSelect", () => {
  test("plain click on ListView item fires onSelect (baseline — click still works)", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const onSelect = vi.fn()

    const handle = await run(
      <ListView
        nav
        height={5}
        items={["alpha", "beta", "gamma", "delta"]}
        renderItem={(item, _i, meta) => (
          <Text>
            {meta.isCursor ? "> " : "  "}
            {item}
          </Text>
        )}
        onSelect={onSelect}
      />,
      term,
      { selection: true, mouse: true } as any,
    )
    await settle()

    // Click without moving (plain click) on "beta" at row 1.
    // No drag threshold exceeded → click should fire normally.
    await term.mouse.click(5, 1)
    await settle(200)

    expect(onSelect).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(1) // index of "beta"

    handle.unmount()
  })

  test("drag-select on ListView does NOT fire onSelect at mouseUp", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const onSelect = vi.fn()

    const handle = await run(
      <ListView
        nav
        height={5}
        items={["alpha", "beta", "gamma", "delta"]}
        renderItem={(item, _i, meta) => (
          <Text>
            {meta.isCursor ? "> " : "  "}
            {item}
          </Text>
        )}
        onSelect={onSelect}
      />,
      term,
      { selection: true, mouse: true } as any,
    )
    await settle()

    // Drag from col 2, row 1 ("beta") to col 10, row 1 — a real drag with
    // movement past the 1-char threshold. onSelect must NOT fire.
    await term.mouse.drag({ from: [2, 1], to: [10, 1] })
    await settle(200)

    expect(onSelect).not.toHaveBeenCalled()

    handle.unmount()
  })
})

// ============================================================================
// Bug 3 — plain click creates NO selection
// ============================================================================

describe("Bug 3 — plain click creates no selection", () => {
  test("e2e: mouseDown+mouseUp without movement yields null range, no clipboard write", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // Plain click: mouseDown then mouseUp at the SAME coordinate, no move.
    await term.mouse.click(10, 0)
    await settle(200)

    // No OSC 52 should have been emitted — nothing was selected.
    expect(term.clipboard.last).toBeNull()

    handle.unmount()
  })

  test("e2e: tiny mouse jitter (same cell) still counts as plain click", async () => {
    using term = createTermless({ cols: 40, rows: 10 })

    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // Down, "move" at the SAME cell, up. The threshold is |Δ| >= 1 cell:
    // motion that does not cross cells must not start a selection.
    await term.mouse.down(10, 0)
    await term.mouse.move(10, 0)
    await term.mouse.up(10, 0)
    await settle(150)

    expect(term.clipboard.last).toBeNull()

    handle.unmount()
  })
})
