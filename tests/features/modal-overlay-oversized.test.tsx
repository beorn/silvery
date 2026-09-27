/**
 * @failure  A modal taller (or wider) than the screen loses its top instead of
 *           its bottom: ModalOverlay centres the guard box with justify-content
 *           center, and a centred child that overflows spills equally off BOTH
 *           edges (CSS and Yoga do the same), so the border, the title and the
 *           first rows land above row 0 while the footer is off the bottom too.
 *           The deck keyboard help (about 47 rows of chrome plus one-line keys)
 *           did exactly this at 120x36; it went unnoticed while flexily's Phase 5
 *           under-estimated the dialog's height (rows with wrapping text counted
 *           as one line, the centre sat about two rows higher), and surfaced the
 *           moment the engine reported the true height (@km/silvery/24197,
 *           2026-09-05). Measured on the pin, 120x36, 47-row help: y -5,
 *           height 47, title and first key row off-screen.
 * @level    l2 (real render through the reconciler and flexily; rects read from
 *           the laid-out nodes, then the painted text)
 * @consumer every ModalOverlay user: the deck help, the command palette, the
 *           pickers; any dialog opened on a small terminal
 *
 * Two limits this file stays inside, both pre-existing and filed separately:
 * the constrained case is height-constrained only (80x12), because a flex
 * item with an explicit width that the container shrinks still lays its
 * children out against the declared width (flexily Phase 1 takes a point
 * width verbatim), so a 72-wide dialog on a 60-column screen keeps 68-wide
 * rows and trips the tier-2 layout-overflow check; and under the tier-2
 * `residue` slug the two wheel cases report pipeline-state contamination at
 * (0,0), the same signature modal-dismiss-no-ghost.test.tsx shows on the
 * untouched components (plain scroll containers pass that slug).
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../../packages/ag-react/src/components/Box"
import { Text } from "../../packages/ag-react/src/components/Text"
import { ModalOverlay } from "../../packages/ag-react/src/ui/components/ModalOverlay"
import { ShortcutHelpDialog } from "../../packages/ag-react/src/ui/components/ShortcutHelpDialog"

const ACTIONS = [
  "Show the deck keyboard help dialog",
  "Open the searchable command palette",
  "Split the current pane side-by-side (new pane to the right)",
  "Split the current pane top/bottom (new pane below)",
  "Close the current pane (keeps at least one open)",
  "Toggle zoom of the current pane (hide the others)",
  "Stack the current pane with its neighbor (one slot, tabs)",
  "Expand the current pane's stack back into splits",
  "Show the next pane in the current stack",
  "Show the previous pane in the current stack",
  "Equalize all pane split weights",
  "Swap the current pane with its left neighbor",
  "Swap the current pane with its lower neighbor",
  "Swap the current pane with its upper neighbor",
  "Swap the current pane with its right neighbor",
  "Focus the pane to the left",
  "Focus the pane below",
  "Focus the pane above",
  "Focus the pane to the right",
  "Open a searchable picker over panes and sessions",
  "Focus a pane via the searchable picker",
  "Focus the pane whose centered overlay number is pressed",
  "Focus adjacent pane without the prefix chord",
  "Open a new agent pane to the right and focus its prompt",
  "Open a new shell pane to the right and focus it",
  "Open a launcher for the current backend",
  "Rename the current session",
  "Detach from the deck without stopping anything",
  "Quit the deck",
]

/** The deck help shape: two sections, 14-cell key column, 72 wide, ~47 rows. */
function help(rows: number) {
  const actions = Array.from({ length: rows }, (_, i) =>
    i === rows - 1 ? ACTIONS[LAST]! : ACTIONS[i % LAST]!,
  )
  const split = Math.ceil(rows * 0.7)
  // The wrapper is the guard's only child, so its rect is the dialog's rect.
  return (
    <Box id="dlg">
      <ShortcutHelpDialog
        title="Deck keyboard help"
        footer="Esc to close"
        keyColumnWidth={14}
        sections={[
          {
            title: "Panes",
            rows: actions.slice(0, split).map((a, i) => ({ keys: [`Ctrl+G ${i}`], action: a })),
          },
          {
            title: "Session",
            rows: actions.slice(split).map((a, i) => ({ keys: [`Ctrl+G s${i}`], action: a })),
          },
        ]}
      />
    </Box>
  )
}

function mount(cols: number, rows: number, dialog: React.ReactNode) {
  return createRenderer({ cols, rows })(
    <Box width={cols} height={rows} flexDirection="column">
      <Box id="under" flexGrow={1}>
        <Text>UNDER</Text>
      </Box>
      <ModalOverlay>{dialog}</ModalOverlay>
    </Box>,
  )
}

function read(app: ReturnType<ReturnType<typeof createRenderer>>) {
  const node = app.locator("#dlg").resolve()
  if (!node?.boxRect) throw new Error("no #dlg box was laid out")
  const lines = app.text.split("\n")
  const line = (needle: string) => lines.findIndex((l) => l.includes(needle))
  return {
    rect: node.boxRect,
    titleLine: line("Deck keyboard help"),
    firstRowLine: line("Show the deck keyboard help dialog"),
    lastRowLine: line("Quit the deck"),
    footerLine: line("Esc to close"),
  }
}

function screen(cols: number, rows: number, dialog: React.ReactNode) {
  const app = mount(cols, rows, dialog)
  const out = read(app)
  app.unmount()
  return out
}

/** The last action string is unique in a 40-row help: rows 28 and 29 wrap the list. */
const LAST = ACTIONS.length - 1

describe("ModalOverlay keeps an oversized modal on the screen", () => {
  test("control: a fitting dialog is centred", () => {
    const s = screen(120, 36, help(6))
    // 6 rows + 2 section titles + margin + title block (2) + footer (2) + paddingY (2) + border (2)
    expect(s.rect.height).toBeLessThan(36)
    // centred to within the one-row rounding of an odd remainder
    expect(Math.abs(s.rect.y - (36 - s.rect.height) / 2)).toBeLessThanOrEqual(1)
    expect(s.rect.x).toBe(Math.floor((120 - 72) / 2))
    // paddingY 1, no border: title on the second row, footer on the second-to-last
    expect(s.titleLine).toBe(s.rect.y + 1)
    expect(s.lastRowLine).toBeGreaterThan(s.firstRowLine)
    expect(s.footerLine).toBe(s.rect.y + s.rect.height - 2)
  })

  test("the 47-row deck help at 120x36 keeps its title and its first row on the screen", () => {
    const s = screen(120, 36, help(40))
    // Measured 2026-09-05 on the pin: rect y -5 height 47 (3f9c818) / y -3 (807ff18); title and first row off-screen.
    expect(s.rect.y).toBe(0)
    expect(s.rect.height).toBe(36)
    expect(s.rect.x).toBe(24)
    expect(s.titleLine).toBe(1)
    expect(s.firstRowLine).toBeGreaterThan(s.titleLine)
    expect(s.lastRowLine).toBe(-1)
    expect(s.footerLine).toBe(34)
  })

  test("the clipped rows stay reachable: the body scrolls by wheel down to the last row", async () => {
    const app = mount(120, 36, help(40))
    const before = read(app)
    expect(before.lastRowLine).toBe(-1)
    await app.wheel(60, 18, 200)
    const after = read(app)
    expect(after.titleLine).toBe(1)
    expect(after.footerLine).toBe(34)
    expect(after.lastRowLine).toBeGreaterThan(1)
    expect(after.lastRowLine).toBeLessThan(34)
    app.unmount()
  })

  test("a constrained 80x12 viewport reaches the title, a key row, the last row by wheel, and the footer", async () => {
    const app = mount(80, 12, help(40))
    const s = read(app)
    expect(s.rect.x).toBe(4)
    expect(s.rect.y).toBe(0)
    expect(s.rect.width).toBe(72)
    expect(s.rect.height).toBe(12)
    expect(s.titleLine).toBe(1)
    expect(s.firstRowLine).toBeGreaterThan(s.titleLine)
    expect(s.footerLine).toBe(10)
    await app.wheel(40, 6, 200)
    const after = read(app)
    expect(after.titleLine).toBe(1)
    expect(after.footerLine).toBe(10)
    expect(after.lastRowLine).toBeGreaterThan(1)
    expect(after.lastRowLine).toBeLessThan(10)
    app.unmount()
  })
})
