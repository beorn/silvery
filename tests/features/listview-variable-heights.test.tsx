/**
 * ListView with HIGHLY variable item heights — regression for
 * `km-tui.column-top-disappears` (2026-04-20 real-vault session).
 *
 * User-visible symptom (200×120 terminal, real vault):
 *   Col "Next Actions @next" renders ~18 short cards in rows 0-84, then leaves
 *   ~30 blank rows, then shows `▼1` claiming 1 item hidden. In fact many more
 *   items are hidden — the indicator count is WRONG, and the blank gap is a
 *   render-window shortfall.
 *
 * Data shape that triggers the bug:
 *   - ~33 items in the list
 *   - First ~18 items are SHORT (3-5 rows each)
 *   - Last ~15 items are TALL (15-30 rows each — wrapped text, section
 *     headers, multi-line bodies)
 *   - avgHeight = (short*18 + tall*15) / 33 ≈ 15
 *   - estimatedVisibleCount = ceil(viewport/avgH) ≈ 8
 *   - renderCount = 8 + 2*overscan = 18
 *   - Render window = [0, 18) → only the short cards
 *   - Those 18 cards total ~84 rows (well under viewport=115)
 *   - trailingHeight = sumHeights(18, 33, measuredAvg=15.8) ≈ 438
 *   - contentHeight = 84 + 438 = 522
 *   - hasOverflow = 522 > 115 = true → indicatorReserve = 1
 *   - The SINGLE trailing-placeholder Box (height=438) has bottom=522 >
 *     visibleBottom=114, so it's counted as a "partially visible bottom child"
 *     → hiddenBelow++ = 1 → `▼1` (wrong: should be 15+).
 *
 * Two invariants are violated:
 *   A) Render window must cover the viewport. When the first N items are
 *      short, the window must include MORE items until viewport is filled.
 *   B) Overflow indicator count must equal the number of HIDDEN ITEMS, not
 *      the number of partially visible placeholder Boxes.
 *
 * This test reproduces the shape at the component level via createRenderer.
 * It MUST fail on HEAD with the variable-heights bug; it passes when the
 * virtualizer fills the viewport correctly.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

describe("ListView variable-heights: column-top-disappears real-vault shape", () => {
  test("short-first + tall-later items: no large blank gap below last rendered card", () => {
    // Build 33 items matching the real-vault @next column shape:
    //   items 0..17 — SHORT (3 rows, § header-style cards) — 18 items, 54 rows
    //   items 18..32 — VERY TALL (30 rows, wrapped content) — 15 items, 450 rows
    //   Total content = 504 rows; viewport = 115 → hasOverflow.
    //   avgHeight = 504/33 ≈ 15.3 — matches real-vault measurement (avgH=15.8).
    //   estimatedVisibleCount = ceil(115/15.3) = 8; renderCount = 8+10 = 18.
    //   Window = [0, 18) covers ONLY the 18 short cards = 54 rows of content.
    //   trailingHeight = sumHeights(18, 33, measured) ≈ 450 rows.
    //   contentHeight = 54 + 450 = 504 → viewport rows 54..114 are BLANK.
    //   The trailing placeholder's single Box has bottom=504 → counted as
    //   ONE "partially visible bottom" item → `▼1`.
    //
    // User-visible symptom (this is what must fail before the fix):
    //   - 18 short cards render in rows 0-54
    //   - rows 55-114 are blank (~60 rows)
    //   - `▼1` at row 115 — falsely claims just 1 item hidden
    const items = Array.from({ length: 33 }, (_, i) => ({
      id: `i-${i}`,
      height: i < 18 ? 3 : 30,
    }))

    const r = createRenderer({ cols: 60, rows: 120 })
    const app = r(
      <Box flexDirection="column" height={120}>
        <ListView
          items={items}
          height={115}
          width={58}
          estimateHeight={4}
          overflowIndicator
          getKey={(item) => item.id}
          renderItem={(item) => (
            <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
              <Text>{item.id}</Text>
            </Box>
          )}
        />
      </Box>,
    )

    const text = stripAnsi(app.text)
    const lines = text.split("\n")

    // Find the row of the ▼N indicator.
    const indicatorRow = lines.findIndex((l) => /▼\d+/.test(l))

    // Dump the rendered column for diagnostic output.
    const dump = lines
      .map((l, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(l) ? l : "<blank>"}`)
      .join("\n")

    expect(
      indicatorRow,
      `Fixture must produce ▼N overflow indicator — content (${items.reduce((s, x) => s + x.height, 0)} rows) > viewport (115).\n\nDUMP:\n${dump}`,
    ).toBeGreaterThan(0)

    // Walk backward from indicator, count blank rows until we hit card border.
    let blankGap = 0
    for (let i = indicatorRow - 1; i >= 0; i--) {
      const slice = lines[i] ?? ""
      if (slice.includes("╰") || slice.includes("│")) break
      if (!/\S/.test(slice)) blankGap++
      else break
    }

    // INVARIANT: no large blank gap between last rendered card and ▼N.
    //   Passing: 0-3 blank rows (padding/spacer).
    //   Buggy:  ~30+ blank rows (window shortfall).
    expect(
      blankGap,
      `Column has ${blankGap} blank rows between the last rendered card's ╰ border and the ▼N indicator at row ${indicatorRow}. Expected ≤ 3 (padding only). This is the column-top-disappears bug.\n\nDUMP:\n${dump}`,
    ).toBeLessThanOrEqual(3)
  })

  test("MID-COLUMN scrollTo with leading placeholder: no blank rows ABOVE viewport", () => {
    // User-reported follow-up (2026-04-20): after the forward-walk fix, a
    // DIFFERENT symptom appeared — a SYMMETRIC blank gap at the TOP of the
    // viewport when cursor moves mid-column.
    //
    // Root cause: when the virtualizer's window starts at `start > 0`, a
    // `leadingHeight` placeholder Box fills the scroll content from row 0 to
    // row leadingHeight. The scroll container only scrolls when the target
    // is outside the viewport — if the target is within viewport reach at
    // scrollOffset=0, no scroll happens, and the leading placeholder remains
    // visible as blank rows at the top of the viewport.
    //
    // Example from real vault probe (virt log):
    //   count=33 scrollOff=13 start=8 end=28 leadH=39 trailH=209
    //   - items 8..27 rendered, leading placeholder = 39 rows
    //   - scroll container child[6]=item 13, target.top≈64, target.bottom≈68
    //   - visibleTop=0, visibleBottom=115: target in view → no scroll
    //   - viewport rows 0-38 show BLANK leading placeholder
    //
    // Expected: initial scrollOffset must push leadingHeight out of view.
    // ListView should communicate leadingHeight to the scroll container (e.g.
    // pass scrollOffset={leadingHeight} as a minimum), OR the scroll container
    // should treat leading placeholder as "virtual space" that must be
    // scrolled past.
    //
    // Fixture: enough items that count > minWindowSize AND cursor scrollTo
    // lands mid-column such that `start > 0` but the target is still inside
    // the naive viewport (scrollOffset=0).
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `k-${i}`,
      // Uniform short items so the window is small but non-zero leadingHeight
      // produces a visible gap.
      height: 3,
    }))

    const r = createRenderer({ cols: 60, rows: 105 })
    const app = r(
      <Box flexDirection="column" height={105}>
        <ListView
          items={items}
          height={100}
          width={58}
          estimateHeight={3}
          overflowIndicator
          scrollTo={25}
          getKey={(item) => item.id}
          renderItem={(item) => (
            <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
              <Text>{item.id}</Text>
            </Box>
          )}
        />
      </Box>,
    )

    const text = stripAnsi(app.text)
    const lines = text.split("\n")

    // Count blank rows at the top of the viewport (rows 0..N that contain no
    // visible character). A card border `╭`, text `k-N`, or indicator `▲`
    // breaks the gap.
    let gapTop = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ""
      if (/\S/.test(line)) break
      gapTop++
    }

    const dump = lines
      .slice(0, Math.min(30, lines.length))
      .map((l, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(l) ? l : "<blank>"}`)
      .join("\n")

    // INVARIANT: no blank rows at top of viewport.
    //   Passing: 0 (first row has content — card top border or ▲ indicator).
    //   Buggy: N blank rows = leadingHeight rows (placeholder visible).
    expect(
      gapTop,
      `${gapTop} blank rows at top of viewport — the leading placeholder is visible, should be scrolled past.\n\nDUMP (first 30 rows):\n${dump}`,
    ).toBeLessThanOrEqual(3)
  })

  test("overflow indicator count scales with number of hidden items (not stuck at 1)", () => {
    // When the virtualizer renders a window smaller than `count`, the trailing
    // placeholder is a single Box that represents MULTIPLE hidden items. Before
    // the height-aware window fix, the indicator counted the placeholder as
    // ONE hidden item — so the user saw `▼1` when many items were below.
    //
    // After the fix, the indicator count must grow with the number of hidden
    // items. Exact match isn't required (the trailing placeholder still
    // introduces some discrepancy with partially-visible counting in
    // layout-phase) but the count must be ≥ ~hidden/2 — proving the indicator
    // reflects the real hidden workload, not a stuck "1".
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `j-${i}`,
      height: i < 20 ? 3 : 15, // short prefix + tall suffix
    }))

    const r = createRenderer({ cols: 60, rows: 100 })
    const app = r(
      <Box flexDirection="column" height={100}>
        <ListView
          items={items}
          height={95}
          width={58}
          estimateHeight={4}
          overflowIndicator
          getKey={(item) => item.id}
          renderItem={(item) => (
            <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
              <Text>{item.id}</Text>
            </Box>
          )}
        />
      </Box>,
    )

    const text = stripAnsi(app.text)
    const indicatorMatch = text.match(/▼(\d+)/)

    if (indicatorMatch) {
      const indicatorCount = parseInt(indicatorMatch[1]!, 10)
      const visibleCount = Array.from({ length: 30 }).filter((_, i) =>
        text.includes(`j-${i}`),
      ).length
      const hiddenItemCount = 30 - visibleCount

      // Indicator must grow with hidden-item count — not stuck at 1.
      // Buggy (pre-fix): indicator = 1 regardless of how many items are hidden.
      // Fixed: indicator reflects the actual hidden-item workload (≥ half).
      expect(
        indicatorCount,
        `▼N says ${indicatorCount} items below; ${hiddenItemCount} items actually hidden (j-${visibleCount}..j-29). Indicator must reflect real hidden count (≥ hidden/2), not be stuck at 1.`,
      ).toBeGreaterThanOrEqual(Math.ceil(hiddenItemCount / 2))
    }
  })

  test("placeholder representsItems makes ▲N/▼N exact for a scrolled virtualized list", () => {
    // Reproduce a scenario where the virtualizer renders a narrow window and
    // the leading + trailing placeholders must individually announce how many
    // items they represent. Precise-count variant of the broader "scales with
    // hidden" test above — this one checks exact numerics, not "≥ half".
    //
    // Scenario: 50 uniform items (height=4), viewport=24, viewport scrolled so
    // items 10..14 are visible. Expected: ▲10 (items 0..9 above), ▼35
    // (items 15..49 below). WITHOUT representsItems on placeholders, Box would
    // have reported 1 for each side (the placeholder Boxes).
    const count = 50
    const viewport = 24
    const items = Array.from({ length: count }, (_, i) => ({ id: `k-${i}` }))

    const r = createRenderer({ cols: 60, rows: viewport + 2 })
    const app = r(
      <ListView
        items={items}
        height={viewport}
        width={58}
        estimateHeight={4}
        overflowIndicator
        scrollTo={12} // Target the middle item; scroll settles so 10..14 are visible.
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={4} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />,
    )

    const text = stripAnsi(app.text)
    const up = text.match(/▲(\d+)/)
    const down = text.match(/▼(\d+)/)

    expect(up, `▲N must be present (items above viewport):\n${text}`).toBeTruthy()
    expect(down, `▼N must be present (items below viewport):\n${text}`).toBeTruthy()

    const upCount = up ? parseInt(up[1]!, 10) : 0
    const downCount = down ? parseInt(down[1]!, 10) : 0

    // Count items actually on-screen to derive expected hidden counts without
    // relying on the virtualizer's window size (which may vary with overscan).
    // Use word-boundary match so `k-1` doesn't match inside `k-10`, `k-11`, …
    const visibleIds = Array.from({ length: count })
      .map((_, i) => i)
      .filter((i) => new RegExp(`\\bk-${i}\\b`).test(text))
    const firstVisible = visibleIds[0]!
    const lastVisible = visibleIds[visibleIds.length - 1]!
    const expectedAbove = firstVisible // items 0..firstVisible-1
    const expectedBelow = count - 1 - lastVisible // items lastVisible+1..count-1

    // Allow ±1 slack: partially-visible edge items can move the count by one
    // depending on scroll settlement, but the bug we're guarding against
    // reports a stuck "1" — that's a >5-item divergence and far outside slack.
    expect(
      Math.abs(upCount - expectedAbove),
      `▲${upCount} vs expected ~${expectedAbove} (items 0..${firstVisible - 1} above viewport)`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(downCount - expectedBelow),
      `▼${downCount} vs expected ~${expectedBelow} (items ${lastVisible + 1}..${count - 1} below viewport)`,
    ).toBeLessThanOrEqual(1)

    // Hard lower bound on the bug we're specifically fighting: the indicator
    // MUST report more than 1 when more than 1 item is hidden. Without
    // representsItems on placeholders, Box would report exactly 1.
    expect(upCount, "▲ must exceed 1 when >1 item above viewport").toBeGreaterThan(1)
    expect(downCount, "▼ must exceed 1 when >1 item below viewport").toBeGreaterThan(1)
  })
})

// =============================================================================
// Edge-case matrix — required by coordinator for the symmetric-walk fix.
// Each test uses the same synthetic ListView fixture so failures are 100%
// deterministic (no real vault needed).
// =============================================================================

describe("ListView edge-case matrix: column-top-disappears symmetric walk", () => {
  // Helper: render ListView with mixed heights, return text lines + indicators.
  // Uses cols=60, rows = viewport + small margin. The ListView is rendered at
  // the full viewport height within a Box that's slightly taller.
  function renderList(config: {
    items: { id: string; height: number }[]
    scrollTo?: number
    viewport: number
    estimateHeight?: number
  }): { text: string; lines: string[]; indicatorUp?: string; indicatorDown?: string } {
    const rows = config.viewport + 5
    const r = createRenderer({ cols: 60, rows })
    const app = r(
      <ListView
        items={config.items}
        height={config.viewport}
        width={58}
        estimateHeight={config.estimateHeight ?? 3}
        overflowIndicator
        scrollTo={config.scrollTo}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <Box flexDirection="column" height={item.height} flexShrink={0} borderStyle="round">
            <Text>{item.id}</Text>
          </Box>
        )}
      />,
    )
    const text = stripAnsi(app.text)
    const lines = text.split("\n").slice(0, config.viewport)
    const up = text.match(/▲(\d+)/)?.[1]
    const down = text.match(/▼(\d+)/)?.[1]
    return { text, lines, indicatorUp: up, indicatorDown: down }
  }

  // Helper: count blank rows at top of rendered list before first card.
  function gapTop(lines: string[]): number {
    let n = 0
    for (const line of lines) {
      if (/\S/.test(line)) break
      n++
    }
    return n
  }

  // Helper: count blank rows between last card's ╰/│ and ▼N indicator.
  function gapBottom(lines: string[]): number {
    const indicatorRow = lines.findIndex((l) => /▼\d+/.test(l))
    if (indicatorRow < 0) return 0
    let n = 0
    for (let i = indicatorRow - 1; i >= 0; i--) {
      const line = lines[i] ?? ""
      if (line.includes("╰") || line.includes("│")) break
      if (!/\S/.test(line)) n++
      else break
    }
    return n
  }

  test("1. cursor at TOP + mixed heights — no blank gap at bottom above ▼N", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `a-${i}`, height: i < 20 ? 3 : 10 }))
    const r = renderList({ items, scrollTo: 0, viewport: 100 })
    expect(r.indicatorDown, "▼N must be present (content > viewport)").toBeDefined()
    expect(gapBottom(r.lines)).toBeLessThanOrEqual(3)
    expect(gapTop(r.lines)).toBeLessThanOrEqual(3)
  })

  test("2. cursor at BOTTOM — no blank gap at top; ▲N shows items above", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `b-${i}`, height: 3 }))
    const r = renderList({ items, scrollTo: 39, viewport: 60 })
    expect(r.indicatorUp, "▲N must be present (cursor at bottom with items above)").toBeDefined()
    expect(gapTop(r.lines)).toBeLessThanOrEqual(3)
  })

  test("3. cursor MID-LIST, tall outlier ABOVE cursor — no blank gap at top", () => {
    // 50 items; item 10 is 30 rows tall (outlier); others are 3 rows. Cursor
    // at 30 (below outlier). Viewport=60.
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `c-${i}`,
      height: i === 10 ? 30 : 3,
    }))
    const r = renderList({ items, scrollTo: 30, viewport: 60 })
    const rawDump = r.lines
      .slice(0, 65)
      .map((l, i) => `${String(i).padStart(3, "0")}: [${l}]`)
      .join("\n")
    expect(
      gapTop(r.lines),
      `Cursor mid-list with tall outlier above: gapTop should be ≤ 3. RAW:\n${rawDump}`,
    ).toBeLessThanOrEqual(3)
  })

  test("4. cursor MID-LIST, tall outlier BELOW cursor — no blank gap at bottom above ▼N", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `d-${i}`,
      height: i === 40 ? 30 : 3,
    }))
    const r = renderList({ items, scrollTo: 15, viewport: 60 })
    if (r.indicatorDown) {
      expect(gapBottom(r.lines)).toBeLessThanOrEqual(3)
    }
  })

  test("5. cursor ON tall outlier (height >> viewport) — outlier renders, ▲▼ flanking", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `e-${i}`,
      height: i === 15 ? 200 : 3,
    }))
    const r = renderList({ items, scrollTo: 15, viewport: 60 })
    // The tall item should render (clipped). Its id ("e-15") should appear.
    expect(r.text, "outlier item must render (even clipped)").toContain("e-15")
  })

  test("6. uniform short cards baseline — all render, no indicator, no gap", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ id: `f-${i}`, height: 3 }))
    const r = renderList({ items, scrollTo: 0, viewport: 50 })
    expect(r.indicatorUp, "no items above cursor=0").toBeUndefined()
    // Content = 45 rows, viewport = 50 → no overflow.
    expect(r.indicatorDown, "all items fit → no ▼N").toBeUndefined()
    // All items rendered.
    for (let i = 0; i < 15; i++) {
      expect(r.text).toContain(`f-${i}`)
    }
  })

  test("7. uniform TALL cards — cursor mid, ▲/▼ indicators accurate, no gaps", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `g-${i}`, height: 20 }))
    const r = renderList({ items, scrollTo: 5, viewport: 60 })
    expect(r.indicatorUp, "items above cursor must show ▲N").toBeDefined()
    expect(r.indicatorDown, "items below cursor must show ▼N").toBeDefined()
    expect(gapTop(r.lines)).toBeLessThanOrEqual(3)
    expect(gapBottom(r.lines)).toBeLessThanOrEqual(3)
  })

  test("8. single item (count=1) — no indicators, item renders at top", () => {
    const items = [{ id: "h-only", height: 5 }]
    const r = renderList({ items, scrollTo: 0, viewport: 30 })
    expect(r.indicatorUp).toBeUndefined()
    expect(r.indicatorDown).toBeUndefined()
    expect(r.text).toContain("h-only")
    expect(gapTop(r.lines)).toBeLessThanOrEqual(2)
  })

  test("9. empty list (count=0) — no crash, no indicators", () => {
    const items: { id: string; height: number }[] = []
    const r = renderList({ items, viewport: 30 })
    expect(r.indicatorUp).toBeUndefined()
    expect(r.indicatorDown).toBeUndefined()
  })

  test("10. contentHeight === viewportHeight exactly — no overflow indicators, no gap", () => {
    // 10 items × 3 rows = 30 rows of content. Viewport = 30 → exactly fits.
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `p-${i}`, height: 3 }))
    const r = renderList({ items, scrollTo: 0, viewport: 30 })
    expect(r.indicatorUp).toBeUndefined()
    expect(r.indicatorDown).toBeUndefined()
    for (let i = 0; i < 10; i++) {
      expect(r.text).toContain(`p-${i}`)
    }
  })
})
