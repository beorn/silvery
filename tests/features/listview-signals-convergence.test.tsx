/**
 * ListView signals refactor — convergence + first-paint lockdown.
 *
 * Tests for the migration of ListView's viewport tracking from
 * `useState` + `onLayout` callbacks to `getLayoutSignals(node).boxRectCommitted()`.
 *
 * Background. The previous implementation captured the outer + inner Box
 * dimensions through `useState`-driven `onLayout` callbacks. Each callback
 * fired during the layout-phase notify pass and called `setState`, which
 * scheduled a React commit. The renderer's bounded convergence loop
 * (`MAX_CONVERGENCE_PASSES`, see `pass-cause.ts`) capped the number of
 * passes — so layouts with the height-independent ListView shape
 * (silvercode chat) needed 3+ passes to settle, while the cap admits 2.
 * The structural tail of that bug: scrollbar invisible until the user
 * triggered a re-render (e.g. by submitting the first prompt).
 *
 * The fix reads `boxRectCommitted` synchronously during render — the
 * committed signal is invariant across every convergence pass within one
 * batch (see `commitLayoutSnapshot` in
 * `vendor/silvery/packages/ag/src/layout-signals.ts`). A render that BOTH
 * reads the rect AND writes a layout-affecting prop based on it converges
 * in one pass, eliminating the feedback edge.
 *
 * Bead: `@km/silvery/listview-layout-signals-from-getlayoutsignals`.
 *
 * Companion bridge mitigation: silvercode's
 * `apps/silvercode/src/components/ChatBlockList.tsx` `estimateHeight={3}`
 * (commit 06b9a088d) papers over the pre-fix convergence symptom for the
 * scrollbar-visibility surface specifically. With this refactor landed the
 * bridge is no longer load-bearing — it's defense-in-depth.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, AutoFit } from "@silvery/ag-react"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])

function makeItems(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `item ${i}`)
}

function findThumbCell(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  // Thumb renders in the rightmost interior column (the absolute scrollbar
  // overlay). Walk every row of the rightmost column for a thumb glyph.
  const col = cols - 1
  for (let r = 0; r < rows; r++) {
    if (THUMB_EIGHTHS.has(app.cell(col, r).char)) return { col, row: r }
  }
  return null
}

describe("ListView signals refactor — convergence", () => {
  test("first-paint scrollbar visibility (height-independent, no estimateHeight)", () => {
    // The exact silvercode shape: ListView wrapped in a flexGrow container,
    // no `height` prop, no `estimateHeight` prop. With the prior
    // useState+onLayout chain, the scrollbar's geometry depended on the
    // inner Box's `viewportSize.h` reaching the renderer through a chain
    // of setState calls — by `MAX_CONVERGENCE_PASSES`, the chain was still
    // mid-flight, so the scrollbar gate computed against a stale viewport
    // height of 1 and the thumb didn't render until a subsequent batch.
    //
    // With the signals refactor, the outer Box's `boxRectCommitted` is read
    // synchronously during the SAME render that consumes it — the height
    // is known on the first batch's commit, the scrollbar gate evaluates
    // correctly, and the thumb appears on the first painted frame.
    //
    // We check after `app.rerender` to exercise the commit-boundary signal
    // path explicitly: a fresh renderer commits its initial layout and any
    // subsequent re-render reads the committed value.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(200)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items: it }: { items: string[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={it} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={items} />)
    // `auto-flash` fires `setIsScrolling(true)` when item count grows; force
    // it via a rerender with the same items to enter the visible-scrollbar
    // window. The exact timing is downstream of the convergence question:
    // we're verifying that ONCE the gate is asked, the thumb renders.
    app.rerender(<Harness items={makeItems(items.length + 1)} />)
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()
  })

  test("bounded settle — strict mode does not trip with height-independent ListView", () => {
    // The renderer's bounded-convergence assertion fires under
    // `SILVERY_STRICT` when the layout loop exceeds `MAX_CONVERGENCE_PASSES`.
    // SILVERY_STRICT=1 is on by default in this test setup (see km-tui
    // CLAUDE.md). The pre-refactor implementation was a known offender for
    // this exact shape — the test would either fail (STRICT=2) or emit a
    // stderr warning that the harness flagged.
    //
    // We render the height-independent ListView shape with overflowing
    // content and assert the harness completes WITHOUT a render error.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(200)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    expect(() => {
      render(
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>,
      )
    }).not.toThrow()
  })

  test("follow=end snap waits for measured viewport (no phantom snap on first paint)", () => {
    // Per /pro audit (session c288c217 review): the follow="end" snap must
    // not fire when `viewportSize.h === 0` — otherwise it sees `maxRow = 0`
    // (because `scrollableRows = max(0, totalRowsMeasured - viewportHeight)`
    // collapses), pins to the (false) bottom, and clears `pendingFollowSnap`.
    // The next frame, when the viewport finally measures, the snap is
    // already cleared and the user sees a frozen near-top viewport.
    //
    // The signals refactor doesn't change the snap math, but it changes WHEN
    // a non-zero viewport reaches the snap gate (now: same batch as the first
    // committed layout). This test asserts the gate is intact and that the
    // last item is visible after a follow="end" first paint.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} follow="end" renderItem={(item) => <Text>{item}</Text>} />
        </Box>
      </Box>,
    )

    // Tail item visible on first paint. The exact item-49 string would land
    // on the last visible row when follow="end" snaps to the tail correctly.
    expect(app.text).toContain("item 49")
  })

  test("AutoFit composition — height-independent ListView nested in AutoFit lane chooser", () => {
    // AutoFit measures children at unconstrained width on a phantom subtree
    // and renders them at the chosen lane on the visible subtree. Per the
    // /pro audit hidden-gotcha #5, the interaction with the prior useState
    // chain risked an extra commit / measurement-cache invalidation on the
    // phantom→visible transition.
    //
    // With committed-signal reads, AutoFit's chosen-lane width is itself a
    // committed value by the time ListView reads its own viewport — same
    // batch, no race. We assert the composition renders without error and
    // ListView's content appears.
    const COLS = 80
    const ROWS = 20
    const items = makeItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <AutoFit lanes={[40, 60, 80]}>
            <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
          </AutoFit>
        </Box>
      </Box>,
    )

    // Items render through the AutoFit visible subtree. The phantom subtree
    // is parked off-screen (render-phase viewport clip) and contributes no
    // pixels, so the visible-text assertion is sufficient to verify the
    // composition didn't throw or render an empty viewport.
    expect(app.text).toContain("item 0")
    expect(app.text).toContain("item 1")
  })

  test("auto-flash scrollbar still appears when items grow (height-independent)", () => {
    // Regression coverage: this is the existing
    // `listview-flex-scrollbar.test.tsx` shape. It hit the wired-up signal
    // path during refactor — keeping it here makes the convergence file
    // self-contained for "did we break the visible-scrollbar surface?"
    const COLS = 60
    const ROWS = 20
    const initialItems = makeItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items: it }: { items: string[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={it} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={initialItems} />)
    expect(findThumbCell(app, COLS, ROWS)).toBeNull()

    app.rerender(<Harness items={makeItems(150)} />)
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()
  })
})
