/**
 * ANSI escape sequence sanitizer.
 *
 * Strips dangerous escape sequences from text while preserving safe SGR
 * styling and OSC sequences (hyperlinks, etc.). Used for rendering untrusted
 * text safely in the terminal.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A parsed token from an ANSI-containing string.
 *
 * Token types:
 * - `text` — Plain text content
 * - `csi` — CSI (Control Sequence Introducer): ESC + '[' + params + final byte
 * - `osc` — OSC (Operating System Command): ESC + ']' + payload + ST/BEL
 * - `esc` — Simple two-byte escape: ESC + final byte
 * - `dcs` — DCS (Device Control String): ESC + 'P' + payload + ST
 * - `pm` — PM (Privacy Message): ESC + '^' + payload + ST
 * - `apc` — APC (Application Program Command): ESC + '_' + payload + ST
 * - `sos` — SOS (Start of String): ESC + 'X' + payload + ST
 * - `c1` — C1 control character (0x80–0x9F)
 */
export interface AnsiToken {
  type: "text" | "csi" | "osc" | "esc" | "dcs" | "pm" | "apc" | "sos" | "c1"
  value: string
}

// =============================================================================
// Constants
// =============================================================================

const ESC = 0x1b

/** Characters that introduce ST-terminated string sequences after ESC. */
const STRING_SEQUENCE_INTROS: Record<number, AnsiToken["type"]> = {
  0x50: "dcs", // 'P' — Device Control String
  0x5e: "pm", // '^' — Privacy Message
  0x5f: "apc", // '_' — Application Program Command
  0x58: "sos", // 'X' — Start of String
}

/** C1 control codes (8-bit mode) that correspond to string sequence introducers. */
const C1_STRING_SEQUENCE_MAP: Record<number, AnsiToken["type"]> = {
  0x90: "dcs", // DCS
  0x9e: "pm", // PM
  0x9f: "apc", // APC
  0x98: "sos", // SOS
}

// =============================================================================
// Tokenizer
// =============================================================================

/**
 * Tokenize a string into ANSI escape sequence tokens.
 *
 * Parses the string character by character, identifying escape sequences
 * and plain text segments. Each token includes its type and the raw string
 * value (including escape characters).
 *
 * @param text - Input string that may contain ANSI escape sequences
 * @returns Array of tokens
 */
export function tokenizeAnsi(text: string): AnsiToken[] {
  const tokens: AnsiToken[] = []
  const len = text.length
  let i = 0
  let textStart = i

  function flushText(): void {
    if (i > textStart) {
      tokens.push({ type: "text", value: text.slice(textStart, i) })
    }
  }

  while (i < len) {
    const code = text.charCodeAt(i)

    // Check for C1 control characters (0x80–0x9F) in 8-bit mode
    if (code >= 0x80 && code <= 0x9f) {
      flushText()

      const c1Type = C1_STRING_SEQUENCE_MAP[code]
      if (c1Type) {
        // C1 string sequence introducer — consume until ST
        const start = i
        i++
        i = findST(text, i, len)
        tokens.push({ type: c1Type, value: text.slice(start, i) })
      } else if (code === 0x9b) {
        // CSI in 8-bit mode
        const start = i
        i++
        i = consumeCSI(text, i, len)
        tokens.push({ type: "csi", value: text.slice(start, i) })
      } else if (code === 0x9d) {
        // OSC in 8-bit mode
        const start = i
        i++
        i = findOSCEnd(text, i, len)
        tokens.push({ type: "osc", value: text.slice(start, i) })
      } else {
        // Other C1 control character
        tokens.push({ type: "c1", value: text[i]! })
        i++
      }
      textStart = i
      continue
    }

    // Check for ESC (0x1B)
    if (code === ESC) {
      flushText()

      if (i + 1 >= len) {
        // Incomplete escape at end of string — treat as malformed
        tokens.push({ type: "esc", value: text[i]! })
        i++
        textStart = i
        continue
      }

      const next = text.charCodeAt(i + 1)

      // CSI: ESC + '['
      if (next === 0x5b) {
        const start = i
        i += 2
        i = consumeCSI(text, i, len)
        tokens.push({ type: "csi", value: text.slice(start, i) })
        textStart = i
        continue
      }

      // OSC: ESC + ']'
      if (next === 0x5d) {
        const start = i
        i += 2
        i = findOSCEnd(text, i, len)
        tokens.push({ type: "osc", value: text.slice(start, i) })
        textStart = i
        continue
      }

      // String sequences: DCS (P), PM (^), APC (_), SOS (X)
      const stringType = STRING_SEQUENCE_INTROS[next]
      if (stringType) {
        const start = i
        i += 2
        i = findST(text, i, len)
        tokens.push({ type: stringType, value: text.slice(start, i) })
        textStart = i
        continue
      }

      // ESC sequences with intermediate bytes:
      // ESC I... F where I is 0x20–0x2F (intermediate), F is 0x30–0x7E (final)
      // Examples: ESC # 8 (DECALN), ESC ( B (G0 charset)
      // If no valid final byte follows, consume to end of string (fail-safe
      // to prevent payload leaks from malformed sequences).
      if (next >= 0x20 && next <= 0x2f) {
        const start = i
        i += 2 // skip ESC + first intermediate
        // Consume additional intermediate bytes
        while (i < len) {
          const c = text.charCodeAt(i)
          if (c < 0x20 || c > 0x2f) break
          i++
        }
        // Consume final byte (0x30–0x7E) if present
        if (i < len) {
          const c = text.charCodeAt(i)
          if (c >= 0x30 && c <= 0x7e) {
            i++
            tokens.push({ type: "esc", value: text.slice(start, i) })
          } else {
            // No valid final byte — malformed sequence, consume to end of string
            i = len
            tokens.push({ type: "esc", value: text.slice(start, i) })
          }
        } else {
          // Incomplete (at end of string) — consume what we have
          tokens.push({ type: "esc", value: text.slice(start, i) })
        }
        textStart = i
        continue
      }

      // Simple two-byte escape sequence: ESC + byte (0x30–0x7E)
      // 0x30–0x3F: Fp (private use, e.g. ESC 7 = DECSC, ESC 8 = DECRC)
      // 0x40–0x5F: Fe (C1 equivalents, e.g. ESC D = IND, ESC M = RI)
      // 0x60–0x7E: Fs (independent functions)
      if (next >= 0x30 && next <= 0x7e) {
        tokens.push({ type: "esc", value: text.slice(i, i + 2) })
        i += 2
        textStart = i
        continue
      }

      // Unknown/malformed escape — emit just ESC as an esc token
      tokens.push({ type: "esc", value: text[i]! })
      i++
      textStart = i
      continue
    }

    i++
  }

  flushText()
  return tokens
}

// =============================================================================
// CSI Parser
// =============================================================================

/**
 * Consume a CSI sequence starting after "ESC [" or the C1 CSI byte.
 * Returns the index after the final byte.
 *
 * CSI format: parameter bytes (0x30–0x3F)*, intermediate bytes (0x20–0x2F)*, final byte (0x40–0x7E)
 */
function consumeCSI(text: string, i: number, len: number): number {
  // Parameter bytes: 0x30–0x3F (digits, semicolons, colons, etc.)
  while (i < len) {
    const c = text.charCodeAt(i)
    if (c < 0x30 || c > 0x3f) break
    i++
  }

  // Intermediate bytes: 0x20–0x2F (space, !, ", #, etc.)
  while (i < len) {
    const c = text.charCodeAt(i)
    if (c < 0x20 || c > 0x2f) break
    i++
  }

  // Final byte: 0x40–0x7E
  if (i < len) {
    const c = text.charCodeAt(i)
    if (c >= 0x40 && c <= 0x7e) {
      i++
    }
  }

  return i
}

// =============================================================================
// String Terminator Finder
// =============================================================================

/**
 * Find the String Terminator (ST) for DCS, PM, APC, SOS sequences.
 * ST is ESC + '\\' (0x5C) or C1 ST (0x9C). Returns index after the ST.
 * If no ST found, returns end of string (consuming the malformed sequence).
 */
function findST(text: string, i: number, len: number): number {
  while (i < len) {
    const code = text.charCodeAt(i)
    // C1 ST (0x9C)
    if (code === 0x9c) {
      return i + 1
    }
    // ESC + '\' (7-bit ST)
    if (code === ESC && i + 1 < len && text.charCodeAt(i + 1) === 0x5c) {
      return i + 2 // past ESC + '\'
    }
    i++
  }
  return len
}

/**
 * Find the end of an OSC sequence.
 * OSC is terminated by ST (ESC + '\\'), C1 ST (0x9C), or BEL (0x07).
 * Returns index after the terminator.
 */
function findOSCEnd(text: string, i: number, len: number): number {
  while (i < len) {
    const code = text.charCodeAt(i)
    // BEL terminator
    if (code === 0x07) {
      return i + 1
    }
    // C1 ST (0x9C)
    if (code === 0x9c) {
      return i + 1
    }
    // ST terminator (ESC + '\')
    if (code === ESC && i + 1 < len && text.charCodeAt(i + 1) === 0x5c) {
      return i + 2
    }
    i++
  }
  return len
}

// =============================================================================
// Sanitizer
// =============================================================================

/**
 * Check whether a CSI sequence is an SGR (Select Graphic Rendition) sequence.
 *
 * SGR sequences set text styling (colors, bold, underline, etc.) and are safe.
 * They have the form: CSI <params> m
 *
 * A CSI is SGR when:
 * - The final byte is 'm'
 * - There are no intermediate bytes (0x20–0x2F)
 * - Parameter bytes are only 0x30–0x3F
 */
export function isCSISGR(value: string): boolean {
  // Must end with 'm'
  if (value.length < 2 || value.charCodeAt(value.length - 1) !== 0x6d) {
    return false
  }

  // Find start of parameters (skip ESC[ or C1 CSI)
  let start: number
  if (value.charCodeAt(0) === ESC) {
    // ESC [ ... m
    start = 2
  } else {
    // C1 CSI (0x9B) ... m
    start = 1
  }

  // Everything between start and the final 'm' must be standard parameter bytes:
  // digits (0x30–0x39), semicolons (0x3B), colons (0x3A).
  // Private-use parameter prefixes (<, =, >, ? at 0x3C–0x3F) indicate non-SGR.
  // Intermediate bytes (0x20–0x2F) also indicate non-SGR.
  for (let i = start; i < value.length - 1; i++) {
    const c = value.charCodeAt(i)
    // Allow: digits 0-9 (0x30-0x39), colon (0x3A), semicolon (0x3B)
    // Reject: < = > ? (0x3C-0x3F) — private-use parameter prefixes
    // Reject: anything outside 0x30-0x3B (intermediates, etc.)
    if (c < 0x30 || c > 0x3b) {
      return false
    }
  }

  return true
}

/**
 * Sanitize a string by stripping dangerous ANSI escape sequences while
 * preserving safe SGR styling codes and OSC sequences (hyperlinks, etc.).
 *
 * Safe (preserved):
 * - Plain text
 * - CSI SGR sequences (colors, bold, underline — final byte 'm', no intermediates)
 * - OSC sequences (hyperlinks, window titles, etc.)
 *
 * Stripped:
 * - Non-SGR CSI sequences (cursor movement, screen clearing, etc.)
 * - DCS (Device Control String)
 * - PM (Privacy Message)
 * - APC (Application Program Command)
 * - SOS (Start of String)
 * - C1 control characters (0x80–0x9F)
 * - Simple ESC sequences (cursor save/restore, etc.)
 * - Malformed/incomplete escape sequences
 *
 * @param text - Input string that may contain ANSI escape sequences
 * @returns Sanitized string with only safe sequences preserved
 *
 * @example
 * ```ts
 * // SGR preserved
 * sanitizeAnsi('\x1b[31mred\x1b[0m') // '\x1b[31mred\x1b[0m'
 *
 * // Cursor movement stripped
 * sanitizeAnsi('\x1b[2J\x1b[H') // ''
 *
 * // Mixed: only SGR kept
 * sanitizeAnsi('\x1b[31m\x1b[2Jred\x1b[0m') // '\x1b[31mred\x1b[0m'
 * ```
 */
export function sanitizeAnsi(text: string): string {
  if (text.length === 0) return ""

  const tokens = tokenizeAnsi(text)
  let result = ""

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        result += token.value
        break
      case "csi":
        // Only keep SGR sequences (color/style codes)
        if (isCSISGR(token.value)) {
          result += token.value
        }
        break
      case "osc":
        // OSC sequences are safe (hyperlinks, titles, etc.)
        result += token.value
        break
      // Strip everything else: esc, dcs, pm, apc, sos, c1
    }
  }

  return result
}

// =============================================================================
// Colon-format SGR round-trip tracking
// =============================================================================

/**
 * A colon→semicolon SGR replacement pair.
 */
export interface ColonSGRReplacement {
  semicolonForm: string
  colonForm: string
}

/**
 * Detect colon-format SGR sequences in an SGR token and return replacement pairs.
 *
 * Terminals use colon-separated parameters (e.g., `38:2::255:100:0`) for true color,
 * but silvery's pipeline normalizes to semicolons (`38;2;255;100;0`). This function
 * extracts the mapping so the original colon format can be restored after rendering.
 *
 * @param sgrSequence - A CSI SGR sequence (must end with 'm')
 * @returns Array of replacement pairs, empty if no colon-format params found
 */
export function extractColonSGRReplacements(sgrSequence: string): ColonSGRReplacement[] {
  const paramsMatch = sgrSequence.match(/\x1b\[([0-9;:]+)m/)
  if (!paramsMatch) return []

  const rawParams = paramsMatch[1]!
  if (!rawParams.includes(":")) return []

  const replacements: ColonSGRReplacement[] = []
  const parts = rawParams.split(";")
  for (const part of parts) {
    if (!part.includes(":")) continue
    const subs = part.split(":")
    const code = Number(subs[0])
    if ((code === 38 || code === 48) && Number(subs[1]) === 2) {
      // True color colon format: code:2::R:G:B or code:2:R:G:B
      // Extract R, G, B (skip empty colorspace ID)
      const nums = subs.map((s) => (s === "" ? 0 : Number(s)))
      const r = nums[3] ?? nums[2] ?? 0
      const g = nums[4] ?? nums[3] ?? 0
      const b = nums[5] ?? nums[4] ?? 0
      const semicolonForm = `\x1b[${code};2;${r};${g};${b}m`
      replacements.push({ semicolonForm, colonForm: `\x1b[${part}m` })
    }
  }
  return replacements
}

/**
 * Create a colon-format SGR tracker for round-trip preservation.
 *
 * Rendering is synchronous: sanitize → render → output in one call. The tracker
 * accumulates colon→semicolon mappings during sanitization, then `restore()` applies
 * them to the rendered output.
 *
 * @example
 * ```ts
 * const tracker = createColonSGRTracker()
 * // During sanitization, register SGR tokens:
 * tracker.register(sgrToken)
 * // After rendering, restore original colon format:
 * output = tracker.restore(output)
 * // Optionally clear for reuse:
 * tracker.clear()
 * ```
 */
export function createColonSGRTracker(): {
  register: (sgrSequence: string) => void
  restore: (output: string) => string
  clear: () => void
} {
  const replacements: ColonSGRReplacement[] = []

  return {
    register(sgrSequence: string): void {
      const found = extractColonSGRReplacements(sgrSequence)
      for (const r of found) replacements.push(r)
    },

    restore(output: string): string {
      if (replacements.length === 0) return output
      let result = output
      for (const { semicolonForm, colonForm } of replacements) {
        result = result.replaceAll(semicolonForm, colonForm)
      }
      return result
    },

    clear(): void {
      replacements.length = 0
    },
  }
}
