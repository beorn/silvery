/**
 * Incremental Rendering: Absolute Position Repaint Bug
 *
 * Bug: km-inkx.abs-pos-repaint
 *
 * When board content changes (e.g., typing in search dialog), absolute-positioned
 * dialog elements with unchanged React content don't get repainted. All dirty flags
 * are false on the dialog's title node, so the incremental fast-path skips it.
 * INKX_STRICT=1 confirms: IncrementalRenderMismatchError at the dialog title position.
 *
 * Root cause hypothesis: content-phase.ts renderNormalChildren uses anySiblingWasDirty
 * to force-repaint absolute children that come AFTER dirty siblings. But this misses:
 *   (a) Absolute children that come BEFORE dirty siblings in the children array
 *   (b) Cases where the dirty sibling's rendering overwrites pixels at the absolute
 *       child's position in the cloned buffer
 *
 * The anySiblingWasDirty flag is set AFTER processing each child. If the absolute
 * child is processed first (earlier in the children array) and the dirty sibling
 * comes later, the flag is still false when the absolute child is checked. The
 * absolute child gets skipped by the fast-path, but then the dirty sibling renders
 * and overwrites the absolute child's pixels in the buffer.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { bufferToText } from "../src/buffer.js"
import { createRenderer } from "../src/testing/index.js"
import {
  compareBuffers,
  formatMismatch,
} from "../src/testing/compare-buffers.js"

const render = createRenderer({ incremental: true })

/**
 * Helper: compare incremental vs fresh buffer and fail with detailed mismatch info.
 */
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

describe("Incremental rendering: absolute-positioned elements", () => {
  /**
   * CORE BUG: Absolute child listed BEFORE dirty normal-flow sibling.
   *
   * The absolute child processes first in the children loop. At that point,
   * anySiblingWasDirty=false, so forceRepaint=false. The absolute child's
   * dirty flags are all clean (nothing changed in the dialog), so the fast-path
   * skips it entirely. Then the dirty normal-flow sibling renders, potentially
   * overwriting pixels at the absolute child's position.
   *
   * This triggers IncrementalRenderMismatchError because the incremental render
   * skips the absolute child (keeping stale/overwritten pixels) while the fresh
   * render paints everything from scratch.
   */
  test("BUG: absolute child before dirty sibling — anySiblingWasDirty misses it", () => {
    function App({ content }: { content: string }) {
      return (
        <Box width={40} height={10} flexDirection="column">
          {/* Absolute dialog listed FIRST in children */}
          <Box position="absolute" width={30} height={3} backgroundColor="black">
            <Text>Overlay Title</Text>
          </Box>
          {/* Normal-flow content listed SECOND — changes each render */}
          <Box flexGrow={1}>
            <Text>{content}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App content="First version" />)

    // Rerender with changed content — the dirty sibling comes AFTER the abs child
    app.rerender(<App content="Second version" />)

    // Incremental vs fresh should match
    assertBuffersMatch(app)
  })

  /**
   * Same bug but with a deeper subtree: the absolute child's grandchildren
   * should also be repainted when their pixels were overwritten.
   */
  test("BUG: nested content in absolute child before dirty sibling", () => {
    function App({ content }: { content: string }) {
      return (
        <Box width={40} height={10} flexDirection="column">
          {/* Absolute dialog with nested content, listed FIRST */}
          <Box position="absolute" width={30} height={5} backgroundColor="black">
            <Box flexDirection="column">
              <Text bold>Dialog Header</Text>
              <Text>Static body line 1</Text>
              <Text>Static body line 2</Text>
            </Box>
          </Box>
          {/* Normal-flow content listed SECOND */}
          <Box flexGrow={1} flexDirection="column">
            <Text>{content}</Text>
            <Text>Board line 2</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App content="Board A" />)
    app.rerender(<App content="Board B" />)
    assertBuffersMatch(app)
  })

  /**
   * The typical dialog pattern: dialog after content (should work with existing
   * anySiblingWasDirty mechanism).
   */
  test("absolute dialog AFTER dirty sibling — anySiblingWasDirty handles it", () => {
    // Dialog uses marginTop to position below board content row 0
    // so both are visible in the output
    function App({ content }: { content: string }) {
      return (
        <Box width={60} height={15} flexDirection="column">
          {/* Board content — changes */}
          <Box flexGrow={1} flexDirection="column">
            <Text>{content}</Text>
            <Text>Board line 2</Text>
            <Text>Board line 3</Text>
          </Box>
          {/* Absolute dialog listed AFTER board, with marginTop to offset */}
          <Box
            position="absolute"
            marginLeft={10}
            marginTop={3}
            width={40}
            height={5}
            backgroundColor="black"
          >
            <Box flexDirection="column">
              <Text>Dialog Title</Text>
              <Text>Dialog body</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App content="Board line 1 - version A" />)
    expect(app.text).toContain("Dialog Title")
    expect(app.text).toContain("version A")

    app.rerender(<App content="Board line 1 - version B" />)
    expect(app.text).toContain("Dialog Title")
    expect(app.text).toContain("version B")

    assertBuffersMatch(app)
  })

  /**
   * Only dialog changes (e.g., typing in dialog text input), board is static.
   * The dialog title (static child) should be preserved because nothing
   * overwrites it — the board didn't re-render.
   */
  test("dialog title preserved when only dialog input changes (board static)", () => {
    function App({ inputText }: { inputText: string }) {
      return (
        <Box width={40} height={10} flexDirection="column">
          {/* Static board */}
          <Box flexGrow={1}>
            <Text>Static board</Text>
          </Box>
          {/* Absolute dialog with static title + changing input */}
          <Box position="absolute" width={30} height={5} backgroundColor="black">
            <Box flexDirection="column">
              <Text>Search Title</Text>
              <Text>{inputText}</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App inputText="" />)
    expect(app.text).toContain("Search Title")

    app.rerender(<App inputText="hello" />)
    expect(app.text).toContain("Search Title")
    expect(app.text).toContain("hello")

    assertBuffersMatch(app)
  })

  /**
   * Both board and dialog change simultaneously (the real search dialog scenario).
   * Board content changes (filtered results) AND dialog input changes.
   * The dialog title is static.
   *
   * The dialog is AFTER the board in children order, so anySiblingWasDirty
   * should catch it.
   */
  test("both board and dialog change — dialog after board in children order", () => {
    function App({ query }: { query: string }) {
      const items = ["alpha", "bravo", "charlie", "delta", "echo"]
      const filtered = query
        ? items.filter((i) => i.includes(query))
        : items
      return (
        <Box width={60} height={15} flexDirection="column">
          {/* Board content — changes based on search */}
          <Box flexGrow={1} flexDirection="column">
            {filtered.map((item) => (
              <Text key={item}>{item}</Text>
            ))}
          </Box>
          {/* Search dialog overlay with marginTop to not fully occlude board */}
          <Box
            position="absolute"
            marginLeft={10}
            marginTop={5}
            width={40}
            height={5}
            backgroundColor="black"
          >
            <Box flexDirection="column">
              <Text bold>Search Dialog</Text>
              <Text>Query: {query}</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App query="" />)
    expect(app.text).toContain("Search Dialog")
    expect(app.text).toContain("alpha")

    app.rerender(<App query="a" />)
    expect(app.text).toContain("Search Dialog")
    expect(app.text).toContain("Query: a")

    assertBuffersMatch(app)
  })

  /**
   * ModalDialog pattern: bordered dialog with bg, positioned with margins.
   * Normal-flow content changes underneath. Dialog is after content.
   */
  test("bordered ModalDialog-style: title repainted when board changes", () => {
    function App({ content }: { content: string }) {
      return (
        <Box width={60} height={15} flexDirection="column">
          <Box flexGrow={1} flexDirection="column">
            <Text>{content}</Text>
            <Text>Line 2</Text>
            <Text>Line 3</Text>
            <Text>Line 4</Text>
            <Text>Line 5</Text>
          </Box>
          <Box
            position="absolute"
            marginLeft={10}
            marginTop={3}
            width={40}
            height={8}
          >
            <Box
              flexDirection="column"
              borderStyle="double"
              borderColor="cyan"
              backgroundColor="black"
              paddingX={2}
              paddingY={1}
              width={40}
              height={8}
            >
              <Text color="cyan" bold>
                Dialog Title
              </Text>
              <Text> </Text>
              <Text>Dialog content</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App content="Board line 1 - version A" />)
    expect(app.text).toContain("Dialog Title")
    expect(app.text).toContain("version A")

    app.rerender(<App content="Board line 1 - version B" />)
    expect(app.text).toContain("Dialog Title")
    expect(app.text).toContain("version B")

    assertBuffersMatch(app)
  })

  /**
   * Multiple re-renders with dialog after board content.
   * Verifies incremental correctness over several frames.
   */
  test("multiple re-renders: dialog after board — incremental matches fresh", () => {
    function App({ n }: { n: number }) {
      return (
        <Box width={60} height={15} flexDirection="column">
          <Box flexGrow={1} flexDirection="column">
            <Text>Counter: {n}</Text>
            <Text>Details for item {n}</Text>
          </Box>
          <Box
            position="absolute"
            marginLeft={10}
            marginTop={3}
            width={30}
            height={3}
            backgroundColor="black"
          >
            <Text>Persistent Overlay</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App n={0} />)
    expect(app.text).toContain("Persistent Overlay")
    expect(app.text).toContain("Counter: 0")

    for (let i = 1; i <= 5; i++) {
      app.rerender(<App n={i} />)
      expect(app.text).toContain("Persistent Overlay")
      expect(app.text).toContain(`Counter: ${i}`)
      assertBuffersMatch(app)
    }
  })

  /**
   * Absolute dialog WITHOUT backgroundColor — no bg fill to cover board pixels.
   * When board content changes at the dialog position, the dialog's children
   * must repaint to restore their text on top of the new board content.
   */
  test("absolute dialog WITHOUT bg: text repainted when board changes", () => {
    function App({ content }: { content: string }) {
      return (
        <Box width={60} height={10} flexDirection="column">
          <Box flexGrow={1} flexDirection="column">
            <Text>{content}</Text>
          </Box>
          <Box position="absolute" marginTop={0} width={20} height={1}>
            <Text>NoBG-Dialog</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App content="Board v1 with long text that spans width" />)

    app.rerender(
      <App content="Board v2 with different long text content here" />,
    )

    assertBuffersMatch(app)
  })

  /**
   * Dialog at same y=0 as board, overlapping pixels.
   * Board renders first (normal flow), dialog renders second (absolute).
   * Dialog should paint on top in both fresh and incremental.
   */
  test("dialog title at same row as board content — incremental matches fresh", () => {
    function App({ line1 }: { line1: string }) {
      return (
        <Box width={40} height={6}>
          {/* Full-width board */}
          <Box flexGrow={1} flexDirection="column" width={40}>
            <Text>{line1}</Text>
            <Text>Board line 2</Text>
          </Box>
          {/* Dialog at top-left, overlapping board line 1 */}
          <Box position="absolute" width={20} height={3} backgroundColor="black">
            <Box flexDirection="column">
              <Text>TITLE</Text>
              <Text>body</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(
      <App line1="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" />,
    )
    expect(app.text).toContain("TITLE")

    app.rerender(<App line1="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" />)
    expect(app.text).toContain("TITLE")

    assertBuffersMatch(app)
  })
})
