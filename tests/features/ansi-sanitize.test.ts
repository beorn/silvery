/**
 * ANSI Escape Sequence Sanitizer Tests
 *
 * Bead: km-silvery.ansi-sanitize
 *
 * Tests tokenizeAnsi() and sanitizeAnsi() — stripping dangerous escape
 * sequences while preserving safe SGR styling and OSC hyperlinks.
 */

import { describe, test, expect } from "vitest"
import { sanitizeAnsi, tokenizeAnsi, type AnsiToken } from "@silvery/term"

// =============================================================================
// Helpers
// =============================================================================

/** Extract just the types from a token array for concise assertions. */
function types(tokens: AnsiToken[]): AnsiToken["type"][] {
  return tokens.map((t) => t.type)
}

// =============================================================================
// tokenizeAnsi
// =============================================================================

describe("tokenizeAnsi", () => {
  test("plain text is a single text token", () => {
    const tokens = tokenizeAnsi("hello world")
    expect(tokens).toEqual([{ type: "text", value: "hello world" }])
  })

  test("empty string yields no tokens", () => {
    expect(tokenizeAnsi("")).toEqual([])
  })

  test("SGR sequence is a csi token", () => {
    const tokens = tokenizeAnsi("\x1b[31m")
    expect(tokens).toEqual([{ type: "csi", value: "\x1b[31m" }])
  })

  test("compound SGR sequence", () => {
    const tokens = tokenizeAnsi("\x1b[1;31m")
    expect(tokens).toEqual([{ type: "csi", value: "\x1b[1;31m" }])
  })

  test("extended SGR with colons (curly underline)", () => {
    const tokens = tokenizeAnsi("\x1b[4:3m")
    expect(tokens).toEqual([{ type: "csi", value: "\x1b[4:3m" }])
  })

  test("cursor movement CSI", () => {
    // ESC[H = cursor home
    const tokens = tokenizeAnsi("\x1b[H")
    expect(tokens).toEqual([{ type: "csi", value: "\x1b[H" }])
  })

  test("erase display CSI", () => {
    const tokens = tokenizeAnsi("\x1b[2J")
    expect(tokens).toEqual([{ type: "csi", value: "\x1b[2J" }])
  })

  test("cursor position CSI", () => {
    const tokens = tokenizeAnsi("\x1b[10;20H")
    expect(tokens).toEqual([{ type: "csi", value: "\x1b[10;20H" }])
  })

  test("OSC hyperlink (ST terminated)", () => {
    const seq = "\x1b]8;;https://example.com\x1b\\"
    const tokens = tokenizeAnsi(seq)
    expect(tokens).toEqual([{ type: "osc", value: seq }])
  })

  test("OSC hyperlink (BEL terminated)", () => {
    const seq = "\x1b]8;;https://example.com\x07"
    const tokens = tokenizeAnsi(seq)
    expect(tokens).toEqual([{ type: "osc", value: seq }])
  })

  test("DCS sequence", () => {
    const seq = "\x1b Ppayload\x1b\\"
    // Note: ESC P is DCS
    const tokens = tokenizeAnsi("\x1bPpayload\x1b\\")
    expect(tokens).toEqual([{ type: "dcs", value: "\x1bPpayload\x1b\\" }])
  })

  test("PM sequence", () => {
    const tokens = tokenizeAnsi("\x1b^message\x1b\\")
    expect(tokens).toEqual([{ type: "pm", value: "\x1b^message\x1b\\" }])
  })

  test("APC sequence", () => {
    const tokens = tokenizeAnsi("\x1b_command\x1b\\")
    expect(tokens).toEqual([{ type: "apc", value: "\x1b_command\x1b\\" }])
  })

  test("SOS sequence", () => {
    const tokens = tokenizeAnsi("\x1bXstring\x1b\\")
    expect(tokens).toEqual([{ type: "sos", value: "\x1bXstring\x1b\\" }])
  })

  test("simple two-byte escape", () => {
    // ESC 7 = save cursor (DECSC)
    const tokens = tokenizeAnsi("\x1b7")
    expect(tokens).toEqual([{ type: "esc", value: "\x1b7" }])
  })

  test("C1 control character", () => {
    // 0x85 = NEL (Next Line)
    const tokens = tokenizeAnsi("\x85")
    expect(tokens).toEqual([{ type: "c1", value: "\x85" }])
  })

  test("mixed text and sequences", () => {
    const input = "hello\x1b[31m world\x1b[0m!"
    const tokens = tokenizeAnsi(input)
    expect(types(tokens)).toEqual(["text", "csi", "text", "csi", "text"])
    expect(tokens[0].value).toBe("hello")
    expect(tokens[1].value).toBe("\x1b[31m")
    expect(tokens[2].value).toBe(" world")
    expect(tokens[3].value).toBe("\x1b[0m")
    expect(tokens[4].value).toBe("!")
  })

  test("multiple CSI sequences", () => {
    const input = "\x1b[31m\x1b[2J\x1b[H\x1b[0m"
    const tokens = tokenizeAnsi(input)
    expect(types(tokens)).toEqual(["csi", "csi", "csi", "csi"])
  })

  test("incomplete escape at end of string", () => {
    const tokens = tokenizeAnsi("text\x1b")
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: "text", value: "text" })
    expect(tokens[1]).toEqual({ type: "esc", value: "\x1b" })
  })

  test("C1 CSI (0x9B) in 8-bit mode", () => {
    // 0x9B followed by params + final byte = CSI in 8-bit mode
    const tokens = tokenizeAnsi("\x9b31m")
    expect(tokens).toEqual([{ type: "csi", value: "\x9b31m" }])
  })

  test("C1 OSC (0x9D) in 8-bit mode", () => {
    const tokens = tokenizeAnsi("\x9d8;;url\x1b\\")
    expect(tokens).toEqual([{ type: "osc", value: "\x9d8;;url\x1b\\" }])
  })

  test("C1 DCS (0x90) in 8-bit mode", () => {
    const tokens = tokenizeAnsi("\x90payload\x1b\\")
    expect(tokens).toEqual([{ type: "dcs", value: "\x90payload\x1b\\" }])
  })

  test("roundtrip: concatenated token values equal original input", () => {
    const input = "abc\x1b[31mdef\x1b[2Jghi\x1b]8;;url\x1b\\jkl\x1b[0m"
    const tokens = tokenizeAnsi(input)
    const reconstructed = tokens.map((t) => t.value).join("")
    expect(reconstructed).toBe(input)
  })
})

// =============================================================================
// sanitizeAnsi
// =============================================================================

describe("sanitizeAnsi", () => {
  // -------------------------------------------------------------------------
  // Passthrough
  // -------------------------------------------------------------------------

  test("empty string returns empty string", () => {
    expect(sanitizeAnsi("")).toBe("")
  })

  test("plain text passes through unchanged", () => {
    expect(sanitizeAnsi("hello world")).toBe("hello world")
  })

  test("string with no escapes returns unchanged", () => {
    const text = "The quick brown fox jumps over the lazy dog. 123!@#"
    expect(sanitizeAnsi(text)).toBe(text)
  })

  test("newlines and tabs pass through", () => {
    expect(sanitizeAnsi("line1\nline2\ttab")).toBe("line1\nline2\ttab")
  })

  // -------------------------------------------------------------------------
  // SGR preserved
  // -------------------------------------------------------------------------

  test("basic SGR reset preserved", () => {
    expect(sanitizeAnsi("\x1b[0m")).toBe("\x1b[0m")
  })

  test("SGR red foreground preserved", () => {
    expect(sanitizeAnsi("\x1b[31m")).toBe("\x1b[31m")
  })

  test("SGR bold preserved", () => {
    expect(sanitizeAnsi("\x1b[1m")).toBe("\x1b[1m")
  })

  test("compound SGR preserved", () => {
    expect(sanitizeAnsi("\x1b[1;31m")).toBe("\x1b[1;31m")
  })

  test("SGR with text preserved", () => {
    expect(sanitizeAnsi("\x1b[31mred text\x1b[0m")).toBe("\x1b[31mred text\x1b[0m")
  })

  test("256-color SGR preserved", () => {
    // ESC[38;5;196m = 256-color red
    expect(sanitizeAnsi("\x1b[38;5;196m")).toBe("\x1b[38;5;196m")
  })

  test("truecolor SGR preserved", () => {
    // ESC[38;2;255;0;0m = RGB red
    expect(sanitizeAnsi("\x1b[38;2;255;0;0m")).toBe("\x1b[38;2;255;0;0m")
  })

  test("extended SGR with colons preserved", () => {
    // ESC[4:3m = curly underline, ESC[58:2::255:0:0m = underline color
    expect(sanitizeAnsi("\x1b[4:3m")).toBe("\x1b[4:3m")
    expect(sanitizeAnsi("\x1b[58:2::255:0:0m")).toBe("\x1b[58:2::255:0:0m")
  })

  // -------------------------------------------------------------------------
  // OSC preserved
  // -------------------------------------------------------------------------

  test("OSC hyperlink preserved (ST terminated)", () => {
    const link = "\x1b]8;;https://example.com\x1b\\click\x1b]8;;\x1b\\"
    expect(sanitizeAnsi(link)).toBe(link)
  })

  test("OSC hyperlink preserved (BEL terminated)", () => {
    const link = "\x1b]8;;https://example.com\x07click\x1b]8;;\x07"
    expect(sanitizeAnsi(link)).toBe(link)
  })

  test("OSC window title preserved", () => {
    const title = "\x1b]0;My Title\x07"
    expect(sanitizeAnsi(title)).toBe(title)
  })

  // -------------------------------------------------------------------------
  // Cursor movement stripped
  // -------------------------------------------------------------------------

  test("cursor home stripped", () => {
    expect(sanitizeAnsi("\x1b[H")).toBe("")
  })

  test("cursor position stripped", () => {
    expect(sanitizeAnsi("\x1b[10;20H")).toBe("")
  })

  test("cursor up stripped", () => {
    expect(sanitizeAnsi("\x1b[5A")).toBe("")
  })

  test("cursor down stripped", () => {
    expect(sanitizeAnsi("\x1b[3B")).toBe("")
  })

  test("cursor forward stripped", () => {
    expect(sanitizeAnsi("\x1b[2C")).toBe("")
  })

  test("cursor back stripped", () => {
    expect(sanitizeAnsi("\x1b[1D")).toBe("")
  })

  // -------------------------------------------------------------------------
  // Screen clearing stripped
  // -------------------------------------------------------------------------

  test("erase display stripped", () => {
    expect(sanitizeAnsi("\x1b[2J")).toBe("")
  })

  test("erase in line stripped", () => {
    expect(sanitizeAnsi("\x1b[K")).toBe("")
  })

  // -------------------------------------------------------------------------
  // Dangerous sequences stripped
  // -------------------------------------------------------------------------

  test("DCS stripped", () => {
    expect(sanitizeAnsi("\x1bPpayload\x1b\\")).toBe("")
  })

  test("PM stripped", () => {
    expect(sanitizeAnsi("\x1b^private\x1b\\")).toBe("")
  })

  test("APC stripped", () => {
    expect(sanitizeAnsi("\x1b_app command\x1b\\")).toBe("")
  })

  test("SOS stripped", () => {
    expect(sanitizeAnsi("\x1bXstring data\x1b\\")).toBe("")
  })

  test("C1 control characters stripped", () => {
    // 0x85 = NEL, 0x84 = IND
    expect(sanitizeAnsi("\x85")).toBe("")
    expect(sanitizeAnsi("\x84")).toBe("")
  })

  test("simple escape sequences stripped", () => {
    // ESC 7 = DECSC (save cursor), ESC 8 = DECRC (restore cursor)
    expect(sanitizeAnsi("\x1b7")).toBe("")
    expect(sanitizeAnsi("\x1b8")).toBe("")
  })

  // -------------------------------------------------------------------------
  // CSI with intermediate bytes stripped (not SGR)
  // -------------------------------------------------------------------------

  test("CSI with intermediate byte stripped even if final is m", () => {
    // ESC[ space m — has intermediate byte 0x20, so not a pure SGR
    expect(sanitizeAnsi("\x1b[ m")).toBe("")
  })

  // -------------------------------------------------------------------------
  // Mixed content
  // -------------------------------------------------------------------------

  test("SGR + cursor movement → only SGR kept", () => {
    expect(sanitizeAnsi("\x1b[31m\x1b[2J\x1b[Hred\x1b[0m")).toBe("\x1b[31mred\x1b[0m")
  })

  test("text with interspersed safe and dangerous sequences", () => {
    const input = "hello\x1b[1m\x1b[5A bold\x1b[0m\x1b[2J world"
    expect(sanitizeAnsi(input)).toBe("hello\x1b[1m bold\x1b[0m world")
  })

  test("hyperlink with cursor movement stripped around it", () => {
    const link = "\x1b]8;;https://example.com\x1b\\click\x1b]8;;\x1b\\"
    const input = "\x1b[H" + link + "\x1b[2J"
    expect(sanitizeAnsi(input)).toBe(link)
  })

  test("multiple dangerous sequences between safe content", () => {
    const input = "\x1b[31mred\x1b7\x1b8\x1b[5A\x1b[3Bmore\x1b[0m"
    expect(sanitizeAnsi(input)).toBe("\x1b[31mredmore\x1b[0m")
  })

  // -------------------------------------------------------------------------
  // Edge cases / malformed
  // -------------------------------------------------------------------------

  test("incomplete escape at end doesn't crash", () => {
    expect(sanitizeAnsi("hello\x1b")).toBe("hello")
  })

  test("consecutive escapes handled", () => {
    expect(sanitizeAnsi("\x1b\x1b\x1b")).toBe("")
  })

  test("only SGR sequences pass through complex mix", () => {
    // Build a string with every sequence type
    const input = [
      "\x1b[31m", // SGR (keep)
      "text", // text (keep)
      "\x1b[2J", // erase display (strip)
      "\x1b[H", // cursor home (strip)
      "\x1b]8;;url\x1b\\", // OSC hyperlink (keep)
      "link", // text (keep)
      "\x1b]8;;\x1b\\", // OSC close (keep)
      "\x1bPdcs\x1b\\", // DCS (strip)
      "\x1b^pm\x1b\\", // PM (strip)
      "\x1b_apc\x1b\\", // APC (strip)
      "\x1bXsos\x1b\\", // SOS (strip)
      "\x1b7", // save cursor (strip)
      "\x1b[0m", // SGR reset (keep)
    ].join("")

    expect(sanitizeAnsi(input)).toBe(
      "\x1b[31m" + "text" + "\x1b]8;;url\x1b\\" + "link" + "\x1b]8;;\x1b\\" + "\x1b[0m",
    )
  })

  test("bare 'm' CSI (ESC[m) is SGR reset — preserved", () => {
    // ESC[m is equivalent to ESC[0m
    expect(sanitizeAnsi("\x1b[m")).toBe("\x1b[m")
  })

  test("scroll region CSI stripped", () => {
    // ESC[1;10r = DECSTBM (set scrolling region)
    expect(sanitizeAnsi("\x1b[1;10r")).toBe("")
  })

  test("mode set/reset CSI stripped", () => {
    // ESC[?25h = show cursor, ESC[?25l = hide cursor
    expect(sanitizeAnsi("\x1b[?25h")).toBe("")
    expect(sanitizeAnsi("\x1b[?25l")).toBe("")
  })
})
