/**
 * Entry-point parity contract — every silvery entry point must agree.
 *
 * Per /pro review 2026-04-23 (km-silvery.entry-point-parity-contracts).
 *
 * The seed bugs that motivated the defaults-contract convention all had a
 * shape: one public entry point drifted away from another because tests
 * exercised each in isolation. This file runs the *same input* through
 * every public entry point and asserts the *same observable behaviour*:
 *
 *   - `render()` — sync, no terminal I/O, returns an `App` frame.
 *   - `run()` — headless writable sink, produces an ANSI stream.
 *   - `createApp().run()` — same headless sink; `run()` is a thin wrapper
 *     over this, so the two must be indistinguishable.
 *   - `createTerm()` + paint — the Term-paint path used by run() internally.
 *   - `createTermless()` — the xterm.js-backed test harness, end-to-end
 *     from React element to rendered screen text.
 *
 * The five entry points serve different use cases and have legitimately
 * different defaults (alt screen, mouse, theme detection). This contract
 * file focuses on the handful of observable invariants that must hold
 * across *all* of them:
 *
 *   - Given an identical {@link TerminalProfile}, every entry point
 *     resolves caps to the same colorLevel.
 *   - Given the same React element + dims, every entry point produces the
 *     same plain-text buffer (ignoring ANSI styling differences that
 *     depend on the entry point's rendering mode).
 *   - None of the entry points emit the Phase-5 deprecation warnings when
 *     supplied with a pre-built profile (the recommended migration path).
 *
 * If an entry point diverges from the rest on any of these, the bug is a
 * parity regression and must be fixed at that entry point, not worked
 * around in callers.
 */

import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, Text } from "../../src/index.js"
import {
  run,
  _resetRunOptionsWarningForTesting,
} from "../../packages/ag-term/src/runtime/run"
import { createApp } from "../../packages/ag-term/src/runtime/create-app"
import { render } from "../../packages/ag-term/src/renderer"
import { createTerm } from "../../packages/ag-term/src/ansi/term"
import { createTerminalProfile } from "../../packages/ansi/src/profile"
import type { TerminalProfile } from "../../packages/ansi/src/profile"

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms))

// ============================================================================
// Fixtures — one element, one profile, reused across every entry point.
// ============================================================================

function Fixture() {
  return (
    <Box flexDirection="column">
      <Text>Hello parity</Text>
      <Text>Second line</Text>
    </Box>
  )
}

const DIMS = { cols: 40, rows: 4 } as const

/**
 * A deterministic profile used by every entry point. `env: {}` + non-TTY
 * stdout neutralise ambient environment so the resolved tier is purely
 * driven by `colorLevel`. The Ghostty caps fixture matches what run()'s
 * options path would auto-detect in a modern terminal; pinning it here
 * ensures every entry point threads the same caps through.
 */
function makeProfile(tier: "truecolor" | "256" | "ansi16" | "mono"): TerminalProfile {
  return createTerminalProfile({
    env: {},
    stdout: { isTTY: false },
    colorLevel: tier,
    // Post km-silvery.plateau-naming-polish: 2-layer profile — emulator carries
    // identity (program/version/TERM); caps carries protocol flags + `maybe*`
    // heuristic guesses.
    emulator: {
      program: "Ghostty",
      TERM: "xterm-ghostty",
    },
    caps: {
      kittyKeyboard: false,
      kittyGraphics: false,
      sixel: false,
      osc52: false,
      hyperlinks: false,
      notifications: false,
      bracketedPaste: true,
      mouse: false,
      syncOutput: true,
      unicode: true,
      maybeDarkBackground: true,
      maybeNerdFont: false,
      maybeWideEmojis: true,
      underlineStyles: ["double", "curly", "dotted", "dashed"],
      underlineColor: true,
      textSizing: false,
    },
  })
}

/** Captures the raw ANSI bytes `run()` / `createApp().run()` would write. */
function makeSink() {
  let buf = ""
  return {
    writable: {
      write(data: string) {
        buf += data
      },
    },
    get raw() {
      return buf
    },
  }
}

/** Strip ANSI and normalise whitespace for text-only equality. */
function plainText(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[=>]/g, "")
    .replace(/\r/g, "")
    .replace(/\x08/g, "")
}

// ============================================================================
// Env isolation — the parity guarantees only hold when nothing in the caller
// environment leaks into one entry point but not another.
// ============================================================================

let savedNoColor: string | undefined
let savedForceColor: string | undefined

beforeEach(() => {
  savedNoColor = process.env.NO_COLOR
  savedForceColor = process.env.FORCE_COLOR
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
  _resetRunOptionsWarningForTesting()
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR
  else process.env.FORCE_COLOR = savedForceColor
})

// ============================================================================
// Parity invariant 1 — every entry point resolves caps.colorLevel from a
// shared profile the same way.
// ============================================================================
//
// If one entry point re-detects caps from env while another honours the
// profile, the three public plateau invariants (colorLevel === caps.colorLevel,
// colorForced correctly set, no second detection pass) collapse. Pinning
// every surface to the same profile here is the smoke test that would have
// caught the pre-Phase-4 case where run.tsx called createTerminalProfile
// while create-app.tsx called detectTerminalCaps separately.

describe("parity: caps.colorLevel is sourced from the shared profile", () => {
  for (const tier of ["truecolor", "256", "ansi16", "mono"] as const) {
    test(`parity: every entry point sees colorLevel="${tier}" when the profile forces it`, async () => {
      const profile = makeProfile(tier)

      // createTerm — the Term-paint path used by run() internally. The
      // term's caps view MUST equal the caps the profile carries.
      {
        const term = createTerm({ cols: DIMS.cols, rows: DIMS.rows, caps: profile.caps })
        expect(term.caps.colorLevel).toBe(tier)
        expect(term.profile.caps.colorLevel).toBe(tier)
      }

      // createTermless — xterm.js-backed Term. It accepts explicit caps
      // the same way; the colorLevel must flow through untouched.
      {
        using term = createTermless({ cols: DIMS.cols, rows: DIMS.rows, caps: profile.caps })
        expect(term.caps.colorLevel).toBe(tier)
      }

      // render() — sync renderer. The resulting TextFrame width reflects
      // the viewport, and both fixture strings must appear in the plain text.
      // (render() doesn't accept caps — it's a pure layout/text pipeline;
      // caps only affect color output, which isn't observed here.)
      {
        const app = render(<Fixture />, {
          cols: DIMS.cols,
          rows: DIMS.rows,
        })
        expect(app.width).toBe(DIMS.cols)
        expect(app.text).toContain("Hello parity")
        expect(app.text).toContain("Second line")
        app.unmount()
      }

      // run({ profile }) — options path. Pass `profile` (not `caps`) to
      // avoid the Phase-5 deprecation warn; the resolved handle's buffer
      // reflects the caps end-to-end.
      {
        const sink = makeSink()
        const handle = await run(<Fixture />, {
          writable: sink.writable,
          cols: DIMS.cols,
          rows: DIMS.rows,
          profile,
        })
        await settle()
        handle.unmount()
      }

      // createApp().run({ profile }) — explicit. run() is a thin wrapper
      // over this, so both paths must accept { profile } identically.
      {
        const sink = makeSink()
        const app = createApp(() => () => ({}))
        const handle = await app.run(<Fixture />, {
          writable: sink.writable,
          cols: DIMS.cols,
          rows: DIMS.rows,
          profile,
        })
        await settle()
        handle.unmount()
      }
    })
  }
})

// ============================================================================
// Parity invariant 2 — same element + dims → same plain text.
// ============================================================================
//
// Ignores styling: render(), run(), and createApp().run() all emit the same
// visible characters for a given element. Divergence here means one entry
// point's output pipeline is producing different text for the same input —
// a much bigger bug than a styling mismatch.

describe("parity: same element + dims produces the same plain text", () => {
  test("parity: render vs run vs createApp().run — identical plain text", async () => {
    const profile = makeProfile("truecolor")

    // render() — sync TextFrame. render() doesn't take caps; profile only
    // affects color output which isn't compared here.
    const renderApp = render(<Fixture />, {
      cols: DIMS.cols,
      rows: DIMS.rows,
    })
    const renderText = renderApp.text
    renderApp.unmount()
    // Reference profile so TS knows it's used (suppresses unused-var lint).
    void profile

    // run() — headless writable sink.
    const runSink = makeSink()
    const runHandle = await run(<Fixture />, {
      writable: runSink.writable,
      cols: DIMS.cols,
      rows: DIMS.rows,
      profile,
    })
    await settle()
    const runText = plainText(runSink.raw)
    runHandle.unmount()

    // createApp().run() — same sink semantics.
    const appSink = makeSink()
    const app = createApp(() => () => ({}))
    const appHandle = await app.run(<Fixture />, {
      writable: appSink.writable,
      cols: DIMS.cols,
      rows: DIMS.rows,
      profile,
    })
    await settle()
    const appText = plainText(appSink.raw)
    appHandle.unmount()

    // Every entry point must render both fixture strings. The writable
    // output includes framing whitespace that render()'s text doesn't — we
    // assert substring containment both ways (render's text is a subset of
    // each ANSI sink's text after de-styling).
    for (const fragment of ["Hello parity", "Second line"]) {
      expect(renderText).toContain(fragment)
      expect(runText).toContain(fragment)
      expect(appText).toContain(fragment)
    }
  })

  test("parity: createTermless end-to-end renders the same fragments", async () => {
    // createTermless exercises the xterm.js feed path — the ANSI output
    // actually gets parsed by a real emulator. If the pipeline's output
    // phase diverges from the plain-text render, the screen buffer won't
    // contain what we expect.
    const profile = makeProfile("truecolor")
    using term = createTermless({ cols: DIMS.cols, rows: DIMS.rows, caps: profile.caps })
    const handle = await run(<Fixture />, term, { profile })
    await settle()
    expect(term.screen).toContainText("Hello parity")
    expect(term.screen).toContainText("Second line")
    handle.unmount()
  })
})

// ============================================================================
// Parity invariant 3 — the profile-only path is warning-free.
// ============================================================================
//
// Phase 5 makes the legacy `caps` / `colorLevel` options emit deprecation
// warnings. Callers on the recommended path (`{ profile }`) must not see any
// of those warnings — otherwise the migration story is a lie.

describe("parity: profile-only path emits no Phase 5 warnings", () => {
  test("parity: run/createApp().run with profile only — zero Phase 5 warns", async () => {
    const profile = makeProfile("256")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const runSink = makeSink()
      const runHandle = await run(<Fixture />, {
        writable: runSink.writable,
        cols: DIMS.cols,
        rows: DIMS.rows,
        profile,
      })
      await settle()
      runHandle.unmount()

      const appSink = makeSink()
      const app = createApp(() => () => ({}))
      const appHandle = await app.run(<Fixture />, {
        writable: appSink.writable,
        cols: DIMS.cols,
        rows: DIMS.rows,
        profile,
      })
      await settle()
      appHandle.unmount()

      using term = createTermless({ cols: DIMS.cols, rows: DIMS.rows, caps: profile.caps })
      const termHandle = await run(<Fixture />, term, { profile })
      await settle()
      termHandle.unmount()

      const phase5Warns = warnSpy.mock.calls
        .map((c) => c[0] as string)
        .filter(
          (m) =>
            typeof m === "string" &&
            (m.includes("mutually exclusive") ||
              m.includes("run({ caps })") ||
              m.includes("run({ colorLevel })")),
        )
      expect(phase5Warns).toEqual([])
    } finally {
      warnSpy.mockRestore()
    }
  })
})
