/**
 * SCR2 — silvery measurement + mouse-event subscription cluster (DOCUMENTING TESTS).
 *
 * User-reported four-symptom cluster — investigation result:
 *
 *   1. Scroll doesn't work on startup → wheel works at first paint in
 *      minimal harness; user-perceived as "scrollbar invisible" =
 *      symptom 2.
 *   2. Scrollbar invisible until first prompt → REPRODUCES (this file)
 *      and is the root user complaint. The Scrollbar's `visible` prop
 *      is gated on `physics.isScrolling`, which is false until the
 *      user wheel-scrolls, presses arrow keys, or items append (via
 *      flashScrollbar() at line 2000 of ListView.tsx). On startup with
 *      a list whose viewport is overflowing, no chrome appears.
 *   3. Resize-up doesn't repaint → does NOT reproduce in
 *      createRenderer (resize-from-10-to-30-rows correctly paints
 *      bottom rows). Likely needs the silvercode tree shape (composer
 *      overlay, paneGrid layout, real ChatBlockList state) to bite —
 *      filing as silvercode-side investigation rather than a vendor
 *      bug.
 *   4. Hover stuck on multiple adjacent elements → does NOT reproduce
 *      in createRenderer (adjacent useHover elements clear correctly
 *      on move). Likely needs the silvercode HoverPreviewTarget /
 *      InlineDisclosure / Content.Body lane composition to bite. Also
 *      filing as silvercode-side investigation.
 *
 * Architectural finding for #2 (the only reproducer):
 *
 *   ListView.tsx in HEIGHT-INDEPENDENT mode (silvercode's shape — no
 *   `height` prop) tracks viewport size via `useState<outerViewportSize>`
 *   driven by Box.onLayout (line 1124). The setState chain takes 3+
 *   commits to settle on first mount:
 *
 *     - mount: useLayoutEffect(setNode) → schedule re-render
 *     - re-render: useLayoutEffect([node, onLayout]) → subscribe
 *       signalEffect on layout-signals.boxRect → fires immediately
 *       with `node.boxRect` (populated by pipeline after first
 *       commit's resetAfterCommit) → setOuterViewportSize → schedule
 *       re-render
 *     - third re-render: outerViewportSize populated, showScrollbar
 *       can finally become true
 *
 *   This exceeds the renderer's MAX_CONVERGENCE_PASSES (= 2). On real
 *   silvercode the next user-driven render (typing in composer,
 *   message arrival) drains the pending state — explaining "scrollbar
 *   appears after I send a prompt".
 *
 *   Two fix vectors (NOT applied in this commit, both need bigger
 *   reasoning + co-ordination):
 *     (a) Replace `useState<outerViewportSize>` with a layout-signal
 *         subscription via getLayoutSignals() + useSignal — the
 *         canonical pattern from the closed view-as-layout-output
 *         bead. Reads synchronously during render, no extra commit
 *         needed.
 *     (b) Bump MAX_CONVERGENCE_PASSES specifically for the index-
 *         window mode's first-paint settle. Risks broader convergence
 *         budget regressions.
 *
 *   The "macOS-style auto-hide" design intent (existing test
 *   `listview-height-independent-scrollbar.test.tsx:118`) means the
 *   scrollbar SHOULD hide while idle. The user's complaint is the
 *   absence of an INITIAL FLASH cue when overflow first appears — same
 *   shape as the auto-flash on item-count grow (line 2000), but at
 *   first paint too.
 *
 * Status: 1 failing test (#2) documents the bug + root cause for the
 * next session. 4 passing tests document the symptoms that did NOT
 * reproduce in vendor minimal harness — when re-investigating, jump
 * straight to silvercode L4 with renderScenario.
 *
 * Worktree note: this worktree's `apps/silvercode/tests/visual/` smoke
 * test is failing with `useScope() called without ScopeProvider` —
 * that is a worktree-environmental issue (renderScenario harness scope
 * wiring missing somewhere) blocking L4 tests for SCR2's session.
 * Other worktrees may not have this issue.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, ListView, Text, useHover } from "@silvery/ag-react"

const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])

function findThumbCell(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  const col = cols - 1
  for (let r = 0; r < rows; r++) {
    if (THUMB_EIGHTHS.has(app.cell(col, r).char)) return { col, row: r }
  }
  return null
}

function MultiLineItem({ idx }: { idx: number }): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>line 1 of item {idx}</Text>
      <Text>line 2</Text>
      <Text>line 3</Text>
      <Text>line 4</Text>
      <Text>line 5</Text>
      <Text>line 6</Text>
      <Text>line 7</Text>
      <Text>line 8</Text>
    </Box>
  )
}

describe("SCR2 — first-paint measurement (does NOT reproduce in minimal)", () => {
  test("scrolling works on startup (wheel not dropped)", async () => {
    const COLS = 60
    const ROWS = 20
    const items = Array.from({ length: 6 }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView
            items={items}
            nav
            getKey={(idx) => idx}
            renderItem={(idx) => <MultiLineItem idx={idx} />}
          />
        </Box>
      </Box>,
    )

    expect(app.text).toContain("line 1 of item 0")

    // Wheel scroll. WITHOUT manual rerender. If symptom #1 is real,
    // this drops because maxScrollRow=0 at first paint.
    await app.wheel(5, ROWS / 2, 5)
    expect(app.text).toContain("line 1 of item 1")
  })

  test("REPRODUCES: scrollbar visible on first paint when content overflows", async () => {
    const COLS = 60
    const ROWS = 20
    const items = Array.from({ length: 6 }, (_, i) => i)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView
            items={items}
            nav
            getKey={(idx) => idx}
            renderItem={(idx) => <MultiLineItem idx={idx} />}
          />
        </Box>
      </Box>,
    )

    // FAILS — symptom #2 reproduces. See file header for root cause.
    const thumb = findThumbCell(app, COLS, ROWS)
    expect(
      thumb,
      `expected scrollbar visible on first paint with overflow - frame:\n${app.text}`,
    ).not.toBeNull()
  })
})

describe("SCR2 — resize-taller paints the new rows (does NOT reproduce in minimal)", () => {
  test("resize from short to tall paints the bottom rows (no rerender call)", async () => {
    const COLS = 60
    const SHORT_ROWS = 10
    const TALL_ROWS = 30
    const items = Array.from({ length: 12 }, (_, i) => `item-${i}`)
    const render = createRenderer({ cols: COLS, rows: SHORT_ROWS })
    const app = render(
      <Box width="100%" height="100%" flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} nav getKey={(s) => s} renderItem={(s) => <Text>{s}</Text>} />
        </Box>
      </Box>,
    )

    expect(app.text).toContain("item-0")

    app.resize(COLS, TALL_ROWS)

    // Passes — resize-up paints in this minimal harness. The user's
    // real-terminal report needs the silvercode shape to investigate.
    expect(
      app.text,
      `expected bottom item visible after resize-taller - frame:\n${app.text}`,
    ).toContain("item-11")
  })
})

describe("SCR2 — hover state cleared on adjacent move (does NOT reproduce in minimal)", () => {
  test("hovering element B clears hover state on element A (absolute layout)", async () => {
    const COLS = 40
    const ROWS = 5

    function HoverElement({ id, col }: { id: string; col: number }): React.ReactElement {
      const { isHovered, onMouseEnter, onMouseLeave } = useHover()
      return (
        <Box
          position="absolute"
          top={0}
          left={col}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <Text>
            {isHovered ? "*" : "."}
            {id}
          </Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS}>
        <HoverElement id="A" col={0} />
        <HoverElement id="B" col={10} />
        <HoverElement id="C" col={20} />
      </Box>,
    )

    expect(app.text).toContain(".A")
    expect(app.text).toContain(".B")
    expect(app.text).toContain(".C")

    await app.hover(1, 0)
    expect(app.text, `after hover A - frame:\n${app.text}`).toContain("*A")

    await app.hover(11, 0)
    expect(app.text, `after move A->B should clear A - frame:\n${app.text}`).toContain(".A")
    expect(app.text).toContain("*B")

    await app.hover(21, 0)
    expect(app.text, `after move B->C should clear B - frame:\n${app.text}`).toContain(".B")
    expect(app.text).toContain("*C")
  })

  test("hover stuck on previous element when DOM tree shape changes between moves", async () => {
    const COLS = 40
    const ROWS = 5

    function HoverElement({ id }: { id: string }): React.ReactElement {
      const { isHovered, onMouseEnter, onMouseLeave } = useHover()
      return (
        <Box onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          <Text>
            {isHovered ? "*" : "."}
            {id}
          </Text>
        </Box>
      )
    }

    function Harness({ extra }: { extra: number }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="row" key={extra}>
          <HoverElement id="A" />
          <HoverElement id="B" />
          <HoverElement id="C" />
        </Box>
      )
    }

    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Harness extra={0} />)

    await app.hover(0, 0)
    expect(app.text).toContain("*A")

    app.rerender(<Harness extra={1} />)
    await app.hover(2, 0)

    expect(app.text, `after rekey + move A->B - frame:\n${app.text}`).toContain(".A")
    expect(app.text).toContain("*B")
  })
})
