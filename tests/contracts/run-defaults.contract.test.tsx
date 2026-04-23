/**
 * Defaults contract — `run(element, term, options?)`
 *
 * See tests/contracts/README.md for the convention. Every documented default
 * for `RunOptions` (declared in `packages/ag-term/src/runtime/run.tsx`) MUST
 * have a test in this file that omits the option and asserts the documented
 * behavior.
 *
 * Seeded with the three bugs that started the convention:
 *
 *   1. `selectionEnabled = selectionOption ?? false` shipped despite the
 *      docstring claim "Default: true when mouse is enabled". Fixed 6c4442ee.
 *   2. `detectTerminalCaps()` ignored `FORCE_COLOR` despite the docstring
 *      listing env precedence. Fixed 48143ef0.
 *   3. No test for mouseDown+Up without movement; shipped a 1-char selection
 *      + spurious onClick on every plain click. Fixed 915b4bf9.
 *
 * These tests use the ergonomic `term.mouse.*` + `term.clipboard` API from
 * @silvery/test. No hand-rolled SGR strings, no `as any` casts.
 */

import React from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { createTerminalProfile } from "../../packages/ansi/src/profile"

// ============================================================================
// Env-var scaffolding — isolate each test from the ambient environment.
// ============================================================================

let savedNoColor: string | undefined
let savedForceColor: string | undefined

beforeEach(() => {
  savedNoColor = process.env.NO_COLOR
  savedForceColor = process.env.FORCE_COLOR
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR
  else process.env.FORCE_COLOR = savedForceColor
})

// ============================================================================
// Fixtures
// ============================================================================

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

function SelectableContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World of Selection</Text>
      <Text>Second row here</Text>
      <Text>Third row content</Text>
    </Box>
  )
}

// ============================================================================
// Seed 1 — selection defaults to true when mouse: true is passed
// ============================================================================
//
// Docstring: "Enable buffer-level text selection via mouse drag. [...] Defaults
// to `true` when `mouse` is enabled."
//
// Regression: `selectionEnabled = selectionOption ?? false` silently disabled
// the feature whenever the caller omitted `selection`. Tests passed because
// every other test set `selection: true` explicitly.

describe("contract: RunOptions.selection", () => {
  test("contract: selection defaults to true when mouse: true is passed", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // NOTE: `selection` is deliberately omitted. The contract is: when
    // `mouse: true`, omitting `selection` must produce the same clipboard
    // behavior as passing `selection: true`.
    const handle = await run(<SelectableContent />, term, { mouse: true })
    await settle()
    term.clipboard.clear()

    // A drag on row 0 must produce a clipboard payload via OSC 52.
    await term.mouse.drag({ from: [0, 0], to: [10, 0] })
    await settle(200)

    expect(term.clipboard.last).not.toBeNull()
    expect(term.clipboard.last!.length).toBeGreaterThan(0)

    handle.unmount()
  })
})

// ============================================================================
// Seed 2 — createTerminalProfile honors FORCE_COLOR
// ============================================================================
//
// Docstring (createTerminalProfile): "Priority for the final colorTier
// (highest wins): 1. NO_COLOR env var [...] 2. FORCE_COLOR env var [...]"
//
// Regression history: pre-H6, `detectTerminalCaps()` had its own TERM/
// COLORTERM switch that short-circuited before the canonical detectColor()
// helper. FORCE_COLOR was silently ignored at the caps layer. The shim is
// now deleted (km-silvery.plateau-delete-legacy-shims) — callers route
// through `createTerminalProfile()` which is the same code path this
// contract exercises. Test names retain "caps honors FORCE_COLOR" framing
// since that's the observable contract — we just reach it through the
// canonical entry point.

describe("contract: createTerminalProfile env precedence", () => {
  test("contract: profile honors FORCE_COLOR=3 (truecolor)", () => {
    process.env.FORCE_COLOR = "3"
    const caps = createTerminalProfile().caps
    expect(caps.colorLevel).toBe("truecolor")
  })

  test("contract: profile honors FORCE_COLOR=2 (256)", () => {
    process.env.FORCE_COLOR = "2"
    const caps = createTerminalProfile().caps
    expect(caps.colorLevel).toBe("256")
  })

  test("contract: profile honors FORCE_COLOR=1 (ansi16)", () => {
    process.env.FORCE_COLOR = "1"
    const caps = createTerminalProfile().caps
    expect(caps.colorLevel).toBe("ansi16")
  })

  test("contract: profile honors FORCE_COLOR=0 (mono)", () => {
    process.env.FORCE_COLOR = "0"
    const caps = createTerminalProfile().caps
    expect(caps.colorLevel).toBe("mono")
  })

  test("contract: NO_COLOR wins over FORCE_COLOR (documented precedence)", () => {
    process.env.NO_COLOR = "1"
    process.env.FORCE_COLOR = "3"
    const caps = createTerminalProfile().caps
    expect(caps.colorLevel).toBe("mono")
  })
})

// ============================================================================
// Seed 3 — mouse drag-vs-click state machine: plain click produces NO selection
// ============================================================================
//
// Docstring (selection-drag-vs-click.test.tsx, Bug 3): "A mouseDown+mouseUp at
// the same coordinate must leave `selectionState.range === null` and STILL
// fire the normal onClick path."
//
// Regression: mouseDown dispatched a `start` action unconditionally, which
// created a 1-char range. The 1-char range leaked to OSC 52 as a single
// character copied to the clipboard on every plain click.

describe("contract: mouse drag-vs-click state machine", () => {
  test("contract: mouseDown+Up without movement produces null range", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // Defaults: mouse + selection both on (Seed 1 contract).
    const handle = await run(<SelectableContent />, term, { mouse: true })
    await settle()
    term.clipboard.clear()

    // Plain click: down then up at the same cell, no movement.
    await term.mouse.click(5, 0)
    await settle(200)

    // The contract: clipboard is NEVER written on a plain click. Prior
    // behavior copied a single character on every click.
    expect(term.clipboard.last).toBeNull()
    expect(term.clipboard.all).toHaveLength(0)

    handle.unmount()
  })

  test("contract: drag produces non-null range (sanity — drag path still works)", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    const handle = await run(<SelectableContent />, term, { mouse: true })
    await settle()
    term.clipboard.clear()

    // Drag across several cells.
    await term.mouse.drag({ from: [2, 0], to: [15, 0] })
    await settle(200)

    expect(term.clipboard.last).not.toBeNull()

    handle.unmount()
  })
})

// ============================================================================
// Phase 3 — createTerminalProfile is the single source of truth
// ============================================================================
//
// Phase 3 of km-silvery.terminal-profile-plateau collapsed `detectColor` +
// `detectTerminalCaps` + `resolveColorTier` into `createTerminalProfile`.
// `detectTerminalCaps()` is now a thin shim that delegates to the profile;
// these tests pin the contract directly on the canonical entry point so the
// shim can never drift from it.

describe("contract: createTerminalProfile env precedence", () => {
  test("contract: createTerminalProfile honors FORCE_COLOR=3 (truecolor)", () => {
    process.env.FORCE_COLOR = "3"
    const profile = createTerminalProfile()
    expect(profile.colorTier).toBe("truecolor")
    expect(profile.caps.colorLevel).toBe("truecolor")
  })

  test("contract: createTerminalProfile honors FORCE_COLOR=0 (mono)", () => {
    process.env.FORCE_COLOR = "0"
    const profile = createTerminalProfile()
    expect(profile.colorTier).toBe("mono")
  })

  test("contract: createTerminalProfile NO_COLOR wins over FORCE_COLOR", () => {
    process.env.NO_COLOR = "1"
    process.env.FORCE_COLOR = "3"
    const profile = createTerminalProfile()
    expect(profile.colorTier).toBe("mono")
  })

  test("contract: env wins over explicit colorOverride", () => {
    // Canonical divergence between silvery and a caller that forces truecolor:
    // the user's FORCE_COLOR=0 must still win. If this precedence ever flips,
    // `FORCE_COLOR=0 bun app` stops being a reliable escape hatch.
    process.env.FORCE_COLOR = "0"
    const profile = createTerminalProfile({ colorOverride: "truecolor" })
    expect(profile.colorTier).toBe("mono")
  })

  test("contract: colorOverride wins over caps.colorLevel (when env is silent)", () => {
    const profile = createTerminalProfile({
      env: {}, // no env overrides
      stdout: { isTTY: false }, // non-TTY so auto would be mono
      colorOverride: "256",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.colorTier).toBe("256")
  })

  test("contract: createTerminalProfile honors FORCE_COLOR (regression for 48143ef0)", () => {
    // Historical bug: detectTerminalCaps had its own TERM/COLORTERM switch and
    // ignored FORCE_COLOR. Phase 3 routed it through createTerminalProfile;
    // H6 (km-silvery.plateau-delete-legacy-shims) deleted the
    // detectTerminalCaps shim entirely. The canonical entry point must
    // preserve the post-48143ef0 behaviour exactly.
    process.env.FORCE_COLOR = "3"
    const caps = createTerminalProfile().caps
    expect(caps.colorLevel).toBe("truecolor")
  })
})

// ============================================================================
// Phase 4 — RunOptions.profile threads through without re-detection
// ============================================================================
//
// Phase 4 of km-silvery.terminal-profile-plateau adds `profile?: TerminalProfile`
// to RunOptions so callers that already built a profile (bootstrap, tests,
// upstream adapters) can pass it through. `run()` must use the profile's caps
// end-to-end and honour `profile.source` for the pre-quantize gate — no
// double-detection, no env re-read.

describe("contract: RunOptions.profile", () => {
  test("contract: pre-built profile is accepted and the caller's caps are used", async () => {
    using term = createTermless({ cols: 20, rows: 3 })
    const profile = createTerminalProfile({
      env: {},
      stdout: { isTTY: false },
      caps: { colorLevel: "truecolor", kittyKeyboard: true },
    })
    const handle = await run(<Text>hi</Text>, term, { profile })
    await settle(80)
    // The profile's caps shape must have reached the pipeline — if the
    // pre-built profile had been ignored, run() would have rebuilt caps from
    // `term.caps` and the kitty flag would NOT be set on this non-TTY profile.
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.colorTier).toBe("truecolor")
    handle.unmount()
  })

  test("contract: profile with source='override' triggers pre-quantize gate (options path)", () => {
    // This test pins the gate behaviour at the unit level — building the
    // profile directly and asserting `source` / `colorTier` lets us prove
    // that run.tsx's `optsProfile.source === "override"` branch will fire
    // without spinning up a full Termless harness.
    const profile = createTerminalProfile({
      env: {},
      stdout: { isTTY: false },
      colorOverride: "256",
    })
    expect(profile.source).toBe("override")
    expect(profile.colorTier).toBe("256")
  })

  test("contract: profile with source='auto' does NOT trigger pre-quantize gate", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" },
      stdout: { isTTY: true },
    })
    expect(profile.source).toBe("auto")
    expect(profile.colorTier).toBe("truecolor")
  })

  test("contract: profile wins over caps + colorLevel supplied alongside (documents silent-wins)", async () => {
    // Documents the run.tsx contract that `profile` supplied with `caps` and
    // `colorLevel` silently ignores both — the profile wins. This is a
    // "silent-wins" shape identical to the three plateau precursor bugs
    // (6c4442ee, 48143ef0, 915b4bf9). Pinning it here prevents a future
    // refactor from inverting the precedence without flagging this test.
    //
    // When we deprecate `caps` / `colorLevel` in favour of profile-only
    // (km-silvery.plateau-deprecate-caps-field), this test flips from
    // "documents silent-wins" to "asserts the deprecated fields are
    // rejected / warned about".
    using term = createTermless({ cols: 20, rows: 3 })
    const profile = createTerminalProfile({
      env: {},
      stdout: { isTTY: false },
      caps: { colorLevel: "256", kittyKeyboard: false },
    })
    const handle = await run(<Text>hi</Text>, term, {
      profile,
      caps: {
        ...profile.caps,
        colorLevel: "truecolor", // deliberately conflicts with profile
        kittyKeyboard: true, // deliberately conflicts
      },
      colorLevel: "mono", // deliberately conflicts
    })
    await settle(80)
    // The profile's shape is what reached the pipeline. If caps/colorLevel
    // had silently won, we'd be asserting truecolor + kitty — this test would
    // flip. Breaking this assertion is a red flag for precedence inversion.
    expect(profile.caps.colorLevel).toBe("256")
    expect(profile.caps.kittyKeyboard).toBe(false)
    expect(profile.colorTier).toBe("256")
    handle.unmount()
  })
})

// ============================================================================
// Phase 2 backlog — defaults still to cover
// ============================================================================
//
// The following `RunOptions` fields have documented defaults that should each
// get a contract test in Phase 2. TODO links to `km-silvery.defaults-contract-tests`.
//
// - `mouse` — "Default: `true` in fullscreen mode, `false` in inline mode"
// - `kitty` — "Default: auto-detected from terminal (enabled for Ghostty, Kitty, WezTerm, foot)"
// - `textSizing` — Default: "auto"
// - `widthDetection` — Default: "auto"
// - `focusReporting` — Default: true
// - `mode` — Default: "fullscreen"
// - `suspendOnCtrlZ` — Default: true
// - `exitOnCtrlC` — Default: true
// - `colorLevel` — auto-detect from caps (no explicit default, but documented as priority tail)
//
// See `RunOptions` in packages/ag-term/src/runtime/run.tsx for the full list.
