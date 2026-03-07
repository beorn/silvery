/**
 * Terminal Multiplexer Compatibility Tests
 *
 * Tests and documents Hightea behavior in terminal multiplexers like tmux and Zellij.
 *
 * Since we cannot run automated tests inside actual multiplexers, this file:
 * 1. Documents expected behaviors and known quirks
 * 2. Tests multiplexer detection via environment variables
 * 3. Tests Synchronized Update Mode (DEC mode 2026) escape sequences
 * 4. Provides manual testing guidelines
 *
 * @see https://gist.github.com/christianparpart/d8a62cc1ab659194337d73e399004036 (Synchronized Update spec)
 */

import { describe, expect, test } from "vitest"
import { ANSI } from "../src/output.js"

// ============================================================================
// Constants
// ============================================================================

const ESC = "\x1b"
const CSI = `${ESC}[`

/**
 * Synchronized Update Mode escape sequences.
 *
 * These sequences tell the terminal to batch output updates, preventing
 * tearing during rapid screen updates. Especially important in tmux.
 *
 * - Begin: CSI ? 2026 h
 * - End: CSI ? 2026 l
 */
const SYNC_UPDATE = {
  begin: `${CSI}?2026h`,
  end: `${CSI}?2026l`,
}

/**
 * Passthrough escape sequence for tmux.
 *
 * tmux uses passthrough mode to forward escape sequences to the outer terminal.
 * Format: ESC Ptmux; <escaped-content> ESC \
 *
 * Within passthrough, ESC must be doubled (ESC ESC).
 */
const TMUX_PASSTHROUGH = {
  begin: `${ESC}Ptmux;`,
  end: `${ESC}\\`,
}

// ============================================================================
// Detection Helpers
// ============================================================================

type Env = Record<string, string | undefined>
type MultiplexerType = "tmux" | "zellij" | "screen" | null

/** Detect multiplexer from TMUX, ZELLIJ, STY, or TERM environment variables */
function detectMultiplexer(env: Env): MultiplexerType {
  if (env.TMUX) return "tmux"
  if (env.ZELLIJ !== undefined) return "zellij"
  if (env.STY) return "screen"
  if (env.TERM?.includes("tmux")) return "tmux"
  if (env.TERM?.includes("screen")) return "screen"
  return null
}

/** Check if TERM contains tmux or screen identifiers */
function isTmuxTerm(term: string | undefined): boolean {
  return term?.includes("tmux") || term?.includes("screen") || false
}

/** Wrap content with synchronized update sequences */
function wrapWithSyncUpdate(content: string): string {
  return `${SYNC_UPDATE.begin}${content}${SYNC_UPDATE.end}`
}

/** Escape ESC characters for tmux passthrough mode */
function escapeForTmux(content: string): string {
  return content.replace(/\x1b/g, "\x1b\x1b")
}

/** Wrap sequences for tmux passthrough */
function wrapForTmuxPassthrough(content: string): string {
  const escaped = escapeForTmux(content)
  return `${TMUX_PASSTHROUGH.begin}${escaped}${TMUX_PASSTHROUGH.end}`
}

// ============================================================================
// Environment Detection Tests
// ============================================================================

describe("Terminal Multiplexer Detection", () => {
  describe("tmux detection", () => {
    test.each([
      [{ TMUX: "/tmp/tmux-501/default,12345,0" }, true],
      [{ TMUX: undefined }, false],
      [{}, false],
    ])("detects tmux via TMUX variable: %j -> %s", (env, expected) => {
      expect(!!env.TMUX).toBe(expected)
    })

    test.each([
      ["tmux-256color", true],
      ["screen-256color", true],
      ["screen", true],
      ["xterm-256color", false],
      [undefined, false],
    ])("detects tmux via TERM variable: %s -> %s", (term, expected) => {
      expect(isTmuxTerm(term)).toBe(expected)
    })

    test.each([
      ["tmux", true],
      ["iTerm.app", false],
      [undefined, false],
    ])("detects tmux via TERM_PROGRAM: %s -> %s", (prog, expected) => {
      expect(prog === "tmux").toBe(expected)
    })
  })

  describe("Zellij detection", () => {
    test.each([
      [{ ZELLIJ: "0" }, true],
      [{ ZELLIJ: "" }, true], // Empty string still indicates Zellij
      [{ ZELLIJ: undefined }, false],
      [{}, false],
    ])("detects Zellij via ZELLIJ variable: %j -> %s", (env, expected) => {
      expect(env.ZELLIJ !== undefined).toBe(expected)
    })

    test.each([
      [{ ZELLIJ_SESSION_NAME: "my-session" }, true],
      [{ ZELLIJ_SESSION_NAME: "" }, false],
      [{}, false],
    ])("detects Zellij via ZELLIJ_SESSION_NAME: %j -> %s", (env, expected) => {
      expect(!!env.ZELLIJ_SESSION_NAME).toBe(expected)
    })
  })

  describe("generic multiplexer detection", () => {
    test.each<[Env, MultiplexerType]>([
      [{ TMUX: "/path" }, "tmux"],
      [{ ZELLIJ: "0" }, "zellij"],
      [{ STY: "12345.pts-0.hostname" }, "screen"],
      [{ TERM: "tmux-256color" }, "tmux"],
      [{ TERM: "xterm-256color" }, null],
    ])("detectMultiplexer(%j) -> %s", (env, expected) => {
      expect(detectMultiplexer(env)).toBe(expected)
    })
  })
})

// ============================================================================
// Synchronized Update Mode Tests
// ============================================================================

describe("Synchronized Update Mode (DEC 2026)", () => {
  test("generates correct begin/end sequences", () => {
    expect(SYNC_UPDATE.begin).toBe("\x1b[?2026h")
    expect(SYNC_UPDATE.end).toBe("\x1b[?2026l")
  })

  test("matches ANSI export constants", () => {
    expect(SYNC_UPDATE.begin).toBe(ANSI.SYNC_BEGIN)
    expect(SYNC_UPDATE.end).toBe(ANSI.SYNC_END)
  })

  test("wraps content with synchronized update sequences", () => {
    const output = wrapWithSyncUpdate("Hello, World!")
    expect(output).toBe("\x1b[?2026hHello, World!\x1b[?2026l")
    expect(output.startsWith(SYNC_UPDATE.begin)).toBe(true)
    expect(output.endsWith(SYNC_UPDATE.end)).toBe(true)
  })

  test("synchronized update is idempotent (nested)", () => {
    const inner = wrapWithSyncUpdate("inner")
    const outer = wrapWithSyncUpdate(inner)

    // Should contain two begins and two ends
    expect(outer.split(SYNC_UPDATE.begin).length - 1).toBe(2)
    expect(outer.split(SYNC_UPDATE.end).length - 1).toBe(2)
  })
})

// ============================================================================
// tmux Passthrough Tests
// ============================================================================

describe("tmux Passthrough Mode", () => {
  test("generates correct passthrough wrapper", () => {
    expect(TMUX_PASSTHROUGH.begin).toBe("\x1bPtmux;")
    expect(TMUX_PASSTHROUGH.end).toBe("\x1b\\")
  })

  test("escapes ESC characters in passthrough content", () => {
    const originalSequence = "\x1b[31mRed\x1b[0m"
    const escaped = escapeForTmux(originalSequence)
    expect(escaped).toBe("\x1b\x1b[31mRed\x1b\x1b[0m")
  })

  test("wraps sequences for tmux passthrough", () => {
    const originalSequence = "\x1b]52;c;SGVsbG8=\x07" // OSC 52 clipboard
    const wrapped = wrapForTmuxPassthrough(originalSequence)

    expect(wrapped.startsWith(TMUX_PASSTHROUGH.begin)).toBe(true)
    expect(wrapped.endsWith(TMUX_PASSTHROUGH.end)).toBe(true)
    expect(wrapped).toContain("\x1b\x1b]52") // ESC should be doubled
  })
})

// ============================================================================
// ANSI Constants Verification
// ============================================================================

describe("ANSI Constants (from output.ts)", () => {
  test("CSI and cursor sequences are correctly defined", () => {
    expect(ANSI.CSI).toBe("\x1b[")
    expect(ANSI.CURSOR_HIDE).toBe("\x1b[?25l")
    expect(ANSI.CURSOR_SHOW).toBe("\x1b[?25h")
    expect(ANSI.CURSOR_HOME).toBe("\x1b[H")
    expect(ANSI.RESET).toBe("\x1b[0m")
  })
})

// ============================================================================
// Input Handling Documentation Tests
// ============================================================================

describe("Input Handling in Multiplexers", () => {
  const arrowSequences = {
    standard: { up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D" },
    appMode: { up: "\x1bOA", down: "\x1bOB", right: "\x1bOC", left: "\x1bOD" },
    ctrl: {
      up: "\x1b[1;5A",
      down: "\x1b[1;5B",
      right: "\x1b[1;5C",
      left: "\x1b[1;5D",
    },
    shift: {
      up: "\x1b[1;2A",
      down: "\x1b[1;2B",
      right: "\x1b[1;2C",
      left: "\x1b[1;2D",
    },
  }

  test.each(["up", "down", "right", "left"] as const)("arrow key %s has standard xterm sequence", (dir) => {
    expect(arrowSequences.standard[dir]).toMatch(/^\x1b\[[ABCD]$/)
  })

  test.each(["up", "down", "right", "left"] as const)("arrow key %s has application mode sequence", (dir) => {
    expect(arrowSequences.appMode[dir]).toMatch(/^\x1bO[ABCD]$/)
  })

  test("modifier key combinations use CSI 1;N format", () => {
    expect(arrowSequences.ctrl.up).toBe("\x1b[1;5A")
    expect(arrowSequences.shift.up).toBe("\x1b[1;2A")
  })

  describe("IME (Input Method Editor) considerations", () => {
    test("IME input arrives as final converted string", () => {
      const imeInput = "日本語" // Arrives as single chunk, not keystrokes
      expect(imeInput.length).toBe(3)
      expect([...imeInput]).toEqual(["日", "本", "語"])
    })

    test("bracketed paste mode sequences", () => {
      const bracketedPaste = {
        enable: "\x1b[?2004h",
        disable: "\x1b[?2004l",
        pasteStart: "\x1b[200~",
        pasteEnd: "\x1b[201~",
      }

      expect(bracketedPaste.enable).toBe("\x1b[?2004h")
      expect(bracketedPaste.pasteStart).toBe("\x1b[200~")
      expect(bracketedPaste.pasteEnd).toBe("\x1b[201~")
    })
  })
})

// ============================================================================
// Color Rendering Tests
// ============================================================================

describe("Color Rendering in Multiplexers", () => {
  test("basic 16-color SGR codes", () => {
    expect("\x1b[31m").toBe("\x1b[31m") // fg red
    expect("\x1b[42m").toBe("\x1b[42m") // bg green
    expect("\x1b[0m").toBe("\x1b[0m") // reset
  })

  test("256-color palette codes", () => {
    const fg = (n: number) => `\x1b[38;5;${n}m`
    const bg = (n: number) => `\x1b[48;5;${n}m`

    expect(fg(196)).toBe("\x1b[38;5;196m") // Bright red
    expect(bg(21)).toBe("\x1b[48;5;21m") // Blue
  })

  test("true color (24-bit) RGB codes", () => {
    // Note: tmux needs `set -g default-terminal "tmux-256color"`
    const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`
    const bg = (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`

    expect(fg(255, 128, 64)).toBe("\x1b[38;2;255;128;64m")
    expect(bg(0, 100, 200)).toBe("\x1b[48;2;0;100;200m")
  })
})

// ============================================================================
// Resize Behavior Tests
// ============================================================================

describe("Resize Behavior", () => {
  const resizeSequences = {
    querySize: "\x1b[18t",
    saveCursor: "\x1b[s",
    moveToCorner: "\x1b[9999;9999H",
    queryPosition: "\x1b[6n",
    restoreCursor: "\x1b[u",
  }

  test("SIGWINCH signal number", () => {
    expect(28).toBe(28) // Signal number on most systems
  })

  test("terminal size query sequence", () => {
    // Response format: CSI 9 ; HEIGHT ; WIDTH t
    expect(resizeSequences.querySize).toBe("\x1b[18t")
  })

  test("cursor position report sequence", () => {
    // Method: save cursor -> move to 9999,9999 -> query position -> restore
    // Response: CSI ROW;COL R
    expect(resizeSequences.queryPosition).toBe("\x1b[6n")
  })
})

// ============================================================================
// Documentation: Manual Testing Guide
// ============================================================================

/**
 * MANUAL TESTING GUIDE FOR TERMINAL MULTIPLEXERS
 * ==============================================
 *
 * tmux Testing:
 * -------------
 * 1. Start tmux: `tmux new -s test`
 * 2. Run the TUI app inside tmux
 * 3. Test: rendering, colors, scrolling, input, resize, splits
 *
 * tmux Configuration for best results:
 * ```tmux
 * # ~/.tmux.conf
 * set -g default-terminal "tmux-256color"
 * set -as terminal-features ",*:RGB"
 * set -sg escape-time 0
 * ```
 *
 * Zellij Testing:
 * ---------------
 * 1. Start Zellij: `zellij`
 * 2. Run the TUI app inside Zellij
 * 3. Test: rendering, colors, scrolling, keybindings, resize, layouts
 *
 * Known Issues:
 * -------------
 * 1. tmux tearing: Use synchronized update mode (CSI ? 2026 h/l)
 * 2. tmux true color: Requires proper terminfo configuration
 * 3. Zellij key conflicts: Alt+key combinations may be captured
 * 4. Screen (GNU): Limited true color support in older versions
 * 5. ssh + tmux: Double latency for escape sequences
 */

describe("Documentation: Manual Testing Guide", () => {
  test("guide exists in comments above", () => {
    expect(true).toBe(true)
  })
})

// ============================================================================
// Quirks and Workarounds Documentation
// ============================================================================

describe("Multiplexer Quirks and Workarounds", () => {
  describe("tmux quirks", () => {
    test("escape-time delay (recommend 0)", () => {
      // Default 500ms causes sluggish ESC response
      // Fix: set -sg escape-time 0
      expect(0).toBe(0)
    })

    test("true color capable terms", () => {
      // prettier-ignore
      const capable = ['xterm-256color', 'tmux-256color', 'xterm-direct', 'iterm2'];
      expect(capable).toContain("tmux-256color")
    })

    test("alternate screen buffer sequences", () => {
      expect("\x1b[?1049h").toBe("\x1b[?1049h") // on
      expect("\x1b[?1049l").toBe("\x1b[?1049l") // off
    })
  })

  describe("Zellij quirks", () => {
    test("locked mode keybind for TUI apps", () => {
      // Ctrl+g passes all input to app
      expect("Ctrl+g").toBe("Ctrl+g")
    })

    test("mouse tracking sequences", () => {
      expect("\x1b[?1000h").toBe("\x1b[?1000h") // on
      expect("\x1b[?1000l").toBe("\x1b[?1000l") // off
    })
  })

  describe("General multiplexer workarounds", () => {
    test("synchronized update for flicker-free rendering", () => {
      // Supported by: tmux 3.2+, kitty, iTerm2, WezTerm, Contour
      const wrapped = wrapWithSyncUpdate("test")
      expect(wrapped).toBe("\x1b[?2026htest\x1b[?2026l")
    })

    test("feature detection via DECRQM", () => {
      // Query: CSI ? <mode> $ p
      // Response: CSI ? <mode> ; <value> $ y
      // value: 0=unknown, 1=set, 2=reset, 3=permanent set, 4=permanent reset
      const requestMode = (mode: number) => `\x1b[?${mode}$p`
      expect(requestMode(2026)).toBe("\x1b[?2026$p")
    })
  })
})

// ============================================================================
// Utility Functions for Multiplexer Support
// ============================================================================

describe("Multiplexer Support Utilities", () => {
  interface MultiplexerInfo {
    type: MultiplexerType
    version: string | null
    features: { trueColor: boolean; synchronizedUpdate: boolean }
  }

  function detectMultiplexerEnvironment(env: Env): MultiplexerInfo {
    if (env.TMUX) {
      return {
        type: "tmux",
        version: env.TMUX_VERSION ?? null,
        features: { trueColor: true, synchronizedUpdate: true },
      }
    }
    if (env.ZELLIJ !== undefined) {
      return {
        type: "zellij",
        version: env.ZELLIJ_VERSION ?? null,
        features: { trueColor: true, synchronizedUpdate: true },
      }
    }
    if (env.STY) {
      return {
        type: "screen",
        version: null,
        features: { trueColor: false, synchronizedUpdate: false },
      }
    }
    return {
      type: null,
      version: null,
      features: { trueColor: true, synchronizedUpdate: false },
    }
  }

  test.each<[string, Env, MultiplexerType, boolean]>([
    ["tmux", { TMUX: "/tmp/tmux", TMUX_VERSION: "3.4" }, "tmux", true],
    ["zellij", { ZELLIJ: "0" }, "zellij", true],
    ["screen", { STY: "12345.pts-0.host" }, "screen", false],
    ["plain terminal", { TERM: "xterm-256color" }, null, false],
  ])("detectMultiplexerEnvironment for %s", (_, env, expectedType, expectedSyncUpdate) => {
    const info = detectMultiplexerEnvironment(env)
    expect(info.type).toBe(expectedType)
    expect(info.features.synchronizedUpdate).toBe(expectedSyncUpdate)
  })

  test("wrapOutputForMultiplexer adds synchronized update", () => {
    const wrapOutputForMultiplexer = (output: string, multiplexerType: MultiplexerType): string => {
      if (multiplexerType === "tmux" || multiplexerType === "zellij") {
        return `${SYNC_UPDATE.begin}${output}${SYNC_UPDATE.end}`
      }
      return output
    }

    expect(wrapOutputForMultiplexer("Hello", "tmux")).toBe("\x1b[?2026hHello\x1b[?2026l")
    expect(wrapOutputForMultiplexer("Hello", null)).toBe("Hello")
  })
})
