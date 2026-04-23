/**
 * Tests for createTerminalProfile — the single source of truth for terminal
 * detection (Phase 3 of km-silvery.terminal-profile-plateau).
 *
 * Covers:
 * - Env precedence (NO_COLOR, FORCE_COLOR)
 * - Explicit `colorOverride`
 * - `caps` base + `caps.colorLevel` fallback
 * - Merge order (env > override > caps > auto)
 * - Edge cases: `null` colorOverride, TTY/non-TTY, COLORTERM, TERM_PROGRAM
 */

import { describe, expect, test } from "vitest"
import {
  createTerminalProfile,
  probeTerminalProfile,
  detectColorFromEnv,
  detectTerminalCapsFromEnv,
} from "../src/profile"
import { defaultCaps } from "../src/detection"

const tty = { isTTY: true }
const nonTty = { isTTY: false }

// ============================================================================
// Env precedence — NO_COLOR > FORCE_COLOR > override > caps > auto
// ============================================================================

describe("createTerminalProfile — env precedence", () => {
  test("NO_COLOR=1 forces mono regardless of override or caps", () => {
    const profile = createTerminalProfile({
      env: { NO_COLOR: "1" },
      stdout: tty,
      colorOverride: "truecolor",
      caps: { colorLevel: "truecolor" },
    })
    expect(profile.colorTier).toBe("mono")
    expect(profile.caps.colorLevel).toBe("mono")
  })

  test("NO_COLOR empty string still forces mono (presence check, not value)", () => {
    const profile = createTerminalProfile({
      env: { NO_COLOR: "" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("mono")
  })

  test("FORCE_COLOR=3 → truecolor", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "3" },
      stdout: nonTty, // would otherwise be mono
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("FORCE_COLOR=2 → 256", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "2" },
      stdout: nonTty,
    })
    expect(profile.colorTier).toBe("256")
  })

  test("FORCE_COLOR=1 → ansi16", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "1" },
      stdout: nonTty,
    })
    expect(profile.colorTier).toBe("ansi16")
  })

  test("FORCE_COLOR=0 → mono", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "0" },
      stdout: tty,
      colorOverride: "truecolor", // override loses to env
    })
    expect(profile.colorTier).toBe("mono")
  })

  test("FORCE_COLOR=false → mono", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "false" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("mono")
  })

  test("NO_COLOR wins over FORCE_COLOR", () => {
    const profile = createTerminalProfile({
      env: { NO_COLOR: "1", FORCE_COLOR: "3" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("mono")
  })
})

// ============================================================================
// colorOverride — explicit caller tier
// ============================================================================

describe("createTerminalProfile — colorOverride", () => {
  test("explicit truecolor override wins over caps fallback", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      colorOverride: "truecolor",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("explicit 256 override wins over auto-detect", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-256color" }, // would auto-detect 256
      stdout: tty,
      colorOverride: "ansi16", // caller downgrades
    })
    expect(profile.colorTier).toBe("ansi16")
  })

  test("null colorOverride is the legacy mono alias", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      colorOverride: null,
    })
    expect(profile.colorTier).toBe("mono")
  })

  test("undefined colorOverride falls through to next level", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      colorOverride: undefined,
      caps: { colorLevel: "256" },
    })
    expect(profile.colorTier).toBe("256")
  })
})

// ============================================================================
// caps base — full/partial override, colorLevel fallback
// ============================================================================

describe("createTerminalProfile — caps base", () => {
  test("full caps passed through unchanged (no env/override)", () => {
    const caps = {
      ...defaultCaps(),
      program: "Ghostty",
      kittyKeyboard: true,
      colorLevel: "truecolor" as const,
    }
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps,
    })
    expect(profile.caps.program).toBe("Ghostty")
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.colorLevel).toBe("truecolor")
  })

  test("caps.colorLevel acts as fallback when override+env are absent", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps: { colorLevel: "256" },
    })
    expect(profile.colorTier).toBe("256")
  })

  test("caps is merged onto defaultCaps (partial)", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      caps: { kittyKeyboard: true }, // only one field
    })
    expect(profile.caps.kittyKeyboard).toBe(true)
    // Other fields come from defaultCaps
    expect(profile.caps.bracketedPaste).toBe(true)
    expect(profile.caps.mouse).toBe(true)
  })

  test("no caps provided → full env-based detection runs", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-kitty", TERM_PROGRAM: "kitty" },
      stdout: tty,
    })
    expect(profile.caps.program).toBe("kitty")
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.colorLevel).toBe("truecolor") // via TERM pattern
  })
})

// ============================================================================
// Auto-detection — env-based fallback path
// ============================================================================

describe("createTerminalProfile — auto-detect from env", () => {
  test("COLORTERM=truecolor → truecolor", () => {
    const profile = createTerminalProfile({
      env: { COLORTERM: "truecolor" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("COLORTERM=24bit → truecolor", () => {
    const profile = createTerminalProfile({
      env: { COLORTERM: "24bit" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("TERM=xterm-256color → 256", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-256color" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("256")
  })

  test("TERM_PROGRAM=iTerm.app → truecolor", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "iTerm.app" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("TERM_PROGRAM=Apple_Terminal → 256", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Apple_Terminal" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("256")
  })

  test("TERM_PROGRAM=Ghostty → truecolor", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("TERM_PROGRAM=WezTerm → truecolor", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "WezTerm" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("KITTY_WINDOW_ID set → truecolor", () => {
    const profile = createTerminalProfile({
      env: { KITTY_WINDOW_ID: "1" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("WT_SESSION set (no other hints) → truecolor", () => {
    const profile = createTerminalProfile({
      env: { WT_SESSION: "abcd" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })

  test("TERM=dumb → mono", () => {
    const profile = createTerminalProfile({
      env: { TERM: "dumb" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("mono")
  })

  test("non-TTY without FORCE_COLOR → mono", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
    })
    expect(profile.colorTier).toBe("mono")
  })

  test("TTY with unknown TERM → ansi16 default", () => {
    const profile = createTerminalProfile({
      env: { TERM: "unknown" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("ansi16")
  })

  test("CI env (e.g. GITHUB_ACTIONS) → ansi16", () => {
    const profile = createTerminalProfile({
      env: { GITHUB_ACTIONS: "true" },
      stdout: nonTty, // CI is typically non-TTY, but the branch checks regardless
    })
    // Non-TTY without FORCE_COLOR still short-circuits to mono BEFORE CI branch.
    // This matches the legacy `detectColor` semantics.
    expect(profile.colorTier).toBe("mono")
  })

  test("CI env + TTY + no other hints → ansi16", () => {
    const profile = createTerminalProfile({
      env: { GITHUB_ACTIONS: "true", TERM: "screen" },
      stdout: tty,
    })
    // Takes the xterm/screen branch first — matches legacy behavior.
    expect(profile.colorTier).toBe("ansi16")
  })
})

// ============================================================================
// Full precedence chain — one test per rung
// ============================================================================

describe("createTerminalProfile — precedence chain", () => {
  test("env > override > caps > auto (env wins)", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "1", TERM: "xterm-ghostty" },
      stdout: tty,
      colorOverride: "truecolor",
      caps: { colorLevel: "256" },
    })
    expect(profile.colorTier).toBe("ansi16") // FORCE_COLOR=1
  })

  test("override > caps > auto (override wins when env absent)", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" }, // would auto-detect truecolor
      stdout: tty,
      colorOverride: "256",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.colorTier).toBe("256")
  })

  test("caps > auto (caps wins when override+env absent)", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" },
      stdout: tty,
      caps: { colorLevel: "ansi16" }, // overrides the auto-detect
    })
    expect(profile.colorTier).toBe("ansi16")
  })

  test("auto when nothing else is provided", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("truecolor")
  })
})

// ============================================================================
// Caps shape — structural defaults
// ============================================================================

describe("createTerminalProfile — caps shape", () => {
  test("profile.caps always has every required field", () => {
    const profile = createTerminalProfile({ env: {}, stdout: nonTty })
    // Spot-check the fields the pipeline depends on.
    expect(typeof profile.caps.program).toBe("string")
    expect(typeof profile.caps.term).toBe("string")
    expect(typeof profile.caps.colorLevel).toBe("string")
    expect(typeof profile.caps.kittyKeyboard).toBe("boolean")
    expect(typeof profile.caps.unicode).toBe("boolean")
    expect(typeof profile.caps.bracketedPaste).toBe("boolean")
    expect(typeof profile.caps.mouse).toBe("boolean")
    expect(typeof profile.caps.darkBackground).toBe("boolean")
    expect(typeof profile.caps.nerdfont).toBe("boolean")
  })

  test("colorTier matches caps.colorLevel", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "2" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe(profile.caps.colorLevel)
  })

  test("profile.caps.program reflects TERM_PROGRAM", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.caps.program).toBe("Ghostty")
  })
})

// ============================================================================
// caps.unicode — env-sensitive (regression: km-silvery.unicode-plateau Phase 1)
// ============================================================================
//
// Before the unicode plateau, `detectTerminalCapsFromEnv` hardcoded
// `unicode: true` and the real detection lived in a standalone `detectUnicode()`
// helper that every consumer re-read env to call. The plateau refactor absorbed
// the detection into the profile factory. These tests pin the absorbed
// semantics so neither regression can reappear.

describe("createTerminalProfile — caps.unicode env-sensitivity", () => {
  test("empty env + non-TTY: unicode is false (conservative default)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: nonTty })
    expect(profile.caps.unicode).toBe(false)
  })

  test("modern terminal (TERM_PROGRAM=Ghostty): unicode is true", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("UTF-8 locale via LANG: unicode is true", () => {
    const profile = createTerminalProfile({
      env: { LANG: "en_US.UTF-8" },
      stdout: nonTty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("UTF-8 locale via LC_ALL: unicode is true", () => {
    const profile = createTerminalProfile({
      env: { LC_ALL: "de_DE.utf8" },
      stdout: nonTty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("Windows Terminal (WT_SESSION): unicode is true", () => {
    const profile = createTerminalProfile({
      env: { WT_SESSION: "some-session-id" },
      stdout: tty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("Kitty window (KITTY_WINDOW_ID): unicode is true", () => {
    const profile = createTerminalProfile({
      env: { KITTY_WINDOW_ID: "1" },
      stdout: tty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("GitHub Actions CI: unicode is true", () => {
    const profile = createTerminalProfile({
      env: { CI: "1", GITHUB_ACTIONS: "true" },
      stdout: nonTty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("TERM=xterm-256color implies unicode via TERM family", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-256color" },
      stdout: tty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("TERM=tmux-256color implies unicode (multiplexer)", () => {
    const profile = createTerminalProfile({
      env: { TERM: "tmux-256color" },
      stdout: tty,
    })
    expect(profile.caps.unicode).toBe(true)
  })

  test("TERM=dumb + non-TTY: unicode is false", () => {
    const profile = createTerminalProfile({
      env: { TERM: "dumb" },
      stdout: nonTty,
    })
    expect(profile.caps.unicode).toBe(false)
  })

  test("bare CI without GITHUB_ACTIONS: unicode defaults to false", () => {
    // Legacy semantic: CI alone is NOT enough — we want the specific
    // indicator. This pins the env-sensitivity so a drift that short-
    // circuited on plain `CI` would fail the test.
    const profile = createTerminalProfile({
      env: { CI: "1" },
      stdout: nonTty,
    })
    expect(profile.caps.unicode).toBe(false)
  })
})

// ============================================================================
// Internal helpers — detectColorFromEnv / detectTerminalCapsFromEnv
// (exported-internal so test fixtures can drive them deterministically)
// ============================================================================

// ============================================================================
// profile.colorProvenance + profile.colorForced — color-scoped provenance
// ============================================================================
//
// Phase 5 of km-silvery.terminal-profile-plateau (/pro review 2026-04-23).
// The prior flat `source` field was renamed to `colorProvenance` (narrower
// name matches what the field actually describes — color tier resolution,
// not whole-profile provenance) and a precomputed `colorForced` boolean was
// added because `source === "env" || source === "override"` was the only
// read pattern in run.tsx / create-app.tsx. Pin every rung plus the forced
// gate so the two new fields stay aligned with the old `source` behaviour.

describe("createTerminalProfile — color provenance attribution", () => {
  test('NO_COLOR → colorProvenance = "env", colorForced = true', () => {
    const profile = createTerminalProfile({
      env: { NO_COLOR: "1" },
      stdout: tty,
      colorOverride: "truecolor",
      caps: { colorLevel: "truecolor" },
    })
    expect(profile.colorProvenance).toBe("env")
    expect(profile.colorForced).toBe(true)
  })

  test('FORCE_COLOR=3 → colorProvenance = "env", colorForced = true', () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "3" },
      stdout: nonTty,
    })
    expect(profile.colorProvenance).toBe("env")
    expect(profile.colorForced).toBe(true)
  })

  test('FORCE_COLOR=0 with caller override → colorProvenance = "env" (env still wins)', () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "0" },
      stdout: tty,
      colorOverride: "truecolor",
    })
    expect(profile.colorProvenance).toBe("env")
    expect(profile.colorForced).toBe(true)
  })

  test('colorOverride with no env → colorProvenance = "override", colorForced = true', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      colorOverride: "truecolor",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.colorProvenance).toBe("override")
    expect(profile.colorForced).toBe(true)
  })

  test('null colorOverride (legacy mono alias) → colorProvenance = "override"', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      colorOverride: null,
    })
    expect(profile.colorProvenance).toBe("override")
    expect(profile.colorForced).toBe(true)
  })

  test('caps.colorLevel fallback → colorProvenance = "caller-caps", colorForced = false', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps: { colorLevel: "256" },
    })
    expect(profile.colorProvenance).toBe("caller-caps")
    expect(profile.colorForced).toBe(false)
  })

  test('full caps passed without override → colorProvenance = "caller-caps"', () => {
    const caps = {
      ...defaultCaps(),
      program: "Ghostty",
      kittyKeyboard: true,
      colorLevel: "truecolor" as const,
    }
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps,
    })
    expect(profile.colorProvenance).toBe("caller-caps")
    expect(profile.colorForced).toBe(false)
  })

  test('no env, no override, no caps → colorProvenance = "auto", colorForced = false', () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" },
      stdout: tty,
    })
    expect(profile.colorProvenance).toBe("auto")
    expect(profile.colorForced).toBe(false)
    expect(profile.colorTier).toBe("truecolor")
  })

  test('non-TTY with no overrides → colorProvenance = "auto" (mono)', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
    })
    expect(profile.colorProvenance).toBe("auto")
    expect(profile.colorForced).toBe(false)
    expect(profile.colorTier).toBe("mono")
  })

  test("precedence chain: env wins over override + caps", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "1" },
      stdout: tty,
      colorOverride: "truecolor",
      caps: { colorLevel: "256" },
    })
    expect(profile.colorProvenance).toBe("env")
    expect(profile.colorForced).toBe(true)
    expect(profile.colorTier).toBe("ansi16") // FORCE_COLOR=1
  })

  test("colorForced is the single-field read pattern callers use", () => {
    // The whole point of colorForced: entry points previously wrote
    // `source === "env" || source === "override"` in two places. That chain
    // is exactly the forced-tier predicate — pin it here so the two fields
    // stay synchronised if a new rung is ever added to colorProvenance.
    const envForced = createTerminalProfile({ env: { NO_COLOR: "1" }, stdout: tty })
    const overrideForced = createTerminalProfile({
      env: {},
      stdout: tty,
      colorOverride: "256",
    })
    const callerCaps = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps: { colorLevel: "256" },
    })
    const auto = createTerminalProfile({ env: {}, stdout: nonTty })

    expect(envForced.colorForced).toBe(true)
    expect(overrideForced.colorForced).toBe(true)
    expect(callerCaps.colorForced).toBe(false)
    expect(auto.colorForced).toBe(false)
  })
})

describe("detectColorFromEnv", () => {
  test("NO_COLOR wins", () => {
    expect(detectColorFromEnv({ NO_COLOR: "1", FORCE_COLOR: "3" }, tty)).toBe("mono")
  })

  test("FORCE_COLOR=3 wins over non-TTY", () => {
    expect(detectColorFromEnv({ FORCE_COLOR: "3" }, nonTty)).toBe("truecolor")
  })

  test("returns mono when non-TTY and no env overrides", () => {
    expect(detectColorFromEnv({}, nonTty)).toBe("mono")
  })

  test("xterm-ghostty → truecolor", () => {
    expect(detectColorFromEnv({ TERM: "xterm-ghostty" }, tty)).toBe("truecolor")
  })
})

describe("detectTerminalCapsFromEnv", () => {
  test("kittyKeyboard is true for xterm-kitty", () => {
    const caps = detectTerminalCapsFromEnv({ TERM: "xterm-kitty" }, tty)
    expect(caps.kittyKeyboard).toBe(true)
  })

  test("kittyKeyboard is false for Apple_Terminal", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "Apple_Terminal" }, tty)
    expect(caps.kittyKeyboard).toBe(false)
  })

  test("colorLevel honors FORCE_COLOR in caps", () => {
    const caps = detectTerminalCapsFromEnv({ FORCE_COLOR: "2" }, nonTty)
    expect(caps.colorLevel).toBe("256")
  })

  test("nerdfont defaults to true for modern terminals (iTerm.app)", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "iTerm.app" }, tty)
    expect(caps.nerdfont).toBe(true)
  })

  test("NERDFONT=0 disables nerdfont override", () => {
    const caps = detectTerminalCapsFromEnv(
      { TERM_PROGRAM: "iTerm.app", NERDFONT: "0" },
      tty,
    )
    expect(caps.nerdfont).toBe(false)
  })
})

// ============================================================================
// Terminal matrix — full caps snapshot per known terminal.
//
// Pins every cap flag for each supported TERM_PROGRAM / TERM combination so a
// case-sensitivity slip (the km-silvery.ghostty-case-sensitivity regression)
// or a fallthrough-default drift cannot pass tests silently. Previous tests
// asserted one cap at a time — sufficient for colorLevel, insufficient for
// the 8-flag "isModern" fanout (kittyKeyboard, osc52, hyperlinks, …).
// ============================================================================

describe("detectTerminalCapsFromEnv — terminal matrix", () => {
  test("Ghostty (TERM_PROGRAM=Ghostty) populates every modern-terminal cap", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "Ghostty" }, tty)
    // Regression: km-silvery.ghostty-case-sensitivity — the lowercase compare
    // at profile.ts:295 meant every one of these was false on real Ghostty
    // machines while the test suite (which only checked colorLevel) passed.
    expect(caps.program).toBe("Ghostty")
    expect(caps.colorLevel).toBe("truecolor")
    expect(caps.kittyKeyboard).toBe(true)
    expect(caps.kittyGraphics).toBe(true)
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
    expect(caps.syncOutput).toBe(true)
    expect(caps.underlineStyles).toBe(true)
    expect(caps.underlineColor).toBe(true)
    expect(caps.nerdfont).toBe(true)
  })

  test("Kitty (TERM=xterm-kitty) populates kitty + modern caps", () => {
    const caps = detectTerminalCapsFromEnv({ TERM: "xterm-kitty" }, tty)
    expect(caps.term).toBe("xterm-kitty")
    expect(caps.colorLevel).toBe("truecolor")
    expect(caps.kittyKeyboard).toBe(true)
    expect(caps.kittyGraphics).toBe(true)
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
    expect(caps.notifications).toBe(true)
  })

  test("WezTerm (TERM_PROGRAM=WezTerm) populates kitty + modern caps", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "WezTerm" }, tty)
    expect(caps.program).toBe("WezTerm")
    expect(caps.colorLevel).toBe("truecolor")
    expect(caps.kittyKeyboard).toBe(true)
    expect(caps.sixel).toBe(true)
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
  })

  test("foot (TERM=foot) populates kitty + modern caps", () => {
    const caps = detectTerminalCapsFromEnv({ TERM: "foot" }, tty)
    expect(caps.kittyKeyboard).toBe(true)
    expect(caps.sixel).toBe(true)
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
  })

  test("iTerm.app (TERM_PROGRAM=iTerm.app) populates iTerm caps", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "iTerm.app" }, tty)
    expect(caps.program).toBe("iTerm.app")
    expect(caps.colorLevel).toBe("truecolor")
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
    expect(caps.notifications).toBe(true)
    // iTerm is not Kitty-keyboard by default — that matrix cell must stay false.
    expect(caps.kittyKeyboard).toBe(false)
  })

  test("Apple_Terminal reports 256 color + text-narrow emoji + no modern caps", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "Apple_Terminal" }, tty)
    expect(caps.program).toBe("Apple_Terminal")
    expect(caps.colorLevel).toBe("256")
    expect(caps.kittyKeyboard).toBe(false)
    expect(caps.kittyGraphics).toBe(false)
    expect(caps.osc52).toBe(false)
    expect(caps.hyperlinks).toBe(false)
    expect(caps.underlineStyles).toBe(false)
    expect(caps.underlineColor).toBe(false)
    // Apple Terminal renders text-emoji at 1-cell width — required for correct
    // grapheme measurement in the pipeline.
    expect(caps.textEmojiWide).toBe(false)
  })

  test("Alacritty (TERM_PROGRAM=Alacritty) reports osc52 + hyperlinks without kitty", () => {
    const caps = detectTerminalCapsFromEnv({ TERM_PROGRAM: "Alacritty" }, tty)
    expect(caps.program).toBe("Alacritty")
    expect(caps.osc52).toBe(true)
    expect(caps.hyperlinks).toBe(true)
    expect(caps.underlineStyles).toBe(true)
    expect(caps.underlineColor).toBe(true)
    // Alacritty doesn't implement Kitty keyboard protocol.
    expect(caps.kittyKeyboard).toBe(false)
  })

  test("unknown TERM (e.g. plain xterm) falls back to ansi16 without modern caps", () => {
    const caps = detectTerminalCapsFromEnv({ TERM: "xterm" }, tty)
    expect(caps.colorLevel).toBe("ansi16")
    expect(caps.kittyKeyboard).toBe(false)
    expect(caps.kittyGraphics).toBe(false)
    expect(caps.osc52).toBe(false)
    expect(caps.hyperlinks).toBe(false)
  })
})

// ============================================================================
// Contract: RunOptions / profile precedence at the factory level.
//
// Documents the precedence contract for the `profile?` field relative to
// `caps`/`colorOverride` at the factory. The factory does not expose the
// RunOptions-level silent-wins behavior; that contract lives in run.tsx.
// This section pins the invariants the profile factory itself guarantees.
// ============================================================================

describe("createTerminalProfile — contract", () => {
  test("contract: precedence chain is env > override > caller-caps > auto (cannot be inverted without breaking this test)", () => {
    // Env wins over everything
    expect(
      createTerminalProfile({
        env: { FORCE_COLOR: "2" },
        stdout: tty,
        colorOverride: "mono",
        caps: { colorLevel: "truecolor" },
      }).colorProvenance,
    ).toBe("env")

    // Override wins over caller-caps
    expect(
      createTerminalProfile({
        env: {},
        stdout: nonTty,
        colorOverride: "mono",
        caps: { colorLevel: "truecolor" },
      }).colorProvenance,
    ).toBe("override")

    // Caller-caps wins over auto
    expect(
      createTerminalProfile({
        env: {},
        stdout: nonTty,
        caps: { colorLevel: "256" },
      }).colorProvenance,
    ).toBe("caller-caps")

    // Nothing supplied → auto (from env-based detection)
    expect(
      createTerminalProfile({
        env: { TERM: "xterm-ghostty" },
        stdout: tty,
      }).colorProvenance,
    ).toBe("auto")
  })
})

// ============================================================================
// probeTerminalProfile — async profile with bundled theme
// ============================================================================
//
// H2 of the /big review 2026-04-23 (km-silvery.plateau-profile-theme).
// probeTerminalProfile folds detectTheme + pickColorLevel into the profile
// factory so run() / createApp() stop duplicating the probe dance across
// their Term-path and options-path branches. The contract tests below pin:
//   1. probeTheme: false behaves like createTerminalProfile (no theme).
//   2. probeTheme: true (default) populates profile.theme on mono/ansi16
//      tiers using the ANSI-16 canned themes — no OSC roundtrip needed.
//   3. The precedence chain + color provenance match the sync factory.

describe("probeTerminalProfile — contract", () => {
  test('contract: probeTheme: false returns a profile without theme (sync-equivalent)', async () => {
    // When probeTheme is explicitly disabled, the async variant must produce
    // exactly what createTerminalProfile would have — same caps, same tier,
    // same colorProvenance, no theme field. This lets callers unify on one
    // async entry point even when they don't want a probe.
    const profile = await probeTerminalProfile({
      env: { FORCE_COLOR: "3" },
      stdout: tty,
      probeTheme: false,
    })
    expect(profile.colorTier).toBe("truecolor")
    expect(profile.colorProvenance).toBe("env")
    expect(profile.colorForced).toBe(true)
    expect(profile.theme).toBeUndefined()
  })

  test('contract: probeTheme: true on mono tier returns a canned theme (no OSC probe)', async () => {
    // detectTheme short-circuits mono/ansi16 to the built-in ANSI-16 themes,
    // so this test runs to completion even in non-TTY Vitest environments
    // where an OSC probe would time out. The profile.theme field must be
    // populated — that's the whole point of using probeTerminalProfile.
    const profile = await probeTerminalProfile({
      env: { NO_COLOR: "1" },
      stdout: tty,
      fallbackDark: undefined, // let detectTheme pick its built-in default
      fallbackLight: undefined,
    })
    expect(profile.colorTier).toBe("mono")
    expect(profile.colorProvenance).toBe("env")
    expect(profile.theme).toBeDefined()
    // Sanity: the theme has the required top-level fields (not a test of
    // theme shape, just that we returned *a* theme).
    expect(typeof profile.theme).toBe("object")
  })

  test('contract: probeTheme: true on ansi16 tier returns a canned theme', async () => {
    const profile = await probeTerminalProfile({
      env: { FORCE_COLOR: "1" },
      stdout: tty,
    })
    expect(profile.colorTier).toBe("ansi16")
    expect(profile.colorProvenance).toBe("env")
    expect(profile.theme).toBeDefined()
  })

  test("contract: precedence chain matches createTerminalProfile (env > override > caps > auto)", async () => {
    // Async variant must honor the same precedence — env wins over override
    // wins over caller-caps. Pinning the chain here ensures the async wrapper
    // can't drift apart from the sync source of truth.
    const profile = await probeTerminalProfile({
      env: { FORCE_COLOR: "0" }, // mono — env wins
      stdout: tty,
      colorOverride: "truecolor",
      caps: { colorLevel: "truecolor" },
      probeTheme: false, // isolate the precedence assertion from theme probing
    })
    expect(profile.colorTier).toBe("mono")
    expect(profile.colorProvenance).toBe("env")
    expect(profile.colorForced).toBe(true)
  })
})

// ============================================================================
// Immutability invariants — km-silvery.profile-immutable (/pro review)
// ============================================================================
//
// TerminalProfile is a snapshot value. The whole plateau leans on the
// invariants below never drifting; without type-level readonly + dev freeze,
// any caller could silently rewrite `profile.colorTier` and break the
// "one detection, one source of truth" contract.
//
// These tests are intentionally defensive — the type system already rejects
// direct writes, but test builds run with NODE_ENV=undefined (dev mode) so
// the Object.freeze path is always exercised here.

describe("createTerminalProfile — immutability invariants", () => {
  test("invariant: profile.colorTier === profile.caps.colorLevel across all rungs", () => {
    const cases = [
      createTerminalProfile({ env: { NO_COLOR: "1" }, stdout: tty }),
      createTerminalProfile({ env: { FORCE_COLOR: "3" }, stdout: nonTty }),
      createTerminalProfile({ env: {}, stdout: tty, colorOverride: "256" }),
      createTerminalProfile({ env: {}, stdout: nonTty, caps: { colorLevel: "truecolor" } }),
      createTerminalProfile({ env: { TERM: "xterm-ghostty" }, stdout: tty }),
    ]
    for (const profile of cases) {
      expect(profile.colorTier).toBe(profile.caps.colorLevel)
    }
  })

  test("invariant: profile is frozen in dev (mutation throws)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: tty, colorOverride: "256" })
    expect(Object.isFrozen(profile)).toBe(true)
    // Mutating any top-level field throws in strict mode — TS strict modules
    // run implicit strict, so the assignment below is a TypeError at runtime.
    expect(() => {
      ;(profile as unknown as { colorTier: string }).colorTier = "mono"
    }).toThrow(TypeError)
  })

  test("invariant: profile.caps is frozen in dev (nested mutation throws)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: tty, colorOverride: "256" })
    expect(Object.isFrozen(profile.caps)).toBe(true)
    expect(() => {
      ;(profile.caps as unknown as { colorLevel: string }).colorLevel = "mono"
    }).toThrow(TypeError)
  })

  test("invariant: probeTerminalProfile result is frozen in dev", async () => {
    const profile = await probeTerminalProfile({
      env: { FORCE_COLOR: "3" },
      stdout: tty,
      probeTheme: false,
    })
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.caps)).toBe(true)
    expect(() => {
      ;(profile as unknown as { colorTier: string }).colorTier = "mono"
    }).toThrow(TypeError)
  })

  test("invariant: probeTerminalProfile with theme re-freezes after spread", async () => {
    // probeTerminalProfile does `{ ...profile, theme }` which creates a fresh
    // unfrozen object; the factory must re-freeze it so the immutability
    // contract survives the theme-bundle path.
    const profile = await probeTerminalProfile({
      env: { NO_COLOR: "1" },
      stdout: tty,
    })
    expect(Object.isFrozen(profile)).toBe(true)
    expect(profile.theme).toBeDefined()
    expect(() => {
      ;(profile as unknown as { theme: unknown }).theme = undefined
    }).toThrow(TypeError)
  })
})
