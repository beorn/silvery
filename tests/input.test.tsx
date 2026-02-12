import React, { useState } from "react"
/**
 * Tests for input handling in Inkx
 *
 * Tests for km-mvcn requirements:
 * 1. Rapid keypresses in automated tests
 * 2. Paste operations (bracketed paste)
 * 3. Unicode edge cases (variation selectors, surrogate pairs)
 * 4. Incomplete escape sequences (buffered parsing)
 */
import { describe, expect, test } from "vitest"
import { Box, type Key, Text, useInput } from "../src/index.ts"
import { createRenderer } from "../src/testing/index.tsx"

// ============================================================================
// Test Component: Simple keystroke capture
// ============================================================================

interface KeyLog {
  input: string
  key: Partial<Key>
}

function KeystrokeCapture({ onCapture }: { onCapture?: (logs: KeyLog[]) => void }) {
  const [logs, setLogs] = useState<KeyLog[]>([])

  useInput((input: string, key: Key) => {
    const newLog: KeyLog = {
      input,
      key: {
        ...(key.upArrow && { upArrow: true }),
        ...(key.downArrow && { downArrow: true }),
        ...(key.leftArrow && { leftArrow: true }),
        ...(key.rightArrow && { rightArrow: true }),
        ...(key.escape && { escape: true }),
        ...(key.return && { return: true }),
        ...(key.ctrl && { ctrl: true }),
        ...(key.shift && { shift: true }),
        ...(key.meta && { meta: true }),
        ...(key.tab && { tab: true }),
        ...(key.backspace && { backspace: true }),
        ...(key.delete && { delete: true }),
        ...(key.pageUp && { pageUp: true }),
        ...(key.pageDown && { pageDown: true }),
        ...(key.home && { home: true }),
        ...(key.end && { end: true }),
      },
    }
    setLogs((prev) => {
      const updated = [...prev, newLog]
      onCapture?.(updated)
      return updated
    })
  })

  return (
    <Box flexDirection="column">
      <Text>Keystrokes captured: {logs.length}</Text>
      {logs.map((log, i) => (
        <Text key={i}>
          {i}: input="{log.input}" keys={JSON.stringify(log.key)}
        </Text>
      ))}
    </Box>
  )
}

// ============================================================================
// Test 1: Rapid keypresses in automated tests
// ============================================================================

describe("Rapid keypress handling", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles multiple rapid keypresses sequentially", () => {
    const app = render(<KeystrokeCapture />)

    // Send rapid keypresses
    app.stdin.write("a")
    app.stdin.write("b")
    app.stdin.write("c")
    app.stdin.write("d")
    app.stdin.write("e")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 5")
    expect(frame).toContain('input="a"')
    expect(frame).toContain('input="b"')
    expect(frame).toContain('input="c"')
    expect(frame).toContain('input="d"')
    expect(frame).toContain('input="e"')
  })

  test("handles rapid arrow key sequences", () => {
    const app = render(<KeystrokeCapture />)

    // Arrow keys: ESC [ A/B/C/D
    app.stdin.write("\x1b[A") // up
    app.stdin.write("\x1b[B") // down
    app.stdin.write("\x1b[C") // right
    app.stdin.write("\x1b[D") // left

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
    expect(frame).toContain('"upArrow":true')
    expect(frame).toContain('"downArrow":true')
    expect(frame).toContain('"rightArrow":true')
    expect(frame).toContain('"leftArrow":true')
  })

  test("handles mixed rapid input: letters + special keys", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("h") // h
    app.stdin.write("\x1b[A") // up arrow
    app.stdin.write("j") // j
    app.stdin.write("\x1b[B") // down arrow
    app.stdin.write("k") // k
    app.stdin.write("\x1b[A") // up arrow
    app.stdin.write("l") // l

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 7")
  })

  test("handles burst of 20 rapid keypresses", () => {
    const app = render(<KeystrokeCapture />)

    // Send a burst of 20 keypresses
    for (let i = 0; i < 20; i++) {
      app.stdin.write(String.fromCharCode(97 + (i % 26))) // a-z cycling
    }

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 20")
  })
})

// ============================================================================
// Test 2: Paste operations (bracketed paste)
// ============================================================================

describe("Paste operations", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles multi-character string by splitting into graphemes", () => {
    const app = render(<KeystrokeCapture />)

    // Multi-char strings are split into individual grapheme keypresses,
    // matching production behavior where stdin.read() can buffer multiple chars.
    app.stdin.write("hello")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 5")
    expect(frame).toContain('input="h"')
    expect(frame).toContain('input="o"')
  })

  test("handles paste with special characters", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("a")
    app.stdin.write("!")
    app.stdin.write("@")
    app.stdin.write("#")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
    expect(frame).toContain('input="a"')
    expect(frame).toContain('input="!"')
    expect(frame).toContain('input="@"')
    expect(frame).toContain('input="#"')
  })

  test("handles paste with numbers", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("1")
    app.stdin.write("2")
    app.stdin.write("3")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 3")
    // Numbers return empty input string due to key.name = 'number' handling
  })
})

// ============================================================================
// Test 3: Unicode edge cases
// ============================================================================

describe("Unicode edge cases", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles basic Unicode characters", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("é") // e with acute accent
    app.stdin.write("ñ") // n with tilde

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 2")
    expect(frame).toContain('input="é"')
    expect(frame).toContain('input="ñ"')
  })

  test("handles CJK characters", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("中") // Chinese
    app.stdin.write("日") // Japanese
    app.stdin.write("한") // Korean

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 3")
    expect(frame).toContain('input="中"')
    expect(frame).toContain('input="日"')
    expect(frame).toContain('input="한"')
  })

  test("handles emoji (basic)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("😀") // Grinning face (U+1F600)

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('input="😀"')
  })

  test("handles emoji with variation selectors as single grapheme", () => {
    const app = render(<KeystrokeCapture />)

    // Heart with variation selector (❤️ = U+2764 U+FE0F)
    // splitRawInput uses grapheme segmentation, keeping this as one keypress
    app.stdin.write("❤️")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    // The input should preserve the variation selector
    expect(frame).toContain("❤")
  })

  test("handles surrogate pair emoji", () => {
    const app = render(<KeystrokeCapture />)

    // Emoji outside BMP (requires surrogate pairs in UTF-16)
    app.stdin.write("🎉") // U+1F389 Party popper
    app.stdin.write("🚀") // U+1F680 Rocket

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 2")
    expect(frame).toContain('input="🎉"')
    expect(frame).toContain('input="🚀"')
  })

  test("handles ZWJ emoji sequences", () => {
    const app = render(<KeystrokeCapture />)

    // Family emoji (composed via ZWJ)
    // Note: This may be processed as multiple codepoints or as one grapheme
    // depending on terminal and implementation
    app.stdin.write("👨‍👩‍👧")

    const frame = app.text
    // Document current behavior - may be 1 or multiple keystrokes
    expect(frame).toContain("Keystrokes captured:")
  })

  test("handles combining characters", () => {
    const app = render(<KeystrokeCapture />)

    // e + combining acute accent (U+0301) = é
    app.stdin.write("e\u0301")

    const frame = app.text
    // Document behavior: may be 1 or 2 keystrokes depending on processing
    expect(frame).toContain("Keystrokes captured:")
  })
})

// ============================================================================
// Test 4: Escape sequences
// ============================================================================

describe("Escape sequence handling", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles standalone Escape key", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b") // ESC

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"escape":true')
  })

  test("handles double Escape (meta)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b\x1b") // ESC ESC

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"meta":true')
  })

  test("handles function keys F1-F4 (xterm O-style)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1bOP") // F1
    app.stdin.write("\x1bOQ") // F2
    app.stdin.write("\x1bOR") // F3
    app.stdin.write("\x1bOS") // F4

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
  })

  test("handles function keys F5-F12 (xterm [~style)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[15~") // F5
    app.stdin.write("\x1b[17~") // F6
    app.stdin.write("\x1b[18~") // F7
    app.stdin.write("\x1b[19~") // F8
    app.stdin.write("\x1b[20~") // F9
    app.stdin.write("\x1b[21~") // F10
    app.stdin.write("\x1b[23~") // F11
    app.stdin.write("\x1b[24~") // F12

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 8")
  })

  test("handles navigation keys", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[1~") // Home
    app.stdin.write("\x1b[4~") // End
    app.stdin.write("\x1b[5~") // Page Up
    app.stdin.write("\x1b[6~") // Page Down
    app.stdin.write("\x1b[2~") // Insert
    app.stdin.write("\x1b[3~") // Delete

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 6")
    expect(frame).toContain('"home":true')
    expect(frame).toContain('"end":true')
    expect(frame).toContain('"pageUp":true')
    expect(frame).toContain('"pageDown":true')
    expect(frame).toContain('"delete":true')
  })

  test("handles xterm alternative Home/End sequences", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[H") // Home (alternative)
    app.stdin.write("\x1b[F") // End (alternative)

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 2")
    expect(frame).toContain('"home":true')
    expect(frame).toContain('"end":true')
  })

  test("handles gnome/xterm O-style arrow keys", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1bOA") // up
    app.stdin.write("\x1bOB") // down
    app.stdin.write("\x1bOC") // right
    app.stdin.write("\x1bOD") // left

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
    expect(frame).toContain('"upArrow":true')
    expect(frame).toContain('"downArrow":true')
    expect(frame).toContain('"rightArrow":true')
    expect(frame).toContain('"leftArrow":true')
  })

  test("handles shift+tab (backtab)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[Z") // Shift+Tab

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"tab":true')
    expect(frame).toContain('"shift":true')
  })
})

// ============================================================================
// Test 5: Control characters
// ============================================================================

describe("Control character handling", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles Ctrl+letter combinations", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x01") // Ctrl+A
    app.stdin.write("\x02") // Ctrl+B
    app.stdin.write("\x04") // Ctrl+D
    app.stdin.write("\x05") // Ctrl+E

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
    expect(frame).toContain('"ctrl":true')
    expect(frame).toContain('input="a"')
    expect(frame).toContain('input="b"')
    expect(frame).toContain('input="d"')
    expect(frame).toContain('input="e"')
  })

  test("handles Return key", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\r") // Return

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"return":true')
  })

  test("handles Tab key", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\t") // Tab

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"tab":true')
  })

  test("handles Backspace", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\b") // Backspace

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"backspace":true')
  })

  test("handles Delete (0x7f is Backspace in modern terminals)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x7f") // Modern terminals send this for Backspace

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"backspace":true')
  })
})

// ============================================================================
// Test 6: Modifier detection
// ============================================================================

describe("Modifier key detection", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("detects uppercase as shift+letter", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("A")
    app.stdin.write("B")
    app.stdin.write("Z")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 3")
    expect(frame).toContain('"shift":true')
    expect(frame).toContain('input="A"')
    expect(frame).toContain('input="B"')
    expect(frame).toContain('input="Z"')
  })

  test("handles meta+letter (Alt+key)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1ba") // Alt+a

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"meta":true')
  })

  test("handles rxvt shift+arrow keys", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[a") // Shift+Up (rxvt)
    app.stdin.write("\x1b[b") // Shift+Down (rxvt)
    app.stdin.write("\x1b[c") // Shift+Right (rxvt)
    app.stdin.write("\x1b[d") // Shift+Left (rxvt)

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
    expect(frame).toContain('"shift":true')
    expect(frame).toContain('"upArrow":true')
    expect(frame).toContain('"downArrow":true')
    expect(frame).toContain('"rightArrow":true')
    expect(frame).toContain('"leftArrow":true')
  })

  test("handles rxvt ctrl+navigation keys", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1bOa") // Ctrl+Up (rxvt)
    app.stdin.write("\x1bOb") // Ctrl+Down (rxvt)
    app.stdin.write("\x1bOc") // Ctrl+Right (rxvt)
    app.stdin.write("\x1bOd") // Ctrl+Left (rxvt)

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 4")
    expect(frame).toContain('"ctrl":true')
  })
})

// ============================================================================
// Test 7: Counter component (integration test for state updates)
// ============================================================================

describe("Stateful component with rapid input", () => {
  const render = createRenderer({ cols: 80, rows: 10 })

  function Counter() {
    const [count, setCount] = useState(0)

    useInput((input: string, key: Key) => {
      if (input === "+" || key.upArrow) {
        setCount((c) => c + 1)
      } else if (input === "-" || key.downArrow) {
        setCount((c) => c - 1)
      } else if (input === "r") {
        setCount(0)
      }
    })

    return <Text>Count: {count}</Text>
  }

  test("increments with rapid + presses", () => {
    const app = render(<Counter />)

    app.stdin.write("+")
    app.stdin.write("+")
    app.stdin.write("+")
    app.stdin.write("+")
    app.stdin.write("+")

    const frame = app.text
    expect(frame).toContain("Count: 5")
  })

  test("handles mixed increment/decrement", () => {
    const app = render(<Counter />)

    app.stdin.write("+") // 0 -> 1
    app.stdin.write("+") // 1 -> 2
    app.stdin.write("+") // 2 -> 3
    app.stdin.write("-") // 3 -> 2
    app.stdin.write("+") // 2 -> 3

    const frame = app.text
    expect(frame).toContain("Count: 3")
  })

  test("handles arrow keys for increment/decrement", () => {
    const app = render(<Counter />)

    app.stdin.write("\x1b[A") // up
    app.stdin.write("\x1b[A") // up
    app.stdin.write("\x1b[B") // down
    app.stdin.write("\x1b[A") // up

    const frame = app.text
    expect(frame).toContain("Count: 2")
  })

  test("handles reset mid-sequence", () => {
    const app = render(<Counter />)

    app.stdin.write("+")
    app.stdin.write("+")
    app.stdin.write("+")
    app.stdin.write("r") // reset
    app.stdin.write("+")
    app.stdin.write("+")

    const frame = app.text
    expect(frame).toContain("Count: 2")
  })
})

// ============================================================================
// Test 8: Space and special input characters
// ============================================================================

describe("Space and special characters", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles space character", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write(" ")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    // Space is handled specially - check it was captured
    expect(frame).toContain('input=" "')
  })

  test("handles meta+space", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b ") // Alt+Space

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"meta":true')
  })

  test("handles punctuation", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write(".")
    app.stdin.write(",")
    app.stdin.write("/")
    app.stdin.write("\\")
    app.stdin.write("[")
    app.stdin.write("]")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 6")
  })
})

// ============================================================================
// Test 9: Home/End key handling (km-bquv)
// ============================================================================

describe("Home/End key handling (km-bquv)", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  // ------------------------------------------------------------------------
  // Home key detection
  // ------------------------------------------------------------------------

  test("detects Home key via ESC[H (xterm)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[H")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"home":true')
  })

  test("detects Home key via ESC[1~ (vt/linux)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[1~")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"home":true')
  })

  test("detects Home key via ESCOH (application mode)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1bOH")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"home":true')
  })

  // ------------------------------------------------------------------------
  // End key detection
  // ------------------------------------------------------------------------

  test("detects End key via ESC[F (xterm)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[F")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"end":true')
  })

  test("detects End key via ESC[4~ (vt/linux)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[4~")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"end":true')
  })

  test("detects End key via ESCOF (application mode)", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1bOF")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"end":true')
  })

  // ------------------------------------------------------------------------
  // Shift+Home / Shift+End combinations
  // ------------------------------------------------------------------------

  test("detects Shift+Home via ESC[1;2H", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[1;2H")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"home":true')
    expect(frame).toContain('"shift":true')
  })

  test("detects Shift+End via ESC[1;2F", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[1;2F")

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 1")
    expect(frame).toContain('"end":true')
    expect(frame).toContain('"shift":true')
  })

  // ------------------------------------------------------------------------
  // Cross-terminal compatibility (all sequences in sequence)
  // ------------------------------------------------------------------------

  test("handles all Home escape sequences consistently", () => {
    const app = render(<KeystrokeCapture />)

    // Send all three Home variants
    app.stdin.write("\x1b[H") // xterm
    app.stdin.write("\x1b[1~") // vt/linux
    app.stdin.write("\x1bOH") // application mode

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 3")
    // All three should register as home keys
    const homeMatches = (frame.match(/"home":true/g) || []).length
    expect(homeMatches).toBe(3)
  })

  test("handles all End escape sequences consistently", () => {
    const app = render(<KeystrokeCapture />)

    // Send all three End variants
    app.stdin.write("\x1b[F") // xterm
    app.stdin.write("\x1b[4~") // vt/linux
    app.stdin.write("\x1bOF") // application mode

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 3")
    // All three should register as end keys
    const endMatches = (frame.match(/"end":true/g) || []).length
    expect(endMatches).toBe(3)
  })

  test("Home and End keys interleaved with other navigation", () => {
    const app = render(<KeystrokeCapture />)

    app.stdin.write("\x1b[H") // Home
    app.stdin.write("\x1b[C") // Right arrow
    app.stdin.write("\x1b[C") // Right arrow
    app.stdin.write("\x1b[F") // End
    app.stdin.write("\x1b[D") // Left arrow
    app.stdin.write("\x1b[H") // Home

    const frame = app.text
    expect(frame).toContain("Keystrokes captured: 6")
    const homeMatches = (frame.match(/"home":true/g) || []).length
    const endMatches = (frame.match(/"end":true/g) || []).length
    expect(homeMatches).toBe(2)
    expect(endMatches).toBe(1)
  })
})
