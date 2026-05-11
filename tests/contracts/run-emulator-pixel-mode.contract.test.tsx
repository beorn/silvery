/**
 * Defaults contract — `run(<App/>, term, opts?)` emulator-branch mouse mode.
 *
 * See tests/contracts/README.md for the convention. This file pins the
 * fidelity gap closed by `@km/silvery/run-emulator-probe-mouse-mode-parity`:
 *
 *   - **Before**: real-PTY branch ran `resolveMouseOption()` (probes
 *     CSI 14t / CSI 18t window-op responses, returns
 *     `{ coordinateMode: "pixel", cellSize }` when both arrive) but the
 *     emulator branch passed `mouse: true` through unchanged. Result:
 *     every termless test exercised cell-mode SGR (1003+1006). Real
 *     terminals (Ghostty, xterm.js in VSCode, etc.) exercised pixel-mode
 *     SGR (1003+1006+1016). Pixel-mode-only bugs hid behind green tests.
 *   - **After**: emulator branch runs an in-process probe via the backend's
 *     `feed()` + `onResponse` pair (mirrors the real-PTY probe, adapted
 *     for in-process event flow). All bundled termless backends already
 *     answer 14t/18t (companion bead
 *     `@km/all/.../window-op-probes-14t-18t`), so the upgrade fires
 *     automatically without per-test boilerplate.
 *
 * Observable contract: the runtime writes `\x1b[?1016h` (SGR-Pixels enable)
 * to the terminal output stream when pixel mode is active. `term.out`
 * captures every byte fed to the emulator — substring-search for the enable
 * sequence is the cleanest way to assert mode without reaching into private
 * pipeline state.
 *
 * Caller-override branches (false / explicit ParseMouseOptions) are pinned
 * alongside the auto-probe path so the precedence chain doesn't drift.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// Mode enable/disable byte sequences. Source: @silvery/ansi terminal-control
// `enableMouse({ pixels: true })` emits `CSI ?1003h CSI ?1006h CSI ?1016h`.
const SGR_PIXELS_ENABLE = "\x1b[?1016h"
const SGR_CELL_ENABLE = "\x1b[?1006h"

function Content() {
  return (
    <Box flexDirection="column">
      <Text>Hello</Text>
      <Text>World</Text>
    </Box>
  )
}

// ============================================================================
// Auto-probe path — default when caller doesn't pin a mouse option
// ============================================================================

describe("contract: run() emulator-branch mouse mode probe", () => {
  test("contract: run(<App/>, term) defaults to pixel mode (1016) when backend answers 14t+18t probes", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // No mouse option passed — silvery's default is `true` in fullscreen
    // mode. The emulator branch must now probe 14t+18t before forwarding
    // the option to createApp, the same way the real-PTY branch does.
    const handle = await run(<Content />, term)
    await settle()

    const written = term.out.getText()
    expect(
      written.includes(SGR_PIXELS_ENABLE),
      "emulator branch must auto-upgrade to SGR-Pixels mode (1016) when backend answers 14t+18t probes",
    ).toBe(true)
    expect(
      written.includes(SGR_CELL_ENABLE),
      "SGR-Pixels mode still includes the standard 1006 SGR encoding",
    ).toBe(true)

    handle.unmount()
  })

  test("contract: mouse: true defaults to pixel mode (parity with auto-default)", async () => {
    // Pinning `mouse: true` explicitly must produce the same result as the
    // auto-default — true is "enable with auto-probe", not "force cell mode."
    using term = createTermless({ cols: 40, rows: 5 })

    const handle = await run(<Content />, term, { mouse: true })
    await settle()

    expect(term.out.getText()).toContain(SGR_PIXELS_ENABLE)

    handle.unmount()
  })
})

// ============================================================================
// Opt-out and caller-override branches
// ============================================================================

describe("contract: run() emulator-branch mouse precedence", () => {
  test("contract: explicit mouse: false bypasses probe even when backend would answer", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    const handle = await run(<Content />, term, { mouse: false })
    await settle()

    const written = term.out.getText()
    expect(
      written.includes(SGR_PIXELS_ENABLE),
      "mouse: false must NOT enable SGR-Pixels mode",
    ).toBe(false)
    expect(
      written.includes(SGR_CELL_ENABLE),
      "mouse: false must NOT enable any SGR mouse mode",
    ).toBe(false)

    handle.unmount()
  })

  test("contract: explicit mouse: { coordinateMode: 'cell' } overrides probe (cell mode wins)", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // Caller has decided cell mode is correct for this app — auto-probe
    // must not promote them to pixel mode. Explicit object beats probe
    // (same precedence as the real-PTY branch's resolveMouseOption).
    const handle = await run(<Content />, term, {
      mouse: { coordinateMode: "cell" },
    })
    await settle()

    const written = term.out.getText()
    expect(
      written.includes(SGR_PIXELS_ENABLE),
      "explicit coordinateMode: 'cell' must NOT promote to pixel mode",
    ).toBe(false)
    expect(
      written.includes(SGR_CELL_ENABLE),
      "explicit coordinateMode: 'cell' must still enable 1006 SGR encoding",
    ).toBe(true)

    handle.unmount()
  })

  test("contract: explicit mouse: { coordinateMode: 'pixel', cellSize } passes through unchanged", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // Caller-supplied cellSize beats whatever the probe would compute.
    // This is the shape `apps/silvercode/tests/visual/transcript-scroll-pixel.test.tsx`
    // historically had to pass — after this fix it's no longer required,
    // but the explicit-override path must still work for callers that want
    // a specific cellSize (e.g., to match a particular font metric).
    const handle = await run(<Content />, term, {
      mouse: { coordinateMode: "pixel", cellSize: { width: 8, height: 17 } },
    })
    await settle()

    expect(term.out.getText()).toContain(SGR_PIXELS_ENABLE)

    handle.unmount()
  })
})
