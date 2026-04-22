/**
 * Regression: km-silvery.layout-churn-leaks-pixels (terminal-level test)
 *
 * The buffer-level STRICT test passes because the render phase produces the
 * correct buffer. The bug lives in the output phase: when a column-set reflow
 * happens between frames and cells at some row are NOT written by any node in
 * the new frame, `diffBuffers` skips those rows (they're not marked dirty in
 * the new buffer), so no ANSI write goes out and the terminal retains stale
 * characters from the previous wave.
 *
 * This test replays the bug via `createTermless()` + `run()`: real ANSI goes
 * through a real xterm.js backend, which is the only way to see the leak.
 *
 * Canonical repro (km): `bun km view /tmp/v` with lazy folder-board hydration
 * causes `@next | @someday | archive` → `archive | done | inbox` reflow and
 * leaves `─╯` / `╯` corner fragments at the old column boundaries.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

interface ColumnSpec {
  id: string
  title: string
  cards: string[]
}

// Mirror the km repro: wave 1 has 2 short columns + 1 empty column;
// wave 2 has 1 empty column (same id, different position) + 2 tall columns
// (new ids, new positions).
const WAVE_1: ColumnSpec[] = [
  { id: "next", title: "@next", cards: ["Inbox"] },
  { id: "someday", title: "@someday", cards: ["Ideas"] },
  { id: "archive", title: "archive", cards: [] },
]

const WAVE_2: ColumnSpec[] = [
  { id: "archive", title: "archive", cards: [] },
  { id: "done", title: "done", cards: ["t1", "t2", "t3"] },
  { id: "inbox", title: "inbox", cards: ["t1", "t2", "t3"] },
]

function Card({ title }: { title: string }) {
  return (
    <Box borderStyle="round" paddingX={1} minHeight={3} flexShrink={0}>
      <Text>{title}</Text>
    </Box>
  )
}

function Column({ spec }: { spec: ColumnSpec }) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      paddingX={1}
      overflow="hidden"
      backgroundColor="#223344"
    >
      <Text bold>{spec.title}</Text>
      <Box flexDirection="column" gap={1} marginTop={1}>
        {spec.cards.map((c) => (
          <Card key={c} title={c} />
        ))}
      </Box>
    </Box>
  )
}

// Stable component identity: state drives the column set so the reconciler
// diffs keys rather than replacing the root component (matches the km path
// where the BoardView re-renders with new columnIds).
let setStateRef: ((v: number) => void) | null = null
function Board() {
  const [wave, setWave] = React.useState(0)
  setStateRef = setWave
  const columns = wave === 0 ? WAVE_1 : WAVE_2
  return (
    <Box flexDirection="column" width={120} height={20} backgroundColor="#111111">
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {columns.map((col) => (
          <Box key={col.id} flexShrink={0} width={40}>
            <Column spec={col} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

describe("km-silvery.layout-churn-leaks-pixels (terminal)", () => {
  test("reflowing the column set leaves no stale cells on screen", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const handle = await run(<Board />, term)

    // Frame 1: wave-1 columns on screen.
    expect(term.screen!.getText()).toContain("@next")
    expect(term.screen!.getText()).toContain("@someday")

    // Trigger the reflow — React re-renders with wave=1.
    setStateRef?.(1)
    // Let the runtime drain re-render + output.
    await new Promise((r) => setTimeout(r, 50))

    const text = term.screen!.getText()
    expect(text).toContain("archive")
    expect(text).toContain("done")
    expect(text).toContain("inbox")
    // Wave-1 column titles must be gone.
    expect(text).not.toContain("@next")
    expect(text).not.toContain("@someday")

    // Spot-check: the wave-1 inbox/ideas card contents must not leak through.
    expect(text).not.toContain("Inbox")
    expect(text).not.toContain("Ideas")

    // Reflow-leak signature: orphan corner characters (`─╯`, `╯`) at row/col
    // positions that aren't inside any current card. After wave-2 every `╯`
    // and `╮` must sit at the bottom-right or top-right of a current card;
    // we assert that each `╯` has a matching `│` directly above it on the
    // same card.
    const lines = text.split("\n")
    for (let y = 1; y < lines.length; y++) {
      const line = lines[y]
      if (!line) continue
      for (let x = 0; x < line.length; x++) {
        const ch = line[x]
        if (ch === "╯" || ch === "╰") {
          // Above must be `│` (card vertical edge) — otherwise this is an
          // orphan corner from a previous layout.
          const above = lines[y - 1]?.[x] ?? " "
          expect(
            ["│", " "].includes(above),
            `orphan ${ch} at (${x},${y}): above='${above}' (expected '│' or empty)`,
          ).toBe(true)
        }
      }
    }

    handle.unmount()
  })
})
