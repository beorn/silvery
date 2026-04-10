/**
 * Phase 4: Output Phase
 *
 * Diff two buffers and produce minimal ANSI output.
 *
 * Debug: Set SILVERY_DEBUG_OUTPUT=1 to log diff changes and ANSI sequences.
 */

import {
  type Style,
  type TerminalBuffer,
  type UnderlineStyle,
  VISIBLE_SPACE_ATTR_MASK,
  colorEquals,
  createMutableCell,
  hasActiveAttrs,
  isDefaultBg,
  styleEquals,
} from "../buffer"
import { fgColorCode, bgColorCode } from "../ansi/sgr-codes"
import type { CursorState } from "@silvery/ag-react/hooks/useCursor"
import { IncrementalRenderMismatchError } from "../errors"
import { textSized } from "../text-sizing"
import { graphemeWidth, isTextSizingEnabled } from "../unicode"
import type { CellChange } from "./types"
import { createLogger } from "loggily"
import {
  replayAnsiWithStyles,
  captureStrictFailureArtifacts as _captureArtifacts,
  verifyOutputEquivalence as _verifyOutputEquivalence,
  verifyAccumulatedOutput as _verifyAccumulatedOutput,
  verifyTerminalEquivalence as _verifyTerminalEquivalence,
  initTerminalVerifyState,
  createTerminalVerifyState,
  strictTerminalBackends,
  sgrColorEquals,
  formatColor,
  type AccumulateState,
  type TerminalVerifyState,
} from "./output-verify"

const log = createLogger("silvery:output")

const _env = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>)
const DEBUG_OUTPUT = !!_env.SILVERY_DEBUG_OUTPUT
const FULL_RENDER = !!_env.SILVERY_FULL_RENDER
const DEBUG_CAPTURE = !!_env.SILVERY_DEBUG_CAPTURE
const CAPTURE_RAW = !!_env.SILVERY_CAPTURE_RAW
let _debugFrameCount = 0
let _captureRawFrameCount = 0

// Re-export verification functions for external consumers (test files import from output-phase)
export { replayAnsiWithStyles } from "./output-verify"
export type { StyledCell } from "./output-verify"
// Wrap captureStrictFailureArtifacts to bind bufferToAnsi (avoids circular dep in output-verify.ts)
export function captureStrictFailureArtifacts(opts: Parameters<typeof _captureArtifacts>[0]): string {
  return _captureArtifacts({ ...opts, renderFull: opts.renderFull ?? bufferToAnsi })
}

// ============================================================================
// Terminal Capability Flags (suppress unsupported SGR codes)
// ============================================================================

import type { TerminalCaps } from "../terminal-caps"

/**
 * @deprecated Use createOutputPhase(caps) instead. This is a no-op.
 */
export function setOutputCaps(
  _caps: Partial<Pick<TerminalCaps, "underlineStyles" | "underlineColor" | "colorLevel">>,
): void {
  // No-op: use createOutputPhase(caps) instead
}

// ============================================================================
// Output Phase Factory (per-term instance, no globals)
// ============================================================================

/** Output-phase capabilities type. */
export type OutputCaps = Pick<TerminalCaps, "underlineStyles" | "underlineColor" | "colorLevel">

// ============================================================================
// Output Context (per-instance state, replaces module-level globals)
// ============================================================================

/**
 * Per-instance output context containing terminal capabilities, measurer,
 * caches, and per-frame viewport state. Threaded through internal functions
 * to eliminate module-level mutable state and prevent "forgot to thread
 * parameter" failures. Caches are per-context because SGR output depends on caps.
 *
 * Per-frame fields (mode, termRows) are set by the caller before each frame:
 * - createOutputPhase() closure sets them in scopedOutputPhase()
 * - bare outputPhase() sets them from its parameters
 */
export interface OutputContext {
  readonly caps: OutputCaps
  readonly measurer: OutputMeasurer | null
  readonly sgrCache: Map<string, string>
  readonly transitionCache: Map<string, string>
  /** Render mode for the current frame. Set per-frame by the output phase entry point. */
  mode: "fullscreen" | "inline"
  /** Terminal height in rows for the current frame. Caps output to prevent
   *  scrollback corruption when content exceeds terminal height. Set per-frame. */
  termRows: number | undefined
}

/** Default context used by bare outputPhase() calls (full capability support, no measurer). */
const defaultContext: OutputContext = {
  caps: {
    underlineStyles: true,
    underlineColor: true,
    colorLevel: "truecolor",
  },
  measurer: null,
  sgrCache: new Map(),
  transitionCache: new Map(),
  mode: "fullscreen",
  termRows: undefined,
}

/** Output phase function signature. */
export interface OutputPhaseFn {
  (
    prev: TerminalBuffer | null,
    next: TerminalBuffer,
    mode?: "fullscreen" | "inline",
    scrollbackOffset?: number,
    termRows?: number,
    cursorPos?: CursorState | null,
  ): string
  /** Reset inline cursor state. Used by useScrollback to clear cursor tracking on resize. */
  resetInlineState?: () => void
  /** Get the current inline cursor row (relative to render region start). -1 if unknown. */
  getInlineCursorRow?: () => number
  /** Promote frozen content to scrollback. Called by useScrollback to queue
   *  frozen content for the next render — the output phase writes frozen + live
   *  content in a single target.write() to avoid flicker. */
  promoteScrollback?: (frozenContent: string, frozenLineCount: number) => void
}

// ============================================================================
// Output Phase Measurer (module-local, avoids dual-module-loading issues)
// ============================================================================
// bun can load the same .ts file via symlink + real path as separate module
// instances. This means `_scopedMeasurer` set by `runWithMeasurer()` in
// pipeline/index.ts's instance of unicode.ts is invisible to output-phase.ts's
// instance. We avoid this by closing over the measurer in createOutputPhase()
// and setting a module-local variable that all output-phase functions read.

export interface OutputMeasurer {
  graphemeWidth(grapheme: string): number
  readonly textSizingEnabled: boolean
}

/** Get grapheme width using the output context measurer (falls back to unicode.ts import). */
function outputGraphemeWidth(g: string, ctx: OutputContext): number {
  return ctx.measurer ? ctx.measurer.graphemeWidth(g) : graphemeWidth(g)
}

/** Check if text sizing is enabled using the output context measurer. */
function outputTextSizingEnabled(ctx: OutputContext): boolean {
  return ctx.measurer ? ctx.measurer.textSizingEnabled : isTextSizingEnabled()
}

/**
 * Create a scoped output phase that uses specific terminal capabilities.
 *
 * @param caps - Terminal capabilities for SGR code generation
 * @param measurer - Width measurer for graphemeWidth/textSizingEnabled (avoids dual-module-loading issues)
 */
export function createOutputPhase(caps: Partial<OutputCaps>, measurer?: OutputMeasurer): OutputPhaseFn {
  // Instance-scoped context — caps, measurer, and caches are all per-instance.
  // mode and termRows are set per-frame in scopedOutputPhase() below.
  // No module-level globals are read or modified.
  const ctx: OutputContext = {
    caps: {
      underlineStyles: caps.underlineStyles ?? true,
      underlineColor: caps.underlineColor ?? true,
      colorLevel: caps.colorLevel ?? "truecolor",
    },
    measurer: measurer ?? null,
    sgrCache: new Map(),
    transitionCache: new Map(),
    mode: "fullscreen",
    termRows: undefined,
  }
  // Instance-scoped inline cursor state — persists across frames for incremental rendering.
  // Each createOutputPhase() call gets its own state, eliminating module-level globals.
  const inlineState = createInlineCursorState()

  // Instance-scoped accumulated ANSI state for SILVERY_STRICT_ACCUMULATE verification.
  // Tracks per-instance verification state rather than using module-level globals.
  const accState = {
    accumulatedAnsi: "",
    accumulateWidth: 0,
    accumulateHeight: 0,
    accumulateFrameCount: 0,
  }

  // Instance-scoped terminal verify state for SILVERY_STRICT_TERMINAL verification.
  const tvState = createTerminalVerifyState()

  // Pending scrollback promotion — queued by useScrollback, consumed by the next render.
  let pendingPromotion: { frozenContent: string; frozenLineCount: number } | null = null

  const fn: OutputPhaseFn = function scopedOutputPhase(
    prev: TerminalBuffer | null,
    next: TerminalBuffer,
    mode: "fullscreen" | "inline" = "fullscreen",
    scrollbackOffset = 0,
    termRows?: number,
    cursorPos?: CursorState | null,
  ): string {
    // Set per-frame viewport state on the context — internal functions read from ctx
    // instead of accepting mode/termRows as separate parameters.
    ctx.mode = mode
    ctx.termRows = termRows
    // Handle scrollback promotion: write frozen content + live content in one pass.
    if (pendingPromotion && mode === "inline") {
      const promo = pendingPromotion
      pendingPromotion = null
      return handleScrollbackPromotion(inlineState, promo.frozenContent, promo.frozenLineCount, next, cursorPos, ctx)
    }
    return outputPhase(prev, next, mode, scrollbackOffset, termRows, cursorPos, inlineState, ctx, accState, tvState)
  }

  fn.resetInlineState = () => {
    Object.assign(inlineState, createInlineCursorState())
    inlineState.forceFirstRender = true
    // Clear any queued promotion — the resize handler re-emits all frozen items
    // directly, so any pending promotion from the freeze effect is redundant.
    // Without this, freeze+resize in the same frame causes duplicate frozen content.
    pendingPromotion = null
  }

  fn.getInlineCursorRow = () => inlineState.prevCursorRow

  fn.promoteScrollback = (frozenContent: string, frozenLineCount: number) => {
    if (pendingPromotion) {
      pendingPromotion.frozenContent += frozenContent
      pendingPromotion.frozenLineCount += frozenLineCount
    } else {
      pendingPromotion = { frozenContent, frozenLineCount }
    }
  }

  return fn
}

/**
 * Handle scrollback promotion: write frozen content + live content in a single output string.
 *
 * Instead of useScrollback writing directly to stdout (which blanks the screen and
 * causes flicker), this function builds one output string that:
 * 1. Moves cursor to the render region start (no clearing)
 * 2. Writes frozen content (each line overwrites in-place via \x1b[K])
 * 3. Writes live content via bufferToAnsi (also with per-line \x1b[K])
 * 4. Erases any leftover lines from the previous frame
 * 5. Positions the hardware cursor
 *
 * Result: a single target.write() with no blanking — no flicker.
 */
function handleScrollbackPromotion(
  state: InlineCursorState,
  frozenContent: string,
  frozenLineCount: number,
  next: TerminalBuffer,
  cursorPos: CursorState | null | undefined,
  ctx: OutputContext,
): string {
  const { termRows } = ctx
  // 1. Move cursor to render region start
  let output = ""
  if (state.prevCursorRow > 0) {
    output += `\x1b[${state.prevCursorRow}A`
  }
  output += "\r" // column 0, NO \x1b[J clear

  // 2. Write frozen content (overwrites old content in-place, OSC markers included)
  output += frozenContent

  // 3. Write live content via bufferToAnsi (each line has \x1b[K — no blanking)
  const nextContentLines = findLastContentLine(next) + 1
  const maxOutputLines = termRows != null ? Math.min(nextContentLines, termRows) : nextContentLines
  output += bufferToAnsi(next, ctx, maxOutputLines)

  // Total lines on-screen: frozen + live. The terminal may scroll if this exceeds
  // termRows, naturally pushing frozen lines into scrollback. No padding needed —
  // we track ALL on-screen lines so the next render can overwrite them cleanly.
  const totalOnScreen = frozenLineCount + maxOutputLines

  // 4. Erase leftover lines at bottom (if content shrank)
  const oldTotalLines = state.prevOutputLines
  const nextLastLine = totalOnScreen - 1
  const terminalScroll = termRows != null ? Math.max(0, totalOnScreen - termRows) : 0
  const lastOccupied = Math.max(oldTotalLines - 1 - terminalScroll, 0)
  if (lastOccupied > nextLastLine) {
    for (let y = nextLastLine + 1; y <= lastOccupied; y++) {
      output += "\n\r\x1b[K"
    }
    const up = lastOccupied - nextLastLine
    if (up > 0) output += `\x1b[${up}A`
  }

  // 5. Cursor suffix (hardware cursor positioning)
  //    Cursor is at the end of live content (row totalOnScreen - 1 relative to
  //    render region start). inlineCursorSuffix moves it to the useCursor position
  //    within the live content area.
  output += inlineCursorSuffix(cursorPos ?? null, next, ctx)

  // 6. Update tracking for subsequent incremental renders.
  //    Track cursor position and output lines relative to the LIVE content only.
  //    Frozen content has been written as raw ANSI above the live content and is
  //    now "owned" by the terminal — it stays on screen until natural scrolling
  //    pushes it into terminal scrollback. The next render only needs to cursor-up
  //    to the start of the live content area, not past the frozen content.
  //
  //    This is critical for real terminals where pre-existing content (shell prompt,
  //    direnv output) sits above the app. If prevCursorRow included frozenLineCount,
  //    the cursor-up would overshoot into the shell prompt area, clearing it.
  let startLine = 0
  if (termRows != null && nextContentLines > termRows) startLine = nextContentLines - termRows
  state.prevBuffer = next

  // Cursor row within the LIVE content area only (not including frozen lines).
  // inlineCursorSuffix already positioned the cursor within the live content.
  if (cursorPos?.visible) {
    const visibleRow = cursorPos.y - startLine
    state.prevCursorRow = visibleRow >= 0 && visibleRow < maxOutputLines ? visibleRow : maxOutputLines - 1
  } else {
    state.prevCursorRow = maxOutputLines - 1
  }
  state.prevOutputLines = maxOutputLines

  return output
}

// These use getters so they can be set after module load (e.g., in test files).
// SILVERY_STRICT enables buffer + output checks (per-frame), including vt100 output verification.
// SILVERY_STRICT_ACCUMULATE is separate — it replays ALL frames (O(N²)) and is opt-in only.
// Note: "0" and "false" are treated as disabled, consistent with renderer.ts strictMode check.
function isStrictOutput(): boolean {
  if (typeof process === "undefined") return false
  const val = process.env.SILVERY_STRICT
  return !!val && val !== "0" && val !== "false"
}
function isStrictAccumulate(): boolean {
  if (typeof process === "undefined") return false
  const val = process.env.SILVERY_STRICT_ACCUMULATE
  return !!val && val !== "0" && val !== "false"
}

/** Default accumulate state used by bare outputPhase() calls. */
const defaultAccState: AccumulateState = {
  accumulatedAnsi: "",
  accumulateWidth: 0,
  accumulateHeight: 0,
  accumulateFrameCount: 0,
}

/** Default terminal verify state used by bare outputPhase() calls. */
const defaultTerminalVerifyState = createTerminalVerifyState()

// ============================================================================
// Inline Mode: Inter-frame Cursor Tracking (instance-scoped)
// ============================================================================

/**
 * Mutable state for inline mode inter-frame cursor tracking.
 * Captured in the createOutputPhase() closure — no module-level globals.
 */
interface InlineCursorState {
  /** Row within render region after last inline frame's cursor suffix. -1 = unknown. */
  prevCursorRow: number
  /** Total output lines rendered in last frame. Used to clear old content on resize. */
  prevOutputLines: number
  /** Previous frame's buffer — used for incremental rendering when runtime invalidates (resize). */
  prevBuffer: TerminalBuffer | null
  /** When true, the next inline render treats prev as null (first-render path).
   *  Set by resetInlineState() after useScrollback clears and re-emits frozen items. */
  forceFirstRender: boolean
}

/** Create fresh inline cursor state (unknown position → first call falls back to full render). */
function createInlineCursorState(): InlineCursorState {
  return {
    prevCursorRow: -1,
    prevOutputLines: 0,
    prevBuffer: null,
    forceFirstRender: false,
  }
}

/**
 * Update cursor tracking after an inline render frame.
 * Records where the terminal cursor ends up after inlineCursorSuffix().
 */
function updateInlineCursorRow(
  state: InlineCursorState,
  cursorPos: CursorState | null | undefined,
  maxOutputLines: number,
  startLine: number,
): void {
  if (cursorPos?.visible) {
    const visibleRow = cursorPos.y - startLine
    state.prevCursorRow = visibleRow >= 0 && visibleRow < maxOutputLines ? visibleRow : maxOutputLines - 1
  } else {
    // Cursor hidden: cursor stays at end of last content line
    state.prevCursorRow = maxOutputLines - 1
  }
  state.prevOutputLines = maxOutputLines
}

/**
 * Wrap a cell character in OSC 66 if text sizing is enabled and the cell is
 * wide. OSC 66 tells the terminal to render the character in exactly `width`
 * cells, matching the layout engine's measurement.
 *
 * Previously this only wrapped specific categories (PUA, text-presentation
 * emoji, flag emoji) — a whack-a-mole approach that missed new categories
 * as Unicode evolved. Now wraps ALL wide chars unconditionally: if the buffer
 * says width 2, the terminal is told width 2. CJK chars don't strictly need
 * it (terminals agree on their width), but the ~8-byte overhead per wide char
 * is negligible and eliminates any future width disagreement.
 */
function wrapTextSizing(char: string, wide: boolean, ctx: OutputContext): string {
  if (!wide || !outputTextSizingEnabled(ctx)) return char
  return textSized(char, 2)
}

// ============================================================================
// Style Interning + SGR Cache
// ============================================================================

// SGR caches are now per-OutputContext (see OutputContext interface).
// This is correct because SGR output depends on caps (underlineStyles,
// underlineColor), so caches populated under one caps configuration
// would produce wrong results under a different one.

/**
 * Serialize a Style into a cache key string.
 * Fast path: most styles are simple (256-color or null fg/bg, no true color).
 */
function styleToKey(style: Style): string {
  const fg = style.fg
  const bg = style.bg
  const attrs = style.attrs

  // Fast path: common case of simple colors + few attrs
  let key = ""

  // fg
  if (fg === null) {
    key = "n"
  } else if (typeof fg === "number") {
    key = `${fg}`
  } else {
    key = `r${fg.r},${fg.g},${fg.b}`
  }

  key += "|"

  // bg
  if (bg === null) {
    key += "n"
  } else if (typeof bg === "number") {
    key += `${bg}`
  } else {
    key += `r${bg.r},${bg.g},${bg.b}`
  }

  // attrs packed as bitmask for speed
  let attrBits = 0
  if (attrs.bold) attrBits |= 1
  if (attrs.dim) attrBits |= 2
  if (attrs.italic) attrBits |= 4
  if (attrs.underline) attrBits |= 8
  if (attrs.inverse) attrBits |= 16
  if (attrs.strikethrough) attrBits |= 32
  if (attrs.blink) attrBits |= 64
  if (attrs.hidden) attrBits |= 128

  key += `|${attrBits}`

  // Underline style (rare)
  if (attrs.underlineStyle) {
    key += `|u${attrs.underlineStyle}`
  }

  // Underline color (rare)
  const ul = style.underlineColor
  if (ul !== null && ul !== undefined) {
    if (typeof ul === "number") {
      key += `|l${ul}`
    } else {
      key += `|lr${ul.r},${ul.g},${ul.b}`
    }
  }

  // Hyperlink URL (rare)
  if (style.hyperlink) {
    key += `|h${style.hyperlink}`
  }

  return key
}

/**
 * Get the SGR escape string for a style, using the intern cache.
 * Cache hit: O(1) Map lookup + key serialization.
 * Cache miss: builds the SGR string and caches it.
 */
function cachedStyleToAnsi(style: Style, ctx: OutputContext): string {
  const key = styleToKey(style)
  let sgr = ctx.sgrCache.get(key)
  if (sgr !== undefined) return sgr
  sgr = styleToAnsi(style, ctx)
  ctx.sgrCache.set(key, sgr)
  if (ctx.sgrCache.size > 1000) ctx.sgrCache.clear()
  return sgr
}

/**
 * Compute the minimal SGR transition between two styles.
 *
 * When oldStyle is null (first cell or after reset), falls through to
 * full SGR generation via cachedStyleToAnsi. Otherwise, diffs attribute
 * by attribute and emits only changed SGR codes. Caches the result for
 * each (oldKey, newKey) pair.
 */
function styleTransition(oldStyle: Style | null, newStyle: Style, ctx: OutputContext): string {
  // First cell or after reset — full generation
  if (!oldStyle) return cachedStyleToAnsi(newStyle, ctx)

  // Same style — nothing to emit
  if (styleEquals(oldStyle, newStyle)) return ""

  // Check transition cache
  const oldKey = styleToKey(oldStyle)
  const newKey = styleToKey(newStyle)
  const cacheKey = `${oldKey}\x00${newKey}`
  const cached = ctx.transitionCache.get(cacheKey)
  if (cached !== undefined) return cached

  // Build minimal diff
  const codes: string[] = []

  // Check attributes that can only be "turned off" via reset or specific off-codes.
  // If an attribute was on and is now off, we need either the off-code or a full reset.
  const oa = oldStyle.attrs
  const na = newStyle.attrs

  // Bold and dim share SGR 22 as their off-code, so handle them together
  // to avoid emitting duplicate codes.
  const boldChanged = Boolean(oa.bold) !== Boolean(na.bold)
  const dimChanged = Boolean(oa.dim) !== Boolean(na.dim)
  if (boldChanged || dimChanged) {
    const boldOff = boldChanged && !na.bold
    const dimOff = dimChanged && !na.dim
    if (boldOff || dimOff) {
      // SGR 22 resets both bold and dim
      codes.push("22")
      // Re-enable whichever should stay on
      if (na.bold) codes.push("1")
      if (na.dim) codes.push("2")
    } else {
      // Only turning attributes on
      if (boldChanged && na.bold) codes.push("1")
      if (dimChanged && na.dim) codes.push("2")
    }
  }
  if (Boolean(oa.italic) !== Boolean(na.italic)) {
    codes.push(na.italic ? "3" : "23")
  }

  // Underline: compare both underline flag and underlineStyle
  const oldUl = Boolean(oa.underline)
  const newUl = Boolean(na.underline)
  const oldUlStyle = oa.underlineStyle ?? false
  const newUlStyle = na.underlineStyle ?? false
  if (oldUl !== newUl || oldUlStyle !== newUlStyle) {
    if (!ctx.caps.underlineStyles) {
      // Terminal doesn't support SGR 4:x — fall back to simple SGR 4/24
      codes.push(newUl || na.underlineStyle ? "4" : "24")
    } else {
      const sgrSub = underlineStyleToSgr(na.underlineStyle)
      if (sgrSub !== null && sgrSub !== 0) {
        codes.push(`4:${sgrSub}`)
      } else if (newUl) {
        codes.push("4")
      } else {
        codes.push("24")
      }
    }
  }

  if (Boolean(oa.inverse) !== Boolean(na.inverse)) {
    codes.push(na.inverse ? "7" : "27")
  }
  if (Boolean(oa.hidden) !== Boolean(na.hidden)) {
    codes.push(na.hidden ? "8" : "28")
  }
  if (Boolean(oa.strikethrough) !== Boolean(na.strikethrough)) {
    codes.push(na.strikethrough ? "9" : "29")
  }
  if (Boolean(oa.blink) !== Boolean(na.blink)) {
    codes.push(na.blink ? "5" : "25")
  }

  // Foreground color
  if (!colorEquals(oldStyle.fg, newStyle.fg)) {
    if (newStyle.fg === null) {
      codes.push("39")
    } else {
      codes.push(fgColorCode(newStyle.fg))
    }
  }

  // Background color
  if (!colorEquals(oldStyle.bg, newStyle.bg)) {
    if (newStyle.bg === null) {
      codes.push("49")
    } else {
      codes.push(bgColorCode(newStyle.bg))
    }
  }

  // Underline color (SGR 58/59) — skip for terminals that don't support it
  if (ctx.caps.underlineColor && !colorEquals(oldStyle.underlineColor, newStyle.underlineColor)) {
    if (newStyle.underlineColor === null || newStyle.underlineColor === undefined) {
      // SGR 59 resets underline color
      codes.push("59")
    } else if (typeof newStyle.underlineColor === "number") {
      codes.push(`58;5;${newStyle.underlineColor}`)
    } else {
      codes.push(`58;2;${newStyle.underlineColor.r};${newStyle.underlineColor.g};${newStyle.underlineColor.b}`)
    }
  }

  // Hyperlink (OSC 8) is handled separately in the render loops, not here.

  let result: string
  if (codes.length === 0) {
    // Styles differ but no SGR codes emitted (e.g., hyperlink-only change).
    // Fall back to full generation to be safe.
    result = cachedStyleToAnsi(newStyle, ctx)
  } else {
    result = `\x1b[${codes.join(";")}m`
  }

  ctx.transitionCache.set(cacheKey, result)
  if (ctx.transitionCache.size > 1000) ctx.transitionCache.clear()
  return result
}

/**
 * Map underline style to SGR 4:x subparameter.
 */
function underlineStyleToSgr(style: UnderlineStyle | undefined): number | null {
  switch (style) {
    case false:
      return 0 // SGR 4:0 = no underline
    case "single":
      return 1 // SGR 4:1 = single underline
    case "double":
      return 2 // SGR 4:2 = double underline
    case "curly":
      return 3 // SGR 4:3 = curly underline
    case "dotted":
      return 4 // SGR 4:4 = dotted underline
    case "dashed":
      return 5 // SGR 4:5 = dashed underline
    default:
      return null // Use simple SGR 4 or no underline
  }
}

/**
 * Diff two buffers and produce minimal ANSI output.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @param mode Render mode: fullscreen or inline
 * @param scrollbackOffset Lines written to stdout between renders (inline mode)
 * @param termRows Terminal height in rows (inline mode) — caps output to prevent
 *   scrollback corruption when content exceeds terminal height
 * @returns ANSI escape sequence string
 */
export function outputPhase(
  prev: TerminalBuffer | null,
  next: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
  scrollbackOffset = 0,
  termRows?: number,
  cursorPos?: CursorState | null,
  _inlineState?: InlineCursorState,
  _ctx?: OutputContext,
  _accState?: AccumulateState,
  _tvState?: TerminalVerifyState,
): string {
  // Bare outputPhase() calls use a fresh cursor state each time.
  // prevCursorRow = -1 means incremental rendering always falls back to full render.
  // Instance-scoped state (via createOutputPhase) enables incremental across frames.
  const inlineState = _inlineState ?? createInlineCursorState()
  const ctx = _ctx ?? defaultContext
  const accState = _accState ?? defaultAccState

  // Set per-frame viewport state on the context — internal functions read from ctx.
  // For bare outputPhase() calls (no createOutputPhase), this updates defaultContext
  // each call. For scoped calls, ctx.mode/termRows were already set by the closure.
  ctx.mode = mode
  ctx.termRows = termRows
  const tvState = _tvState ?? defaultTerminalVerifyState

  // After resetInlineState (e.g., useScrollback cleared and re-emitted frozen items),
  // treat the next render as a first render. The cursor is at a known position
  // (right after the re-emitted frozen items) and prev is stale.
  if (mode === "inline" && inlineState.forceFirstRender) {
    inlineState.forceFirstRender = false
    prev = null // may already be null (runtime.invalidate on resize), consume flag regardless
  }

  // First render: output entire buffer
  if (!prev) {
    // Accumulate timing for full-render path
    const fullRenderAcc = (globalThis as any).__silvery_bench_output_detail
    if (fullRenderAcc) {
      fullRenderAcc.fullRenderCalls = (fullRenderAcc.fullRenderCalls ?? 0) + 1
      fullRenderAcc.fullRenderCells = (fullRenderAcc.fullRenderCells ?? 0) + next.width * next.height
    }
    // Inline mode resize optimization: if the runtime invalidated prevBuffer (resize)
    // but we have a stored buffer with matching dimensions, use incremental rendering
    // instead of clear+full render. This avoids wiping content when the buffer is unchanged
    // (e.g., content narrower than both old and new terminal widths).
    if (mode === "inline" && inlineState.prevBuffer && inlineState.prevCursorRow >= 0) {
      const stored = inlineState.prevBuffer
      if (stored.width === next.width && stored.height === next.height) {
        // Dimensions match — use incremental rendering (skip clear entirely)
        inlineState.prevBuffer = next
        return inlineIncrementalRender(inlineState, stored, next, scrollbackOffset, cursorPos, ctx, tvState)
      }
    }

    // Cap output to terminal height to prevent scroll desync.
    // In inline mode: prevents scrollback corruption (cursor-up clamped at row 0).
    // In fullscreen mode: prevents terminal scroll that desynchronizes prevBuffer
    // from actual terminal state, causing ghost pixels on subsequent incremental renders.
    const tFullStart = performance.now()
    const firstOutput = bufferToAnsi(next, ctx, termRows)
    const tFullEnd = performance.now()
    if (fullRenderAcc) {
      fullRenderAcc.fullRenderMs = (fullRenderAcc.fullRenderMs ?? 0) + (tFullEnd - tFullStart)
      fullRenderAcc.fullRenderBytes = (fullRenderAcc.fullRenderBytes ?? 0) + firstOutput.length
    }
    // For inline first render, append cursor positioning and initialize tracking
    if (mode === "inline") {
      const firstContentLines = findLastContentLine(next) + 1
      const firstMaxOutput = termRows != null ? Math.min(firstContentLines, termRows) : firstContentLines
      let firstStartLine = 0
      if (termRows != null && firstContentLines > termRows) firstStartLine = firstContentLines - termRows

      // Resize: clear the entire visible screen and re-render.
      // Terminal reflow is unpredictable — lines wrap differently based on content,
      // unicode, wrap points. Rather than guessing cursor-up distances, overshoot:
      // ESC[nA is clamped at row 0 of the visible screen (can't touch scrollback),
      // so using termRows is safe. Frozen scrollback content above is preserved.
      let prefix = ""
      if (inlineState.prevCursorRow >= 0) {
        const clearDistance = termRows ?? Math.max(inlineState.prevCursorRow, inlineState.prevOutputLines - 1)
        if (clearDistance > 0) {
          prefix += `\x1b[${clearDistance}A`
        }
        prefix += "\r\x1b[J" // column 0, clear from cursor to end of screen
      }

      inlineState.prevBuffer = next
      updateInlineCursorRow(inlineState, cursorPos, firstMaxOutput, firstStartLine)
      return prefix + firstOutput + inlineCursorSuffix(cursorPos ?? null, next, ctx)
    }
    if (isStrictAccumulate()) {
      accState.accumulatedAnsi = firstOutput
      accState.accumulateWidth = next.width
      accState.accumulateHeight = next.height
      accState.accumulateFrameCount = 0
    }
    if (tvState.backends.length > 0) {
      initTerminalVerifyState(tvState, next.width, next.height, firstOutput)
    }
    if (CAPTURE_RAW) {
      try {
        const fs = require("fs")
        _captureRawFrameCount = 0
        // Write initial render with frame separator
        fs.writeFileSync("/tmp/silvery-raw.ansi", firstOutput)
        fs.writeFileSync(
          "/tmp/silvery-raw-frames.jsonl",
          JSON.stringify({
            frame: 0,
            type: "full",
            bytes: firstOutput.length,
            width: next.width,
            height: next.height,
          }) + "\n",
        )
      } catch {}
    }
    return firstOutput
  }

  // Inline mode: use incremental rendering when safe, fall back to full render.
  if (mode === "inline") {
    inlineState.prevBuffer = next
    return inlineIncrementalRender(inlineState, prev, next, scrollbackOffset, cursorPos, ctx, tvState)
  }

  // SILVERY_FULL_RENDER: bypass incremental diff, always render full buffer.
  // Use to diagnose garbled rendering — if FULL_RENDER fixes it, the bug
  // is in changesToAnsi (diff → ANSI serialization).
  if (FULL_RENDER) {
    return bufferToAnsi(next, ctx, termRows)
  }

  // Dimension change: fall back to full render.
  // When prev and next buffers have different dimensions (e.g., terminal resize
  // without prevBuffer invalidation, or test renderer dimension changes),
  // incremental diff produces CUP sequences targeting positions beyond the
  // current terminal bounds. Terminals clamp out-of-bounds CUP to the last
  // valid row/column, causing stale cells from the diff's shrink-region clears
  // to overwrite valid content at the terminal edge.
  if (prev.width !== next.width || prev.height !== next.height) {
    return bufferToAnsi(next, ctx, termRows)
  }

  // Fullscreen mode: diff and emit only changes
  const tDiff0 = performance.now()
  const { pool, count: rawCount } = diffBuffers(prev, next)
  const tDiff1 = performance.now()

  // Filter out changes beyond terminal height to prevent CUP targeting rows
  // past the terminal, which causes scrolling and prevBuffer desync.
  let count = rawCount
  if (termRows != null) {
    let writeIdx = 0
    for (let i = 0; i < rawCount; i++) {
      if (pool[i]!.y < termRows) {
        pool[writeIdx++] = pool[i]!
      }
    }
    count = writeIdx
  }

  if (DEBUG_OUTPUT) {
    log.error?.(
      `diffBuffers: ${count} changes${rawCount !== count ? ` (${rawCount - count} clamped beyond termRows)` : ""}`,
    )
    const debugLimit = Math.min(count, 10)
    for (let i = 0; i < debugLimit; i++) {
      const change = pool[i]!
      log.error?.(`  (${change.x},${change.y}): "${change.cell.char}"`)
    }
    if (count > 10) {
      log.error?.(`  ... and ${count - 10} more`)
    }
  }

  if (count === 0) {
    // Accumulate timing even for zero-change frames
    const acc = (globalThis as any).__silvery_bench_output_detail
    if (acc) {
      acc.diffMs += tDiff1 - tDiff0
      acc.calls += 1
    }
    return "" // No changes
  }

  // Wide characters are handled atomically in changesToAnsi():
  // - Wide char main cells emit the character and advance cursor by 2
  // - Continuation cells are skipped (handled with their main cell)
  // - Orphaned continuation cells (main cell unchanged) trigger a
  //   re-emit of the main cell from the buffer
  const tAnsi0 = performance.now()
  const incrOutput = changesToAnsi(pool, count, ctx, next).output
  const tAnsi1 = performance.now()

  // Accumulate output-phase sub-timing for benchmarks
  const outputDetailAcc = (globalThis as any).__silvery_bench_output_detail
  if (outputDetailAcc) {
    outputDetailAcc.diffMs += tDiff1 - tDiff0
    outputDetailAcc.ansiMs += tAnsi1 - tAnsi0
    outputDetailAcc.calls += 1
    outputDetailAcc.totalChanges += count
    // Count dirty rows
    let dirtyRowCount = 0
    const minRow = next.minDirtyRow
    const maxRow = next.maxDirtyRow
    if (minRow >= 0) {
      for (let r = minRow; r <= maxRow; r++) {
        if (next.isRowDirty(r)) dirtyRowCount++
      }
    }
    outputDetailAcc.dirtyRows += dirtyRowCount
    outputDetailAcc.outputBytes += incrOutput.length
  }

  // Log output sizes when debug or strict-accumulate is enabled
  if (DEBUG_OUTPUT || isStrictAccumulate()) {
    const bytes = Buffer.byteLength(incrOutput)
    try {
      const fs = require("fs")
      fs.appendFileSync("/tmp/silvery-sizes.log", `changesToAnsi: ${count} changes, ${bytes} bytes\n`)
    } catch {}
  }

  // Debug capture: write both incremental and fresh ANSI to files for comparison.
  if (DEBUG_CAPTURE) {
    _debugFrameCount++
    try {
      const fs = require("fs")
      const freshOutput = bufferToAnsi(next, ctx)
      const freshPrev = prev ? bufferToAnsi(prev, ctx) : ""
      // Replay incremental on top of fresh prev
      const w = Math.max(prev?.width ?? next.width, next.width)
      const h = Math.max(prev?.height ?? next.height, next.height)
      const screenIncr = replayAnsiWithStyles(w, h, freshPrev + incrOutput, ctx)
      const screenFresh = replayAnsiWithStyles(w, h, freshOutput, ctx)
      // Find first mismatch
      let mismatchInfo = ""
      for (let y = 0; y < h && !mismatchInfo; y++) {
        for (let x = 0; x < w && !mismatchInfo; x++) {
          const ic = screenIncr[y]?.[x]
          const fc = screenFresh[y]?.[x]
          if (ic && fc && (ic.char !== fc.char || !sgrColorEquals(ic.fg, fc.fg) || !sgrColorEquals(ic.bg, fc.bg))) {
            mismatchInfo = `MISMATCH at (${x},${y}): incr='${ic.char}' fresh='${fc.char}' incrFg=${formatColor(ic.fg)} freshFg=${formatColor(fc.fg)} incrBg=${formatColor(ic.bg)} freshBg=${formatColor(fc.bg)}`
            // Show row context
            const incrRow = screenIncr[y]!.map((c) => c.char).join("")
            const freshRow = screenFresh[y]!.map((c) => c.char).join("")
            mismatchInfo += `\n  incr row ${y}: ${incrRow.slice(Math.max(0, x - 20), x + 40)}\n  fresh row ${y}: ${freshRow.slice(Math.max(0, x - 20), x + 40)}`
          }
        }
      }
      const status = mismatchInfo || "MATCH"
      fs.appendFileSync("/tmp/silvery-capture.log", `Frame ${_debugFrameCount}: ${count} changes, ${status}\n`)
      if (mismatchInfo) {
        fs.writeFileSync(`/tmp/silvery-incr-${_debugFrameCount}.ansi`, freshPrev + incrOutput)
        fs.writeFileSync(`/tmp/silvery-fresh-${_debugFrameCount}.ansi`, freshOutput)
        fs.appendFileSync(
          "/tmp/silvery-capture.log",
          `  Saved ANSI files: /tmp/silvery-incr-${_debugFrameCount}.ansi and /tmp/silvery-fresh-${_debugFrameCount}.ansi\n`,
        )
      }
    } catch (e) {
      try {
        require("fs").appendFileSync("/tmp/silvery-capture.log", `Frame ${_debugFrameCount}: ERROR ${e}\n`)
      } catch {}
    }
  }

  // vt100 output verification: verify that the incremental ANSI output produces
  // the same visible terminal state as a fresh render. Uses the internal
  // replayAnsiWithStyles parser (stateless). Enabled by SILVERY_STRICT or
  // SILVERY_STRICT_TERMINAL containing "vt100".
  if (isStrictOutput() || tvState.hasVt100) {
    _verifyOutputEquivalence(prev, next, incrOutput, ctx, bufferToAnsi, outputGraphemeWidth, outputTextSizingEnabled)
  }

  // SILVERY_STRICT_ACCUMULATE: verify that the accumulated output from ALL frames
  // produces the same terminal state as a fresh render of the current buffer.
  // Catches compounding errors that per-frame verification misses.
  if (isStrictAccumulate()) {
    accState.accumulatedAnsi += incrOutput
    accState.accumulateFrameCount++
    _verifyAccumulatedOutput(next, ctx, accState, bufferToAnsi)
  }

  // SILVERY_STRICT_TERMINAL (xterm/ghostty backends): verify via independent
  // terminal emulators that the cumulative incremental ANSI output produces the
  // same terminal state as a fresh full render. Unlike the vt100 backend (which
  // uses replayAnsiWithStyles — the same ANSI parser as the output generator),
  // these feed output through real terminal emulators, catching bugs where our
  // parser and generator agree but a real terminal disagrees (e.g., OSC 66, wide
  // char cursor drift, buffer overflow scrolling).
  if (tvState.backends.length > 0 && (tvState.terminal || tvState.ghosttyTerminal)) {
    tvState.frameCount++
    _verifyTerminalEquivalence(tvState, incrOutput, next, ctx, bufferToAnsi)
  }

  if (CAPTURE_RAW) {
    try {
      const fs = require("fs")
      _captureRawFrameCount++
      // Append output to cumulative ANSI file
      fs.appendFileSync("/tmp/silvery-raw.ansi", incrOutput)
      // Also save the fresh render of this frame for comparison
      const freshOutput = bufferToAnsi(next, ctx)
      fs.writeFileSync(`/tmp/silvery-raw-fresh-${_captureRawFrameCount}.ansi`, freshOutput)
      fs.appendFileSync(
        "/tmp/silvery-raw-frames.jsonl",
        JSON.stringify({
          frame: _captureRawFrameCount,
          type: "incremental",
          changes: count,
          bytes: incrOutput.length,
          width: next.width,
          height: next.height,
        }) + "\n",
      )
    } catch {}
  }

  return incrOutput
}

/**
 * Check if a line has any non-space content or styling.
 * A row with only spaces but with background color or other styling
 * (bold, inverse, underline, etc.) is visually meaningful.
 */
function lineHasContent(buffer: TerminalBuffer, y: number): boolean {
  for (let x = 0; x < buffer.width; x++) {
    const ch = buffer.getCellChar(x, y)
    if (ch !== " " && ch !== "") return true
    // Styled blank cells are visually meaningful:
    // - background color (colored spacer rows)
    // - inverse (visible block of fg color)
    // - underline (visible line under space)
    // - strikethrough (visible line through space)
    const bg = buffer.getCellBg(x, y)
    if (bg !== null) return true
    if (buffer.getCellAttrs(x, y) & VISIBLE_SPACE_ATTR_MASK) return true
  }
  return false
}

/**
 * Find the last line with content in the buffer.
 */
function findLastContentLine(buffer: TerminalBuffer): number {
  for (let y = buffer.height - 1; y >= 0; y--) {
    if (lineHasContent(buffer, y)) {
      return y
    }
  }
  return 0 // At least render first line
}

/**
 * Compute the ANSI suffix that positions the real terminal cursor for inline mode.
 *
 * After inline rendering, the terminal cursor sits at the end of the last
 * content line. If a component used useCursor(), we move the cursor to
 * that position (relative to the rendered output). Otherwise we just show
 * the cursor at its current position.
 *
 * @param cursorPos The cursor state from useCursor() (or null if none)
 * @param buffer The rendered buffer
 * @param ctx Output context (termRows read from ctx.termRows)
 */
function inlineCursorSuffix(
  cursorPos: CursorState | null | undefined,
  buffer: TerminalBuffer,
  ctx: OutputContext,
): string {
  const { termRows } = ctx
  if (!cursorPos?.visible) {
    // No active cursor — hide it
    return "\x1b[?25l"
  }

  // Determine the visible row range (same logic as bufferToAnsi for inline)
  const lastContentLine = findLastContentLine(buffer)
  const maxLine = lastContentLine
  let startLine = 0
  const maxOutputLines = termRows != null ? Math.min(lastContentLine + 1, termRows) : lastContentLine + 1
  if (termRows != null && maxLine >= termRows) {
    startLine = maxLine - termRows + 1
  }

  // Convert absolute buffer cursor position to visible row index
  const visibleRow = cursorPos.y - startLine
  if (visibleRow < 0 || visibleRow >= maxOutputLines) {
    // Cursor is outside the visible area (scrolled off) — hide it
    return "\x1b[?25l"
  }

  // After rendering, the terminal cursor is at the end of the last output line.
  // The last output line is at visible row (maxOutputLines - 1).
  const currentRow = maxOutputLines - 1
  const rowDelta = currentRow - visibleRow

  let suffix = ""
  // Move up to the correct row
  if (rowDelta > 0) {
    suffix += `\x1b[${rowDelta}A`
  }
  // Move to column 0, then right to the correct column
  suffix += "\r"
  if (cursorPos.x > 0) {
    suffix += `\x1b[${cursorPos.x}C`
  }
  // Show cursor
  suffix += "\x1b[?25h"
  return suffix
}

/**
 * Incremental rendering for inline mode.
 *
 * When conditions are safe (no external writes, dimensions unchanged),
 * diffs prev/next buffers and emits only changed cells using relative
 * cursor positioning. Falls back to full render otherwise.
 *
 * This reduces output from ~5,848 bytes (full re-render at 50 items)
 * to ~50-100 bytes per keystroke, matching fullscreen efficiency.
 */
function inlineIncrementalRender(
  state: InlineCursorState,
  prev: TerminalBuffer,
  next: TerminalBuffer,
  scrollbackOffset: number,
  cursorPos?: CursorState | null,
  ctx: OutputContext = defaultContext,
  tvState?: TerminalVerifyState,
): string {
  const { termRows } = ctx
  // Guard: fall back to full render for complex cases
  if (scrollbackOffset > 0 || prev.width !== next.width || prev.height !== next.height || state.prevCursorRow < 0) {
    return inlineFullRender(state, prev, next, scrollbackOffset, cursorPos, ctx)
  }

  const nextContentLines = findLastContentLine(next) + 1
  const prevContentLines = findLastContentLine(prev) + 1

  // Compute visible ranges for both prev and next content
  const prevMaxOutputLines = termRows != null ? Math.min(prevContentLines, termRows) : prevContentLines
  const maxOutputLines = termRows != null ? Math.min(nextContentLines, termRows) : nextContentLines
  let prevStartLine = 0
  if (termRows != null && prevContentLines > termRows) {
    prevStartLine = prevContentLines - termRows
  }
  let startLine = 0
  if (termRows != null && nextContentLines > termRows) {
    startLine = nextContentLines - termRows
  }

  // When the visible window shifts (content exceeds termRows and startLine changes),
  // the entire visible region is different — fall back to full render.
  if (startLine !== prevStartLine) {
    return inlineFullRender(state, prev, next, scrollbackOffset, cursorPos, ctx)
  }

  // Diff buffers
  const { pool, count } = diffBuffers(prev, next)
  if (count === 0 && nextContentLines === prevContentLines) {
    // No buffer changes, but cursor position may have changed.
    // Emit cursor suffix to update the terminal cursor.
    const suffix = inlineCursorSuffix(cursorPos ?? null, next, ctx)
    updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine)
    return suffix
  }

  // Move cursor from tracked row to row 0 of render region
  let output = ""
  if (state.prevCursorRow > 0) {
    output += `\x1b[${state.prevCursorRow}A`
  }
  output += "\r"
  output += "\x1b[?25l" // hide cursor during update

  // Emit changes with relative positioning.
  // Use the larger of prev/next output lines so changesToAnsi processes all
  // visible cells including rows that shrank (need clearing) or grew (need writing).
  const effectiveOutputLines = Math.max(prevMaxOutputLines, maxOutputLines)
  const changes = changesToAnsi(pool, count, ctx, next, startLine, effectiveOutputLines)
  output += changes.output

  // After changesToAnsi, cursor is at changes.finalY (render-relative).
  // We need to position cursor at the effective bottom row, then handle
  // growth/shrinkage, and end at (maxOutputLines - 1) for inlineCursorSuffix.
  const finalY = changes.finalY
  const prevBottomRow = prevMaxOutputLines - 1
  const bottomRow = maxOutputLines - 1

  if (maxOutputLines > prevMaxOutputLines) {
    // Content grew: rows beyond the previous bottom don't exist on the terminal.
    // CUD (\x1b[nB) is clamped at the terminal edge and won't create new lines.
    // Use \r\n for each new row to ensure the terminal extends naturally.
    //
    // changesToAnsi may have already moved past prevBottomRow using \r\n
    // (creating new terminal lines in the process). Only add \r\n for
    // rows beyond what changesToAnsi already reached.
    const fromRow = finalY >= 0 ? finalY : 0
    if (fromRow >= bottomRow) {
      // changesToAnsi already reached or passed the new bottom — nothing to do
    } else if (fromRow >= prevBottomRow) {
      // Cursor already past old bottom (changesToAnsi extended the terminal).
      // Only need \r\n for remaining rows.
      const remainingRows = bottomRow - fromRow
      for (let i = 0; i < remainingRows; i++) {
        output += "\r\n"
      }
    } else {
      // Cursor is still within the old content area.
      // First, move to the old bottom row using CUD (safe, rows exist on terminal)
      if (fromRow < prevBottomRow) {
        const dy = prevBottomRow - fromRow
        output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
      }
      // Then extend to new bottom with \r\n for each new row
      const newRows = bottomRow - prevBottomRow
      for (let i = 0; i < newRows; i++) {
        output += "\r\n"
      }
    }
  } else if (maxOutputLines < prevMaxOutputLines) {
    // Content shrank: erase orphan lines below the new content.
    // changesToAnsi already wrote empty cells to clear the old content,
    // but we need \x1b[K to clear any residual characters.
    // The cursor is at finalY after changesToAnsi — move to the new bottom first.
    const fromRow = finalY >= 0 ? finalY : 0
    if (fromRow < bottomRow) {
      const dy = bottomRow - fromRow
      output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
    } else if (fromRow > bottomRow) {
      // Cursor is past the new bottom (was erasing orphan rows) — move back up
      output += `\x1b[${fromRow - bottomRow}A`
    }
    // Now at new bottom row (bottomRow). Erase orphan lines below by moving
    // down one line at a time, erasing each. This leaves cursor at the last
    // orphan row (prevMaxOutputLines - 1).
    const orphanCount = prevMaxOutputLines - maxOutputLines
    for (let y = 0; y < orphanCount; y++) {
      output += "\n\r\x1b[K"
    }
    // Move back up from last orphan row to new bottom row
    if (orphanCount > 0) output += `\x1b[${orphanCount}A`
  } else {
    // Same height: move to bottom row if not already there
    if (finalY >= 0 && finalY < bottomRow) {
      const dy = bottomRow - finalY
      output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
    }
  }

  output += inlineCursorSuffix(cursorPos ?? null, next, ctx)

  // STRICT verification for inline incremental renders.
  // Inline mode uses relative cursor positioning (CUU/CUD/CR) instead of
  // absolute CUP, so we can't pass the inline output directly to
  // verifyOutputEquivalence (which replays freshPrev + incrOutput — the cursor
  // position after freshPrev differs from the tracked prevCursorRow). Instead,
  // re-diff in fullscreen mode for vt100 verification. This verifies the buffer
  // diff logic produces correct ANSI output, even though it doesn't test the
  // inline cursor positioning specifically.
  if (isStrictOutput() || tvState?.hasVt100) {
    const savedMode = ctx.mode
    ctx.mode = "fullscreen"
    const fsIncrOutput = changesToAnsi(pool, count, ctx, next).output
    _verifyOutputEquivalence(prev, next, fsIncrOutput, ctx, bufferToAnsi, outputGraphemeWidth, outputTextSizingEnabled)
    ctx.mode = savedMode
  }
  // TODO: verifyTerminalEquivalence (xterm/ghostty) is skipped for inline mode.
  // The persistent terminal emulators track cumulative state across frames, but
  // inline mode's cursor management (relative positioning, scrollback promotion,
  // cursor tracking via prevCursorRow) is incompatible with this model.
  // verifyAccumulatedOutput is also skipped — inline has a different accumulation
  // model (scrollback promotion, frozen content).

  // Update tracking
  updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine)

  return output
}

/**
 * Full re-render for inline mode.
 *
 * Moves cursor to the start of the render region, writes the entire
 * buffer fresh, and erases any leftover lines from the previous render.
 *
 * When content exceeds terminal height, output is capped to termRows lines.
 * Lines beyond the terminal can't be managed (cursor-up is clamped at row 0),
 * so we truncate to prevent scrollback corruption.
 */
function inlineFullRender(
  state: InlineCursorState,
  prev: TerminalBuffer,
  next: TerminalBuffer,
  scrollbackOffset: number,
  cursorPos?: CursorState | null,
  ctx: OutputContext = defaultContext,
): string {
  const { termRows } = ctx
  const nextContentLines = findLastContentLine(next) + 1

  // Use tracked state from the previous frame for cursor position and output height.
  // state.prevCursorRow tracks where the terminal cursor actually is (row within render
  // region), and state.prevOutputLines tracks how many lines the previous frame rendered.
  // Re-deriving from the prev buffer can disagree (e.g., when cursor was positioned at a
  // visible row via useCursor, not at the bottom), causing the cursor-up to overshoot
  // and leaving orphan lines below the content ("inline-bleed").
  // Fall back to prev-buffer derivation only when cursor tracking is uninitialized.
  let prevOutputLines: number
  let cursorRowInRegion: number
  if (state.prevCursorRow >= 0) {
    prevOutputLines = state.prevOutputLines
    cursorRowInRegion = state.prevCursorRow
  } else {
    const prevContentLines = findLastContentLine(prev) + 1
    prevOutputLines = termRows != null ? Math.min(prevContentLines, termRows) : prevContentLines
    cursorRowInRegion = prevOutputLines - 1
  }

  // How far the cursor is below the start of the render region:
  // tracked cursor row + any lines written to stdout between renders.
  // Cap to termRows-1: terminal clamps cursor-up at row 0.
  const rawCursorOffset = cursorRowInRegion + scrollbackOffset
  const cursorOffset = termRows != null && !isStrictOutput() ? Math.min(rawCursorOffset, termRows - 1) : rawCursorOffset

  // Cap output at terminal height to prevent scrollback corruption.
  // Content taller than the terminal pushes lines into scrollback where
  // they can never be overwritten (cursor-up is clamped at terminal row 0).
  const maxOutputLines = termRows != null ? Math.min(nextContentLines, termRows) : nextContentLines

  // Quick check: if nothing changed and no scrollback displacement, skip
  if (scrollbackOffset === 0) {
    const { count } = diffBuffers(prev, next)
    if (count === 0) return ""
  }

  // Move cursor up to the start of the render region
  let prefix = ""
  if (cursorOffset > 0) {
    prefix = `\x1b[${cursorOffset}A\r`
  }
  // bufferToAnsi handles: hide cursor, render content lines with
  // \x1b[K (clear to EOL) on each line, and reset style at end.
  let output = prefix + bufferToAnsi(next, ctx, maxOutputLines)

  // Erase leftover lines if visible area shrank.
  // Account for terminal scroll: when useScrollback writes frozen items and the
  // cursor overflows the terminal, the terminal scrolls up. The scroll amount
  // equals how far rawCursorOffset exceeds termRows-1 (the terminal's last row).
  // That many old render lines were pushed into scrollback and no longer need
  // erasing. The remaining visible old render lines end at lastOccupiedLine.
  // Lines beyond that contain frozen items — those must NOT be erased.
  // Note: computed from terminal geometry, independent of strict-output cursor bypass.
  const terminalScroll = termRows != null ? Math.max(0, rawCursorOffset - (termRows - 1)) : 0
  const lastOccupiedLine = Math.max(prevOutputLines - 1 - terminalScroll, 0)
  const nextLastLine = maxOutputLines - 1
  if (lastOccupiedLine > nextLastLine) {
    for (let y = nextLastLine + 1; y <= lastOccupiedLine; y++) {
      output += "\n\r\x1b[K"
    }
    const up = lastOccupiedLine - nextLastLine
    if (up > 0) output += `\x1b[${up}A`
  }

  // Position the real terminal cursor and show it.
  // If a component called useCursor(), place the cursor there.
  // Otherwise, just show it at the current position (end of content).
  output += inlineCursorSuffix(cursorPos ?? null, next, ctx)

  // Update cursor tracking for incremental rendering on next frame
  let startLine = 0
  if (termRows != null && nextContentLines > termRows) startLine = nextContentLines - termRows
  updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine)

  return output
}

/**
 * Convert entire buffer to ANSI string.
 *
 * Mode is read from ctx.mode. maxRows is an explicit parameter because callers
 * sometimes pass a pre-computed value (e.g., maxOutputLines) rather than raw
 * ctx.termRows.
 *
 * @param maxRows Optional cap on number of rows to output (inline mode).
 *   When content exceeds terminal height, this prevents scrollback corruption.
 */
function bufferToAnsi(buffer: TerminalBuffer, ctx: OutputContext = defaultContext, maxRows?: number): string {
  const { mode } = ctx
  let output = ""
  let currentStyle: Style | null = null
  let currentHyperlink: string | undefined

  // Cap output to prevent rendering beyond terminal height.
  // Inline mode: render up to last content line; if taller than terminal, show bottom
  // (footer and latest content stay visible in scrollback).
  // Fullscreen mode: always start from top; cap at terminal height to prevent scroll
  // that desynchronizes prevBuffer from actual terminal state.
  let maxLine = mode === "inline" ? findLastContentLine(buffer) : buffer.height - 1
  let startLine = 0
  if (maxRows != null && maxLine >= maxRows) {
    if (mode === "fullscreen") {
      maxLine = maxRows - 1 // cap at terminal height, always from top
    } else {
      startLine = maxLine - maxRows + 1 // show bottom of content
    }
  }

  // Move cursor to start position based on mode
  if (mode === "fullscreen") {
    // Fullscreen: Move cursor to home position (top-left)
    output += "\x1b[H"
  } else {
    // Inline: Hide cursor, start from current position
    output += "\x1b[?25l"
  }

  // Reusable objects to avoid per-cell allocation in the inner loop
  const cell = createMutableCell()
  const cellStyle: Style = {
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
  }

  for (let y = startLine; y <= maxLine; y++) {
    // Move to start of line.
    // Fullscreen: CUP (absolute positioning) for rows after startLine.
    // After writing exactly `cols` chars, cursor enters pending-wrap state.
    // \r goes to col 0 of the CURRENT row (doesn't resolve wrap in real
    // terminals), overwriting the row. CUP is unambiguous across all
    // terminals and our internal ANSI parser (replayAnsiWithStyles).
    // First row skips CUP — cursor is already at home via \x1b[H.
    // Inline: \r on EVERY row (including first) to ensure column 0.
    if (mode === "inline") {
      output += "\r"
    } else if (y > startLine) {
      output += `\x1b[${y + 1};1H`
    }

    // Render the line content
    for (let x = 0; x < buffer.width; x++) {
      buffer.readCellInto(x, y, cell)

      // No continuation skip here. Valid continuation cells are never reached
      // because `if (cell.wide) x++` below jumps past them. Orphaned
      // continuation cells (wide char overwritten by region clear) must NOT
      // be skipped — they write a space to keep the VT cursor in sync.

      // Handle OSC 8 hyperlink transitions (separate from SGR style)
      const cellHyperlink = cell.hyperlink
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          output += "\x1b]8;;\x1b\\" // Close previous hyperlink
        }
        if (cellHyperlink) {
          output += `\x1b]8;;${cellHyperlink}\x1b\\` // Open new hyperlink
        }
        currentHyperlink = cellHyperlink
      }

      // Build style from cell and check if changed.
      // readCellInto mutates cell.attrs in place, so we must snapshot attrs
      // only when the style actually changes (which is rare -- most adjacent
      // cells share the same style). This avoids per-cell object allocation.
      cellStyle.fg = cell.fg
      cellStyle.bg = cell.bg
      cellStyle.underlineColor = cell.underlineColor
      cellStyle.attrs = cell.attrs
      if (!styleEquals(currentStyle, cellStyle)) {
        // Snapshot: copy attrs so currentStyle isn't invalidated by next readCellInto
        const saved: Style = {
          fg: cell.fg,
          bg: cell.bg,
          underlineColor: cell.underlineColor,
          attrs: { ...cell.attrs },
        }
        output += styleTransition(currentStyle, saved, ctx)
        currentStyle = saved
      }

      // Write character — empty-string chars are treated as space to ensure
      // the terminal cursor advances (an empty string writes nothing, causing
      // all subsequent characters on the row to shift left by one column).
      const char = cell.char || " "
      output += wrapTextSizing(char, cell.wide, ctx)

      // Wide characters occupy 2 columns in the terminal. Skip the next cell
      // position since the terminal cursor already advanced by 2. We skip
      // unconditionally (not relying on the next cell's continuation flag)
      // because the buffer may have a corrupted continuation cell — e.g., when
      // an adjacent container's region clear overwrites the continuation.
      // Without this, the non-continuation cell at x+1 would also be written,
      // causing every subsequent character on the row to shift right by 1.
      if (cell.wide) {
        x++
        // Cursor re-sync: some terminals treat multi-codepoint wide chars
        // (flag emoji like 🇨🇦) as two width-1 chars instead of one width-2
        // char. This causes the terminal cursor to be 1 column behind where
        // we expect. Emit an explicit cursor position to re-sync, mirroring
        // the re-sync in changesToAnsi. Cost: ~8 bytes per wide char; wide
        // chars are rare so overhead is negligible.
        // After x++, x points to the continuation cell. The next character
        // to write is at x+1 (after the loop increment), so position the
        // cursor at 0-indexed column x+1 = 1-indexed column x+2.
        if (mode === "fullscreen") {
          output += `\x1b[${y - startLine + 1};${x + 2}H`
        } else {
          // Inline: \r resets to column 0, CUF moves to expected position.
          // Reset bg first to prevent bleed across traversed cells.
          if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
            output += "\x1b[0m"
            currentStyle = null
          }
          const nextCol = x + 1
          output += "\r"
          if (nextCol > 0) output += nextCol === 1 ? "\x1b[C" : `\x1b[${nextCol}C`
        }
      }
    }

    // Close any open hyperlink at end of row
    if (currentHyperlink) {
      output += "\x1b]8;;\x1b\\"
      currentHyperlink = undefined
    }

    // Reset style before newline to prevent background color from
    // bleeding into the next line via the terminal's right margin fill.
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      output += "\x1b[0m"
      currentStyle = null
    }
    // Note: \x1b[K (Erase to End of Line) is intentionally omitted.
    // bufferToAnsi writes every cell in the row (buffer.width == terminal cols),
    // so there is nothing beyond the cursor to erase. More importantly, after
    // writing the last column the cursor enters pending-wrap state, and EL
    // behavior in pending-wrap is terminal-dependent — some terminals resolve
    // the wrap first, causing the next line's content to shift down by one row.

    // Move to next line (except for last line)
    if (y < maxLine) {
      if (mode === "inline") {
        // In inline mode, use \r\n to cancel DECAWM pending-wrap state.
        // When the line fills exactly `cols` characters, the cursor enters
        // pending-wrap. A bare \n in that state causes a double line advance
        // in some terminals (Ghostty, iTerm2). The \r first moves to column 0
        // (canceling pending-wrap), then \n advances one row cleanly.
        output += "\r\n"
      }
      // Fullscreen: no \n needed — CUP at the start of the next row handles
      // positioning. Bare \n in pending-wrap state is terminal-dependent
      // (some terminals double-advance, potentially causing scroll at the
      // bottom of the alternate screen).
    }
  }

  // Close any open hyperlink at end
  if (currentHyperlink) {
    output += "\x1b]8;;\x1b\\"
  }

  // Reset style at end
  output += "\x1b[0m"

  return output
}

// ============================================================================
// Buffer diffing (extracted to diff-buffers.ts)
// ============================================================================

import { diffBuffers } from "./diff-buffers"

/** Result from changesToAnsi: ANSI output string and final cursor position. */
interface ChangesResult {
  output: string
  /** Final render-relative cursor Y after emitting changes (-1 if no changes emitted). */
  finalY: number
}

/** Pre-allocated style object reused across changesToAnsi calls. */
const reusableCellStyle: Style = {
  fg: null,
  bg: null,
  underlineColor: null,
  attrs: {},
}

/**
 * Pre-allocated cell for looking up wide char main cells from the buffer
 * when an orphaned continuation cell is encountered in changesToAnsi.
 */
const wideCharLookupCell = createMutableCell()

/**
 * Sort a sub-range of the pool by position for optimal cursor movement.
 * Uses a simple in-place sort on pool[0..count).
 */
function sortPoolByPosition(pool: CellChange[], count: number): void {
  // Insertion sort is efficient for the typical case (mostly sorted or small count)
  for (let i = 1; i < count; i++) {
    const item = pool[i]!
    const iy = item.y
    const ix = item.x
    let j = i - 1
    while (j >= 0 && (pool[j]!.y > iy || (pool[j]!.y === iy && pool[j]!.x > ix))) {
      pool[j + 1] = pool[j]!
      j--
    }
    pool[j + 1] = item
  }
}

/**
 * Convert cell changes to optimized ANSI output.
 *
 * Wide characters are handled atomically: the main cell (wide:true) and its
 * continuation cell are treated as a single unit. When the main cell is in
 * the pool, it's emitted and the cursor advances by 2. When only the
 * continuation cell changed (e.g., bg color), the main cell is read from
 * the buffer and emitted to cover both columns.
 *
 * @param pool Pre-allocated pool of CellChange objects
 * @param count Number of valid entries in the pool
 * @param ctx Output context (mode read from ctx.mode)
 * @param buffer The current buffer, used to look up main cells for orphaned
 *   continuation cells (optional for backward compatibility)
 * @param startLine For inline mode: first visible buffer row (for termRows capping)
 * @param maxOutputLines For inline mode: number of visible rows
 */
function changesToAnsi(
  pool: CellChange[],
  count: number,
  ctx: OutputContext = defaultContext,
  buffer?: TerminalBuffer,
  startLine = 0,
  maxOutputLines = Infinity,
): ChangesResult {
  const { mode } = ctx
  if (count === 0) return { output: "", finalY: -1 }

  // Sort by position for optimal cursor movement (in-place, no allocation)
  sortPoolByPosition(pool, count)

  // ========================================================================
  // Hybrid emission: analyze per-row density and choose strategy per row.
  //
  // Dense rows (>50% of cells changed): emit the entire row from the buffer
  // with a single cursor positioning — avoids per-cell CUP overhead.
  //
  // Sparse rows: cell-by-cell emission (current behavior) — optimal for
  // isolated changes since it skips unchanged cells entirely.
  //
  // The threshold is checked only when the buffer is available (incremental
  // renders always pass it; bare changesToAnsi calls may not).
  // ========================================================================

  // Build a set of dense rows by scanning the sorted pool.
  // A row is dense if its changed cell count exceeds 50% of the buffer width.
  // We collect row boundaries (start/end indices in the pool) for dense rows
  // so we can skip their individual changes in the main loop.
  const denseRows = new Set<number>()
  const bufWidth = buffer?.width ?? 0
  const densityThreshold = bufWidth > 0 ? bufWidth * 0.5 : Infinity

  if (buffer && bufWidth > 0) {
    let rowStart = 0
    while (rowStart < count) {
      const rowY = pool[rowStart]!.y
      let rowEnd = rowStart + 1
      while (rowEnd < count && pool[rowEnd]!.y === rowY) rowEnd++
      const rowChanges = rowEnd - rowStart
      if (rowChanges >= densityThreshold) {
        denseRows.add(rowY)
      }
      rowStart = rowEnd
    }
  }

  let output = ""
  let currentStyle: Style | null = null
  let currentHyperlink: string | undefined
  const isInline = mode === "inline"
  const endLine = startLine + maxOutputLines // exclusive upper bound for inline filtering
  let finalY = -1
  let cursorX = -1
  let cursorY = -1
  let prevY = -1
  // Track the last emitted cell position to detect when a continuation
  // cell's main cell was already emitted in this pass.
  let lastEmittedX = -1
  let lastEmittedY = -1

  // Pre-allocated cell for full-row reads (dense row emission).
  // Separate from wideCharLookupCell to avoid aliasing issues.
  const denseRowCell = createMutableCell()

  for (let i = 0; i < count; i++) {
    const change = pool[i]!
    let x = change.x
    const y = change.y
    let cell = change.cell

    // In inline mode, skip changes outside the visible range
    if (isInline && (y < startLine || y >= endLine)) continue

    // ====================================================================
    // Dense row: emit the full row from the buffer.
    // Skip all pool entries for this row — we read directly from the buffer.
    // ====================================================================
    if (buffer && denseRows.has(y)) {
      // Skip remaining pool entries for this row
      while (i + 1 < count && pool[i + 1]!.y === y) i++

      const renderY = isInline ? y - startLine : y

      // Close hyperlink on row change
      if (y !== prevY && currentHyperlink) {
        output += "\x1b]8;;\x1b\\"
        currentHyperlink = undefined
      }
      prevY = y

      // Position cursor at start of row (column 0)
      if (renderY !== cursorY || cursorX !== 0) {
        // Reset style before cursor movement to prevent bg bleed
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1b[0m"
          currentStyle = null
        }

        if (cursorY >= 0 && renderY === cursorY + 1) {
          output += "\r\n"
        } else if (cursorY >= 0 && renderY > cursorY) {
          const dy = renderY - cursorY
          output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
        } else if (isInline) {
          const fromRow = cursorY >= 0 ? cursorY : 0
          if (renderY > fromRow) {
            output += `\x1b[${renderY - fromRow}B\r`
          } else if (renderY < fromRow) {
            output += `\x1b[${fromRow - renderY}A\r`
          } else {
            output += "\r"
          }
        } else {
          output += `\x1b[${renderY + 1};1H`
        }
      }

      // Emit the entire row from the buffer (like bufferToAnsi per-row logic)
      for (let bx = 0; bx < bufWidth; bx++) {
        buffer.readCellInto(bx, y, denseRowCell)

        // Handle hyperlink transitions
        const cellHyperlink = denseRowCell.hyperlink
        if (cellHyperlink !== currentHyperlink) {
          if (currentHyperlink) output += "\x1b]8;;\x1b\\"
          if (cellHyperlink) output += `\x1b]8;;${cellHyperlink}\x1b\\`
          currentHyperlink = cellHyperlink
        }

        // Style transition
        reusableCellStyle.fg = denseRowCell.fg
        reusableCellStyle.bg = denseRowCell.bg
        reusableCellStyle.underlineColor = denseRowCell.underlineColor
        reusableCellStyle.attrs = denseRowCell.attrs
        if (!styleEquals(currentStyle, reusableCellStyle)) {
          const prevStyle = currentStyle
          currentStyle = {
            fg: denseRowCell.fg,
            bg: denseRowCell.bg,
            underlineColor: denseRowCell.underlineColor,
            attrs: { ...denseRowCell.attrs },
          }
          output += styleTransition(prevStyle, currentStyle, ctx)
        }

        // Write character
        const char = denseRowCell.char || " "
        output += wrapTextSizing(char, denseRowCell.wide, ctx)

        // Skip continuation cell for wide chars
        if (denseRowCell.wide) {
          bx++
          // Cursor re-sync for wide chars (same logic as bufferToAnsi)
          if (isInline) {
            if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
              output += "\x1b[0m"
              currentStyle = null
            }
            const nextCol = bx + 1
            output += "\r"
            if (nextCol > 0) output += nextCol === 1 ? "\x1b[C" : `\x1b[${nextCol}C`
          } else {
            output += `\x1b[${renderY + 1};${bx + 2}H`
          }
        }
      }

      // Close hyperlink at end of row
      if (currentHyperlink) {
        output += "\x1b]8;;\x1b\\"
        currentHyperlink = undefined
      }

      // Reset style at end of row to prevent bg bleed into next row
      if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
        output += "\x1b[0m"
        currentStyle = null
      }

      cursorX = bufWidth
      cursorY = renderY
      lastEmittedX = bufWidth - 1
      lastEmittedY = y
      continue
    }

    // ====================================================================
    // Sparse cell: standard cell-by-cell emission
    // ====================================================================

    // Handle continuation cells: these are the second column of a wide
    // character. If their main cell (x-1) was already emitted in this
    // pass, skip. Otherwise, look up and emit the main cell from the
    // buffer so the wide char covers both columns.
    if (cell.continuation) {
      // Main cell was already emitted — skip
      if (lastEmittedX === x - 1 && lastEmittedY === y) continue

      // Orphaned continuation cell: main cell didn't change but this
      // cell's style did. Read the main cell from the buffer and emit it.
      if (buffer && x > 0) {
        x = x - 1
        buffer.readCellInto(x, y, wideCharLookupCell)
        cell = wideCharLookupCell
        // If the looked-up cell is itself a continuation (shouldn't happen
        // with valid buffers) or not wide, fall back to skipping
        if (cell.continuation || !cell.wide) continue
      } else {
        continue
      }
    }

    // For inline mode, use render-region-relative row indices
    const renderY = isInline ? y - startLine : y

    // Close hyperlink on row change (hyperlinks must not span across rows)
    if (y !== prevY && currentHyperlink) {
      output += "\x1b]8;;\x1b\\"
      currentHyperlink = undefined
    }
    prevY = y

    // Move cursor if needed (cursor must be exactly at target position)
    if (renderY !== cursorY || x !== cursorX) {
      // Use \r\n optimization only if cursor is initialized AND we're moving
      // to the next line at column 0. Don't use it when cursorY is -1
      // (uninitialized) because that would incorrectly emit a newline at start.
      // Bug km-x7ih: This was causing the first row to appear at the bottom.
      if (cursorY >= 0 && renderY === cursorY + 1 && x === 0) {
        // Next line at column 0, use newline (more efficient)
        // Reset style before newline to prevent background color bleeding
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1b[0m"
          currentStyle = null
        }
        output += "\r\n"
      } else if (cursorY >= 0 && renderY === cursorY && x > cursorX) {
        // Same row, forward: use CUF (Cursor Forward) for small jumps.
        // Reset bg before CUF to prevent background color bleeding into
        // skipped cells. Some terminals (e.g., Ghostty) may apply the
        // current bg to cells traversed by CUF, causing visual artifacts
        // when bg transitions from undefined→color (km-tui.col-header-dup).
        if (currentStyle && currentStyle.bg !== null) {
          output += "\x1b[0m"
          currentStyle = null
        }
        const dx = x - cursorX
        output += dx === 1 ? "\x1b[C" : `\x1b[${dx}C`
      } else if (cursorY >= 0 && renderY > cursorY && x === 0) {
        // Same column (0), down N rows: use \r + CUD
        const dy = renderY - cursorY
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1b[0m"
          currentStyle = null
        }
        output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
      } else if (isInline) {
        // Inline mode: relative positioning (no absolute row numbers)
        if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
          output += "\x1b[0m"
          currentStyle = null
        }
        // When cursorY === -1 (first change in incremental render),
        // the cursor is at row 0 (set by inlineIncrementalRender prefix).
        const fromRow = cursorY >= 0 ? cursorY : 0
        if (renderY > fromRow) {
          output += `\x1b[${renderY - fromRow}B\r`
        } else if (renderY < fromRow) {
          output += `\x1b[${fromRow - renderY}A\r`
        } else {
          output += "\r"
        }
        if (x > 0) output += x === 1 ? "\x1b[C" : `\x1b[${x}C`
      } else {
        // Fullscreen: absolute position (1-indexed)
        output += `\x1b[${renderY + 1};${x + 1}H`
      }
    }

    // Handle OSC 8 hyperlink transitions (separate from SGR style)
    const cellHyperlink = cell.hyperlink
    if (cellHyperlink !== currentHyperlink) {
      if (currentHyperlink) {
        output += "\x1b]8;;\x1b\\" // Close previous hyperlink
      }
      if (cellHyperlink) {
        output += `\x1b]8;;${cellHyperlink}\x1b\\` // Open new hyperlink
      }
      currentHyperlink = cellHyperlink
    }

    // Update style if changed (reuse pre-allocated style object)
    reusableCellStyle.fg = cell.fg
    reusableCellStyle.bg = cell.bg
    reusableCellStyle.underlineColor = cell.underlineColor
    reusableCellStyle.attrs = cell.attrs
    if (!styleEquals(currentStyle, reusableCellStyle)) {
      // Snapshot: copy attrs so currentStyle isn't invalidated by next iteration
      const prevStyle = currentStyle
      currentStyle = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: { ...cell.attrs },
      }
      output += styleTransition(prevStyle, currentStyle, ctx)
    }

    // Write character — empty-string chars are treated as space to ensure
    // the terminal cursor advances and cursorX tracking stays correct.
    const char = cell.char || " "
    output += wrapTextSizing(char, cell.wide, ctx)
    cursorX = x + (cell.wide ? 2 : 1)
    cursorY = renderY
    lastEmittedX = x
    lastEmittedY = y

    // Wide char cursor re-sync: terminals may advance the cursor by 1
    // instead of 2 for certain emoji (flag sequences, text-presentation
    // emoji without OSC 66 support). In bufferToAnsi (full render) this
    // only causes a consistent per-row shift since every cell is written
    // sequentially. But in changesToAnsi, contiguous runs rely on cursor
    // auto-advance, so a width mismatch causes progressive drift —
    // characters appear at wrong positions, mixing old and new content.
    // Fix: emit an explicit cursor position after each wide char to
    // re-sync the terminal cursor with our tracking. Cost: ~8 bytes per
    // wide char (CUP in fullscreen, \r+CUF in inline). Wide chars are
    // rare so the overhead is negligible.
    if (cell.wide) {
      if (isInline) {
        // Inline: \r resets to column 0, CUF moves to expected position.
        // Reset bg first to prevent bleed across traversed cells.
        if (currentStyle && currentStyle.bg !== null) {
          output += "\x1b[0m"
          currentStyle = null
        }
        output += "\r"
        if (cursorX > 0) output += cursorX === 1 ? "\x1b[C" : `\x1b[${cursorX}C`
      } else {
        // Fullscreen: CUP (absolute position) — no style reset needed.
        output += `\x1b[${cursorY + 1};${cursorX + 1}H`
      }
    }
  }

  finalY = cursorY

  // Close any open hyperlink
  if (currentHyperlink) {
    output += "\x1b]8;;\x1b\\"
  }

  // Reset style at end
  if (currentStyle) {
    output += "\x1b[0m"
  }

  return { output, finalY }
}

// =============================================================================
// Color code helpers (imported from ansi/sgr-codes.ts)
// =============================================================================

/**
 * Convert style to ANSI escape sequence (chalk-compatible format).
 *
 * Emits only non-default attributes with no reset prefix. Called when there
 * is no previous style context (first cell or after all attributes are off),
 * so the terminal is already in reset state.
 *
 * Uses native 4-bit codes for basic colors (0-7), 256-color for extended,
 * and true-color for RGB. Each attribute gets its own \x1b[Xm sequence to
 * match chalk's output format.
 *
 * Emits SGR codes including:
 * - Basic colors (30-37, 40-47)
 * - 256-color (38;5;N, 48;5;N)
 * - True color (38;2;r;g;b, 48;2;r;g;b)
 * - Underline styles (4:x where x = 0-5)
 * - Underline color (58;5;N or 58;2;r;g;b)
 * - Inverse uses SGR 7 so terminals swap fg/bg correctly (including default colors)
 */
function styleToAnsi(style: Style, ctx: OutputContext = defaultContext): string {
  const fg = style.fg
  const bg = style.bg

  // Collect all SGR codes into one combined sequence: \x1b[code1;code2;...m
  // This is more spec-compliant and produces fewer bytes than separate sequences.
  const codes: string[] = []

  // Foreground color
  if (fg !== null) {
    codes.push(fgColorCode(fg))
  }

  // Background color (DEFAULT_BG sentinel = terminal default, skip)
  if (bg !== null && !isDefaultBg(bg)) {
    codes.push(bgColorCode(bg))
  }

  // Attributes
  if (style.attrs.bold) codes.push("1")
  if (style.attrs.dim) codes.push("2")
  if (style.attrs.italic) codes.push("3")

  // Underline: use SGR 4:x if style specified, otherwise simple SGR 4
  if (!ctx.caps.underlineStyles) {
    // Terminal doesn't support SGR 4:x — use simple SGR 4
    if (style.attrs.underline || style.attrs.underlineStyle) codes.push("4")
  } else {
    const underlineStyle = style.attrs.underlineStyle
    const sgrSubparam = underlineStyleToSgr(underlineStyle)
    if (sgrSubparam !== null && sgrSubparam !== 0) {
      codes.push(`4:${sgrSubparam}`)
    } else if (style.attrs.underline) {
      codes.push("4")
    }
  }

  // Use SGR 7 for inverse — lets the terminal correctly swap fg/bg
  // (including default terminal colors that have no explicit ANSI code)
  if (style.attrs.blink) codes.push("5")
  if (style.attrs.inverse) codes.push("7")
  if (style.attrs.hidden) codes.push("8")
  if (style.attrs.strikethrough) codes.push("9")

  // Append underline color if specified (SGR 58) — skip for limited terminals
  if (ctx.caps.underlineColor && style.underlineColor !== null && style.underlineColor !== undefined) {
    if (typeof style.underlineColor === "number") {
      codes.push(`58;5;${style.underlineColor}`)
    } else {
      codes.push(`58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}`)
    }
  }

  if (codes.length === 0) return ""
  return `\x1b[${codes.join(";")}m`
}

// =============================================================================
// STRICT/Verification code lives in output-verify.ts (~990 LOC extracted).
// =============================================================================
