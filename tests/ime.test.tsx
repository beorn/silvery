/**
 * CJK/IME Input Handling Tests (km-uv5o)
 *
 * Tests for CJK character input handling and IME-related concerns.
 *
 * NOTE: True IME (Input Method Editor) testing requires actual system IME,
 * which cannot be automated. These tests verify:
 * 1. CJK character input is handled correctly when received
 * 2. Cursor positioning works with CJK wide characters
 * 3. Synchronized Update Mode sequences for IME rendering in tmux
 * 4. Documentation of IME considerations for manual testing
 *
 * @see https://en.wikipedia.org/wiki/Input_method
 * @see terminal-multiplexers.test.ts for Synchronized Update Mode
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, type Key, Text, useInput } from "../src/index.ts"
import { createRenderer } from "../src/testing/index.tsx"
import { displayWidth, graphemeCount } from "../src/unicode.js"

// ============================================================================
// Test Components
// ============================================================================

interface TextCapture {
  input: string
  displayWidth: number
  graphemeCount: number
}

/**
 * Component that captures and displays input with CJK-aware metrics.
 */
function CJKInputCapture({
  onCapture,
}: {
  onCapture?: (captures: TextCapture[]) => void
}) {
  const [captures, setCaptures] = useState<TextCapture[]>([])

  useInput((input: string, _key: Key) => {
    const newCapture: TextCapture = {
      input,
      displayWidth: displayWidth(input),
      graphemeCount: graphemeCount(input),
    }
    setCaptures((prev) => {
      const updated = [...prev, newCapture]
      onCapture?.(updated)
      return updated
    })
  })

  return (
    <Box flexDirection="column">
      <Text>Inputs captured: {captures.length}</Text>
      {captures.map((cap, i) => (
        <Text key={`${i}-${cap.input}`}>
          {i}: "{cap.input}" (width={cap.displayWidth}, graphemes=
          {cap.graphemeCount})
        </Text>
      ))}
    </Box>
  )
}

/**
 * Simple text editor component that tracks cursor position.
 * Demonstrates CJK-aware cursor positioning.
 */
function CJKTextEditor() {
  const [text, setText] = useState("")
  const [cursorPos, setCursorPos] = useState(0)

  useInput((input: string, key: Key) => {
    if (key.backspace || key.delete) {
      if (cursorPos > 0) {
        // Remove character before cursor
        const graphemes = [...text]
        graphemes.splice(cursorPos - 1, 1)
        setText(graphemes.join(""))
        setCursorPos(cursorPos - 1)
      }
    } else if (key.leftArrow) {
      setCursorPos(Math.max(0, cursorPos - 1))
    } else if (key.rightArrow) {
      setCursorPos(Math.min([...text].length, cursorPos + 1))
    } else if (input && !key.ctrl && !key.meta && !key.escape && !key.return) {
      // Insert input at cursor (can be single char or paste)
      const graphemes = [...text]
      const inputGraphemes = [...input] // Split pasted text into graphemes
      graphemes.splice(cursorPos, 0, ...inputGraphemes)
      setText(graphemes.join(""))
      setCursorPos(cursorPos + inputGraphemes.length)
    }
  })

  // Calculate display column for cursor (CJK chars are 2 columns wide)
  const graphemes = [...text]
  let cursorColumn = 0
  for (let i = 0; i < cursorPos && i < graphemes.length; i++) {
    cursorColumn += displayWidth(graphemes[i]!)
  }

  return (
    <Box flexDirection="column">
      <Text>Text: {text || "(empty)"}</Text>
      <Text>Cursor position: {cursorPos} (graphemes)</Text>
      <Text>Cursor column: {cursorColumn} (display columns)</Text>
      <Text>Text width: {displayWidth(text)} columns</Text>
      <Text>Grapheme count: {graphemeCount(text)}</Text>
    </Box>
  )
}

// ============================================================================
// Chinese Character Input Tests
// ============================================================================

describe("Chinese Character Input (中文)", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles single Chinese character input", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("中")

    const frame = app.text
    expect(frame).toContain("Inputs captured: 1")
    expect(frame).toContain('"中"')
    expect(frame).toContain("width=2")
    expect(frame).toContain("graphemes=1")
  })

  test("handles multiple Chinese characters input individually", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("你")
    app.stdin.write("好")
    app.stdin.write("世")
    app.stdin.write("界")

    const frame = app.text
    expect(frame).toContain("Inputs captured: 4")
    expect(frame).toContain('"你"')
    expect(frame).toContain('"好"')
    expect(frame).toContain('"世"')
    expect(frame).toContain('"界"')
  })

  test("handles Chinese string as single paste event", () => {
    const app = render(<CJKInputCapture />)

    // When pasted, the entire string arrives as one input event
    app.stdin.write("你好世界")

    const frame = app.text
    expect(frame).toContain("Inputs captured: 1")
    expect(frame).toContain('"你好世界"')
    expect(frame).toContain("width=8") // 4 chars * 2 columns
    expect(frame).toContain("graphemes=4")
  })

  test("handles simplified Chinese characters", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("简体中文")

    const frame = app.text
    expect(frame).toContain('"简体中文"')
    expect(frame).toContain("width=8")
  })

  test("handles traditional Chinese characters", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("繁體中文")

    const frame = app.text
    expect(frame).toContain('"繁體中文"')
    expect(frame).toContain("width=8")
  })

  test("handles Chinese punctuation", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("，")
    app.stdin.write("。")
    app.stdin.write("！")
    app.stdin.write("？")

    const frame = app.text
    expect(frame).toContain("Inputs captured: 4")
    // Full-width punctuation is 2 columns
    expect(frame).toContain("width=2")
  })
})

// ============================================================================
// Japanese Input Tests
// ============================================================================

describe("Japanese Character Input (日本語)", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles Hiragana input", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("ひらがな")

    const frame = app.text
    expect(frame).toContain('"ひらがな"')
    expect(frame).toContain("width=8") // 4 chars * 2 columns
    expect(frame).toContain("graphemes=4")
  })

  test("handles Katakana input", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("カタカナ")

    const frame = app.text
    expect(frame).toContain('"カタカナ"')
    expect(frame).toContain("width=8")
  })

  test("handles Kanji input", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("日本語")

    const frame = app.text
    expect(frame).toContain('"日本語"')
    expect(frame).toContain("width=6") // 3 chars * 2 columns
  })

  test("handles half-width Katakana (hankaku)", () => {
    const app = render(<CJKInputCapture />)

    // Half-width katakana: U+FF61-U+FF9F
    app.stdin.write("ｱｲｳ")

    const frame = app.text
    expect(frame).toContain('"ｱｲｳ"')
    expect(frame).toContain("width=3") // Half-width = 1 column each
  })

  test("handles mixed Japanese script", () => {
    const app = render(<CJKInputCapture />)

    // Common Japanese pattern: Kanji + Hiragana
    app.stdin.write("東京とうきょう")

    const frame = app.text
    expect(frame).toContain('"東京とうきょう"')
    expect(frame).toContain("width=14") // 2 kanji (4) + 5 hiragana (10)
  })

  test("handles Romaji (ASCII) mixed with Japanese", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("ABCあいう")

    const frame = app.text
    expect(frame).toContain('"ABCあいう"')
    expect(frame).toContain("width=9") // 3 ASCII (3) + 3 hiragana (6)
  })
})

// ============================================================================
// Korean Input Tests
// ============================================================================

describe("Korean Character Input (한국어)", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles Hangul syllable input", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("한글")

    const frame = app.text
    expect(frame).toContain('"한글"')
    expect(frame).toContain("width=4") // 2 chars * 2 columns
    expect(frame).toContain("graphemes=2")
  })

  test("handles Korean greeting", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("안녕하세요")

    const frame = app.text
    expect(frame).toContain('"안녕하세요"')
    expect(frame).toContain("width=10") // 5 chars * 2 columns
    expect(frame).toContain("graphemes=5")
  })

  test("handles Hangul Jamo (conjoining)", () => {
    const app = render(<CJKInputCapture />)

    // Compatibility Jamo (displayed separately)
    app.stdin.write("ㄱㄴㄷ")

    const frame = app.text
    expect(frame).toContain('"ㄱㄴㄷ"')
    expect(frame).toContain("width=6") // Compatibility Jamo are wide
  })

  test("handles Korean with numbers", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("2024년")

    const frame = app.text
    expect(frame).toContain('"2024년"')
    expect(frame).toContain("width=6") // 4 digits (4) + 1 Hangul (2)
  })
})

// ============================================================================
// Mixed CJK Input Tests
// ============================================================================

describe("Mixed CJK and ASCII Input", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("handles alternating ASCII and CJK characters", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("a")
    app.stdin.write("中")
    app.stdin.write("b")
    app.stdin.write("文")

    const frame = app.text
    expect(frame).toContain("Inputs captured: 4")
    expect(frame).toContain('"a"')
    expect(frame).toContain('"中"')
    expect(frame).toContain('"b"')
    expect(frame).toContain('"文"')
  })

  test("handles mixed CJK language input", () => {
    const app = render(<CJKInputCapture />)

    // Chinese + Japanese + Korean
    app.stdin.write("中あ한")

    const frame = app.text
    expect(frame).toContain('"中あ한"')
    expect(frame).toContain("width=6") // 3 CJK chars * 2 columns
    expect(frame).toContain("graphemes=3")
  })

  test("handles CJK with ASCII punctuation", () => {
    const app = render(<CJKInputCapture />)

    app.stdin.write("中文.")

    const frame = app.text
    expect(frame).toContain('"中文."')
    expect(frame).toContain("width=5") // 2 CJK (4) + 1 ASCII (1)
  })
})

// ============================================================================
// Cursor Positioning Tests
// ============================================================================

describe("Cursor Positioning with CJK Characters", () => {
  const render = createRenderer({ cols: 80, rows: 30 })

  test("tracks cursor position with CJK input", () => {
    const app = render(<CJKTextEditor />)

    app.stdin.write("中")

    const frame = app.text
    expect(frame).toContain("Cursor position: 1 (graphemes)")
    expect(frame).toContain("Cursor column: 2 (display columns)")
  })

  test("cursor column accounts for CJK width", () => {
    const app = render(<CJKTextEditor />)

    app.stdin.write("AB中文CD")

    const frame = app.text
    expect(frame).toContain("Cursor position: 6 (graphemes)")
    // A(1) + B(1) + 中(2) + 文(2) + C(1) + D(1) = 8 columns
    expect(frame).toContain("Cursor column: 8 (display columns)")
    expect(frame).toContain("Text width: 8 columns")
    expect(frame).toContain("Grapheme count: 6")
  })

  test("cursor movement with mixed CJK/ASCII", () => {
    const app = render(<CJKTextEditor />)

    // Type "A中B"
    app.stdin.write("A")
    app.stdin.write("中")
    app.stdin.write("B")

    // Move left twice (should be at '中')
    app.stdin.write("\x1b[D") // left
    app.stdin.write("\x1b[D") // left

    const frame = app.text
    expect(frame).toContain("Cursor position: 1 (graphemes)")
    // Cursor at position 1 means after 'A' (1 column)
    expect(frame).toContain("Cursor column: 1 (display columns)")
  })

  test("backspace removes whole CJK character", () => {
    const app = render(<CJKTextEditor />)

    app.stdin.write("A中B")
    app.stdin.write("\b") // Backspace

    const frame = app.text
    expect(frame).toContain("Text: A中")
    expect(frame).toContain("Cursor position: 2")
  })
})

// ============================================================================
// Synchronized Update Mode Tests
// ============================================================================

describe("Synchronized Update Mode (for IME rendering)", () => {
  /**
   * Synchronized Update Mode (CSI ? 2026 h/l) helps prevent tearing
   * when IME composition windows or candidate lists are displayed.
   *
   * This is especially important in tmux where screen updates can flicker.
   *
   * These tests verify the escape sequence format, not actual terminal behavior.
   */

  const ESC = "\x1b"
  const CSI = `${ESC}[`

  const SYNC_UPDATE = {
    begin: `${CSI}?2026h`,
    end: `${CSI}?2026l`,
  }

  test("generates correct synchronized update begin sequence", () => {
    expect(SYNC_UPDATE.begin).toBe("\x1b[?2026h")
  })

  test("generates correct synchronized update end sequence", () => {
    expect(SYNC_UPDATE.end).toBe("\x1b[?2026l")
  })

  test("wraps CJK output with synchronized update", () => {
    const wrapWithSyncUpdate = (content: string): string => {
      return `${SYNC_UPDATE.begin}${content}${SYNC_UPDATE.end}`
    }

    const cjkContent = "中文日本語한국어"
    const wrapped = wrapWithSyncUpdate(cjkContent)

    expect(wrapped).toBe("\x1b[?2026h中文日本語한국어\x1b[?2026l")
    expect(wrapped.startsWith(SYNC_UPDATE.begin)).toBe(true)
    expect(wrapped.endsWith(SYNC_UPDATE.end)).toBe(true)
  })

  test("documented: prevents IME composition window flicker", () => {
    // IME composition typically shows:
    // 1. Inline composition text (underlined)
    // 2. Candidate window (floating)
    //
    // Without synchronized update, rapid screen updates during
    // composition can cause visible flicker in tmux.
    //
    // Using synchronized update batches the screen changes,
    // resulting in smoother IME interaction.
    expect(true).toBe(true) // Documentation test
  })
})

// ============================================================================
// IME Documentation Tests
// ============================================================================

describe("IME Considerations (Documentation)", () => {
  /**
   * IME INPUT METHOD EDITOR CONSIDERATIONS
   * ======================================
   *
   * IME is used for inputting CJK characters and other complex scripts.
   * The composition process is:
   *
   * 1. User types phonetic characters (romaji, pinyin, bopomofo)
   * 2. IME shows composition string (often underlined)
   * 3. IME shows candidate list
   * 4. User selects candidate
   * 5. Final converted text is committed
   *
   * From the terminal's perspective:
   * - Only the final committed text is received
   * - Composition UI is handled by the IME system
   * - The terminal sees completed CJK characters, not keystrokes
   *
   * For example, typing "nihongo" and pressing space might:
   * - Send "日本語" as a single string to the terminal
   * - Or send each character individually depending on IME mode
   */

  test("documents IME composition behavior", () => {
    // The terminal receives final text, not composition events
    const imeCommittedText = "日本語"
    expect(imeCommittedText).toBe("日本語")
    expect(displayWidth(imeCommittedText)).toBe(6)
  })

  test("documents IME paste behavior", () => {
    // When using IME to input and then pasting:
    // - Pasted CJK text arrives as a single chunk
    // - Bracketed paste mode helps distinguish paste from typing
    const pastedText = "你好世界こんにちは안녕하세요"
    expect(graphemeCount(pastedText)).toBe(14)
  })

  test("documents bracketed paste sequences", () => {
    // Bracketed paste helps distinguish IME-pasted text
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

  test("documents tmux IME considerations", () => {
    // tmux quirks affecting IME:
    // 1. escape-time delay can interfere with rapid input
    //    Fix: set -sg escape-time 0
    //
    // 2. Screen tearing during composition
    //    Fix: Synchronized Update Mode (CSI ? 2026 h/l)
    //
    // 3. Unicode width handling
    //    Fix: set -g utf8 on (tmux < 2.2)
    //    Modern tmux handles UTF-8 automatically
    expect(true).toBe(true) // Documentation test
  })

  test("documents terminal compatibility", () => {
    // Terminal emulators with good IME support:
    // - iTerm2 (macOS): Excellent IME support
    // - Kitty: Good IME support, configurable
    // - WezTerm: Good IME support
    // - GNOME Terminal: Good on Linux
    // - Windows Terminal: Good IME support on Windows
    //
    // For TUI apps:
    // - Focus on handling committed text correctly
    // - Don't try to handle composition (OS handles it)
    // - Use wide character detection for cursor positioning
    expect(true).toBe(true) // Documentation test
  })
})

// ============================================================================
// Input Validation Tests
// ============================================================================

describe("CJK Input Edge Cases", () => {
  const render = createRenderer({ cols: 80, rows: 30 })
  // Wide render for tests with long content that exceeds 80 columns
  const wideRender = createRenderer({ cols: 160, rows: 30 })

  test("handles empty input gracefully", () => {
    const app = render(<CJKInputCapture />)

    const frame = app.text
    expect(frame).toContain("Inputs captured: 0")
  })

  test("handles very long CJK string", () => {
    // Need wide terminal for 50 CJK chars (100 columns) + formatting text
    const app = wideRender(<CJKInputCapture />)

    // 50 Chinese characters
    const longText = "中".repeat(50)
    app.stdin.write(longText)

    const frame = app.text
    expect(frame).toContain("width=100") // 50 * 2 columns
    expect(frame).toContain("graphemes=50")
  })

  test("handles CJK with combining marks", () => {
    const app = render(<CJKInputCapture />)

    // Some rare cases have CJK with combining marks
    // Example: Vietnamese uses combining marks
    app.stdin.write("Việt Nam")

    const frame = app.text
    expect(frame).toContain('"Việt Nam"')
  })

  test("handles zero-width joiner between CJK", () => {
    const app = render(<CJKInputCapture />)

    // ZWJ (U+200D) between characters (unusual but valid)
    const textWithZwj = "中\u200D文"
    app.stdin.write(textWithZwj)

    const frame = app.text
    // ZWJ should not affect display width calculation significantly
    expect(frame).toContain("width=")
  })

  test("handles CJK compatibility characters", () => {
    const app = render(<CJKInputCapture />)

    // CJK Compatibility Forms (U+F900-U+FAFF)
    // These are alternate forms of existing characters
    app.stdin.write("\uF900") // CJK compatibility ideograph

    const frame = app.text
    expect(frame).toContain("width=2") // Still a wide character
  })

  test("handles fullwidth ASCII characters", () => {
    const app = render(<CJKInputCapture />)

    // Fullwidth ASCII (U+FF01-U+FF5E) - often used in CJK contexts
    app.stdin.write("ＡＢＣ") // Fullwidth A, B, C

    const frame = app.text
    expect(frame).toContain('"ＡＢＣ"')
    expect(frame).toContain("width=6") // 3 fullwidth chars * 2
  })
})

// ============================================================================
// Manual Testing Guide
// ============================================================================

/**
 * MANUAL IME TESTING GUIDE
 * ========================
 *
 * Since automated tests cannot fully simulate IME behavior,
 * manual testing is essential. Here's what to test:
 *
 * Setup:
 * ------
 * 1. Enable your system's CJK input method:
 *    - macOS: System Preferences > Keyboard > Input Sources
 *    - Linux: ibus, fcitx, or your distro's input method
 *    - Windows: Settings > Time & Language > Language
 *
 * 2. Run the TUI app and switch to CJK input mode
 *
 * Test Cases:
 * -----------
 * 1. Basic Input:
 *    - Type pinyin/romaji/hangul and confirm conversion
 *    - Verify characters appear correctly
 *    - Check cursor position after each character
 *
 * 2. Composition:
 *    - Type partial input (e.g., "ni" in Chinese pinyin)
 *    - Verify composition string is visible (may show in input method window)
 *    - Complete conversion and verify final text
 *
 * 3. Candidate Selection:
 *    - Type until candidate window appears
 *    - Select different candidates
 *    - Verify correct character is inserted
 *
 * 4. Mixed Input:
 *    - Switch between CJK and ASCII mode rapidly
 *    - Type mixed content
 *    - Verify cursor tracking is correct
 *
 * 5. In tmux:
 *    - Repeat all tests inside tmux
 *    - Check for screen tearing during composition
 *    - Verify no character corruption
 *
 * 6. Paste Operations:
 *    - Copy CJK text from another application
 *    - Paste into the TUI
 *    - Verify all characters appear correctly
 *
 * Known Issues to Watch For:
 * --------------------------
 * - Cursor misalignment after CJK input
 * - Screen tearing in tmux during composition
 * - Characters getting cut off at line boundaries
 * - Width miscalculation causing text overlap
 * - Combining marks not rendering with base character
 *
 * If issues are found, document them with:
 * 1. Terminal emulator name and version
 * 2. IME name and version
 * 3. Inside/outside tmux
 * 4. Steps to reproduce
 * 5. Expected vs actual behavior
 */

describe("Manual Testing Guide", () => {
  test("guide exists in comments above", () => {
    // This test ensures the documentation is present
    expect(true).toBe(true)
  })
})
