/**
 * Capability matrix tests: OSC 66 supported / unsupported / parse-but-swallow profiles.
 *
 * The OSC 66 emoji loss bug wasn't caught because all tests ran with either a
 * supportive backend (xterm.js) or a self-referential oracle (replayAnsiWithStyles).
 * No test verified that content survives when OSC 66 is unsupported.
 *
 * These tests verify rendering under three terminal capability profiles:
 *
 * 1. OSC 66 supported (Kitty 0.40+): Wide chars wrapped in OSC 66
 * 2. OSC 66 unsupported (most terminals): No OSC 66 wrapping, content preserved
 * 3. OSC 66 parse-but-swallow (Ghostty): Stripping OSC 66 proves content is lost
 */
import { describe, test, expect } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { createOutputPhase, outputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { createWidthMeasurer } from "@silvery/ag-term/unicode"

const COLS = 80
const ROWS = 5

// OSC 66 pattern: ESC ] 66 ; w=2 ; <content> BEL
const OSC66_REGEX = /\x1b\]66;w=2;(.+?)\x07/g

// Strip all OSC 66 sequences (simulates parse-but-swallow terminal like Ghostty)
const STRIP_OSC66_REGEX = /\x1b\]66;[^]*?\x07/g

/** Wide character test specimens */
const WIDE_CHARS: Array<{ name: string; char: string; description: string }> = [
  // Emoji
  { name: "emoji-party", char: "🎉", description: "Party popper emoji" },
  { name: "emoji-star", char: "⭐", description: "Star emoji" },

  // Flag emoji (regional indicator sequences)
  { name: "flag-CA", char: "🇨🇦", description: "Canadian flag" },
  { name: "flag-JP", char: "🇯🇵", description: "Japan flag" },

  // CJK characters
  { name: "cjk-kanji", char: "漢", description: "CJK Unified Ideograph" },
  { name: "cjk-ji", char: "字", description: "CJK character 'ji'" },

  // Fullwidth
  { name: "fullwidth-A", char: "Ａ", description: "Fullwidth Latin A" },
]

/** PUA / nerdfont icons (only width-2 when textSizingEnabled) */
const PUA_CHARS: Array<{ name: string; char: string; description: string }> = [
  { name: "pua-nerd", char: "\uE0B0", description: "Powerline separator (PUA)" },
  { name: "pua-icon", char: "\uF013", description: "Nerdfont gear icon (PUA)" },
]

/** Check if a grapheme is wide (width 2) using Unicode ranges */
function isWideChar(char: string): boolean {
  if (/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(char)) return true
  if (
    /[\u{2E80}-\u{9FFF}\u{AC00}-\u{D7AF}\u{F900}-\u{FAFF}\u{FE10}-\u{FE6F}\u{FF01}-\u{FF60}\u{FFE0}-\u{FFE6}\u{1F300}-\u{1F9FF}\u{20000}-\u{2FA1F}\u{2B50}]/u.test(
      char,
    )
  )
    return true
  return false
}

/** Check if a code point is in the Private Use Area */
function isPUA(char: string): boolean {
  const cp = char.codePointAt(0)
  if (cp === undefined) return false
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  )
}

/** Write a string into a buffer, handling wide chars */
function writeString(
  buf: TerminalBuffer,
  startX: number,
  y: number,
  text: string,
  treatPuaAsWide = false,
): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  let x = startX
  for (const { segment: char } of segmenter.segment(text)) {
    const wide = isWideChar(char) || (treatPuaAsWide && isPUA(char))
    buf.setCell(x, y, { char, wide, fg: null })
    if (wide) {
      buf.setCell(x + 1, y, { char: "", continuation: true, fg: null })
      x += 2
    } else {
      x += 1
    }
  }
  return x
}

/** Create output phase with text sizing ENABLED (Kitty-like) */
function createOsc66EnabledOutputPhase() {
  const measurer = createWidthMeasurer({ textSizingEnabled: true, textEmojiWide: true })
  return createOutputPhase(
    { underlineStyles: true, underlineColor: true, colorTier: "truecolor" },
    measurer,
  )
}

/** Create output phase with text sizing DISABLED (most terminals) */
function createOsc66DisabledOutputPhase() {
  const measurer = createWidthMeasurer({ textSizingEnabled: false, textEmojiWide: true })
  return createOutputPhase(
    { underlineStyles: true, underlineColor: true, colorTier: "truecolor" },
    measurer,
  )
}

/** Collect all visible text from xterm.js terminal row */
function getRowText(term: ReturnType<typeof createTerminal>, row: number, maxCol: number): string {
  let text = ""
  for (let x = 0; x < maxCol; x++) {
    const cell = term.getCell(row, x)
    if (cell && cell.char && cell.char !== " ") {
      text += cell.char
    }
  }
  return text
}

// ============================================================================
// Profile 1: OSC 66 Supported (Kitty-like)
// ============================================================================

describe("capability profile: OSC 66 supported (Kitty-like)", () => {
  const render = createOsc66EnabledOutputPhase()

  test.each(WIDE_CHARS)("$name ($description): OSC 66 present in ANSI output", ({ char }) => {
    const buf = new TerminalBuffer(COLS, ROWS)
    writeString(buf, 0, 0, `A${char}B`)

    const ansi = render(null, buf, "fullscreen")
    const matches = [...ansi.matchAll(OSC66_REGEX)]
    const wrappedChars = matches.map((m) => m[1])

    expect(wrappedChars).toContain(char)
  })

  test.each(PUA_CHARS)(
    "$name ($description): PUA wrapped in OSC 66 when textSizingEnabled",
    ({ char }) => {
      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, `A${char}B`, true)

      const ansi = render(null, buf, "fullscreen")
      const matches = [...ansi.matchAll(OSC66_REGEX)]
      const wrappedChars = matches.map((m) => m[1])

      expect(wrappedChars).toContain(char)
    },
  )

  test("content is fully preserved through xterm.js", () => {
    const buf = new TerminalBuffer(COLS, ROWS)
    writeString(buf, 0, 0, "A🎉B🇨🇦C漢D")

    const ansi = render(null, buf, "fullscreen")
    const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    term.feed(ansi)

    expect(term.getCell(0, 0)?.char).toBe("A")
    // After each wide char (2 cols), next ASCII char is at +2
    expect(term.getCell(0, 3)?.char).toBe("B")
    expect(term.getCell(0, 6)?.char).toBe("C")
    expect(term.getCell(0, 9)?.char).toBe("D")

    term.close()
  })
})

// ============================================================================
// Profile 2: OSC 66 Unsupported (most terminals)
// ============================================================================

describe("capability profile: OSC 66 unsupported (most terminals)", () => {
  const render = createOsc66DisabledOutputPhase()

  describe("critical invariant: NO OSC 66 sequences in output", () => {
    test.each(WIDE_CHARS)("$name ($description): ANSI output contains NO OSC 66", ({ char }) => {
      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, `A${char}B`)

      const ansi = render(null, buf, "fullscreen")
      const matches = [...ansi.matchAll(OSC66_REGEX)]

      expect(matches).toHaveLength(0)
    })

    test.each(PUA_CHARS)(
      "$name ($description): PUA NOT wrapped in OSC 66 when textSizingEnabled=false",
      ({ char }) => {
        const buf = new TerminalBuffer(COLS, ROWS)
        // PUA treated as narrow (width 1) when textSizing is disabled
        writeString(buf, 0, 0, `A${char}B`, false)

        const ansi = render(null, buf, "fullscreen")
        const matches = [...ansi.matchAll(OSC66_REGEX)]

        expect(matches).toHaveLength(0)
      },
    )

    test("mixed content with emoji, CJK, PUA: zero OSC 66 sequences", () => {
      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, "A🎉B🇨🇦C漢D")

      const ansi = render(null, buf, "fullscreen")
      const matches = [...ansi.matchAll(OSC66_REGEX)]

      expect(matches).toHaveLength(0)
    })
  })

  describe("content preservation without OSC 66", () => {
    test.each(WIDE_CHARS)(
      "$name ($description): character visible in xterm.js without OSC 66",
      ({ char }) => {
        const buf = new TerminalBuffer(COLS, ROWS)
        writeString(buf, 0, 0, `A${char}B`)

        const ansi = render(null, buf, "fullscreen")
        const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        term.feed(ansi)

        // ASCII chars must be at correct positions
        expect(term.getCell(0, 0)?.char).toBe("A")
        expect(term.getCell(0, 3)?.char).toBe("B")

        // The wide character itself must appear in the row
        const rowText = getRowText(term, 0, 20)
        expect(rowText).toContain(char)

        term.close()
      },
    )

    test("all characters preserved: emoji + flags + CJK mixed", () => {
      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, "🎉🇨🇦漢字Ａ")

      const ansi = render(null, buf, "fullscreen")
      const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
      term.feed(ansi)

      const rowText = getRowText(term, 0, 20)
      expect(rowText).toContain("🎉")
      expect(rowText).toContain("🇨🇦")
      expect(rowText).toContain("漢")
      expect(rowText).toContain("字")
      expect(rowText).toContain("Ａ")

      term.close()
    })
  })
})

// ============================================================================
// Profile 3: OSC 66 Parse-but-Swallow (Ghostty simulation)
// ============================================================================

describe("capability profile: OSC 66 parse-but-swallow (Ghostty simulation)", () => {
  test("stripping OSC 66 from enabled-profile output causes content loss", () => {
    // This is the "ghost content" test: proves that if we incorrectly enable
    // OSC 66 for a terminal that swallows it, content disappears.
    const renderEnabled = createOsc66EnabledOutputPhase()
    const buf = new TerminalBuffer(COLS, ROWS)
    writeString(buf, 0, 0, "A🎉B🇨🇦C漢D")

    const ansiWithOsc66 = renderEnabled(null, buf, "fullscreen")

    // Verify OSC 66 IS present before stripping
    expect([...ansiWithOsc66.matchAll(OSC66_REGEX)].length).toBeGreaterThan(0)

    // Strip OSC 66 (simulates Ghostty swallowing them)
    const stripped = ansiWithOsc66.replace(STRIP_OSC66_REGEX, "")

    // Feed stripped output to xterm.js
    const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    term.feed(stripped)

    // Content that was inside OSC 66 wrappers is now MISSING
    const rowText = getRowText(term, 0, 40)

    // At least one wide character should be missing after stripping
    const hasParty = rowText.includes("🎉")
    const hasFlag = rowText.includes("🇨🇦")
    const hasKanji = rowText.includes("漢")
    const someMissing = !hasParty || !hasFlag || !hasKanji

    expect(someMissing).toBe(true)
  })

  test("disabled-profile output survives stripping (no OSC 66 to strip)", () => {
    // Counter-test: when OSC 66 is disabled, stripping has no effect
    const renderDisabled = createOsc66DisabledOutputPhase()
    const buf = new TerminalBuffer(COLS, ROWS)
    writeString(buf, 0, 0, "A🎉B🇨🇦C漢D")

    const ansiNoOsc66 = renderDisabled(null, buf, "fullscreen")

    // Verify NO OSC 66 sequences exist
    expect([...ansiNoOsc66.matchAll(OSC66_REGEX)]).toHaveLength(0)

    // Stripping is a no-op
    const stripped = ansiNoOsc66.replace(STRIP_OSC66_REGEX, "")
    expect(stripped).toBe(ansiNoOsc66)

    // Content is preserved in xterm.js
    const term = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    term.feed(stripped)

    const rowText = getRowText(term, 0, 40)
    expect(rowText).toContain("🎉")
    expect(rowText).toContain("🇨🇦")
    expect(rowText).toContain("漢")

    term.close()
  })
})

// ============================================================================
// Incremental Render Consistency Across Profiles
// ============================================================================

describe("incremental render consistency across profiles", () => {
  describe("OSC 66 enabled: incremental matches fresh through xterm.js", () => {
    test.each(WIDE_CHARS)(
      "$name ($description): incremental render matches fresh render",
      ({ char }) => {
        const render1 = createOsc66EnabledOutputPhase()
        const render2 = createOsc66EnabledOutputPhase()

        // Fresh render of initial state
        const prev = new TerminalBuffer(COLS, ROWS)
        writeString(prev, 0, 0, `A${char}BXYZ`)

        const initialAnsi = render1(null, prev, "fullscreen")

        // Incremental render after change
        prev.resetDirtyRows()
        const next = prev.clone()
        writeString(next, 4, 0, "QRS")

        const incrAnsi = render1(prev, next, "fullscreen")

        // Fresh render of final state
        const freshAnsi = render2(null, next, "fullscreen")

        // Compare through xterm.js
        const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        termIncr.feed(initialAnsi)
        termIncr.feed(incrAnsi)

        const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        termFresh.feed(freshAnsi)

        for (let x = 0; x < 20; x++) {
          expect(termIncr.getCell(0, x)?.char, `col ${x}`).toBe(termFresh.getCell(0, x)?.char)
        }

        termIncr.close()
        termFresh.close()
      },
    )
  })

  describe("OSC 66 disabled: incremental matches fresh through xterm.js", () => {
    test.each(WIDE_CHARS)(
      "$name ($description): incremental render matches fresh render",
      ({ char }) => {
        const render1 = createOsc66DisabledOutputPhase()
        const render2 = createOsc66DisabledOutputPhase()

        // Fresh render of initial state
        const prev = new TerminalBuffer(COLS, ROWS)
        writeString(prev, 0, 0, `A${char}BXYZ`)

        const initialAnsi = render1(null, prev, "fullscreen")

        // Incremental render after change
        prev.resetDirtyRows()
        const next = prev.clone()
        writeString(next, 4, 0, "QRS")

        const incrAnsi = render1(prev, next, "fullscreen")

        // Fresh render of final state
        const freshAnsi = render2(null, next, "fullscreen")

        // Compare through xterm.js
        const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        termIncr.feed(initialAnsi)
        termIncr.feed(incrAnsi)

        const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
        termFresh.feed(freshAnsi)

        for (let x = 0; x < 20; x++) {
          expect(termIncr.getCell(0, x)?.char, `col ${x}`).toBe(termFresh.getCell(0, x)?.char)
        }

        termIncr.close()
        termFresh.close()
      },
    )
  })
})

// ============================================================================
// Cross-Profile Comparison
// ============================================================================

describe("cross-profile: structural equivalence", () => {
  test.each(WIDE_CHARS)(
    "$name ($description): stripping OSC 66 from enabled output yields disabled output",
    ({ char }) => {
      const renderEnabled = createOsc66EnabledOutputPhase()
      const renderDisabled = createOsc66DisabledOutputPhase()

      const buf = new TerminalBuffer(COLS, ROWS)
      writeString(buf, 0, 0, `A${char}B`)

      const ansiEnabled = renderEnabled(null, buf, "fullscreen")
      const ansiDisabled = renderDisabled(null, buf, "fullscreen")

      // Stripping OSC 66 wrappers from enabled output should yield the
      // disabled output (same characters, same positions, just no wrappers).
      // Replace OSC 66 wrapper with its content: ESC]66;w=2;<content>BEL -> <content>
      const enabledStripped = ansiEnabled.replace(/\x1b\]66;w=2;(.+?)\x07/g, "$1")

      expect(enabledStripped).toBe(ansiDisabled)
    },
  )

  test("disabled profile: ASCII-only content has NO OSC 66", () => {
    const render = createOsc66DisabledOutputPhase()
    const buf = new TerminalBuffer(COLS, ROWS)
    writeString(buf, 0, 0, "Hello World 123")

    const ansi = render(null, buf, "fullscreen")
    expect([...ansi.matchAll(OSC66_REGEX)]).toHaveLength(0)
  })

  test("enabled profile: ASCII-only content has NO OSC 66", () => {
    const render = createOsc66EnabledOutputPhase()
    const buf = new TerminalBuffer(COLS, ROWS)
    writeString(buf, 0, 0, "Hello World 123")

    const ansi = render(null, buf, "fullscreen")
    expect([...ansi.matchAll(OSC66_REGEX)]).toHaveLength(0)
  })
})
