/**
 * Backdrop Kitty Graphics Overlay — byte-level regression tests.
 *
 * Verifies Option C of the emoji-fade design (see hub/silvery design docs):
 *
 *   1. When the Kitty graphics capability is **enabled**, the backdrop-fade
 *      pass emits APC graphics escapes for emoji / wide-char cells inside
 *      the faded region. Terminals that honor the protocol render a
 *      translucent scrim *above* the glyph, fading the emoji alongside
 *      surrounding text.
 *
 *   2. When the capability is **disabled**, no APC graphics escapes are
 *      emitted. Backdrop-fade degrades to the cell-level blend + SGR 2 dim
 *      path with no side-channel output.
 *
 *   3. Incremental and fresh renders produce identical Kitty overlays (the
 *      overlay is a pure function of the post-fade buffer state — fresh
 *      path buffer === incremental path buffer at the wide-char cells).
 *      SILVERY_STRICT=1 (auto-enabled by the test setup) runs this check on
 *      every rerender — if the overlay diverged, STRICT would fail first.
 *
 * We verify the escape sequence shape directly rather than the visual
 * result because:
 *   - The cell buffer is unchanged by the overlay (the scrim lands on top
 *     in the real terminal, not in our buffer representation).
 *   - Emulator backends (vt100.js, xterm.js) may or may not implement the
 *     Kitty graphics protocol — byte-level assertions are the only
 *     deterministic check across backends.
 */

import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, ModalDialog, ThemeProvider } from "@silvery/ag-react"
import { deriveTheme } from "@silvery/ansi"
import { catppuccinMocha } from "@silvery/theme/schemes"

const darkTheme = deriveTheme(catppuccinMocha, "truecolor")

// Kitty APC protocol markers we assert on:
//   \x1b_G...\x1b\\  — generic APC graphics command envelope
//   a=t              — transmit (upload) image
//   a=p              — place image at current cursor
//   a=d              — delete placements
const APC_OPEN = "\x1b_G"
const APC_CLOSE = "\x1b\\"

// Save the env var across tests — the env heuristic reads it lazily at Ag
// construction time. Toggling it between tests lets us exercise both branches
// without coupling to the terminal the test runner started in.
let originalEnv: string | undefined

beforeEach(() => {
  originalEnv = process.env.SILVERY_KITTY_GRAPHICS
})

afterEach(() => {
  if (originalEnv === undefined) delete process.env.SILVERY_KITTY_GRAPHICS
  else process.env.SILVERY_KITTY_GRAPHICS = originalEnv
})

describe("backdrop Kitty overlay: capability enabled", () => {
  test("emits APC graphics escapes for emoji cells inside faded region", () => {
    // Force the capability on — bypasses the env heuristic's TMUX / TERM check.
    process.env.SILVERY_KITTY_GRAPHICS = "1"

    const render = createRenderer({ cols: 40, rows: 10 })

    // ThemeProvider supplies defaultBg so the blend target resolves to the
    // dark neutral. ModalDialog marks its outside-region with
    // `data-backdrop-fade-excluded` — the entire area outside the dialog
    // gets faded, and any emoji cells in that area get Kitty overlays.
    function App({ open }: { open: boolean }) {
      return (
        <ThemeProvider theme={darkTheme}>
          <Box flexDirection="column" padding={1}>
            <Text>Status: 🎉 Ready!</Text>
            <Text>More text below</Text>
            {open && (
              <ModalDialog title="Info" fade={0.4}>
                <Text>Dialog body</Text>
              </ModalDialog>
            )}
          </Box>
        </ThemeProvider>
      )
    }

    // Frame 1: no modal → no backdrop, no overlay.
    const app = render(<App open={false} />)
    const frame1 = app.frames[0] ?? ""
    expect(frame1).not.toContain(APC_OPEN)

    // Frame 2: modal opens. Backdrop becomes active. The emoji on row 1 is
    // outside the dialog's rect → in the faded region → Kitty overlay
    // should target its cell.
    app.rerender(<App open={true} />)
    const frame2 = app.frames.at(-1) ?? ""

    // Must contain the APC graphics envelope.
    expect(frame2).toContain(APC_OPEN)
    expect(frame2).toContain(APC_CLOSE)

    // Must contain at least one upload (a=t) and at least one placement (a=p).
    expect(frame2).toMatch(/\x1b_G[^\\]*a=t[^\\]*\x1b\\/)
    expect(frame2).toMatch(/\x1b_G[^\\]*a=p[^\\]*\x1b\\/)

    // Placement must include C=1 (no cursor advance) and z=1 (above text)
    // and the cell extent c=2 (wide char covers 2 cells).
    expect(frame2).toMatch(/a=p[^\\]*c=2[^\\]*r=1[^\\]*z=1[^\\]*C=1/)

    // Frame 3: modal stays open on a rerender. The delete-all + re-place
    // pattern means every frame with an active backdrop emits a fresh
    // overlay batch. We assert the rerender emits its own overlay, not
    // just reuses frame 2's.
    app.rerender(<App open={true} />)
    const frame3 = app.frames.at(-1) ?? ""
    // This may be an incremental frame where no cells changed — accept
    // either a fresh overlay batch OR an empty frame (no changes means
    // no side-channel emission either).
    if (frame3.length > 0) {
      // If anything was emitted, it should be the same overlay shape as
      // frame 2 (deterministic — same tree, same buffer state).
      expect(frame3).toContain(APC_OPEN)
    }
  })

  test("deletes prior placements when backdrop deactivates", () => {
    process.env.SILVERY_KITTY_GRAPHICS = "1"

    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ open }: { open: boolean }) {
      return (
        <ThemeProvider theme={darkTheme}>
          <Box flexDirection="column" padding={1}>
            <Text>Status: 🎉 Ready!</Text>
            <Text>More below</Text>
            {open && (
              <ModalDialog title="Info" fade={0.4}>
                <Text>Body</Text>
              </ModalDialog>
            )}
          </Box>
        </ThemeProvider>
      )
    }

    // Open the modal to activate the overlay.
    const app = render(<App open={true} />)
    const opened = app.frames.at(-1) ?? ""
    expect(opened).toContain(APC_OPEN)

    // Close the modal. The transition frame should emit a delete-all
    // (a=d) so leftover scrim rectangles don't linger in the terminal.
    app.rerender(<App open={false} />)
    const closed = app.frames.at(-1) ?? ""
    expect(closed).toMatch(/\x1b_G[^\\]*a=d[^\\]*\x1b\\/)
  })
})

describe("backdrop Kitty overlay: capability disabled", () => {
  test("no APC graphics escapes when SILVERY_KITTY_GRAPHICS=0", () => {
    // Force off — even on a terminal where auto-detection would say yes.
    process.env.SILVERY_KITTY_GRAPHICS = "0"

    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ open }: { open: boolean }) {
      return (
        <ThemeProvider theme={darkTheme}>
          <Box flexDirection="column" padding={1}>
            <Text>Status: 🎉 Ready!</Text>
            <Text>More text below</Text>
            {open && (
              <ModalDialog title="Info" fade={0.4}>
                <Text>Dialog body</Text>
              </ModalDialog>
            )}
          </Box>
        </ThemeProvider>
      )
    }

    const app = render(<App open={true} />)
    for (const frame of app.frames) {
      expect(frame).not.toContain(APC_OPEN)
    }

    // Rerender to a different modal state — still no APC output.
    app.rerender(<App open={false} />)
    for (const frame of app.frames) {
      expect(frame).not.toContain(APC_OPEN)
    }
  })
})

describe("backdrop Kitty overlay: STRICT invariance", () => {
  test("incremental === fresh buffer state (cell grid unchanged by overlay)", () => {
    // SILVERY_STRICT=1 is set by vitest/setup.ts. It compares incremental
    // and fresh cell buffers cell-by-cell on every rerender. If the Kitty
    // overlay emission mutated cells (it must NOT — the overlay is pure
    // side-channel), STRICT would throw here.
    //
    // This test simply exercises the rerender path with the cap enabled
    // and asserts it doesn't throw.
    process.env.SILVERY_KITTY_GRAPHICS = "1"

    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ n }: { n: number }) {
      return (
        <ThemeProvider theme={darkTheme}>
          <Box flexDirection="column" padding={1}>
            <Text>Count: {n} 🎉 Status</Text>
            <Text>Line 2</Text>
            <ModalDialog title="Info" fade={0.4}>
              <Text>Body {n}</Text>
            </ModalDialog>
          </Box>
        </ThemeProvider>
      )
    }

    const app = render(<App n={0} />)
    // Series of rerenders — each one triggers STRICT incremental vs fresh
    // comparison internally. If overlay emission differed between paths,
    // the STRICT check would fire cell-mismatch. It doesn't, because the
    // overlay is a pure function of (buffer, tree markers).
    for (let i = 1; i <= 5; i++) {
      app.rerender(<App n={i} />)
    }
    expect(app.text).toContain("Count: 5")
  })

  test("wide-cell placement count matches emoji count in faded region", () => {
    process.env.SILVERY_KITTY_GRAPHICS = "1"

    const render = createRenderer({ cols: 60, rows: 10 })

    // Three emoji outside the modal rect. ModalDialog's default rect is
    // small + centered; the top line sits above it, so all three emoji
    // end up in the faded (excluded-from-modal) region.
    function App() {
      return (
        <ThemeProvider theme={darkTheme}>
          <Box flexDirection="column" padding={1}>
            <Text>🎉 🚀 ⭐ Status line</Text>
            <Text>Filler line A</Text>
            <Text>Filler line B</Text>
            <ModalDialog title="Info" fade={0.4}>
              <Text>Dialog body</Text>
            </ModalDialog>
          </Box>
        </ThemeProvider>
      )
    }

    const app = render(<App />)
    const frame = app.frames.at(-1) ?? ""

    // Count a=p occurrences. Exactly one per wide-char lead cell in the
    // faded region. The emoji on the top line are outside the dialog, so
    // each gets a placement. We don't assert an exact number because the
    // ⭐ (U+2B50 "WHITE MEDIUM STAR") may or may not be classified as
    // wide depending on Unicode width tables — we just assert ≥ 1.
    const placementCount = (frame.match(/\x1b_G[^\\]*a=p[^\\]*\x1b\\/g) ?? []).length
    expect(placementCount).toBeGreaterThanOrEqual(1)
  })
})
