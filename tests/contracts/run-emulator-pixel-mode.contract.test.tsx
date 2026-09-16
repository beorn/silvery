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
import type { ParsedMouse } from "../../packages/ag-term/src/mouse"

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

// ============================================================================
// Coordinate units under 1016 — verified from the stream (@si/select/24649)
//
// The population 14207 never covered: a terminal that answers the 14t/18t
// geometry probes (so the runtime upgrades to 1016) but forwards CELL units
// anyway — herdr 0.9, measured 2026-09-16. SGR 1006 and 1016 bytes are
// shape-identical, so the runtime must derive the units from the stream: an
// event whose wire coordinate exceeds the grid is impossible under cell units.
// ============================================================================

/**
 * What a component can observe per event: layout coordinates plus the units
 * the runtime applied (`nativeEvent` is the `ParsedMouse`; `clientX` is only
 * present once pixel units are in force). That per-event field is the
 * integration-level diagnostic; the owner's interpretation accessor is pinned
 * in tests/features/input-owner.test.ts.
 */
type Seen = {
  type: string
  x: number
  y: number
  units: "cell" | "pixel"
  clientX: number | undefined
}

function ClickProbe({ onEvent }: { onEvent: (e: Seen) => void }) {
  const record = (e: {
    type: string
    x: number
    y: number
    clientX?: number
    nativeEvent: unknown
  }) =>
    onEvent({
      type: e.type,
      x: e.x,
      y: e.y,
      units: (e.nativeEvent as ParsedMouse).coordinateMode,
      clientX: e.clientX,
    })
  return (
    <Box width={40} height={5} onMouseDown={record} onMouseMove={record}>
      <Text>target</Text>
    </Box>
  )
}

/**
 * The termless term's own raw-input door — the same one `term.mouse.*` uses
 * (run()'s emulator branch rewires it into the app's stdin, so the bytes take
 * the real parse path).
 */
function rawInput(term: unknown): (data: string) => void {
  return (term as { sendInput: (data: string) => void }).sendInput
}

describe("contract: run() coordinate units under SGR-Pixels are verified, not assumed", () => {
  test("contract: a terminal that answers 14t but forwards cell units still lands the click on its cell", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    const seen: Seen[] = []
    const handle = await run(<ClickProbe onEvent={(e) => seen.push(e)} />, term)
    await settle()
    expect(term.out.getText(), "precondition: pixel mode was negotiated").toContain(
      SGR_PIXELS_ENABLE,
    )

    // herdr-shaped: cell (30, 3), 1-indexed on the wire, although 1016 is on.
    rawInput(term)("\x1b[<0;31;4M")
    await settle()

    const last = seen.at(-1)
    expect(last?.type).toBe("mousedown")
    expect(Math.floor(last!.x), "cell units must not be divided by the probed cell width").toBe(30)
    expect(Math.floor(last!.y)).toBe(3)
    // The units in force are visible on the event itself: still cells, no pixel client coords.
    expect(last).toMatchObject({ units: "cell", clientX: undefined })

    handle.unmount()
  })

  test("contract: a true pixel terminal proves itself on its first out-of-grid event and keeps fractional coordinates", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    const seen: Seen[] = []
    const handle = await run(<ClickProbe onEvent={(e) => seen.push(e)} />, term)
    await settle()

    // Auto encoding follows the negotiated mode: cell (20, 3) → pixel (160, 51)
    // → wire (161, 52), impossible under cell units in a 40x5 grid.
    await term.mouse.down(20, 3)
    await settle()

    expect(seen.at(-1)).toMatchObject({
      type: "mousedown",
      x: 20,
      y: 3,
      units: "pixel",
      clientX: 160,
    })

    handle.unmount()
  })

  test("contract: the documented residual is visible — a pixel click inside the unproven corner reads as cells, and the next out-of-grid motion proves pixels", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    const seen: Seen[] = []
    const handle = await run(<ClickProbe onEvent={(e) => seen.push(e)} />, term)
    await settle()

    // Pixel-encoded hover (SGR 35 = motion, no button) exactly as a true
    // pixel terminal sends it. cell (2, 0) → pixel (16, 0) → wire (17, 1)
    // fits the 40x5 grid, so it cannot prove pixels and is read as cell
    // (16, 0). This is the accepted residual (@si/select/24649): wrong by
    // design here, never silent — the event says which units were applied.
    rawInput(term)("\x1b[<35;17;1M")
    await settle()
    expect(seen.at(-1)).toMatchObject({
      type: "mousemove",
      x: 16,
      y: 0,
      units: "cell",
      clientX: undefined,
    })

    // cell (20, 3) → pixel (160, 51) → wire (161, 52): 161 > 40 columns proves pixels.
    rawInput(term)("\x1b[<35;161;52M")
    await settle()
    expect(seen.at(-1)).toMatchObject({
      type: "mousemove",
      x: 20,
      y: 3,
      units: "pixel",
      clientX: 160,
    })

    handle.unmount()
  })
})
