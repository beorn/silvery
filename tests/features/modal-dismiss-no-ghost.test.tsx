/**
 * Modal Dismiss — No Ghost Cells.
 *
 * Regression test for the silvercode-observed bug pattern:
 *   1. Two-column layout: left column (content + bottom chrome) + right
 *      SidePanel (with explicit backgroundColor).
 *   2. ModalDialog mounts inside the bottom chrome (HistoryDialog,
 *      PermissionInbox shape — TextInput + SelectList children).
 *   3. User dismisses the modal.
 *   4. The cells the modal previously covered must match a fresh render of
 *      the modal-less tree — no leftover double-border fragments
 *      (`═══...╝`), no duplicated SidePanel rows.
 *
 * Bead: km-silvercode.modal-dismiss-ghost
 *
 * Three layers of verification:
 *
 *   1. Buffer-level (`createRenderer`): SILVERY_STRICT=1 (vitest/setup.ts
 *      default) auto-checks incremental === fresh on every rerender. An
 *      explicit row-by-row diff after dismiss gives a readable failure.
 *   2. ANSI-level (`createTermless` + `run`): drives a real terminal
 *      emulator (xterm.js by default) so cursor-positioning bugs in the
 *      output diff surface as visible drift even when the buffer is
 *      correct.
 *   3. Repeated open/close cycles to catch cumulative artifacts.
 *   4. In-flow BG-residue check: bg colors the modal INTRODUCED must not
 *      survive dismiss on any cell (bg-only residue is invisible to the
 *      char-plane snapshot — the popover-unmount shape, 12378 finding).
 *   5. Terminal focus-out/in round-trip after dismiss (12378 acceptance
 *      item 4): the focus-restore repaint must not resurrect modal cells.
 *
 * Load-bearing layout details (mirroring silvercode's App.tsx):
 *   - Right column has its OWN backgroundColor — without this, the ghost
 *     "duplicated text" symptom wouldn't be visible (blank-over-blank).
 *   - Modal is conditionally rendered inside a `flexShrink={0}` column,
 *     pushing/pulling the command input row.
 *   - Modal width (`snug-content`) is wider than the post-dismiss
 *     command-input row — leftover border cells would survive a
 *     same-row rewrite that only covers the input's actual width.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, ModalDialog, PopoverProvider, SelectList, Text, TextInput } from "@silvery/ag-react"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"

const COLS = 80
const ROWS = 20

/**
 * Mirrors silvercode's HistoryDialog — TextInput + SelectList inside a
 * ModalDialog. The TextInput owns focus while the modal is mounted; on
 * unmount, focus moves elsewhere. Many overlay-related bugs only surface
 * when the dismissed modal had a focused interactive child.
 */
function HistoryDialogShape(): React.ReactElement {
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const items = [
    { label: "session-id-aaaaaaaaaaaaaaaa  3 turns  user msg alpha", value: "0" },
    { label: "session-id-bbbbbbbbbbbbbbbb  5 turns  user msg bravo", value: "1" },
    { label: "session-id-cccccccccccccccc  2 turns  user msg charlie", value: "2" },
  ]
  return (
    <ModalDialog title="History" hotkey="Esc">
      <Box flexDirection="column" gap={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search session history"
          prompt="🔍 "
          isActive
        />
        <SelectList
          items={items}
          highlightedIndex={cursor}
          onHighlight={setCursor}
          onSelect={() => {}}
          isActive
        />
        <Text color="$fg-muted">Enter = open · Esc = close</Text>
      </Box>
    </ModalDialog>
  )
}

function App({ open }: { open: boolean }): React.ReactElement {
  // Pick a modal content width that's noticeably WIDER than the command-input
  // text on the row the modal will overlap when laid out. This is the load-
  // bearing condition for the silvercode symptom: the modal's bottom border
  // (`═══...╝`) extends into columns that the post-dismiss command input
  // does NOT rewrite, so any stale-pixel bug shows up as leftover `═`s.
  return (
    <PopoverProvider>
      <Box flexDirection="row" width={COLS} height={ROWS}>
        {/* LEFT column: content area + bottom chrome (where the modal lives). */}
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          {/* Content area — like PaneGrid */}
          <Box flexGrow={1} flexDirection="column">
            <Text>Pane content row 0</Text>
            <Text>Pane content row 1</Text>
            <Text>Pane content row 2</Text>
            <Text>Pane content row 3</Text>
            <Text>Pane content row 4</Text>
          </Box>
          {/* Bottom chrome — flexShrink=0, modal mounts here */}
          <Box flexDirection="column" flexShrink={0}>
            {open && <HistoryDialogShape />}
            {/* Command input — always present, pushes down when modal opens.
                Short content so the command-input row doesn't fully overwrite
                the cells the modal's bottom border previously occupied. */}
            <Box paddingX={2} paddingY={1} flexShrink={0}>
              <Text>{"> "}</Text>
            </Box>
          </Box>
        </Box>

        {/* RIGHT column: SidePanel-style with its own bg color. This is the
            column where the silvercode bug shows duplicated "SilverCode v0.1.0"
            text after dismissing the modal. */}
        <Box flexShrink={0} flexBasis={28} flexDirection="column" backgroundColor="#1e1e2e">
          <Text color="#cdd6f4">Sessions</Text>
          <Text color="#cdd6f4">{"  ▸ session 1"}</Text>
          <Text color="#cdd6f4">{"    session 2"}</Text>
          <Text color="#cdd6f4">Todos 0</Text>
          <Text color="#cdd6f4">Agents 0/0</Text>
          <Text color="#cdd6f4">Mode: auto</Text>
          <Text color="#cdd6f4">SilverCode v0.1.0</Text>
          <Text color="#cdd6f4">Claude Code v2.1.119</Text>
          <Text color="#cdd6f4">0K / 200K (0%)</Text>
          <Text color="#cdd6f4">~/Code/pim/km:main</Text>
        </Box>
      </Box>
    </PopoverProvider>
  )
}

/**
 * Take a buffer snapshot of every cell as a normalized string. Used to assert
 * that the post-unmount frame matches the pre-mount frame (which itself is
 * what a fresh render would produce — STRICT also verifies that path).
 */
function snapshotCells(
  app: { cell: (col: number, row: number) => { char: string; fg: unknown; bg: unknown } },
  cols: number,
  rows: number,
): string[] {
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ""
    for (let x = 0; x < cols; x++) {
      const c = app.cell(x, y)
      line += c.char || " "
    }
    lines.push(line)
  }
  return lines
}

/** Every distinct non-null bg color present in the frame, as "r,g,b" keys. */
function collectBgSet(
  app: {
    cell: (col: number, row: number) => { bg: { r: number; g: number; b: number } | null }
  },
  cols: number,
  rows: number,
): Set<string> {
  const set = new Set<string>()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const bg = app.cell(x, y).bg
      if (bg) set.add(`${bg.r},${bg.g},${bg.b}`)
    }
  }
  return set
}

describe("modal dismiss: no ghost cells", () => {
  test("dismissing HistoryDialog leaves no leftover border or duplicate sidebar text", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Frame 1: closed — establish the baseline.
    const app = render(<App open={false} />)
    const baseline = snapshotCells(app, COLS, ROWS)
    const baselineBgs = collectBgSet(app, COLS, ROWS)

    // Sanity check the baseline contains the SidePanel text exactly once on its row.
    const baselineSidebarRows = baseline.filter((line) => line.includes("SilverCode v0.1.0"))
    expect(baselineSidebarRows.length).toBe(1)

    // Frame 2: open — modal mounts, layout shifts, SidePanel + content rearrange.
    app.rerender(<App open={true} />)
    expect(app.text).toContain("History")
    expect(app.text).toContain("session-id-aaaa")

    // Bg colors the modal INTRODUCED (raised surface, input/list chrome).
    // Self-validating: the modal must introduce at least one new bg, or
    // this residue check would be vacuous.
    const modalOnlyBgs = new Set(
      [...collectBgSet(app, COLS, ROWS)].filter((c) => !baselineBgs.has(c)),
    )
    expect(
      modalOnlyBgs.size,
      "modal introduced no new bg color — residue check vacuous",
    ).toBeGreaterThan(0)

    // Frame 3: closed again — modal unmounts.
    app.rerender(<App open={false} />)
    const afterDismiss = snapshotCells(app, COLS, ROWS)

    // The post-dismiss frame must match the baseline cell-for-cell. STRICT=1
    // already auto-verifies incremental === fresh on every rerender, so any
    // ghost cells trip STRICT before we get here. The explicit row-by-row
    // assertion gives a readable diff when the bug manifests.
    for (let y = 0; y < ROWS; y++) {
      expect(afterDismiss[y], `row ${y} differs from baseline`).toBe(baseline[y])
    }

    // The SidePanel text must appear EXACTLY ONCE — duplicated rows are the
    // headline silvercode symptom.
    const sidebarRows = afterDismiss.filter((line) => line.includes("SilverCode v0.1.0"))
    expect(sidebarRows.length, "SilverCode v0.1.0 appears more than once after dismiss").toBe(1)

    // No leftover double-border fragments. The modal uses `borderStyle="double"`
    // so a partial dismiss leaves runs of `═` or a stray `╝`. Neither should
    // survive into the post-dismiss frame.
    for (const line of afterDismiss) {
      expect(line, "leftover double-border horizontal char").not.toContain("═")
      expect(line, "leftover double-border bottom-right char").not.toContain("╝")
      expect(line, "leftover double-border top-right char").not.toContain("╗")
      expect(line, "leftover double-border top-left char").not.toContain("╔")
      expect(line, "leftover double-border bottom-left char").not.toContain("╚")
    }

    // In-flow BG residue: no cell may retain a bg color that only the modal
    // introduced. Char-plane equality above cannot see this shape (bg-only
    // cells with a baseline-matching character, e.g. a space).
    const staleBgCells: string[] = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const bg = app.cell(x, y).bg
        if (bg && modalOnlyBgs.has(`${bg.r},${bg.g},${bg.b}`)) {
          staleBgCells.push(`(${x},${y})=${bg.r},${bg.g},${bg.b}`)
        }
      }
    }
    expect(staleBgCells, "cells retaining modal-only bg after dismiss").toEqual([])
  })

  test("ANSI output through xterm.js: no ghost cells after dismiss", async () => {
    // Buffer-level STRICT may pass even when the ANSI diff stream leaves
    // stale glyphs in a real terminal — the diff can mis-coordinate cursor
    // positions, omit clears for cells whose char didn't change but which
    // were repositioned by a layout shift, etc. createTermless feeds the
    // emitted ANSI through a real terminal emulator (xterm.js by default)
    // so this test sees what the user sees.
    using term = createTermless({ cols: COLS, rows: ROWS })

    // Drive open/close via keyboard so the harness emits real frames between
    // mounts (matching the silvercode flow: user opens, user dismisses).
    function StatefulApp(): React.ReactElement {
      const [open, setOpen] = useState(false)
      useInput((input, _key) => {
        if (input === "o") setOpen(true)
        if (input === "c") setOpen(false)
      })
      return <App open={open} />
    }

    const handle = await run(<StatefulApp />, term)
    // Capture baseline screen text (modal closed, post-mount frame).
    const baselineText = term.screen!.getText()

    // Open the modal — emits ANSI to draw the modal overlay.
    await handle.press("o")
    expect(term.screen!.getText()).toContain("History")
    // Open a few times to let any cumulative state settle.
    await handle.press("c")
    await handle.press("o")

    // Close the modal — must emit ANSI that fully erases the modal's previous
    // footprint. The bug manifests as leftover `═` / `╝` and / or duplicated
    // SidePanel rows in the post-dismiss screen.
    await handle.press("c")
    const afterDismiss = term.screen!.getText()

    // Strict cell-by-cell comparison via the emulator's screen text.
    expect(afterDismiss, "post-dismiss screen differs from baseline").toBe(baselineText)

    // Spot-check the headline silvercode symptoms.
    const lines = afterDismiss.split("\n")
    const sidebarRows = lines.filter((l) => l.includes("SilverCode v0.1.0"))
    expect(sidebarRows.length, "SilverCode v0.1.0 appears more than once after dismiss").toBe(1)
    for (const line of lines) {
      expect(line, "leftover double-border horizontal char").not.toContain("═")
      expect(line, "leftover double-border bottom-right char").not.toContain("╝")
    }

    // 12378 acceptance item 4: a terminal focus-out → focus-in round-trip
    // after dismiss must not resurrect any modal cells — the focus-restore
    // repaint replays from the runtime's model, never from stale buffer
    // state. (Raw focus-report bytes; same sendInput cast used by the
    // fullscreen-reflow-residue and input-routing suites.)
    const raw = term as unknown as { sendInput(data: string): void }
    raw.sendInput("\x1b[O")
    await new Promise((r) => setTimeout(r, 60))
    raw.sendInput("\x1b[I")
    await new Promise((r) => setTimeout(r, 60))
    expect(
      term.screen!.getText(),
      "screen changed after focus-out/in round-trip (stale-cell resurrection)",
    ).toBe(afterDismiss)

    handle.unmount()
  })

  test("repeated open/close cycles do not accumulate ghosts", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(<App open={false} />)
    const baseline = snapshotCells(app, COLS, ROWS)

    // Five open/close cycles. STRICT=1 auto-checks every rerender. The
    // post-cycle frame must still match baseline.
    for (let i = 0; i < 5; i++) {
      app.rerender(<App open={true} />)
      app.rerender(<App open={false} />)
    }

    const after = snapshotCells(app, COLS, ROWS)
    for (let y = 0; y < ROWS; y++) {
      expect(after[y], `row ${y} differs from baseline after cycles`).toBe(baseline[y])
    }
  })
})
