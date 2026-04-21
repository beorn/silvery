/**
 * Shared fixture builder, render + analysis utilities, and invariant
 * checkers for the ListView scroll-contract tests.
 *
 * Used by:
 *   - `listview-scroll-contract.test.tsx` — always-run seeded regressions
 *   - `listview-scroll-properties.fuzz.tsx` — FUZZ=1 property sweep
 *
 * This file has no describe/test blocks — it's a pure helper module
 * (no suffix that vitest includes) so importing it from either test file
 * doesn't double-register the suite.
 *
 * See the test files' header comments for invariant specs.
 */

import React from "react"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

// ============================================================================
// Types
// ============================================================================

export interface FixtureItem {
  id: string
  height: number
}

export interface ListViewFixture {
  items: FixtureItem[]
  cols: number
  rows: number
  viewport: number
  scrollTo?: number
  estimateHeight: number
}

export interface RenderedCard {
  /** y-coordinate of the ╭ row in the rendered output. */
  top: number
  /** y-coordinate of the ╰ row in the rendered output. */
  bottom: number
  /** The id text found between the borders (best effort). */
  idText: string | undefined
}

export interface RenderAnalysis {
  lines: string[]
  viewportLines: string[]
  cards: RenderedCard[]
  indicatorDownRow: number
  indicatorUpRow: number
  indicatorDownCount: number
  indicatorUpCount: number
  visibleIndices: Set<number>
}

export interface InvariantResult {
  ok: boolean
  message: string
}

// ============================================================================
// Fixture + render
// ============================================================================

/** Build N items with a height function. */
export function buildItems(
  count: number,
  heightFn: (i: number) => number,
  prefix = "p",
): FixtureItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    height: heightFn(i),
  }))
}

export function renderFixture(f: ListViewFixture): RenderAnalysis {
  const r = createRenderer({ cols: f.cols, rows: f.rows })
  const app = r(
    <Box flexDirection="column" height={f.rows}>
      <ListView
        items={f.items}
        height={f.viewport}
        width={f.cols - 2}
        estimateHeight={f.estimateHeight}
        overflowIndicator
        scrollTo={f.scrollTo}
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
  const viewportLines = lines.slice(0, f.viewport)

  // Detect card top (╭) and bottom (╰) borders in the viewport.
  const cards: RenderedCard[] = []
  const topRows: number[] = []
  const bottomRows: number[] = []
  for (let y = 0; y < viewportLines.length; y++) {
    const line = viewportLines[y] ?? ""
    if (line.includes("╭")) topRows.push(y)
    if (line.includes("╰")) bottomRows.push(y)
  }
  // Pair each ╭ with the next ╰ at y ≥ top.
  let b = 0
  for (const top of topRows) {
    while (b < bottomRows.length && bottomRows[b]! < top) b++
    const bottom = b < bottomRows.length ? bottomRows[b]! : top
    let idText: string | undefined
    for (let y = top + 1; y < bottom && y < viewportLines.length; y++) {
      const line = viewportLines[y] ?? ""
      const match = line.match(/[a-z]+-\d+/)
      if (match) {
        idText = match[0]
        break
      }
    }
    cards.push({ top, bottom, idText })
    b++
  }
  cards.sort((a, b) => a.top - b.top)

  // Indicators.
  const downMatch = text.match(/▼(\d+)/)
  const upMatch = text.match(/▲(\d+)/)
  let indicatorDownRow = -1
  let indicatorUpRow = -1
  for (let y = 0; y < viewportLines.length; y++) {
    const line = viewportLines[y] ?? ""
    if (/▼\d+/.test(line) && indicatorDownRow < 0) indicatorDownRow = y
    if (/▲\d+/.test(line) && indicatorUpRow < 0) indicatorUpRow = y
  }

  // Visible indices: search full text for each id.
  const visibleIndices = new Set<number>()
  for (let i = 0; i < f.items.length; i++) {
    if (text.includes(f.items[i]!.id)) visibleIndices.add(i)
  }

  return {
    lines,
    viewportLines,
    cards,
    indicatorDownRow,
    indicatorUpRow,
    indicatorDownCount: downMatch ? parseInt(downMatch[1]!, 10) : 0,
    indicatorUpCount: upMatch ? parseInt(upMatch[1]!, 10) : 0,
    visibleIndices,
  }
}

export function dumpViewport(f: ListViewFixture, a: RenderAnalysis): string {
  const header = `cols=${f.cols} rows=${f.rows} viewport=${f.viewport} items=${f.items.length} scrollTo=${f.scrollTo ?? "-"} estH=${f.estimateHeight}`
  const contentHeight = f.items.reduce((s, x) => s + x.height, 0)
  const shape = f.items.map((x) => x.height).join(",")
  const body = a.viewportLines
    .map((l, i) => `${String(i).padStart(3, "0")}: ${/\S/.test(l) ? l : "<blank>"}`)
    .join("\n")
  return `${header}\ncontentHeight=${contentHeight} heights=[${shape}]\n--- viewport (${f.viewport} rows) ---\n${body}`
}

// ============================================================================
// Invariants
// ============================================================================

/**
 * INV-1: no blank gap between last rendered card's ╰ and the ▼N indicator.
 *
 * Only applies when a ▼N indicator is present. Blank rows between last card
 * and viewport bottom without an indicator are just empty viewport — fine.
 */
export function checkNoBlankGap(f: ListViewFixture, a: RenderAnalysis): InvariantResult {
  if (a.cards.length === 0) return { ok: true, message: "no cards to check" }
  const lastCard = a.cards[a.cards.length - 1]!
  if (a.indicatorDownRow < 0) {
    return { ok: true, message: "no ▼N indicator — trailing blanks are empty viewport" }
  }
  const floor = a.indicatorDownRow
  let gap = 0
  for (let y = lastCard.bottom + 1; y < floor; y++) {
    const line = a.viewportLines[y] ?? ""
    if (/\S/.test(line)) {
      return { ok: true, message: `content at y=${y} closes the gap` }
    }
    gap++
  }
  const TOLERANCE = 1
  if (gap > TOLERANCE) {
    return {
      ok: false,
      message: `INV-1 NO-BLANK-GAP violated: ${gap} blank rows between last card's ╰ at y=${lastCard.bottom} and ▼${a.indicatorDownCount} indicator at y=${a.indicatorDownRow}.`,
    }
  }
  return { ok: true, message: `gap=${gap}` }
}

/**
 * INV-2: overflow indicator counts reflect actually-hidden items.
 *
 * Three sub-checks:
 *   (2a) Content fits viewport → no indicator at all.
 *   (2b) Last item visible → ▼ must be 0. First item visible → ▲ must be 0.
 *   (2c) Overall: ▲N + ▼N ≥ ceil(hidden/2). Catches "stuck at 1 for N>>1".
 */
export function checkOverflowCountAccuracy(
  f: ListViewFixture,
  a: RenderAnalysis,
): InvariantResult {
  const hiddenCount = f.items.length - a.visibleIndices.size
  const totalContent = f.items.reduce((s, x) => s + x.height, 0)
  const fits = totalContent <= f.viewport

  if (fits) {
    if (a.indicatorDownCount > 0 || a.indicatorUpCount > 0) {
      return {
        ok: false,
        message: `INV-2a OVERFLOW-COUNT-ACCURACY: content (${totalContent}) fits viewport (${f.viewport}) but ▲${a.indicatorUpCount}/▼${a.indicatorDownCount} indicator is present.`,
      }
    }
    return { ok: true, message: "no overflow, no indicator" }
  }

  if (hiddenCount === 0) return { ok: true, message: "overflow but all items visible" }

  const lastIndex = f.items.length - 1
  if (a.visibleIndices.has(lastIndex) && a.indicatorDownCount > 0) {
    return {
      ok: false,
      message: `INV-2b OVERFLOW-COUNT-ACCURACY: last item (idx=${lastIndex}, "${f.items[lastIndex]?.id}") is visible but ▼${a.indicatorDownCount} phantom-claims items hidden below.`,
    }
  }
  if (a.visibleIndices.has(0) && a.indicatorUpCount > 0) {
    return {
      ok: false,
      message: `INV-2b OVERFLOW-COUNT-ACCURACY: first item (idx=0, "${f.items[0]?.id}") is visible but ▲${a.indicatorUpCount} phantom-claims items hidden above.`,
    }
  }

  const totalShown = a.indicatorDownCount + a.indicatorUpCount
  if (totalShown < Math.ceil(hiddenCount / 2)) {
    return {
      ok: false,
      message: `INV-2c OVERFLOW-COUNT-ACCURACY: ${hiddenCount} items hidden but ▲${a.indicatorUpCount}+▼${a.indicatorDownCount} = ${totalShown} reported. Must be ≥ ceil(hidden/2) = ${Math.ceil(hiddenCount / 2)}.`,
    }
  }
  return { ok: true, message: `hidden=${hiddenCount}, reported=${totalShown}` }
}

/** INV-3: at scrollOffset=0, first card's top is at y ≤ 2. */
export function checkFirstVisibleZeroOffset(
  f: ListViewFixture,
  a: RenderAnalysis,
): InvariantResult {
  const scroll = f.scrollTo ?? 0
  if (scroll !== 0) return { ok: true, message: `scrollTo=${scroll}, skipping` }
  if (a.cards.length === 0) return { ok: true, message: "no cards" }
  const firstCard = a.cards[0]!
  const MAX_FIRST_TOP = 2
  if (firstCard.top > MAX_FIRST_TOP) {
    return {
      ok: false,
      message: `INV-3 FIRST-VISIBLE-HAS-ZERO-OFFSET: at scrollTo=0, first card's ╭ is at y=${firstCard.top}; expected ≤ ${MAX_FIRST_TOP}. Leading placeholder visible.`,
    }
  }
  return { ok: true, message: `firstCard.top=${firstCard.top}` }
}

/** INV-4: first card's top lies near the viewport top. */
export function checkViewportTopCard(f: ListViewFixture, a: RenderAnalysis): InvariantResult {
  if (a.cards.length === 0) return { ok: true, message: "no cards" }
  const firstCard = a.cards[0]!
  const firstId = firstCard.idText
  let firstItemHeight = f.estimateHeight
  if (firstId) {
    const match = f.items.find((it) => it.id === firstId)
    if (match) firstItemHeight = match.height
  }
  const maxTop = Math.max(firstItemHeight + 1, Math.floor(f.viewport / 4) + 1)
  if (firstCard.top > maxTop) {
    return {
      ok: false,
      message: `INV-4 VIEWPORT-TOP-CARD: first card (${firstId ?? "?"}) top at y=${firstCard.top}, exceeds max ${maxTop} (firstItemHeight=${firstItemHeight}, viewport=${f.viewport}). Window not aligned to viewport top.`,
    }
  }
  return { ok: true, message: `firstCard.top=${firstCard.top}, max=${maxTop}` }
}

/** Run all 4 invariants. Returns first violation or null. */
export function checkAllInvariants(
  f: ListViewFixture,
  a: RenderAnalysis,
): InvariantResult | null {
  for (const check of [
    checkNoBlankGap,
    checkOverflowCountAccuracy,
    checkFirstVisibleZeroOffset,
    checkViewportTopCard,
  ]) {
    const r = check(f, a)
    if (!r.ok) return r
  }
  return null
}
