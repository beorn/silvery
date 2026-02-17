/**
 * Regression tests for border toggle (add/remove) bugs.
 *
 * Three bugs fixed in the reconciler when dynamically adding/removing borders:
 *
 * Bug 1 (applyBoxProps): Border widths in Yoga/Flexx weren't reset to 0 when
 * borderStyle was removed. The layout engine retained stale border widths,
 * causing content area to shrink even without a visible border.
 *
 * Bug 2 (host-config + helpers): Stale border characters persisted in
 * incremental rendering after border removal. paintDirty wasn't set for
 * borderStyle changes, and bgDirty wasn't set for border removal, so the
 * content phase skipped clearing the old border region.
 *
 * Bug 3 (applySpacing): Padding/margin values in Yoga/Flexx weren't reset
 * when props were removed. Switching from {paddingLeft: 1} to {borderStyle}
 * retained both border=1 AND padding=1, doubling the inset.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { bufferToText } from "../src/buffer.js"
import { createRenderer } from "../src/testing/index.js"
import { compareBuffers, formatMismatch } from "../src/testing/compare-buffers.js"

const render = createRenderer({ incremental: true })

function assertBuffersMatch(app: ReturnType<typeof render>): void {
  const fresh = app.freshRender()
  const current = app.lastBuffer()!
  const mismatch = compareBuffers(current, fresh)
  if (mismatch) {
    const msg = formatMismatch(mismatch, {
      incrementalText: bufferToText(current),
      freshText: bufferToText(fresh),
    })
    expect.fail(`Incremental/fresh mismatch:\n${msg}`)
  }
}

describe("Border toggle regression: add/remove borderStyle", () => {
  /**
   * Bug 1 regression: border widths must reset to 0 when borderStyle removed.
   * Without the fix, removing borderStyle leaves stale border widths in the
   * layout engine, shrinking the content area.
   */
  test("removing borderStyle resets layout dimensions to match fresh render", () => {
    function App({ showBorder }: { showBorder: boolean }) {
      return (
        <Box width={40} height={10}>
          <Box
            flexDirection="column"
            width={38}
            {...(showBorder
              ? { borderStyle: "round" as const, borderColor: "yellow" }
              : {})}
          >
            <Text>Content line one</Text>
            <Text>Content line two</Text>
          </Box>
        </Box>
      )
    }

    // Start with border
    const app = render(<App showBorder={true} />)
    expect(app.text).toContain("Content line one")
    assertBuffersMatch(app)

    // Remove border — layout should expand content area
    app.rerender(<App showBorder={false} />)
    assertBuffersMatch(app)

    // Add border back
    app.rerender(<App showBorder={true} />)
    assertBuffersMatch(app)

    // Remove again
    app.rerender(<App showBorder={false} />)
    assertBuffersMatch(app)
  })

  /**
   * Bug 2 regression: stale border characters must be cleared on removal.
   * Without the fix, border chars (╭╮╰╯│─) persist in the cloned buffer
   * because renderBox doesn't draw anything when borderStyle is falsy.
   */
  test("border characters are cleared when borderStyle is removed", () => {
    function App({ showBorder }: { showBorder: boolean }) {
      return (
        <Box width={30} height={6}>
          <Box
            flexDirection="column"
            width={28}
            {...(showBorder
              ? { borderStyle: "round" as const, borderColor: "cyan" }
              : {})}
          >
            <Text>Hello world</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App showBorder={true} />)
    // Verify border characters are present
    expect(app.text).toContain("╭")
    expect(app.text).toContain("╰")

    // Remove border — border chars must disappear
    app.rerender(<App showBorder={false} />)
    expect(app.text).not.toContain("╭")
    expect(app.text).not.toContain("╰")
    expect(app.text).not.toContain("│")
    assertBuffersMatch(app)
  })

  /**
   * Bug 3 regression: padding must reset when switching to border.
   * Without the fix, switching from {paddingLeft: 1} to {borderStyle: "round"}
   * retains both border=1 AND padding=1, creating a 2-cell inset instead of 1.
   */
  test("switching from padding to border resets padding in layout", () => {
    function App({ selected }: { selected: boolean }) {
      return (
        <Box width={30} height={6}>
          <Box
            flexDirection="column"
            width={28}
            {...(selected
              ? { borderStyle: "round" as const, borderColor: "yellow" }
              : { paddingLeft: 1, paddingRight: 1, paddingTop: 1 })}
          >
            <Text>Content here</Text>
          </Box>
        </Box>
      )
    }

    // Start unselected (padding)
    const app = render(<App selected={false} />)
    expect(app.text).toContain("Content here")
    assertBuffersMatch(app)

    // Select (border replaces padding)
    app.rerender(<App selected={true} />)
    expect(app.text).toContain("Content here")
    assertBuffersMatch(app)

    // Back to unselected (padding replaces border)
    app.rerender(<App selected={false} />)
    expect(app.text).toContain("Content here")
    assertBuffersMatch(app)
  })

  /**
   * Combined regression: full padding↔border swap cycle.
   * Simulates the km-tui body card pattern: paddingTop for spacing,
   * full border when selected, cycling through multiple states.
   */
  test("padding↔border swap: multiple cycles match fresh render", () => {
    function Card({ selected, width }: { selected: boolean; width: number }) {
      return (
        <Box
          flexDirection="column"
          width={width}
          {...(selected
            ? { borderStyle: "round" as const, borderColor: "yellow" }
            : { paddingLeft: 1, paddingRight: 1, paddingTop: 1 })}
        >
          <Text>Card content</Text>
          <Text> Sub-item 1</Text>
          <Text> Sub-item 2</Text>
        </Box>
      )
    }

    function App({ cursor }: { cursor: number }) {
      return (
        <Box width={40} height={30} flexDirection="column">
          <Card selected={cursor === 0} width={38} />
          <Card selected={cursor === 1} width={38} />
          <Card selected={cursor === 2} width={38} />
        </Box>
      )
    }

    const app = render(<App cursor={0} />)
    assertBuffersMatch(app)

    // Cycle cursor through all cards multiple times
    for (const c of [1, 2, 0, 1, 0, 2, 1, 0]) {
      app.rerender(<App cursor={c} />)
      assertBuffersMatch(app)
    }
  })

  /**
   * Regression: margin values must reset when props change.
   * Switching from marginBottom=1 to marginBottom=0 (or undefined)
   * must actually clear the margin in the layout engine.
   */
  test("margin resets when toggling between states", () => {
    function App({ expanded }: { expanded: boolean }) {
      return (
        <Box width={30} height={15} flexDirection="column">
          <Box
            flexDirection="column"
            width={28}
            {...(expanded ? { marginBottom: 2 } : {})}
          >
            <Text>Block A</Text>
          </Box>
          <Box flexDirection="column" width={28}>
            <Text>Block B</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App expanded={false} />)
    assertBuffersMatch(app)

    // Add margin
    app.rerender(<App expanded={true} />)
    assertBuffersMatch(app)

    // Remove margin — must actually reset
    app.rerender(<App expanded={false} />)
    assertBuffersMatch(app)
  })

  /**
   * Regression: per-edge padding correctly applies and resets.
   * Tests the CSS-like specificity cascade: top ?? yy ?? all ?? 0
   */
  test("per-edge padding specificity cascade", () => {
    function App({ mode }: { mode: "all" | "xy" | "edges" | "none" }) {
      const padProps =
        mode === "all"
          ? { padding: 1 }
          : mode === "xy"
            ? { paddingX: 1, paddingY: 2 }
            : mode === "edges"
              ? { paddingTop: 1, paddingBottom: 2, paddingLeft: 3, paddingRight: 1 }
              : {}

      return (
        <Box width={40} height={15}>
          <Box flexDirection="column" width={38} {...padProps}>
            <Text>Padded content</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App mode="none" />)
    assertBuffersMatch(app)

    for (const mode of ["all", "xy", "edges", "none", "edges", "all", "none"] as const) {
      app.rerender(<App mode={mode} />)
      assertBuffersMatch(app)
    }
  })
})
