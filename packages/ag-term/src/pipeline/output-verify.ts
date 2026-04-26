/**
 * STRICT/Verification code extracted from output-phase.ts.
 *
 * Contains: replayAnsiWithStyles (vt100 backend), captureStrictFailureArtifacts,
 * verifyOutputEquivalence, verifyAccumulatedOutput, verifyTerminalEquivalence,
 * compareTerminals, and all supporting types/helpers.
 *
 * These functions are only called when SILVERY_STRICT, SILVERY_STRICT_ACCUMULATE,
 * or SILVERY_STRICT_TERMINAL are enabled. Production builds can tree-shake this
 * entire module.
 */

import type { TerminalBuffer } from "../buffer"
import { IncrementalRenderMismatchError } from "../errors"
import { graphemeWidth } from "../unicode"
import { createLogger } from "loggily"
import type { OutputContext } from "./output-phase"

const log = createLogger("silvery:output")

const _env =
  typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>)
const DEBUG_OUTPUT = !!_env.SILVERY_DEBUG_OUTPUT

// ============================================================================
// Types for avoiding circular dependencies
// ============================================================================

/** Function signature for bufferToAnsi — passed from output-phase to avoid circular import. */
export type BufferToAnsiFn = (
  buffer: TerminalBuffer,
  ctx: OutputContext,
  maxRows?: number,
) => string

/** Function signature for outputGraphemeWidth. */
export type OutputGraphemeWidthFn = (g: string, ctx: OutputContext) => number

/** Function signature for outputTextSizingEnabled. */
export type OutputTextSizingEnabledFn = (ctx: OutputContext) => boolean

/** Per-instance state for SILVERY_STRICT_ACCUMULATE verification. */
export interface AccumulateState {
  accumulatedAnsi: string
  accumulateWidth: number
  accumulateHeight: number
  accumulateFrameCount: number
}

/** Per-instance state for SILVERY_STRICT_TERMINAL verification.
 *  Holds persistent terminal(s) that accumulate incremental ANSI output
 *  across frames, enabling comparison against a fresh render in an independent emulator. */
export interface TerminalVerifyState {
  /** The persistent xterm.js terminal accumulating incremental output */
  terminal: import("@termless/core").Terminal | null
  /** Optional persistent Ghostty terminal for cross-backend verification */
  ghosttyTerminal: import("@termless/core").Terminal | null
  /** Width of the terminal */
  width: number
  /** Height of the terminal */
  height: number
  /** Frame count for diagnostics */
  frameCount: number
  /** Which emulator backends to verify (xterm, ghostty — vt100 handled separately) */
  backends: Array<"xterm" | "ghostty">
  /** Whether the vt100 (replayAnsiWithStyles) backend is enabled */
  hasVt100: boolean
}

// ============================================================================
// Strict environment helpers
// ============================================================================

/** Parse SILVERY_STRICT_TERMINAL into a list of backends.
 *
 * Accepts `all` (= `vt100,xterm,ghostty`) or a comma-separated list of
 * backend names (e.g., `vt100,xterm`).
 *
 * The `vt100` backend uses the internal `replayAnsiWithStyles` parser (stateless).
 * `xterm` and `ghostty` use persistent terminal emulators (stateful).
 */
export function strictTerminalBackends(): Array<"vt100" | "xterm" | "ghostty"> {
  const val = (typeof process !== "undefined" ? (process.env.SILVERY_STRICT_TERMINAL ?? "") : "")
    .toLowerCase()
    .trim()
  if (!val) return []
  if (val === "all") return ["vt100", "xterm", "ghostty"]
  // Comma-separated list
  const backends = val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const valid = new Set(["vt100", "xterm", "ghostty"])
  for (const b of backends) {
    if (!valid.has(b)) {
      log.warn?.(`SILVERY_STRICT_TERMINAL: unknown backend '${b}', ignoring`)
    }
  }
  return backends.filter((b) => valid.has(b)) as Array<"vt100" | "xterm" | "ghostty">
}

/** Create fresh terminal verify state. */
export function createTerminalVerifyState(): TerminalVerifyState {
  const allBackends = strictTerminalBackends()
  return {
    terminal: null,
    ghosttyTerminal: null,
    width: 0,
    height: 0,
    frameCount: 0,
    backends: allBackends.filter((b) => b !== "vt100") as Array<"xterm" | "ghostty">,
    hasVt100: allBackends.includes("vt100"),
  }
}

// ============================================================================
// Style-Aware ANSI Replay
// ============================================================================

/** SGR state tracked during ANSI replay. */
interface SgrState {
  fg: number | { r: number; g: number; b: number } | null
  bg: number | { r: number; g: number; b: number } | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  blink: boolean
  inverse: boolean
  hidden: boolean
  strikethrough: boolean
}

/** A cell in the style-aware virtual terminal. */
export interface StyledCell {
  char: string
  fg: number | { r: number; g: number; b: number } | null
  bg: number | { r: number; g: number; b: number } | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  blink: boolean
  inverse: boolean
  hidden: boolean
  strikethrough: boolean
}

function createDefaultSgr(): SgrState {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
  }
}

function createDefaultStyledCell(): StyledCell {
  return {
    char: " ",
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
  }
}

/**
 * Apply SGR parameters to the current state.
 * Handles all SGR codes used by styleTransition().
 */
function applySgrParams(params: string, sgr: SgrState): void {
  if (params === "" || params === "0") {
    // Reset
    sgr.fg = null
    sgr.bg = null
    sgr.bold = false
    sgr.dim = false
    sgr.italic = false
    sgr.underline = false
    sgr.blink = false
    sgr.inverse = false
    sgr.hidden = false
    sgr.strikethrough = false
    return
  }

  const parts = params.split(";")
  let i = 0
  while (i < parts.length) {
    const code = parts[i]!
    // Handle subparameters (e.g., "4:3" for curly underline)
    const colonIdx = code.indexOf(":")
    if (colonIdx >= 0) {
      const mainCode = parseInt(code.substring(0, colonIdx))
      if (mainCode === 4) {
        // Underline style subparameter
        const sub = parseInt(code.substring(colonIdx + 1))
        sgr.underline = sub > 0
      }
      // 58:5:N or 58:2:r:g:b — underline color, skip (we don't track underline color in styled cells)
      i++
      continue
    }

    const n = parseInt(code)
    if (n === 0) {
      sgr.fg = null
      sgr.bg = null
      sgr.bold = false
      sgr.dim = false
      sgr.italic = false
      sgr.underline = false
      sgr.blink = false
      sgr.inverse = false
      sgr.hidden = false
      sgr.strikethrough = false
    } else if (n === 1) {
      sgr.bold = true
    } else if (n === 2) {
      sgr.dim = true
    } else if (n === 3) {
      sgr.italic = true
    } else if (n === 4) {
      sgr.underline = true
    } else if (n === 5 || n === 6) {
      sgr.blink = true
    } else if (n === 7) {
      sgr.inverse = true
    } else if (n === 8) {
      sgr.hidden = true
    } else if (n === 9) {
      sgr.strikethrough = true
    } else if (n === 21) {
      // Double underline — we simplify to underline=true
      sgr.underline = true
    } else if (n === 22) {
      sgr.bold = false
      sgr.dim = false
    } else if (n === 23) {
      sgr.italic = false
    } else if (n === 24) {
      sgr.underline = false
    } else if (n === 25) {
      sgr.blink = false
    } else if (n === 27) {
      sgr.inverse = false
    } else if (n === 28) {
      sgr.hidden = false
    } else if (n === 29) {
      sgr.strikethrough = false
    } else if (n >= 30 && n <= 37) {
      sgr.fg = n - 30
    } else if (n === 38) {
      // Extended fg color
      if (parts[i + 1] === "5") {
        sgr.fg = parseInt(parts[i + 2]!)
        i += 2
      } else if (parts[i + 1] === "2") {
        sgr.fg = {
          r: parseInt(parts[i + 2]!),
          g: parseInt(parts[i + 3]!),
          b: parseInt(parts[i + 4]!),
        }
        i += 4
      }
    } else if (n === 39) {
      sgr.fg = null
    } else if (n >= 40 && n <= 47) {
      sgr.bg = n - 40
    } else if (n === 48) {
      // Extended bg color
      if (parts[i + 1] === "5") {
        sgr.bg = parseInt(parts[i + 2]!)
        i += 2
      } else if (parts[i + 1] === "2") {
        sgr.bg = {
          r: parseInt(parts[i + 2]!),
          g: parseInt(parts[i + 3]!),
          b: parseInt(parts[i + 4]!),
        }
        i += 4
      }
    } else if (n === 49) {
      sgr.bg = null
    } else if (n === 58) {
      // Underline color — semicolon-form (legacy): "58;5;N" (256-color) or
      // "58;2;r;g;b" (RGB). The colon-form ("58:5:N", "58:2:r:g:b") is handled
      // by the colon-detection branch above. We don't track underline color in
      // styled cells, but we MUST consume the sub-parameters here — otherwise
      // the next param ("2" or "5") will be re-interpreted as standalone SGR
      // 2 (dim) or 5 (blink), corrupting the cell style. The bug surfaced as
      // STRICT_OUTPUT mismatches with `dim: true vs false` at border cells
      // following links/tag refs that emit `58;2;r;g;b` underline color.
      if (parts[i + 1] === "5") {
        i += 2
      } else if (parts[i + 1] === "2") {
        i += 4
      }
    } else if (n === 59) {
      // Default underline color — no sub-params, nothing to track.
    } else if (n >= 90 && n <= 97) {
      // Bright fg
      sgr.fg = n - 90 + 8
    } else if (n >= 100 && n <= 107) {
      // Bright bg
      sgr.bg = n - 100 + 8
    }
    i++
  }
}

/**
 * Replay ANSI output into a virtual terminal grid with style tracking.
 *
 * Returns a 2D array [y][x] of StyledCells. This replays the same ANSI
 * escape sequences that outputPhase() produces (CUP, SGR, EL, text) and
 * tracks the resulting character + style at each position.
 *
 * Used by SILVERY_STRICT_OUTPUT to verify that incremental output produces
 * the same visual + style result as a fresh full render.
 *
 * @deprecated Use `SILVERY_STRICT_TERMINAL=vt100` instead. This function is now
 * the internal implementation of the `vt100` backend for STRICT_TERMINAL verification.
 * Direct usage is discouraged — prefer the unified STRICT_TERMINAL env var interface.
 *
 * Public-export removal tracked: km-silvery.unexport-replay-ansi-with-styles
 * (function remains internal to output-verify.ts; only the public re-export is removed)
 */
export function replayAnsiWithStyles(
  width: number,
  height: number,
  ansi: string,
  ctx: OutputContext = _defaultCtxForReplay,
): StyledCell[][] {
  const screen: StyledCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => createDefaultStyledCell()),
  )
  let cx = 0
  let cy = 0
  let pendingWrap = false // VT100 pending wrap flag
  const sgr = createDefaultSgr()
  let i = 0

  while (i < ansi.length) {
    if (ansi[i] === "\x1b") {
      if (ansi[i + 1] === "[") {
        i += 2
        let params = ""
        while (
          i < ansi.length &&
          ((ansi[i]! >= "0" && ansi[i]! <= "9") ||
            ansi[i] === ";" ||
            ansi[i] === "?" ||
            ansi[i] === ":")
        ) {
          params += ansi[i]
          i++
        }
        const cmd = ansi[i]
        i++
        if (cmd === "H") {
          // CUP clears pending wrap
          pendingWrap = false
          if (params === "") {
            cx = 0
            cy = 0
          } else {
            const cmdParts = params.split(";")
            // Clamp to screen bounds (real terminals clamp CUP to valid range)
            cy = Math.min(height - 1, Math.max(0, (parseInt(cmdParts[0]!) || 1) - 1))
            cx = Math.min(width - 1, Math.max(0, (parseInt(cmdParts[1]!) || 1) - 1))
          }
        } else if (cmd === "K") {
          // Erase to end of line — fills with current bg (or default)
          if (cy >= height) continue // out of bounds — skip
          for (let x = cx; x < width; x++) {
            const cell = screen[cy]![x]!
            cell.char = " "
            cell.fg = null
            cell.bg = sgr.bg
            cell.bold = false
            cell.dim = false
            cell.italic = false
            cell.underline = false
            cell.blink = false
            cell.inverse = false
            cell.hidden = false
            cell.strikethrough = false
          }
        } else if (cmd === "J") {
          // Erase from cursor to end of screen
          // Clear from cursor to end of current line
          if (cy < height) {
            for (let x = cx; x < width; x++) {
              const cell = screen[cy]![x]!
              cell.char = " "
              cell.fg = null
              cell.bg = sgr.bg
              cell.bold = false
              cell.dim = false
              cell.italic = false
              cell.underline = false
              cell.blink = false
              cell.inverse = false
              cell.hidden = false
              cell.strikethrough = false
            }
          }
          // Clear all subsequent lines
          for (let y = cy + 1; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const cell = screen[y]![x]!
              cell.char = " "
              cell.fg = null
              cell.bg = sgr.bg
              cell.bold = false
              cell.dim = false
              cell.italic = false
              cell.underline = false
              cell.blink = false
              cell.inverse = false
              cell.hidden = false
              cell.strikethrough = false
            }
          }
        } else if (cmd === "m") {
          applySgrParams(params, sgr)
        } else if (cmd === "C") {
          // Cursor forward — clears pending wrap
          pendingWrap = false
          const n = parseInt(params) || 1
          cx = Math.min(width - 1, cx + n)
        } else if (cmd === "A") {
          // Cursor up — clears pending wrap
          pendingWrap = false
          const n = parseInt(params) || 1
          cy = Math.max(0, cy - n)
        } else if (cmd === "B") {
          // Cursor down — clears pending wrap
          pendingWrap = false
          const n = parseInt(params) || 1
          cy = Math.min(height - 1, cy + n)
        } else if (cmd === "l" || cmd === "h") {
          // Private mode set/reset (e.g., ?25l = hide cursor, ?25h = show cursor)
          // Skip — we don't model cursor visibility
        }
        continue
      } else if (ansi[i + 1] === "]") {
        // OSC sequence — skip until ST (BEL or ESC\\)
        i += 2
        while (i < ansi.length) {
          if (ansi[i] === "\x07") {
            i++
            break
          }
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
            i += 2
            break
          }
          i++
        }
        continue
      }
      // Unknown escape — skip the ESC and next char
      i += 2
      continue
    }

    if (ansi[i] === "\r") {
      // CR clears pending wrap, moves to column 0
      pendingWrap = false
      cx = 0
      i++
      continue
    }

    if (ansi[i] === "\n") {
      // LF clears pending wrap and moves down one row
      pendingWrap = false
      cy++
      if (cy >= height) {
        // Scroll: shift all rows up by 1
        const first = screen.shift()!
        // Reset the row being recycled
        for (const cell of first) {
          cell.char = " "
          cell.fg = null
          cell.bg = null
          cell.bold = false
          cell.dim = false
          cell.italic = false
          cell.underline = false
          cell.blink = false
          cell.inverse = false
          cell.hidden = false
          cell.strikethrough = false
        }
        screen.push(first)
        cy = height - 1
      }
      i++
      continue
    }

    // Regular character — collect full grapheme cluster.
    //
    // A grapheme cluster may span multiple UTF-16 code units:
    // - Surrogate pairs for astral codepoints (e.g., emoji U+1F600)
    // - ZWJ sequences (e.g., 🏃‍♂️ = U+1F3C3 U+200D U+2642 U+FE0F)
    // - Variation selectors (U+FE0E text, U+FE0F emoji presentation)
    // - Combining marks, skin tone modifiers, regional indicators
    //
    // Strategy: extract the first codepoint (handling surrogates), then
    // greedily absorb subsequent zero-width joiners, variation selectors,
    // combining marks, and their targets into a single grapheme string.
    // This matches terminal behavior where the entire cluster occupies
    // the column count of the base character.
    let grapheme = ""
    let advance = 0

    // Extract the initial codepoint
    const code0 = ansi.charCodeAt(i)
    if (code0 >= 0xd800 && code0 <= 0xdbff && i + 1 < ansi.length) {
      const low = ansi.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        grapheme = ansi[i]! + ansi[i + 1]!
        advance = 2
      } else {
        grapheme = ansi[i]!
        advance = 1
      }
    } else {
      grapheme = ansi[i]!
      advance = 1
    }

    // Absorb combining/extending codepoints that follow:
    // ZWJ (U+200D), variation selectors (U+FE0E-FE0F), combining marks
    // (U+0300-036F, U+20D0-20FF, U+1AB0-1AFF, U+FE20-FE2F), skin tone
    // modifiers (U+1F3FB-1F3FF), regional indicators (U+1F1E6-1F1FF),
    // enclosing keycap (U+20E3), and tag sequences (U+E0020-E007F).
    {
      let j = i + advance
      while (j < ansi.length) {
        const c = ansi.charCodeAt(j)
        // Decode the codepoint at j (handle surrogates)
        let cp: number
        let cpLen: number
        if (c >= 0xd800 && c <= 0xdbff && j + 1 < ansi.length) {
          const lo = ansi.charCodeAt(j + 1)
          if (lo >= 0xdc00 && lo <= 0xdfff) {
            cp = ((c - 0xd800) << 10) + (lo - 0xdc00) + 0x10000
            cpLen = 2
          } else {
            break
          }
        } else {
          cp = c
          cpLen = 1
        }

        if (
          cp === 0x200d || // ZWJ
          cp === 0xfe0e ||
          cp === 0xfe0f || // Variation selectors
          (cp >= 0x0300 && cp <= 0x036f) || // Combining diacritical marks
          (cp >= 0x20d0 && cp <= 0x20ff) || // Combining marks for symbols
          (cp >= 0x1ab0 && cp <= 0x1aff) || // Combining diacritical extended
          (cp >= 0xfe20 && cp <= 0xfe2f) || // Combining half marks
          cp === 0x20e3 || // Combining enclosing keycap
          (cp >= 0x1f3fb && cp <= 0x1f3ff) || // Skin tone modifiers
          (cp >= 0x1f1e6 && cp <= 0x1f1ff) || // Regional indicator symbols
          (cp >= 0xe0020 && cp <= 0xe007f) || // Tags
          cp === 0xe0001 // Language tag begin
        ) {
          grapheme += ansi.slice(j, j + cpLen)
          advance += cpLen
          j += cpLen
          continue
        }

        // After ZWJ, absorb the next codepoint (the ZWJ target)
        const prevCp =
          grapheme.length >= 2
            ? grapheme.charCodeAt(grapheme.length - 2) === 0x200d
              ? 0x200d
              : grapheme.charCodeAt(grapheme.length - 1)
            : grapheme.charCodeAt(grapheme.length - 1)
        if (prevCp === 0x200d && cp > 0x20) {
          // ZWJ target: absorb any codepoint after ZWJ
          grapheme += ansi.slice(j, j + cpLen)
          advance += cpLen
          j += cpLen
          continue
        }

        break
      }
    }

    const charWidth = graphemeWidth(grapheme)

    if (cy < height && cx < width) {
      // Resolve pending wrap before writing
      if (pendingWrap) {
        pendingWrap = false
        cx = 0
        cy++
        if (cy >= height) {
          // Scroll: shift all rows up by 1
          const first = screen.shift()!
          for (const cell of first) {
            cell.char = " "
            cell.fg = null
            cell.bg = null
            cell.bold = false
            cell.dim = false
            cell.italic = false
            cell.underline = false
            cell.blink = false
            cell.inverse = false
            cell.hidden = false
            cell.strikethrough = false
          }
          screen.push(first)
          cy = height - 1
        }
      }
      if (cy < height && cx < width) {
        const cell = screen[cy]![cx]!
        cell.char = grapheme
        cell.fg = sgr.fg
        cell.bg = sgr.bg
        cell.bold = sgr.bold
        cell.dim = sgr.dim
        cell.italic = sgr.italic
        cell.underline = sgr.underline
        cell.blink = sgr.blink
        cell.inverse = sgr.inverse
        cell.hidden = sgr.hidden
        cell.strikethrough = sgr.strikethrough

        // Wide character: clear the continuation cell at cx+1 (terminals
        // implicitly overwrite the second column when writing a wide char)
        if (charWidth === 2 && cx + 1 < width) {
          const cont = screen[cy]![cx + 1]!
          cont.char = " "
          cont.fg = sgr.fg
          cont.bg = sgr.bg
          cont.bold = sgr.bold
          cont.dim = sgr.dim
          cont.italic = sgr.italic
          cont.underline = sgr.underline
          cont.blink = sgr.blink
          cont.inverse = sgr.inverse
          cont.hidden = sgr.hidden
          cont.strikethrough = sgr.strikethrough
        }

        cx += charWidth
        if (cx >= width) {
          // Enter pending wrap state — cursor stays at last column
          cx = width - 1
          pendingWrap = true
        }
      }
    }
    i += advance
  }
  return screen
}

// Default context for replayAnsiWithStyles when called without ctx (by tests).
const _defaultCtxForReplay: OutputContext = {
  caps: {
    // Full per-style support — tests render at truecolor with all styles
    // available. Narrower caps are exercised via createOutputPhase({...}).
    underlineStyles: ["single", "double", "curly", "dotted", "dashed"],
    underlineColor: true,
    overline: true,
    colorLevel: "truecolor",
  },
  measurer: null,
  sgrCache: new Map(),
  transitionCache: new Map(),
  mode: "fullscreen",
  termRows: undefined,
}

/** Format a color value for display. */
export function formatColor(c: number | { r: number; g: number; b: number } | null): string {
  if (c === null) return "default"
  if (typeof c === "number") return `${c}`
  return `rgb(${c.r},${c.g},${c.b})`
}

// =============================================================================
// STRICT failure artifact capture
// =============================================================================

/**
 * Capture debug artifacts to disk when a STRICT verification fails.
 * Saves prev/next buffer snapshots, ANSI sequences, terminal size, and test context
 * to /tmp/silvery-strict-failure-<timestamp>/.
 *
 * Returns the artifact directory path (included in the error message).
 */
export function captureStrictFailureArtifacts(opts: {
  source: string
  errorMessage: string
  prev?: TerminalBuffer | null
  next?: TerminalBuffer | null
  incrOutput?: string
  freshOutput?: string
  ctx?: OutputContext
  frameCount?: number
  /** Optional bufferToAnsi function for generating fresh-prev.ansi. */
  renderFull?: BufferToAnsiFn
}): string {
  try {
    const fs = require("fs")
    const path = require("path")
    const timestamp = Date.now()
    const dir = `/tmp/silvery-strict-failure-${timestamp}`
    fs.mkdirSync(dir, { recursive: true })

    // Metadata
    const meta: Record<string, unknown> = {
      source: opts.source,
      timestamp: new Date().toISOString(),
      frameCount: opts.frameCount,
      prevSize: opts.prev ? { width: opts.prev.width, height: opts.prev.height } : null,
      nextSize: opts.next ? { width: opts.next.width, height: opts.next.height } : null,
      incrOutputLength: opts.incrOutput?.length,
      freshOutputLength: opts.freshOutput?.length,
      testName: (globalThis as any).__vitest_worker__?.current?.name as string | undefined,
    }
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2))

    // Error message
    fs.writeFileSync(path.join(dir, "error.txt"), opts.errorMessage)

    // ANSI sequences
    if (opts.incrOutput) {
      fs.writeFileSync(path.join(dir, "incremental.ansi"), opts.incrOutput)
    }
    if (opts.freshOutput) {
      fs.writeFileSync(path.join(dir, "fresh.ansi"), opts.freshOutput)
    }

    // Buffer snapshots (text representation)
    if (opts.prev) {
      const rows: string[] = []
      for (let y = 0; y < opts.prev.height; y++) {
        let row = ""
        for (let x = 0; x < opts.prev.width; x++) {
          const cell = opts.prev.getCell(x, y)
          row += cell.char || " "
        }
        rows.push(row.trimEnd())
      }
      fs.writeFileSync(path.join(dir, "prev-buffer.txt"), rows.join("\n"))
    }

    if (opts.next) {
      const rows: string[] = []
      for (let y = 0; y < opts.next.height; y++) {
        let row = ""
        for (let x = 0; x < opts.next.width; x++) {
          const cell = opts.next.getCell(x, y)
          row += cell.char || " "
        }
        rows.push(row.trimEnd())
      }
      fs.writeFileSync(path.join(dir, "next-buffer.txt"), rows.join("\n"))
    }

    // Fresh prev ANSI (for replay)
    if (opts.prev && opts.ctx && opts.renderFull) {
      const freshPrev = opts.renderFull(opts.prev, opts.ctx)
      fs.writeFileSync(path.join(dir, "fresh-prev.ansi"), freshPrev)
    }

    return dir
  } catch {
    return "(artifact capture failed)"
  }
}

// =============================================================================
// Output Equivalence Verification (vt100 backend)
// =============================================================================

/**
 * Verify that applying changesToAnsi output to a previous terminal state
 * produces the same visible characters AND styles as a fresh render of the
 * next buffer. Throws on mismatch.
 *
 * @param prev Previous terminal buffer
 * @param next Next terminal buffer
 * @param incrOutput Incremental ANSI output from changesToAnsi
 * @param ctx Output context
 * @param renderFull Function to convert a buffer to full ANSI output
 * @param graphemeWidthFn Function to get grapheme width
 * @param textSizingEnabledFn Function to check if text sizing is enabled
 */
export function verifyOutputEquivalence(
  prev: TerminalBuffer,
  next: TerminalBuffer,
  incrOutput: string,
  ctx: OutputContext,
  renderFull: BufferToAnsiFn,
  graphemeWidthFn: OutputGraphemeWidthFn,
  textSizingEnabledFn: OutputTextSizingEnabledFn,
): void {
  const w = Math.max(prev.width, next.width)
  // VT height must accommodate the larger buffer to prevent scrolling artifacts
  // when prev is taller than next (e.g., items removed from a scrollback list).
  // We only compare up to next.height rows — excess rows should be cleared.
  const vtHeight = Math.max(prev.height, next.height)
  // DEBUG: log buffer dimensions
  if (DEBUG_OUTPUT) {
    log.error?.(
      `[VERIFY] prev=${prev.width}x${prev.height} next=${next.width}x${next.height} vtSize=${w}x${vtHeight}`,
    )
  }
  // Replay: fresh prev render + incremental diff applied on top
  const freshPrev = renderFull(prev, ctx)
  if (DEBUG_OUTPUT) {
    log.error?.(`[VERIFY] freshPrev len=${freshPrev.length} incrOutput len=${incrOutput.length}`)
    // Show incrOutput as escaped string
    const escaped = incrOutput.replace(/\x1b/g, "\\e").replace(/\r/g, "\\r").replace(/\n/g, "\\n")
    log.error?.(`[VERIFY] incrOutput: ${escaped.slice(0, 500)}`)
  }
  const screenIncr = replayAnsiWithStyles(w, vtHeight, freshPrev + incrOutput, ctx)
  // Replay: fresh render of next buffer
  const freshNext = renderFull(next, ctx)
  const screenFresh = replayAnsiWithStyles(w, vtHeight, freshNext, ctx)

  const _dumpRowWideCells = (buf: TerminalBuffer, row: number): string => {
    const parts: string[] = []
    for (let cx = 0; cx < buf.width; cx++) {
      const c = buf.getCell(cx, row)
      const cp = c.char
        ? [...c.char]
            .map(
              (ch) => "U+" + (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"),
            )
            .join(",")
        : "empty"
      if (c.wide) parts.push(`W@${cx}:${cp}(gw=${graphemeWidthFn(c.char, ctx)})`)
      if (c.continuation) parts.push(`C@${cx}`)
      // Flag cells where written char width differs from buffer expectation
      const charToWrite = c.char || " "
      const vtWidth = graphemeWidthFn(charToWrite, ctx)
      const bufWidth = c.wide ? 2 : 1
      if (!c.continuation && vtWidth !== bufWidth) {
        parts.push(
          `MISMATCH@${cx}:${cp}(vtW=${vtWidth},bufW=${bufWidth},tse=${textSizingEnabledFn(ctx)})`,
        )
      }
    }
    return parts.join(" ")
  }

  // Compare character by character AND style by style.
  // Use vtHeight (not compareHeight) to catch stale rows after height shrink.
  // When prev.height > next.height, stale rows beyond next.height must be
  // verified as cleared — otherwise incremental output silently diverges.
  for (let y = 0; y < vtHeight; y++) {
    for (let x = 0; x < w; x++) {
      const incr = screenIncr[y]![x]!
      const fresh = screenFresh[y]![x]!

      // Check character
      if (incr.char !== fresh.char) {
        // Build context: show the row from both renders
        const incrRow = screenIncr[y]!.map((c) => c.char).join("")
        const freshRow = screenFresh[y]!.map((c) => c.char).join("")
        // Also show the prev buffer row for diagnosis
        const prevRow = screenIncr[y]!.map((_, cx) => {
          const prevCell = prev.getCell(cx, y)
          return prevCell.char
        }).join("")
        // Show what changesToAnsi tried to write at this position
        const nextCell = next.getCell(x, y)
        const prevCell = prev.getCell(x, y)
        // Show detailed column-by-column comparison around the mismatch
        const contextStart = Math.max(0, x - 5)
        const contextEnd = Math.min(w, x + 10)
        const colDetails: string[] = []
        for (let cx = contextStart; cx < contextEnd; cx++) {
          const ic = screenIncr[y]![cx]!
          const fc = screenFresh[y]![cx]!
          const pc = prev.getCell(cx, y)
          const nc = next.getCell(cx, y)
          const marker = cx === x ? " <<<" : ic.char !== fc.char ? " !!!" : ""
          colDetails.push(
            `  col ${cx}: prev='${pc.char}'(w=${pc.wide},c=${pc.continuation}) next='${nc.char}' incr='${ic.char}' fresh='${fc.char}' wide=${nc.wide} cont=${nc.continuation}${marker}`,
          )
        }
        const msg =
          `STRICT_OUTPUT char mismatch at (${x},${y}): ` +
          `incremental='${incr.char}' fresh='${fresh.char}'\n` +
          `  prev buffer cell: char='${prevCell.char}' bg=${prevCell.bg} wide=${prevCell.wide} cont=${prevCell.continuation}\n` +
          `  next buffer cell: char='${nextCell.char}' bg=${nextCell.bg} wide=${nextCell.wide} cont=${nextCell.continuation}\n` +
          `  incr row: ${incrRow}\n` +
          `  fresh row: ${freshRow}\n` +
          `  prev row: ${prevRow}\n` +
          `Wide/cont cells on row ${y} (next buffer): ${_dumpRowWideCells(next, y)}\n` +
          `Wide/cont cells on row ${y} (prev buffer): ${_dumpRowWideCells(prev, y)}\n` +
          `Column detail around mismatch:\n${colDetails.join("\n")}`
        const artifactDir = captureStrictFailureArtifacts({
          source: "STRICT_OUTPUT",
          errorMessage: msg,
          prev,
          next,
          incrOutput,
          freshOutput: freshNext,
          ctx,
          renderFull,
        })
        const fullMsg = `${msg}\n  Artifacts: ${artifactDir}`
        log.error?.(fullMsg)
        throw new IncrementalRenderMismatchError(fullMsg)
      }

      // Check styles
      const diffs: string[] = []
      if (!sgrColorEquals(incr.fg, fresh.fg))
        diffs.push(`fg: ${formatColor(incr.fg)} vs ${formatColor(fresh.fg)}`)
      if (!sgrColorEquals(incr.bg, fresh.bg))
        diffs.push(`bg: ${formatColor(incr.bg)} vs ${formatColor(fresh.bg)}`)
      if (incr.bold !== fresh.bold) diffs.push(`bold: ${incr.bold} vs ${fresh.bold}`)
      if (incr.dim !== fresh.dim) diffs.push(`dim: ${incr.dim} vs ${fresh.dim}`)
      if (incr.italic !== fresh.italic) diffs.push(`italic: ${incr.italic} vs ${fresh.italic}`)
      if (incr.underline !== fresh.underline)
        diffs.push(`underline: ${incr.underline} vs ${fresh.underline}`)
      if (incr.inverse !== fresh.inverse) diffs.push(`inverse: ${incr.inverse} vs ${fresh.inverse}`)
      if (incr.strikethrough !== fresh.strikethrough)
        diffs.push(`strikethrough: ${incr.strikethrough} vs ${fresh.strikethrough}`)

      if (diffs.length > 0) {
        const msg =
          `STRICT_OUTPUT style mismatch at (${x},${y}) char='${incr.char}': ` +
          diffs.join(", ") +
          `\n  incremental: fg=${formatColor(incr.fg)} bg=${formatColor(incr.bg)} bold=${incr.bold} dim=${incr.dim}` +
          `\n  fresh:       fg=${formatColor(fresh.fg)} bg=${formatColor(fresh.bg)} bold=${fresh.bold} dim=${fresh.dim}`
        const artifactDir2 = captureStrictFailureArtifacts({
          source: "STRICT_OUTPUT",
          errorMessage: msg,
          prev,
          next,
          incrOutput,
          freshOutput: freshNext,
          ctx,
          renderFull,
        })
        throw new IncrementalRenderMismatchError(`${msg}\n  Artifacts: ${artifactDir2}`)
      }
    }
  }
}

// =============================================================================
// Accumulated Output Verification
// =============================================================================

/**
 * Verify that the accumulated output from all frames produces the same
 * terminal state as a fresh render of the current buffer.
 * Catches compounding errors across multiple render frames.
 */
export function verifyAccumulatedOutput(
  currentBuffer: TerminalBuffer,
  ctx: OutputContext,
  accState: AccumulateState,
  renderFull: BufferToAnsiFn,
): void {
  const w = accState.accumulateWidth
  const h = accState.accumulateHeight
  // Replay all accumulated output (first render + all incremental updates)
  const screenAccumulated = replayAnsiWithStyles(w, h, accState.accumulatedAnsi, ctx)
  // Replay fresh render of current buffer
  const freshOutput = renderFull(currentBuffer, ctx)
  const screenFresh = replayAnsiWithStyles(w, h, freshOutput, ctx)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const accum = screenAccumulated[y]![x]!
      const fresh = screenFresh[y]![x]!

      if (accum.char !== fresh.char) {
        const msg =
          `SILVERY_STRICT_ACCUMULATE char mismatch at (${x},${y}) after ${accState.accumulateFrameCount} frames: ` +
          `accumulated='${accum.char}' fresh='${fresh.char}'`
        const dir = captureStrictFailureArtifacts({
          source: "STRICT_ACCUMULATE",
          errorMessage: msg,
          next: currentBuffer,
          incrOutput: accState.accumulatedAnsi,
          freshOutput,
          ctx,
          frameCount: accState.accumulateFrameCount,
          renderFull,
        })
        log.error?.(`${msg}\n  Artifacts: ${dir}`)
        throw new IncrementalRenderMismatchError(`${msg}\n  Artifacts: ${dir}`)
      }

      const diffs: string[] = []
      if (!sgrColorEquals(accum.fg, fresh.fg))
        diffs.push(`fg: ${formatColor(accum.fg)} vs ${formatColor(fresh.fg)}`)
      if (!sgrColorEquals(accum.bg, fresh.bg))
        diffs.push(`bg: ${formatColor(accum.bg)} vs ${formatColor(fresh.bg)}`)
      if (accum.bold !== fresh.bold) diffs.push(`bold: ${accum.bold} vs ${fresh.bold}`)
      if (accum.dim !== fresh.dim) diffs.push(`dim: ${accum.dim} vs ${fresh.dim}`)
      if (accum.italic !== fresh.italic) diffs.push(`italic: ${accum.italic} vs ${fresh.italic}`)
      if (accum.underline !== fresh.underline)
        diffs.push(`underline: ${accum.underline} vs ${fresh.underline}`)
      if (accum.inverse !== fresh.inverse)
        diffs.push(`inverse: ${accum.inverse} vs ${fresh.inverse}`)
      if (accum.strikethrough !== fresh.strikethrough)
        diffs.push(`strikethrough: ${accum.strikethrough} vs ${fresh.strikethrough}`)

      if (diffs.length > 0) {
        const msg =
          `SILVERY_STRICT_ACCUMULATE style mismatch at (${x},${y}) char='${accum.char}' after ${accState.accumulateFrameCount} frames: ` +
          diffs.join(", ")
        const dir2 = captureStrictFailureArtifacts({
          source: "STRICT_ACCUMULATE",
          errorMessage: msg,
          next: currentBuffer,
          freshOutput,
          ctx,
          frameCount: accState.accumulateFrameCount,
          renderFull,
        })
        log.error?.(`${msg}\n  Artifacts: ${dir2}`)
        throw new IncrementalRenderMismatchError(`${msg}\n  Artifacts: ${dir2}`)
      }
    }
  }
}

// =============================================================================
// SILVERY_STRICT_TERMINAL: Independent xterm.js emulator verification
// =============================================================================

/** Lazily loaded termless factories — avoids import cost when STRICT_TERMINAL is off. */
let _createTerminal: typeof import("@termless/core").createTerminal | null = null
let _createXtermBackend: typeof import("@termless/xtermjs").createXtermBackend | null = null
let _createGhosttyBackend: typeof import("@termless/ghostty").createGhosttyBackend | null = null
let _ghosttyInitPromise: Promise<void> | null = null

function loadTermless(): {
  createTerminal: typeof import("@termless/core").createTerminal
  createXtermBackend: typeof import("@termless/xtermjs").createXtermBackend
} {
  if (!_createTerminal || !_createXtermBackend) {
    _createTerminal = require("@termless/core").createTerminal
    _createXtermBackend = require("@termless/xtermjs").createXtermBackend
  }
  return { createTerminal: _createTerminal!, createXtermBackend: _createXtermBackend! }
}

function loadGhosttyBackend(): typeof import("@termless/ghostty").createGhosttyBackend {
  if (!_createGhosttyBackend) {
    const mod = require("@termless/ghostty")
    _createGhosttyBackend = mod.createGhosttyBackend
    // Start async WASM init — first call may block on this
    if (!_ghosttyInitPromise) {
      _ghosttyInitPromise = mod.initGhostty()
    }
  }
  return _createGhosttyBackend!
}

/**
 * Initialize the terminal verify state: create persistent terminal emulators
 * and feed the initial full render ANSI output.
 */
export function initTerminalVerifyState(
  state: TerminalVerifyState,
  width: number,
  height: number,
  initialAnsi: string,
): void {
  // Close any existing terminals from a previous run
  if (state.terminal) void state.terminal.close()
  if (state.ghosttyTerminal) void state.ghosttyTerminal.close()

  // Create xterm.js terminal if requested
  if (state.backends.includes("xterm")) {
    const { createTerminal, createXtermBackend } = loadTermless()
    state.terminal = createTerminal({ backend: createXtermBackend(), cols: width, rows: height })
    state.terminal.feed(initialAnsi)
  } else {
    state.terminal = null
  }

  // Create Ghostty terminal if requested
  if (state.backends.includes("ghostty")) {
    const { createTerminal } = loadTermless()
    const createGhostty = loadGhosttyBackend()
    state.ghosttyTerminal = createTerminal({ backend: createGhostty(), cols: width, rows: height })
    state.ghosttyTerminal.feed(initialAnsi)
  } else {
    state.ghosttyTerminal = null
  }

  state.width = width
  state.height = height
  state.frameCount = 0
}

/**
 * Verify that the cumulative incremental ANSI output (fed through a persistent
 * xterm.js terminal) produces the same visible state as a fresh full render
 * (fed through a second, throwaway xterm.js terminal).
 *
 * This is the ONE invariant that catches both OSC 66 and buffer overflow bugs:
 * "For a given terminal capability profile and viewport size, the actual
 * terminal state after incremental rendering must equal the actual terminal
 * state after a fresh full redraw" — checked in an independent emulator.
 */
export function verifyTerminalEquivalence(
  state: TerminalVerifyState,
  incrOutput: string,
  nextBuffer: TerminalBuffer,
  ctx: OutputContext,
  renderFull: BufferToAnsiFn,
): void {
  // Buffer dimensions may change between frames (test renderers use content-sized
  // buffers). When dimensions change, the persistent terminal can't be meaningfully
  // compared — CUP commands and scrolling behave differently at different sizes.
  // Reinitialize the persistent terminal with a fresh render at the new dimensions.
  if (nextBuffer.width !== state.width || nextBuffer.height !== state.height) {
    const freshAnsi = renderFull(nextBuffer, ctx)
    initTerminalVerifyState(state, nextBuffer.width, nextBuffer.height, freshAnsi)
    state.frameCount++
    return
  }

  const freshAnsi = renderFull(nextBuffer, ctx)

  // Verify xterm.js terminal
  if (state.terminal) {
    state.terminal.feed(incrOutput)
    const { createTerminal, createXtermBackend } = loadTermless()
    const freshTerm = createTerminal({
      backend: createXtermBackend(),
      cols: state.width,
      rows: state.height,
    })
    freshTerm.feed(freshAnsi)
    try {
      compareTerminals(state.terminal, freshTerm, state, "xterm")
    } catch (e) {
      if (e instanceof IncrementalRenderMismatchError) {
        const dir = captureStrictFailureArtifacts({
          source: "STRICT_TERMINAL[xterm]",
          errorMessage: e.message,
          next: nextBuffer,
          incrOutput,
          freshOutput: freshAnsi,
          ctx,
          frameCount: state.frameCount,
          renderFull,
        })
        throw new IncrementalRenderMismatchError(`${e.message}\n  Artifacts: ${dir}`)
      }
      throw e
    } finally {
      void freshTerm.close()
    }
  }

  // Verify Ghostty terminal
  if (state.ghosttyTerminal) {
    state.ghosttyTerminal.feed(incrOutput)
    const { createTerminal } = loadTermless()
    const createGhostty = loadGhosttyBackend()
    const freshTerm = createTerminal({
      backend: createGhostty(),
      cols: state.width,
      rows: state.height,
    })
    freshTerm.feed(freshAnsi)
    try {
      compareTerminals(state.ghosttyTerminal, freshTerm, state, "ghostty")
    } catch (e) {
      if (e instanceof IncrementalRenderMismatchError) {
        const dir = captureStrictFailureArtifacts({
          source: "STRICT_TERMINAL[ghostty]",
          errorMessage: e.message,
          next: nextBuffer,
          incrOutput,
          freshOutput: freshAnsi,
          ctx,
          frameCount: state.frameCount,
          renderFull,
        })
        throw new IncrementalRenderMismatchError(`${e.message}\n  Artifacts: ${dir}`)
      }
      throw e
    } finally {
      void freshTerm.close()
    }
  }
}

/** Compare two terminal states cell-by-cell. Throws IncrementalRenderMismatchError on divergence. */
function compareTerminals(
  incrTerm: import("@termless/core").Terminal,
  freshTerm: import("@termless/core").Terminal,
  state: TerminalVerifyState,
  backendName: string,
): void {
  const w = state.width
  const h = state.height
  const prefix = `SILVERY_STRICT_TERMINAL[${backendName}]`
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const incrCell = incrTerm.getCell(y, x)
      const freshCell = freshTerm.getCell(y, x)
      const incrChar = incrCell.char || " "
      const freshChar = freshCell.char || " "

      if (incrChar !== freshChar) {
        const incrRow = Array.from(
          { length: w },
          (_, cx) => incrTerm.getCell(y, cx).char || " ",
        ).join("")
        const freshRow = Array.from(
          { length: w },
          (_, cx) => freshTerm.getCell(y, cx).char || " ",
        ).join("")
        const msg =
          `${prefix} char mismatch at (${x},${y}) frame ${state.frameCount}: ` +
          `incremental='${incrChar}' fresh='${freshChar}'\n` +
          `  incr row: ${incrRow.trimEnd()}\n` +
          `  fresh row: ${freshRow.trimEnd()}`
        log.error?.(msg)
        throw new IncrementalRenderMismatchError(msg)
      }

      if (!rgbEquals(incrCell.fg, freshCell.fg)) {
        const msg =
          `${prefix} fg color mismatch at (${x},${y}) char='${incrChar}' frame ${state.frameCount}: ` +
          `incremental=${formatRgb(incrCell.fg)} fresh=${formatRgb(freshCell.fg)}`
        log.error?.(msg)
        throw new IncrementalRenderMismatchError(msg)
      }

      if (!rgbEquals(incrCell.bg, freshCell.bg)) {
        const msg =
          `${prefix} bg color mismatch at (${x},${y}) char='${incrChar}' frame ${state.frameCount}: ` +
          `incremental=${formatRgb(incrCell.bg)} fresh=${formatRgb(freshCell.bg)}`
        log.error?.(msg)
        throw new IncrementalRenderMismatchError(msg)
      }

      const attrDiffs: string[] = []
      if (incrCell.bold !== freshCell.bold)
        attrDiffs.push(`bold: ${incrCell.bold} vs ${freshCell.bold}`)
      if (incrCell.dim !== freshCell.dim) attrDiffs.push(`dim: ${incrCell.dim} vs ${freshCell.dim}`)
      if (incrCell.italic !== freshCell.italic)
        attrDiffs.push(`italic: ${incrCell.italic} vs ${freshCell.italic}`)
      if (incrCell.inverse !== freshCell.inverse)
        attrDiffs.push(`inverse: ${incrCell.inverse} vs ${freshCell.inverse}`)
      if (incrCell.strikethrough !== freshCell.strikethrough)
        attrDiffs.push(`strikethrough: ${incrCell.strikethrough} vs ${freshCell.strikethrough}`)

      if (attrDiffs.length > 0) {
        const msg =
          `${prefix} attr mismatch at (${x},${y}) char='${incrChar}' frame ${state.frameCount}: ` +
          attrDiffs.join(", ")
        log.error?.(msg)
        throw new IncrementalRenderMismatchError(msg)
      }
    }
  }
}

/** Compare two RGB color values (from termless Cell). */
function rgbEquals(
  a: { r: number; g: number; b: number } | null,
  b: { r: number; g: number; b: number } | null,
): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

/** Format an RGB value for diagnostic messages. */
function formatRgb(c: { r: number; g: number; b: number } | null): string {
  if (c === null) return "null"
  return `rgb(${c.r},${c.g},${c.b})`
}

/** Compare two SGR color values. */
export function sgrColorEquals(
  a: number | { r: number; g: number; b: number } | null,
  b: number | { r: number; g: number; b: number } | null,
): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a === "number" || typeof b === "number") return a === b
  return a.r === b.r && a.g === b.g && a.b === b.b
}
