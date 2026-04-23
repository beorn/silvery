/**
 * Tests for createTerminalProfile — the single source of truth for terminal
 * detection (Phase 3 of km-silvery.terminal-profile-plateau).
 *
 * Covers:
 * - Env precedence (NO_COLOR, FORCE_COLOR)
 * - Explicit `colorLevel`
 * - `caps` base + `profile.caps.colorLevel` fallback
 * - Merge order (env > override > caps > auto)
 * - Edge cases: `null` colorLevel, TTY/non-TTY, COLORTERM, TERM_PROGRAM
 */

import { describe, expect, test } from "vitest"
import {
  createTerminalProfile,
  probeTerminalProfile,
  detectColorFromEnv,
  detectTerminalProfileFromEnv,
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
      colorLevel: "truecolor",
      caps: { colorLevel: "truecolor" },
    })
    expect(profile.colorLevel).toBe("mono")
    expect(profile.caps.colorLevel).toBe("mono")
  })

  test("NO_COLOR empty string still forces mono (presence check, not value)", () => {
    const profile = createTerminalProfile({
      env: { NO_COLOR: "" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("mono")
  })

  test("FORCE_COLOR=3 → truecolor", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "3" },
      stdout: nonTty, // would otherwise be mono
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("FORCE_COLOR=2 → 256", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "2" },
      stdout: nonTty,
    })
    expect(profile.colorLevel).toBe("256")
  })

  test("FORCE_COLOR=1 → ansi16", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "1" },
      stdout: nonTty,
    })
    expect(profile.colorLevel).toBe("ansi16")
  })

  test("FORCE_COLOR=0 → mono", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "0" },
      stdout: tty,
      colorLevel: "truecolor", // override loses to env
    })
    expect(profile.colorLevel).toBe("mono")
  })

  test("FORCE_COLOR=false → mono", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "false" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("mono")
  })

  test("NO_COLOR wins over FORCE_COLOR", () => {
    const profile = createTerminalProfile({
      env: { NO_COLOR: "1", FORCE_COLOR: "3" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("mono")
  })
})

// ============================================================================
// colorLevel — explicit caller tier
// ============================================================================

describe("createTerminalProfile — colorLevel", () => {
  test("explicit truecolor override wins over caps fallback", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      colorLevel: "truecolor",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("explicit 256 override wins over auto-detect", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-256color" }, // would auto-detect 256
      stdout: tty,
      colorLevel: "ansi16", // caller downgrades
    })
    expect(profile.colorLevel).toBe("ansi16")
  })

  test("null colorLevel is the legacy mono alias", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      colorLevel: null,
    })
    expect(profile.colorLevel).toBe("mono")
  })

  test("undefined colorLevel falls through to next level", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      colorLevel: undefined,
      caps: { colorLevel: "256" },
    })
    expect(profile.colorLevel).toBe("256")
  })
})

// ============================================================================
// caps base — full/partial override, colorLevel fallback
// ============================================================================

describe("createTerminalProfile — caps base", () => {
  test("full caps passed through unchanged (no env/override)", () => {
    const caps = {
      ...defaultCaps(),
      kittyKeyboard: true,
      colorLevel: "truecolor" as const,
    }
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps,
      emulator: { program: "Ghostty" },
    })
    expect(profile.emulator.program).toBe("Ghostty")
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.colorLevel).toBe("truecolor")
  })

  test("profile.caps.colorLevel acts as fallback when override+env are absent", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps: { colorLevel: "256" },
    })
    expect(profile.colorLevel).toBe("256")
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
    expect(profile.emulator.program).toBe("kitty")
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
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("COLORTERM=24bit → truecolor", () => {
    const profile = createTerminalProfile({
      env: { COLORTERM: "24bit" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("TERM=xterm-256color → 256", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-256color" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("256")
  })

  test("TERM_PROGRAM=iTerm.app → truecolor", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "iTerm.app" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("TERM_PROGRAM=Apple_Terminal → 256", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Apple_Terminal" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("256")
  })

  test("TERM_PROGRAM=Ghostty → truecolor", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("TERM_PROGRAM=WezTerm → truecolor", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "WezTerm" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("KITTY_WINDOW_ID set → truecolor", () => {
    const profile = createTerminalProfile({
      env: { KITTY_WINDOW_ID: "1" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("WT_SESSION set (no other hints) → truecolor", () => {
    const profile = createTerminalProfile({
      env: { WT_SESSION: "abcd" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })

  test("TERM=dumb → mono", () => {
    const profile = createTerminalProfile({
      env: { TERM: "dumb" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("mono")
  })

  test("non-TTY without FORCE_COLOR → mono", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
    })
    expect(profile.colorLevel).toBe("mono")
  })

  test("TTY with unknown TERM → ansi16 default", () => {
    const profile = createTerminalProfile({
      env: { TERM: "unknown" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("ansi16")
  })

  test("CI env (e.g. GITHUB_ACTIONS) → ansi16", () => {
    const profile = createTerminalProfile({
      env: { GITHUB_ACTIONS: "true" },
      stdout: nonTty, // CI is typically non-TTY, but the branch checks regardless
    })
    // Non-TTY without FORCE_COLOR still short-circuits to mono BEFORE CI branch.
    // This matches the legacy `detectColor` semantics.
    expect(profile.colorLevel).toBe("mono")
  })

  test("CI env + TTY + no other hints → ansi16", () => {
    const profile = createTerminalProfile({
      env: { GITHUB_ACTIONS: "true", TERM: "screen" },
      stdout: tty,
    })
    // Takes the xterm/screen branch first — matches legacy behavior.
    expect(profile.colorLevel).toBe("ansi16")
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
      colorLevel: "truecolor",
      caps: { colorLevel: "256" },
    })
    expect(profile.colorLevel).toBe("ansi16") // FORCE_COLOR=1
  })

  test("override > caps > auto (override wins when env absent)", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" }, // would auto-detect truecolor
      stdout: tty,
      colorLevel: "256",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.colorLevel).toBe("256")
  })

  test("caps > auto (caps wins when override+env absent)", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" },
      stdout: tty,
      caps: { colorLevel: "ansi16" }, // overrides the auto-detect
    })
    expect(profile.colorLevel).toBe("ansi16")
  })

  test("auto when nothing else is provided", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe("truecolor")
  })
})

// ============================================================================
// Caps shape — structural defaults
// ============================================================================

describe("createTerminalProfile — caps shape", () => {
  test("profile.caps always has every required field", () => {
    const profile = createTerminalProfile({ env: {}, stdout: nonTty })
    // Spot-check the fields the pipeline depends on.
    expect(typeof profile.emulator.program).toBe("string")
    expect(typeof profile.emulator.TERM).toBe("string")
    expect(typeof profile.caps.colorLevel).toBe("string")
    expect(typeof profile.caps.kittyKeyboard).toBe("boolean")
    expect(typeof profile.caps.unicode).toBe("boolean")
    expect(typeof profile.caps.bracketedPaste).toBe("boolean")
    expect(typeof profile.caps.mouse).toBe("boolean")
    expect(typeof profile.caps.maybeDarkBackground).toBe("boolean")
    expect(typeof profile.caps.maybeNerdFont).toBe("boolean")
  })

  test("colorLevel matches profile.caps.colorLevel", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "2" },
      stdout: tty,
    })
    expect(profile.colorLevel).toBe(profile.caps.colorLevel)
  })

  test("profile.emulator.program reflects TERM_PROGRAM", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "Ghostty" },
      stdout: tty,
    })
    expect(profile.emulator.program).toBe("Ghostty")
  })
})

// ============================================================================
// profile.caps.unicode — env-sensitive (regression: km-silvery.unicode-plateau Phase 1)
// ============================================================================
//
// Before the unicode plateau, `detectTerminalProfileFromEnv` hardcoded
// `unicode: true` and the real detection lived in a standalone `detectUnicode()`
// helper that every consumer re-read env to call. The plateau refactor absorbed
// the detection into the profile factory. These tests pin the absorbed
// semantics so neither regression can reappear.

describe("createTerminalProfile — profile.caps.unicode env-sensitivity", () => {
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
// profile.caps.textSizing + profile.emulator.version — migrated from the retired
// isTextSizingLikelySupported env probe (unicode-plateau Phase 2, 2026-04-23).
// ============================================================================

describe("createTerminalProfile — profile.caps.textSizing (Kitty ≥ 0.40)", () => {
  test("Kitty 0.40 on TERM=xterm-kitty: textSizing true", () => {
    const profile = createTerminalProfile({
      env: {
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        TERM_PROGRAM_VERSION: "0.40.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(true)
  })

  test("Kitty 0.41 on TERM=xterm-kitty: textSizing true", () => {
    const profile = createTerminalProfile({
      env: {
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        TERM_PROGRAM_VERSION: "0.41.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(true)
  })

  test("Kitty 1.0 on TERM=xterm-kitty: textSizing true (major bump)", () => {
    const profile = createTerminalProfile({
      env: {
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        TERM_PROGRAM_VERSION: "1.0.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(true)
  })

  test("Kitty 0.39 on TERM=xterm-kitty: textSizing false (below threshold)", () => {
    const profile = createTerminalProfile({
      env: {
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        TERM_PROGRAM_VERSION: "0.39.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(false)
  })

  test("Kitty 0.35 on TERM=xterm-kitty: textSizing false", () => {
    const profile = createTerminalProfile({
      env: {
        TERM: "xterm-kitty",
        TERM_PROGRAM: "kitty",
        TERM_PROGRAM_VERSION: "0.35.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(false)
  })

  test("Ghostty 1.3 on TERM=xterm-ghostty: textSizing false (known broken OSC 66)", () => {
    const profile = createTerminalProfile({
      env: {
        TERM: "xterm-ghostty",
        TERM_PROGRAM: "Ghostty",
        TERM_PROGRAM_VERSION: "1.3.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(false)
  })

  test("unknown terminal: textSizing false", () => {
    const profile = createTerminalProfile({
      env: {
        TERM_PROGRAM: "some-unknown-terminal",
        TERM_PROGRAM_VERSION: "1.0.0",
      },
      stdout: tty,
    })
    expect(profile.caps.textSizing).toBe(false)
  })

  test("TERM_PROGRAM unset: textSizing false", () => {
    const profile = createTerminalProfile({ env: {}, stdout: tty })
    expect(profile.caps.textSizing).toBe(false)
  })
})

describe("createTerminalProfile — profile.caps.input (absorbed from detectInput)", () => {
  test("TTY stdin with setRawMode: input true", () => {
    const ttyStdin = {
      isTTY: true as const,
      setRawMode: () => void 0,
    }
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      stdin: ttyStdin,
    })
    expect(profile.caps.input).toBe(true)
  })

  test("TTY stdin without setRawMode: input false", () => {
    // This is the pattern inside a child process that has stdin as TTY but
    // somehow lacks setRawMode (rare but possible in wrapper libs).
    const partialStdin = { isTTY: true as const }
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      stdin: partialStdin,
    })
    expect(profile.caps.input).toBe(false)
  })

  test("non-TTY stdin: input false (piped input)", () => {
    const pipedStdin = {
      isTTY: false as const,
      setRawMode: () => void 0,
    }
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      stdin: pipedStdin,
    })
    expect(profile.caps.input).toBe(false)
  })

  test("explicit stdin: undefined: input false (browser/canvas target)", () => {
    // Passing `stdin: undefined` explicitly neutralizes the process.stdin
    // default — useful for non-Node targets.
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      stdin: undefined,
    })
    expect(profile.caps.input).toBe(false)
  })

  test("profile.caps.input can be forced via options.caps", () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      stdin: undefined,
      caps: { input: true },
    })
    expect(profile.caps.input).toBe(true)
  })
})

describe("createTerminalProfile — profile.caps.cursor (absorbed from detectCursor)", () => {
  test("TTY + regular TERM: cursor true", () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-256color" },
      stdout: tty,
    })
    expect(profile.caps.cursor).toBe(true)
  })

  test("non-TTY: cursor false (piped output)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: nonTty })
    expect(profile.caps.cursor).toBe(false)
  })

  test("TTY + TERM=dumb: cursor false", () => {
    const profile = createTerminalProfile({
      env: { TERM: "dumb" },
      stdout: tty,
    })
    expect(profile.caps.cursor).toBe(false)
  })

  test("TTY + no TERM: cursor true (assume modern terminal)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: tty })
    expect(profile.caps.cursor).toBe(true)
  })
})

describe("createTerminalProfile — profile.emulator.version", () => {
  test("profile.emulator.version mirrors TERM_PROGRAM_VERSION", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "kitty", TERM_PROGRAM_VERSION: "0.40.0" },
      stdout: tty,
    })
    expect(profile.emulator.version).toBe("0.40.0")
  })

  test("profile.emulator.version is empty string when TERM_PROGRAM_VERSION unset", () => {
    const profile = createTerminalProfile({
      env: { TERM_PROGRAM: "kitty" },
      stdout: tty,
    })
    expect(profile.emulator.version).toBe("")
  })
})

// ============================================================================
// Internal helpers — detectColorFromEnv / detectTerminalProfileFromEnv
// (exported-internal so test fixtures can drive them deterministically)
// ============================================================================

// ============================================================================
// profile.caps.colorProvenance + profile.caps.colorForced — color-scoped provenance
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
      colorLevel: "truecolor",
      caps: { colorLevel: "truecolor" },
    })
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.caps.colorForced).toBe(true)
  })

  test('FORCE_COLOR=3 → colorProvenance = "env", colorForced = true', () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "3" },
      stdout: nonTty,
    })
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.caps.colorForced).toBe(true)
  })

  test('FORCE_COLOR=0 with caller override → colorProvenance = "env" (env still wins)', () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "0" },
      stdout: tty,
      colorLevel: "truecolor",
    })
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.caps.colorForced).toBe(true)
  })

  test('colorLevel with no env → colorProvenance = "override", colorForced = true', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      colorLevel: "truecolor",
      caps: { colorLevel: "ansi16" },
    })
    expect(profile.caps.colorProvenance).toBe("override")
    expect(profile.caps.colorForced).toBe(true)
  })

  test('null colorLevel (legacy mono alias) → colorProvenance = "override"', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: tty,
      colorLevel: null,
    })
    expect(profile.caps.colorProvenance).toBe("override")
    expect(profile.caps.colorForced).toBe(true)
  })

  test('profile.caps.colorLevel fallback → colorProvenance = "caller-caps", colorForced = false', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps: { colorLevel: "256" },
    })
    expect(profile.caps.colorProvenance).toBe("caller-caps")
    expect(profile.caps.colorForced).toBe(false)
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
    expect(profile.caps.colorProvenance).toBe("caller-caps")
    expect(profile.caps.colorForced).toBe(false)
  })

  test('no env, no override, no caps → colorProvenance = "auto", colorForced = false', () => {
    const profile = createTerminalProfile({
      env: { TERM: "xterm-ghostty" },
      stdout: tty,
    })
    expect(profile.caps.colorProvenance).toBe("auto")
    expect(profile.caps.colorForced).toBe(false)
    expect(profile.colorLevel).toBe("truecolor")
  })

  test('non-TTY with no overrides → colorProvenance = "auto" (mono)', () => {
    const profile = createTerminalProfile({
      env: {},
      stdout: nonTty,
    })
    expect(profile.caps.colorProvenance).toBe("auto")
    expect(profile.caps.colorForced).toBe(false)
    expect(profile.colorLevel).toBe("mono")
  })

  test("precedence chain: env wins over override + caps", () => {
    const profile = createTerminalProfile({
      env: { FORCE_COLOR: "1" },
      stdout: tty,
      colorLevel: "truecolor",
      caps: { colorLevel: "256" },
    })
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.caps.colorForced).toBe(true)
    expect(profile.colorLevel).toBe("ansi16") // FORCE_COLOR=1
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
      colorLevel: "256",
    })
    const callerCaps = createTerminalProfile({
      env: {},
      stdout: nonTty,
      caps: { colorLevel: "256" },
    })
    const auto = createTerminalProfile({ env: {}, stdout: nonTty })

    expect(envForced.caps.colorForced).toBe(true)
    expect(overrideForced.caps.colorForced).toBe(true)
    expect(callerCaps.caps.colorForced).toBe(false)
    expect(auto.caps.colorForced).toBe(false)
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

describe("detectTerminalProfileFromEnv", () => {
  test("kittyKeyboard is true for xterm-kitty", () => {
    const profile = detectTerminalProfileFromEnv({ TERM: "xterm-kitty" }, tty)
    expect(profile.caps.kittyKeyboard).toBe(true)
  })

  test("kittyKeyboard is false for Apple_Terminal", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "Apple_Terminal" }, tty)
    expect(profile.caps.kittyKeyboard).toBe(false)
  })

  test("colorLevel honors FORCE_COLOR in caps", () => {
    const profile = detectTerminalProfileFromEnv({ FORCE_COLOR: "2" }, nonTty)
    expect(profile.caps.colorLevel).toBe("256")
  })

  test("nerdfont defaults to true for modern terminals (iTerm.app)", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "iTerm.app" }, tty)
    expect(profile.caps.maybeNerdFont).toBe(true)
  })

  test("NERDFONT=0 disables nerdfont override", () => {
    const profile = detectTerminalProfileFromEnv(
      { TERM_PROGRAM: "iTerm.app", NERDFONT: "0" },
      tty,
    )
    expect(profile.caps.maybeNerdFont).toBe(false)
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

describe("detectTerminalProfileFromEnv — terminal matrix", () => {
  test("Ghostty (TERM_PROGRAM=Ghostty) populates every modern-terminal cap", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "Ghostty" }, tty)
    // Regression: km-silvery.ghostty-case-sensitivity — the lowercase compare
    // at profile.ts:295 meant every one of these was false on real Ghostty
    // machines while the test suite (which only checked colorLevel) passed.
    expect(profile.emulator.program).toBe("Ghostty")
    expect(profile.caps.colorLevel).toBe("truecolor")
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.kittyGraphics).toBe(true)
    expect(profile.caps.osc52).toBe(true)
    expect(profile.caps.hyperlinks).toBe(true)
    expect(profile.caps.syncOutput).toBe(true)
    expect(profile.caps.underlineStyles.length).toBeGreaterThan(0)
    expect(profile.caps.underlineColor).toBe(true)
    expect(profile.caps.maybeNerdFont).toBe(true)
  })

  test("Kitty (TERM=xterm-kitty) populates kitty + modern caps", () => {
    const profile = detectTerminalProfileFromEnv({ TERM: "xterm-kitty" }, tty)
    expect(profile.emulator.TERM).toBe("xterm-kitty")
    expect(profile.caps.colorLevel).toBe("truecolor")
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.kittyGraphics).toBe(true)
    expect(profile.caps.osc52).toBe(true)
    expect(profile.caps.hyperlinks).toBe(true)
    expect(profile.caps.notifications).toBe(true)
  })

  test("WezTerm (TERM_PROGRAM=WezTerm) populates kitty + modern caps", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "WezTerm" }, tty)
    expect(profile.emulator.program).toBe("WezTerm")
    expect(profile.caps.colorLevel).toBe("truecolor")
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.sixel).toBe(true)
    expect(profile.caps.osc52).toBe(true)
    expect(profile.caps.hyperlinks).toBe(true)
  })

  test("foot (TERM=foot) populates kitty + modern caps", () => {
    const profile = detectTerminalProfileFromEnv({ TERM: "foot" }, tty)
    expect(profile.caps.kittyKeyboard).toBe(true)
    expect(profile.caps.sixel).toBe(true)
    expect(profile.caps.osc52).toBe(true)
    expect(profile.caps.hyperlinks).toBe(true)
  })

  test("iTerm.app (TERM_PROGRAM=iTerm.app) populates iTerm caps", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "iTerm.app" }, tty)
    expect(profile.emulator.program).toBe("iTerm.app")
    expect(profile.caps.colorLevel).toBe("truecolor")
    expect(profile.caps.osc52).toBe(true)
    expect(profile.caps.hyperlinks).toBe(true)
    expect(profile.caps.notifications).toBe(true)
    // iTerm is not Kitty-keyboard by default — that matrix cell must stay false.
    expect(profile.caps.kittyKeyboard).toBe(false)
  })

  test("Apple_Terminal reports 256 color + text-narrow emoji + no modern caps", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "Apple_Terminal" }, tty)
    expect(profile.emulator.program).toBe("Apple_Terminal")
    expect(profile.caps.colorLevel).toBe("256")
    expect(profile.caps.kittyKeyboard).toBe(false)
    expect(profile.caps.kittyGraphics).toBe(false)
    expect(profile.caps.osc52).toBe(false)
    expect(profile.caps.hyperlinks).toBe(false)
    expect(profile.caps.underlineStyles.length).toBe(0)
    expect(profile.caps.underlineColor).toBe(false)
    // Apple Terminal renders text-emoji at 1-cell width — required for correct
    // grapheme measurement in the pipeline.
    expect(profile.caps.maybeWideEmojis).toBe(false)
  })

  test("Alacritty (TERM_PROGRAM=Alacritty) reports osc52 + hyperlinks without kitty", () => {
    const profile = detectTerminalProfileFromEnv({ TERM_PROGRAM: "Alacritty" }, tty)
    expect(profile.emulator.program).toBe("Alacritty")
    expect(profile.caps.osc52).toBe(true)
    expect(profile.caps.hyperlinks).toBe(true)
    expect(profile.caps.underlineStyles.length).toBeGreaterThan(0)
    expect(profile.caps.underlineColor).toBe(true)
    // Alacritty doesn't implement Kitty keyboard protocol.
    expect(profile.caps.kittyKeyboard).toBe(false)
  })

  test("unknown TERM (e.g. plain xterm) falls back to ansi16 without modern caps", () => {
    const profile = detectTerminalProfileFromEnv({ TERM: "xterm" }, tty)
    expect(profile.caps.colorLevel).toBe("ansi16")
    expect(profile.caps.kittyKeyboard).toBe(false)
    expect(profile.caps.kittyGraphics).toBe(false)
    expect(profile.caps.osc52).toBe(false)
    expect(profile.caps.hyperlinks).toBe(false)
  })
})

// ============================================================================
// Contract: RunOptions / profile precedence at the factory level.
//
// Documents the precedence contract for the `profile?` field relative to
// `caps`/`colorLevel` at the factory. The factory does not expose the
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
        colorLevel: "mono",
        caps: { colorLevel: "truecolor" },
      }).caps.colorProvenance,
    ).toBe("env")

    // Override wins over caller-caps
    expect(
      createTerminalProfile({
        env: {},
        stdout: nonTty,
        colorLevel: "mono",
        caps: { colorLevel: "truecolor" },
      }).caps.colorProvenance,
    ).toBe("override")

    // Caller-caps wins over auto
    expect(
      createTerminalProfile({
        env: {},
        stdout: nonTty,
        caps: { colorLevel: "256" },
      }).caps.colorProvenance,
    ).toBe("caller-caps")

    // Nothing supplied → auto (from env-based detection)
    expect(
      createTerminalProfile({
        env: { TERM: "xterm-ghostty" },
        stdout: tty,
      }).caps.colorProvenance,
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
    expect(profile.colorLevel).toBe("truecolor")
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.caps.colorForced).toBe(true)
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
    expect(profile.colorLevel).toBe("mono")
    expect(profile.caps.colorProvenance).toBe("env")
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
    expect(profile.colorLevel).toBe("ansi16")
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.theme).toBeDefined()
  })

  test("contract: precedence chain matches createTerminalProfile (env > override > caps > auto)", async () => {
    // Async variant must honor the same precedence — env wins over override
    // wins over caller-caps. Pinning the chain here ensures the async wrapper
    // can't drift apart from the sync source of truth.
    const profile = await probeTerminalProfile({
      env: { FORCE_COLOR: "0" }, // mono — env wins
      stdout: tty,
      colorLevel: "truecolor",
      caps: { colorLevel: "truecolor" },
      probeTheme: false, // isolate the precedence assertion from theme probing
    })
    expect(profile.colorLevel).toBe("mono")
    expect(profile.caps.colorProvenance).toBe("env")
    expect(profile.caps.colorForced).toBe(true)
  })
})

// ============================================================================
// Immutability invariants — km-silvery.profile-immutable (/pro review)
// ============================================================================
//
// TerminalProfile is a snapshot value. The whole plateau leans on the
// invariants below never drifting; without type-level readonly + dev freeze,
// any caller could silently rewrite `profile.colorLevel` and break the
// "one detection, one source of truth" contract.
//
// These tests are intentionally defensive — the type system already rejects
// direct writes, but test builds run with NODE_ENV=undefined (dev mode) so
// the Object.freeze path is always exercised here.

describe("createTerminalProfile — immutability invariants", () => {
  test("invariant: profile.colorLevel === profile.caps.colorLevel across all rungs", () => {
    const cases = [
      createTerminalProfile({ env: { NO_COLOR: "1" }, stdout: tty }),
      createTerminalProfile({ env: { FORCE_COLOR: "3" }, stdout: nonTty }),
      createTerminalProfile({ env: {}, stdout: tty, colorLevel: "256" }),
      createTerminalProfile({ env: {}, stdout: nonTty, caps: { colorLevel: "truecolor" } }),
      createTerminalProfile({ env: { TERM: "xterm-ghostty" }, stdout: tty }),
    ]
    for (const profile of cases) {
      expect(profile.colorLevel).toBe(profile.caps.colorLevel)
    }
  })

  test("invariant: profile is frozen in dev (mutation throws)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: tty, colorLevel: "256" })
    expect(Object.isFrozen(profile)).toBe(true)
    // Mutating any top-level field throws in strict mode — TS strict modules
    // run implicit strict, so the assignment below is a TypeError at runtime.
    expect(() => {
      ;(profile as unknown as { colorLevel: string }).colorLevel = "mono"
    }).toThrow(TypeError)
  })

  test("invariant: profile.caps is frozen in dev (nested mutation throws)", () => {
    const profile = createTerminalProfile({ env: {}, stdout: tty, colorLevel: "256" })
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
      ;(profile as unknown as { colorLevel: string }).colorLevel = "mono"
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
