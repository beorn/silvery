/**
 * Text style-only restyle fast path — per-segment, incremental + realistic-scale.
 *
 * Bead: @si/render/20532-text-restyle-fast-path-reenable
 *
 * The OLD whole-rect restyle path (`emitRestyleRegion(x,y,w,h, oneStyle)`) was
 * hard-disabled because a single style clobbers nested per-run fg colors: a
 * `<Text color>` containing inline colored child `<Text>` runs (status icon +
 * label) lost the children's colors on every restyle. This suite re-enables the
 * path as a PER-SEGMENT restyle and proves it preserves nested run colors while
 * keeping SILVERY_STRICT incremental≡fresh across SELECT/DESELECT.
 *
 * Coverage:
 *  - 50+ card fixture, each title = status icon (one color) + space + inline
 *    colored label run (a different color) under a parent `<Text color>` whose
 *    color flips on selection (the cursor/selection style toggle).
 *  - SELECT then DESELECT sweep — SILVERY_STRICT=1 (default in the km vendor
 *    project) auto-verifies incremental == fresh on every rerender. A whole-rect
 *    restyle throws IncrementalRenderMismatchError here (nested colors lost); the
 *    per-segment path passes.
 *  - The DESELECT leg restores each run's color (explicit cell assertions).
 *  - bgOnlyChange (Box background toggle) still works alongside text restyle.
 *  - The fast path is actually EXERCISED (textRestyleFastPath stat > 0), not
 *    silently falling back to full renderText.
 */

// This suite is meaningless without strict incremental verification: the
// incremental≡fresh comparison AND the textRestyleFastPath stat counter only
// run under SILVERY_STRICT. km's vendor project sets it globally; silvery's
// own root config does not — strict-first.ts pins it BEFORE the framework
// module graph loads (ESM hoists imports; see its docstring).
import "./strict-first.ts"
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

// Distinct truecolor values so cell.fg assertions are unambiguous.
const ICON_CYAN = "#00d7d7"
const LABEL_RED = "#ff5f5f"
const SEL_YELLOW = "#ffff00"
const DESEL_GREY = "#9e9e9e"
const CARD_BG = "#202430"

// app.cell(...).fg resolves truecolor inputs to an { r, g, b } object.
function rgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

const CARD_W = 40
const ICON_COL = 1 // inside the card border
const LABEL_COL = 3 // icon(1) + space(1) → label starts at col 3 inside border

interface Card {
  id: number
  label: string
}

function buildCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => ({ id: i, label: `Card item number ${i}` }))
}

/**
 * One card. Title is a SINGLE silvery-text node whose `color` flips on select,
 * with two nested colored runs (icon + label) that must keep their own colors.
 */
function CardRow({ card, selected }: { card: Card; selected: boolean }) {
  return (
    <Box
      id={`card-${card.id}`}
      width={CARD_W}
      borderStyle="round"
      backgroundColor={CARD_BG}
      flexDirection="column"
    >
      <Text color={selected ? SEL_YELLOW : DESEL_GREY} wrap="truncate">
        <Text color={ICON_CYAN}>●</Text> <Text color={LABEL_RED}>{card.label}</Text>
      </Text>
    </Box>
  )
}

function Board({ cards, selectedId }: { cards: Card[]; selectedId: number }) {
  return (
    <Box flexDirection="column" width={CARD_W}>
      {cards.map((card) => (
        <CardRow key={card.id} card={card} selected={card.id === selectedId} />
      ))}
    </Box>
  )
}

// Under SILVERY_STRICT the fresh comparison render overwrites
// __silvery_content_detail (fresh has no prevBuffer → no fast path), so scan the
// full per-frame snapshot log for the max restyle count instead.
function maxRestyleCount(): number {
  const all = ((globalThis as any).__silvery_content_all ?? []) as Array<{
    textRestyleFastPath?: number
  }>
  let max = 0
  for (const s of all) max = Math.max(max, s.textRestyleFastPath ?? 0)
  return max
}

describe("feature: per-segment text restyle preserves nested run colors", () => {
  test("first render: icon + label runs carry their own colors", () => {
    const render = createRenderer({ cols: CARD_W, rows: 60 })
    const cards = buildCards(50)
    const app = render(<Board cards={cards} selectedId={-1} />)

    // Card 0 title is on row 1 (row 0 = top border).
    expect(app.cell(ICON_COL, 1).char).toBe("●")
    expect(app.cell(ICON_COL, 1).fg).toEqual(rgb(ICON_CYAN))
    expect(app.cell(LABEL_COL, 1).char).toBe("C") // "Card item…"
    expect(app.cell(LABEL_COL, 1).fg).toEqual(rgb(LABEL_RED))
  })

  // 50 rerenders × STRICT incremental≡fresh full-buffer verification is
  // CPU-heavy: ~43s on a 2-core CI runner (timed out at the 30s default,
  // 2026-07-02). The sweep IS the coverage — keep it, budget for it.
  test(
    "SELECT then DESELECT sweep keeps incremental≡fresh AND restores per-run colors",
    { timeout: 120_000 },
    () => {
      const render = createRenderer({ cols: CARD_W, rows: 60 })
      const cards = buildCards(50)
      const app = render(<Board cards={cards} selectedId={-1} />)

      // Each card occupies 3 rows: top border, title, bottom border.
      const titleRow = (id: number) => id * 3 + 1

      // Sweep selection across all 50 cards. SILVERY_STRICT=1 auto-checks
      // incremental == fresh on every rerender; a whole-rect restyle throws here.
      for (let id = 0; id < 50; id++) {
        app.rerender(<Board cards={cards} selectedId={id} />)

        const row = titleRow(id)
        // SELECT leg: parent base color became yellow, but nested runs keep theirs.
        expect(app.cell(ICON_COL, row).fg).toEqual(rgb(ICON_CYAN))
        expect(app.cell(LABEL_COL, row).fg).toEqual(rgb(LABEL_RED))
        // The gap cell (space between icon and label) takes the parent base color.
        expect(app.cell(ICON_COL + 1, row).char).toBe(" ")
        expect(app.cell(ICON_COL + 1, row).fg).toEqual(rgb(SEL_YELLOW))
      }

      // DESELECT everything — the previously-selected runs must restore their colors,
      // and the gap reverts to the deselected base color.
      app.rerender(<Board cards={cards} selectedId={-1} />)
      for (let id = 0; id < 50; id++) {
        const row = titleRow(id)
        expect(app.cell(ICON_COL, row).fg).toEqual(rgb(ICON_CYAN))
        expect(app.cell(LABEL_COL, row).fg).toEqual(rgb(LABEL_RED))
        expect(app.cell(ICON_COL + 1, row).fg).toEqual(rgb(DESEL_GREY))
      }

      // The fast path must actually be exercised, not silently bypassed.
      expect(maxRestyleCount()).toBeGreaterThan(0)
    },
  )

  test("repeated SELECT/DESELECT toggle on one card round-trips colors", () => {
    const render = createRenderer({ cols: CARD_W, rows: 60 })
    const cards = buildCards(50)
    const app = render(<Board cards={cards} selectedId={-1} />)
    const row = 1 // card 0 title row

    for (let i = 0; i < 8; i++) {
      app.rerender(<Board cards={cards} selectedId={0} />)
      expect(app.cell(ICON_COL, row).fg).toEqual(rgb(ICON_CYAN))
      expect(app.cell(LABEL_COL, row).fg).toEqual(rgb(LABEL_RED))
      expect(app.cell(ICON_COL + 1, row).fg).toEqual(rgb(SEL_YELLOW))

      app.rerender(<Board cards={cards} selectedId={-1} />)
      expect(app.cell(ICON_COL, row).fg).toEqual(rgb(ICON_CYAN))
      expect(app.cell(LABEL_COL, row).fg).toEqual(rgb(LABEL_RED))
      expect(app.cell(ICON_COL + 1, row).fg).toEqual(rgb(DESEL_GREY))
    }
  })
})

// ============================================================================
// bgOnlyChange coexistence — Box background toggle still works alongside the
// text restyle fast path.
// ============================================================================

describe("feature: Box bgOnlyChange still works with text restyle enabled", () => {
  test("toggling a card Box backgroundColor preserves child chars + incremental≡fresh", () => {
    const render = createRenderer({ cols: CARD_W, rows: 60 })
    const cards = buildCards(50)

    function BgBoard({ litId }: { litId: number }) {
      return (
        <Box flexDirection="column" width={CARD_W}>
          {cards.map((card) => (
            <Box
              key={card.id}
              width={CARD_W}
              backgroundColor={card.id === litId ? "#3a3f4b" : CARD_BG}
            >
              <Text color={DESEL_GREY} wrap="truncate">
                <Text color={ICON_CYAN}>●</Text> <Text color={LABEL_RED}>{card.label}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<BgBoard litId={-1} />)
    // Sweep the lit (bg-changed) card — bgOnlyChange fillBg must preserve chars
    // and STRICT must stay green.
    for (let id = 0; id < 50; id++) {
      app.rerender(<BgBoard litId={id} />)
      expect(app.cell(0, id).char).toBe("●")
      expect(app.cell(0, id).fg).toEqual(rgb(ICON_CYAN))
    }
  })
})
