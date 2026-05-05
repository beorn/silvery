/**
 * Regression: outline residue across columns — light-blue/cyan strips after
 * editing a card in one column and moving cursor.
 *
 * User-visible bug (km-silvery.render-light-blue-bg-strip-residue, 2026-05-05):
 * pale-cyan ~1-row-tall horizontal strips appeared in cards across multiple
 * columns of the kanban board. The cyan tint matches `$border-focus`
 * (= accentBg in Sterling), which km-tui uses for `outlineColor` on the
 * editing card (`apps/km-tui/src/views/shared-components.tsx`).
 *
 * Hypothesis: the decoration phase's outline snapshots tracking (Phase 2
 * Step 5 / km-silvery.outline-incremental-clear) does not always restore the
 * cells that the previous-frame outline overwrote when the OWNING card was
 * removed from the visible-children set of an enclosing scroll container OR
 * shifted via Tier 1 buffer-shift. Either case lets cyan outline pixels
 * survive into the next frame.
 *
 * SILVERY_STRICT=1 (default in vendor tests) verifies incremental === fresh
 * cell-by-cell. This test exercises the structures most likely to break:
 *   - kanban-shaped flex row of columns
 *   - multiple cards per column with `borderStyle="round"` + bg
 *   - one card has a transient outline that toggles + moves
 *   - cursor moves across columns while the outlined card persists
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

interface CardSpec {
  id: string
  title: string
  body: string[]
}

interface ColSpec {
  id: string
  title: string
  cards: CardSpec[]
}

function makeBoard(numCols: number, cardsPerCol: number): ColSpec[] {
  const cols: ColSpec[] = []
  for (let c = 0; c < numCols; c++) {
    const cards: CardSpec[] = []
    for (let i = 0; i < cardsPerCol; i++) {
      cards.push({
        id: `c${c}-${i}`,
        title: `Task ${c}.${i}`,
        body: [`body line ${c}.${i}.A`, `body line ${c}.${i}.B`],
      })
    }
    cols.push({ id: `col${c}`, title: `Col ${c}`, cards })
  }
  return cols
}

function Card({
  card,
  cardBg,
  borderColor,
  outlined,
  width,
}: {
  card: CardSpec
  cardBg: string | undefined
  borderColor: string
  outlined: boolean
  width: number
}) {
  // Mirrors apps/km-tui/src/views/shared-components.tsx: when editing, wrap
  // the card in a Box with outlineStyle="round" outlineColor="$border-focus".
  const inner = (
    <Box
      id={card.id}
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={borderColor}
      backgroundColor={cardBg}
      flexShrink={0}
    >
      <Text bold color={cardBg ? "$fg-on-selected" : "$fg"}>
        {card.title}
      </Text>
      {card.body.map((line, i) => (
        <Text key={i} color="$muted">
          {line}
        </Text>
      ))}
    </Box>
  )
  if (outlined) {
    return (
      <Box outlineStyle="round" outlineColor="$border-focus">
        {inner}
      </Box>
    )
  }
  return inner
}

function Column({
  col,
  cursorCardId,
  editingCardId,
  width,
}: {
  col: ColSpec
  cursorCardId: string | null
  editingCardId: string | null
  width: number
}) {
  return (
    <Box flexDirection="column" width={width} flexShrink={0} paddingX={1}>
      <Text bold color="$primary">
        {col.title}
      </Text>
      <Box height={1} flexShrink={0} />
      {col.cards.map((card) => {
        const isCursor = cursorCardId === card.id
        const isEditing = editingCardId === card.id
        const cardBg = isEditing ? undefined : isCursor ? "$bg-selected" : undefined
        const borderColor = isEditing
          ? "$border-focus"
          : isCursor
            ? "$bg-selected"
            : "$border-default"
        return (
          <Box key={card.id} flexDirection="column" flexShrink={0}>
            <Card
              card={card}
              cardBg={cardBg}
              borderColor={borderColor}
              outlined={isEditing}
              width={width - 2}
            />
            <Box height={1} flexShrink={0} />
          </Box>
        )
      })}
    </Box>
  )
}

function Board({
  cols,
  cursorCardId,
  editingCardId,
  totalWidth,
}: {
  cols: ColSpec[]
  cursorCardId: string | null
  editingCardId: string | null
  totalWidth: number
}) {
  const colWidth = Math.floor(totalWidth / cols.length)
  return (
    <Box flexDirection="row" width={totalWidth}>
      {cols.map((col) => (
        <Column
          key={col.id}
          col={col}
          cursorCardId={cursorCardId}
          editingCardId={editingCardId}
          width={colWidth}
        />
      ))}
    </Box>
  )
}

describe("outline + bg combo: kanban-shaped layout (regression — light-blue strip residue)", () => {
  test("toggling editing on one card while cursor moves across columns leaves no residue", () => {
    // Realistic scale: 5 columns × 6 cards = 30 cards, 60 body rows, ~30 borders.
    // Total tree size ≈ 200 nodes — large enough to surface incremental cascade
    // bugs that 2-3 node fixtures miss.
    const cols = makeBoard(5, 6)
    const render = createRenderer({ cols: 160, rows: 40 })

    function App({ cursor, editing }: { cursor: string | null; editing: string | null }) {
      return (
        <Box width={160} height={40} flexDirection="column">
          <Board cols={cols} cursorCardId={cursor} editingCardId={editing} totalWidth={160} />
        </Box>
      )
    }

    // Frame 1: cursor on c0-0, no editing — establishes prev buffer.
    const app = render(<App cursor="c0-0" editing={null} />)
    expect(app.text).toContain("Task 0.0")

    // Frame 2: enter edit mode on c0-0 — outline appears around it.
    app.rerender(<App cursor="c0-0" editing="c0-0" />)
    expect(app.text).toContain("Task 0.0")

    // Frame 3: exit edit mode (c0-0 still cursor) — outline must be cleared.
    app.rerender(<App cursor="c0-0" editing={null} />)
    expect(app.text).toContain("Task 0.0")

    // Frame 4: cursor moves to c1-0 (different column) — selection bg must
    // shift cleanly across columns. Any leftover outline residue from frame 2
    // would show up here as STRICT divergence.
    app.rerender(<App cursor="c1-0" editing={null} />)
    expect(app.text).toContain("Task 1.0")

    // Frame 5: cursor moves down within column 1.
    app.rerender(<App cursor="c1-2" editing={null} />)
    expect(app.text).toContain("Task 1.2")

    // Frame 6: enter edit mode on a card in column 2 — outline draws elsewhere.
    app.rerender(<App cursor="c2-3" editing="c2-3" />)
    expect(app.text).toContain("Task 2.3")

    // Frame 7: exit edit, move cursor to column 4 — both bg and outline must clear.
    app.rerender(<App cursor="c4-1" editing={null} />)
    expect(app.text).toContain("Task 4.1")

    // Frame 8: re-enter edit mode on a card in column 0 — outline geometry differs.
    app.rerender(<App cursor="c0-2" editing="c0-2" />)
    expect(app.text).toContain("Task 0.2")

    // Frame 9: cursor swings back through previously-visited columns.
    app.rerender(<App cursor="c4-5" editing={null} />)
    expect(app.text).toContain("Task 4.5")
  })

  test("rapid edit-toggle on cards with varying body sizes — no cyan strip residue", () => {
    // Variable-height cards expose layoutChangedThisFrame interactions with
    // outline snapshots: a card growing/shrinking can shift the next card's
    // y-coordinate, and outline cells sit at y-1 / y+h positions that the
    // cascade must invalidate when the layout shifts.
    const cols: ColSpec[] = [
      {
        id: "col0",
        title: "Variable",
        cards: [
          { id: "v0", title: "tiny", body: [] },
          { id: "v1", title: "small", body: ["a"] },
          { id: "v2", title: "medium", body: ["a", "b", "c"] },
          { id: "v3", title: "large", body: ["a", "b", "c", "d", "e"] },
        ],
      },
      {
        id: "col1",
        title: "Same",
        cards: [
          { id: "s0", title: "one", body: ["x"] },
          { id: "s1", title: "two", body: ["x"] },
          { id: "s2", title: "three", body: ["x"] },
        ],
      },
    ]
    const render = createRenderer({ cols: 100, rows: 30 })

    function App({ editing }: { editing: string | null }) {
      return (
        <Box width={100} height={30}>
          <Board cols={cols} cursorCardId={editing} editingCardId={editing} totalWidth={100} />
        </Box>
      )
    }

    const app = render(<App editing={null} />)
    expect(app.text).toContain("tiny")

    // Walk editing through every card in the variable column — each edit toggle
    // is a layout-relevant change because the outlined wrapper adds a frame.
    const sequence = ["v0", "v1", "v2", "v3", "v2", "v1", "v0", "s0", "s2", "v3", null]
    for (const editing of sequence) {
      app.rerender(<App editing={editing} />)
    }
  })

  test("editing card adjacent to other cards — outline corners do not leak onto siblings", () => {
    // Tight layout: outline draws AT the column edge (x-1, x+w in parent space).
    // If the parent is the column flex item with paddingX={1}, the outline
    // x-1 lands on the column padding cell, which is ALSO part of the parent's
    // bg. STRICT must catch any cell that survives outline-removal.
    const render = createRenderer({ cols: 60, rows: 20 })

    function App({ editing }: { editing: boolean }) {
      return (
        <Box flexDirection="row" width={60} height={20}>
          <Box flexDirection="column" width={30} paddingX={1}>
            <Text bold>Left</Text>
            {editing ? (
              <Box outlineStyle="round" outlineColor="$border-focus">
                <Box
                  width={28}
                  borderStyle="round"
                  borderColor="$border-focus"
                  flexDirection="column"
                >
                  <Text bold color="$bg-accent">
                    Editing card
                  </Text>
                  <Text color="$muted">line 1</Text>
                  <Text color="$muted">line 2</Text>
                </Box>
              </Box>
            ) : (
              <Box
                width={28}
                borderStyle="round"
                borderColor="$border-default"
                flexDirection="column"
              >
                <Text bold>Idle card</Text>
                <Text color="$muted">line 1</Text>
                <Text color="$muted">line 2</Text>
              </Box>
            )}
            <Box height={1} />
            <Box width={28} borderStyle="round" borderColor="$border-default">
              <Text>Sibling A</Text>
            </Box>
          </Box>
          <Box flexDirection="column" width={30} paddingX={1}>
            <Text bold>Right</Text>
            <Box width={28} borderStyle="round" borderColor="$border-default">
              <Text>Sibling B</Text>
            </Box>
            <Box width={28} borderStyle="round" borderColor="$border-default">
              <Text>Sibling C</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = render(<App editing={false} />)
    expect(app.text).toContain("Idle card")

    // Toggle edit on/off repeatedly — each toggle adds/removes an outlined wrapper.
    for (let i = 0; i < 4; i++) {
      app.rerender(<App editing={true} />)
      expect(app.text).toContain("Editing card")
      app.rerender(<App editing={false} />)
      expect(app.text).toContain("Idle card")
    }
  })
})
