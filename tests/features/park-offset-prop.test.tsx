/**
 * parkOffset Box prop — hardware-cursor PARK target as layout output
 * (@km/code/v0.2/19702).
 *
 * The non-focus-gated sibling of `cursorOffset`: a Box declares the cell where a
 * managed frame parks (then hides) the hardware cursor, even with NO visible
 * caret and NO focus. A multiplexer that drops `?25l` then surfaces a benign,
 * predictable cursor on that declared cell — never stranded above the prompt or
 * on dynamic chrome (the deleted box-origin/home fallback).
 *
 * New-prop gate (silvery "New Props Require Tests"): exercises `parkOffset`
 * through the FULL render pipeline (run + termless) at SILVERY_STRICT=1 with a
 * 50+ node tree. Models cmux/Ghostty dropping the hide by stripping `?25l` and
 * replaying the bytes through xterm.js to read the hardware cursor's rest cell.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run, useInput } from "@silvery/ag-term/runtime"
import { Box, Text } from "@silvery/ag-react"
import { findActiveParkRect, getLayoutSignals } from "@silvery/ag/layout-signals"
import type { AgNode, BoxProps } from "@silvery/ag/types"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"

const COLS = 80
const ROWS = 24
const settle = (ms = 150) => new Promise<void>((resolve) => setTimeout(resolve, ms))

interface Handle {
  unmount(): void
}
type TermlessTerm = ReturnType<typeof createTermless>

function replayCursor(output: string): { x: number; y: number; visible: boolean | null } {
  const terminal = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
  try {
    terminal.feed(output)
    const c = terminal.getCursor()
    return { x: c.x, y: c.y, visible: c.visible }
  } finally {
    void terminal.close()
  }
}

function screenRowOf(term: TermlessTerm, needle: string): number {
  return term.screen.getLines().findIndex((line) => line.includes(needle))
}

// A realistic-scale (>50 node) backdrop: 10 cols x 5 rows of text cells, so the
// pipeline runs the prop at scale (incremental cascade, residue) under STRICT.
function Backdrop(): React.ReactElement {
  return (
    <Box flexDirection="column">
      {Array.from({ length: 5 }).map((_, r) => (
        <Box key={r} flexDirection="row" gap={1}>
          {Array.from({ length: 10 }).map((_, c) => (
            <Box key={c}>
              <Text>{`r${r}c${c}`}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

describe("parkOffset prop (hardware-cursor park as layout output, 19702)", () => {
  test("parks the hardware cursor on the declared parkOffset cell — no caret, hide dropped", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    function App(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Backdrop />
          <Box flexGrow={1} />
          {/* Editable-like Box declaring its input cell as the park target —
              NO cursorOffset (unfocused/idle), NO focus. */}
          <Box parkOffset={{ col: 0, row: 0 }}>
            <Text>PARKHERE input row</Text>
          </Box>
          <Text>status bar row</Text>
        </Box>
      )
    }
    const handle = (await run(<App />, term)) as unknown as Handle
    await settle()

    const output = term.out.getText()
    expect(output, "managed frame must hide the hardware cursor (?25l)").toContain("\x1b[?25l")
    const parkRow = screenRowOf(term, "PARKHERE")
    expect(parkRow, "park-row marker must be present").toBeGreaterThanOrEqual(0)

    // Model cmux/Ghostty dropping the hide: the parked cursor surfaces wherever
    // the frame parked it. It MUST be the declared parkOffset row, not home/chrome.
    const cursor = replayCursor(output.replace(/\x1b\[\?25l/g, ""))
    expect(cursor.y, `parked cursor must rest on the declared parkOffset row ${parkRow}`).toBe(
      parkRow,
    )
    handle.unmount()
  })

  test("MUTATION: removing parkOffset → park falls back to home(0,0)", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    function App(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Backdrop />
          <Box flexGrow={1} />
          {/* SAME tree, parkOffset REMOVED — proves the prop is load-bearing. */}
          <Box>
            <Text>PARKHERE input row</Text>
          </Box>
          <Text>status bar row</Text>
        </Box>
      )
    }
    const handle = (await run(<App />, term)) as unknown as Handle
    await settle()

    const cursor = replayCursor(term.out.getText().replace(/\x1b\[\?25l/g, ""))
    // No editable/park declarer in the frame → the ONE remaining home fallback.
    expect(cursor.y, "no park declarer → home row 0").toBe(0)
    expect(cursor.x, "no park declarer → home col 0").toBe(0)
    handle.unmount()
  })

  test("deepest parkOffset declarer wins (post-order, non-focus-gated)", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    function App(): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          {/* shallow declarer, higher up */}
          <Box parkOffset={{ col: 0, row: 0 }}>
            <Text>SHALLOWpark row</Text>
          </Box>
          <Backdrop />
          <Box flexGrow={1} />
          {/* deeper + later declarer — should win the park */}
          <Box>
            <Box parkOffset={{ col: 0, row: 0 }}>
              <Text>DEEPESTpark row</Text>
            </Box>
          </Box>
          <Text>status bar row</Text>
        </Box>
      )
    }
    const handle = (await run(<App />, term)) as unknown as Handle
    await settle()

    const deepRow = screenRowOf(term, "DEEPESTpark")
    const cursor = replayCursor(term.out.getText().replace(/\x1b\[\?25l/g, ""))
    expect(cursor.y, `deepest/last parkOffset declarer wins (row ${deepRow})`).toBe(deepRow)
    handle.unmount()
  })

  test("compact pane (28 cols, ~cmux agent-pane width) still parks on the declared cell", async () => {
    // The live 19702 panes were narrow worker panes; pin that the park resolves
    // at a compact width too, not only the 80-col default. Self-contained replay
    // at the compact width.
    const CCOLS = 28
    using term = createTermless({ cols: CCOLS, rows: ROWS })
    function App(): React.ReactElement {
      return (
        <Box width={CCOLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} />
          <Box parkOffset={{ col: 0, row: 0 }}>
            <Text>PARKHERE</Text>
          </Box>
          <Text>status</Text>
        </Box>
      )
    }
    const handle = (await run(<App />, term)) as unknown as Handle
    await settle()

    const parkRow = term.screen.getLines().findIndex((line) => line.includes("PARKHERE"))
    expect(parkRow, "compact park-row marker present").toBeGreaterThanOrEqual(0)
    const terminal = createTerminal({ backend: createXtermBackend(), cols: CCOLS, rows: ROWS })
    let cursorY = -1
    try {
      terminal.feed(term.out.getText().replace(/\x1b\[\?25l/g, ""))
      cursorY = terminal.getCursor().y
    } finally {
      void terminal.close()
    }
    expect(cursorY, "compact pane parks on the declared parkOffset row").toBe(parkRow)
    handle.unmount()
  })

  // #26660: the park rect is written by the layout phase's notify step. A
  // parkOffset-only change leaves every Flexily node clean, and with a root the
  // size of the terminal the layout-on-demand gate used to skip that step.
  // parkOffset does not allocate signals by itself (findActiveParkRect computes
  // from props when a node has none), so this row allocates them the way any
  // reader does, then moves the park cell.
  test("a parkOffset-only change moves the node's parkRect signal", async () => {
    using term = createTermless({ cols: COLS, rows: ROWS })
    function App(): React.ReactElement {
      const [col, setCol] = useState(0)
      useInput((input) => {
        if (input === "p") setCol(5)
      })
      return (
        <Box width={COLS} height={ROWS} flexDirection="column" paddingLeft={2}>
          <Backdrop />
          <Box flexGrow={1} />
          <Box parkOffset={{ col, row: 0 }}>
            <Text>PARKHERE input row</Text>
          </Box>
          <Text>status bar row</Text>
        </Box>
      )
    }
    const handle = await run(<App />, term)
    await handle.waitForLayoutStable()
    const node = findParkDeclarer(handle.root)
    if (!node) throw new Error("test fixture: no parkOffset node")
    const sig = getLayoutSignals(node)
    const row = ROWS - 2
    expect(sig.parkRect()).toEqual({ x: 2, y: row, width: 1, height: 1 })

    await handle.press("p")
    await handle.waitForLayoutStable()
    expect(sig.parkRect(), "paddingLeft 2 + col 5").toEqual({ x: 7, y: row, width: 1, height: 1 })
    expect(findActiveParkRect(handle.root)).toEqual({ x: 7, y: row, width: 1, height: 1 })
    handle.unmount()
  })
})

function findParkDeclarer(node: AgNode): AgNode | null {
  if ((node.props as BoxProps | undefined)?.parkOffset) return node
  for (const child of node.children) {
    const hit = findParkDeclarer(child)
    if (hit) return hit
  }
  return null
}
