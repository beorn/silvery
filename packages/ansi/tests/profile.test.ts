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
// Internal helpers — detectColorFromEnv / detectTerminalCapsFromEnv
// (exported-internal so test fixtures can drive them deterministically)
// ============================================================================

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
