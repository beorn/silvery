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
  colorEquals,
  createMutableCell,
  hasActiveAttrs,
  isDefaultBg,
  styleEquals,
} from "../buffer"
import type { CursorState } from "@silvery/react/hooks/useCursor"
import { IncrementalRenderMismatchError } from "../errors"
import { isPrivateUseArea, textSized } from "../text-sizing"
import { graphemeWidth, isTextSizingEnabled, isTextPresentationEmoji } from "../unicode"
import type { CellChange } from "./types"

const DEBUG_OUTPUT = !!process.env.SILVERY_DEBUG_OUTPUT
const FULL_RENDER = !!process.env.SILVERY_FULL_RENDER

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
 * and caches. Threaded through internal functions to eliminate module-level
 * mutable state. Caches are per-context because SGR output depends on caps.
 */
interface OutputContext {
  readonly caps: OutputCaps
  readonly measurer: OutputMeasurer | null
  readonly sgrCache: Map<string, string>
  readonly transitionCache: Map<string, string>
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

interface OutputMeasurer {
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
export function createOutputPhase(
  caps: Partial<OutputCaps>,
  measurer?: OutputMeasurer,
): OutputPhaseFn {
  // Instance-scoped context — caps, measurer, and caches are all per-instance.
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
    // Handle scrollback promotion: write frozen content + live content in one pass.
    if (pendingPromotion && mode === "inline") {
      const promo = pendingPromotion
      pendingPromotion = null
      return handleScrollbackPromotion(
        inlineState,
        promo.frozenContent,
        promo.frozenLineCount,
        next,
        termRows,
        cursorPos,
        ctx,
      )
    }
    return outputPhase(
      prev,
      next,
      mode,
      scrollbackOffset,
      termRows,
      cursorPos,
      inlineState,
      ctx,
      accState,
    )
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
  termRows: number | undefined,
  cursorPos: CursorState | null | undefined,
  ctx: OutputContext,
): string {
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
  output += bufferToAnsi(next, "inline", ctx, maxOutputLines)

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
  output += inlineCursorSuffix(cursorPos ?? null, next, termRows)

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
    state.prevCursorRow =
      visibleRow >= 0 && visibleRow < maxOutputLines ? visibleRow : maxOutputLines - 1
  } else {
    state.prevCursorRow = maxOutputLines - 1
  }
  state.prevOutputLines = maxOutputLines

  return output
}

// These use getters so they can be set after module load (e.g., in test files).
// SILVERY_STRICT enables buffer + output checks (per-frame).
// SILVERY_STRICT_OUTPUT=0 explicitly disables output checking even when SILVERY_STRICT is set.
// SILVERY_STRICT_ACCUMULATE is separate — it replays ALL frames (O(N²)) and is opt-in only.
function isStrictOutput(): boolean {
  const outputEnv = process.env.SILVERY_STRICT_OUTPUT
  if (outputEnv === "0" || outputEnv === "false") return false
  return !!outputEnv || !!process.env.SILVERY_STRICT
}
function isStrictAccumulate(): boolean {
  return !!process.env.SILVERY_STRICT_ACCUMULATE
}

/** Per-instance state for SILVERY_STRICT_ACCUMULATE verification. */
interface AccumulateState {
  accumulatedAnsi: string
  accumulateWidth: number
  accumulateHeight: number
  accumulateFrameCount: number
}

/** Default accumulate state used by bare outputPhase() calls. */
const defaultAccState: AccumulateState = {
  accumulatedAnsi: "",
  accumulateWidth: 0,
  accumulateHeight: 0,
  accumulateFrameCount: 0,
}

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
    state.prevCursorRow =
      visibleRow >= 0 && visibleRow < maxOutputLines ? visibleRow : maxOutputLines - 1
  } else {
    // Cursor hidden: cursor stays at end of last content line
    state.prevCursorRow = maxOutputLines - 1
  }
  state.prevOutputLines = maxOutputLines
}

/**
 * Wrap a cell character in OSC 66 if text sizing is enabled and the character
 * has width ambiguity. Covers:
 * - PUA characters (nerdfont icons, powerline symbols)
 * - Text-presentation emoji (e.g., warning sign, checkmark, airplane)
 *
 * OSC 66 tells the terminal to render the character in exactly `width` cells,
 * matching the layout engine's measurement and eliminating misalignment.
 */
function wrapTextSizing(char: string, wide: boolean, ctx: OutputContext): string {
  if (!wide || !outputTextSizingEnabled(ctx)) return char
  const cp = char.codePointAt(0)
  if (cp !== undefined && isPrivateUseArea(cp)) {
    return textSized(char, 2)
  }
  if (isTextPresentationEmoji(char)) {
    return textSized(char, 2)
  }
  return char
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
      codes.push(
        `58;2;${newStyle.underlineColor.r};${newStyle.underlineColor.g};${newStyle.underlineColor.b}`,
      )
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
): string {
  // Bare outputPhase() calls use a fresh cursor state each time.
  // prevCursorRow = -1 means incremental rendering always falls back to full render.
  // Instance-scoped state (via createOutputPhase) enables incremental across frames.
  const inlineState = _inlineState ?? createInlineCursorState()
  const ctx = _ctx ?? defaultContext
  const accState = _accState ?? defaultAccState

  // After resetInlineState (e.g., useScrollback cleared and re-emitted frozen items),
  // treat the next render as a first render. The cursor is at a known position
  // (right after the re-emitted frozen items) and prev is stale.
  if (mode === "inline" && inlineState.forceFirstRender) {
    inlineState.forceFirstRender = false
    prev = null // may already be null (runtime.invalidate on resize), consume flag regardless
  }

  // First render: output entire buffer
  if (!prev) {
    // Inline mode resize optimization: if the runtime invalidated prevBuffer (resize)
    // but we have a stored buffer with matching dimensions, use incremental rendering
    // instead of clear+full render. This avoids wiping content when the buffer is unchanged
    // (e.g., content narrower than both old and new terminal widths).
    if (mode === "inline" && inlineState.prevBuffer && inlineState.prevCursorRow >= 0) {
      const stored = inlineState.prevBuffer
      if (stored.width === next.width && stored.height === next.height) {
        // Dimensions match — use incremental rendering (skip clear entirely)
        inlineState.prevBuffer = next
        return inlineIncrementalRender(
          inlineState,
          stored,
          next,
          scrollbackOffset,
          termRows,
          cursorPos,
          ctx,
        )
      }
    }

    // In inline mode, cap output to terminal height to prevent scrollback corruption.
    // Content taller than the terminal would push lines into scrollback where they
    // can never be overwritten on re-render (cursor-up is clamped at terminal row 0).
    const firstOutput = bufferToAnsi(next, mode, ctx, mode === "inline" ? termRows : undefined)
    // For inline first render, append cursor positioning and initialize tracking
    if (mode === "inline") {
      const firstContentLines = findLastContentLine(next) + 1
      const firstMaxOutput =
        termRows != null ? Math.min(firstContentLines, termRows) : firstContentLines
      let firstStartLine = 0
      if (termRows != null && firstContentLines > termRows)
        firstStartLine = firstContentLines - termRows

      // Resize: clear the entire visible screen and re-render.
      // Terminal reflow is unpredictable — lines wrap differently based on content,
      // unicode, wrap points. Rather than guessing cursor-up distances, overshoot:
      // ESC[nA is clamped at row 0 of the visible screen (can't touch scrollback),
      // so using termRows is safe. Frozen scrollback content above is preserved.
      let prefix = ""
      if (inlineState.prevCursorRow >= 0) {
        const clearDistance =
          termRows ?? Math.max(inlineState.prevCursorRow, inlineState.prevOutputLines - 1)
        if (clearDistance > 0) {
          prefix += `\x1b[${clearDistance}A`
        }
        prefix += "\r\x1b[J" // column 0, clear from cursor to end of screen
      }

      inlineState.prevBuffer = next
      updateInlineCursorRow(inlineState, cursorPos, firstMaxOutput, firstStartLine)
      return prefix + firstOutput + inlineCursorSuffix(cursorPos ?? null, next, termRows)
    }
    if (isStrictAccumulate()) {
      accState.accumulatedAnsi = firstOutput
      accState.accumulateWidth = next.width
      accState.accumulateHeight = next.height
      accState.accumulateFrameCount = 0
    }
    return firstOutput
  }

  // Inline mode: use incremental rendering when safe, fall back to full render.
  if (mode === "inline") {
    inlineState.prevBuffer = next
    return inlineIncrementalRender(
      inlineState,
      prev,
      next,
      scrollbackOffset,
      termRows,
      cursorPos,
      ctx,
    )
  }

  // SILVERY_FULL_RENDER: bypass incremental diff, always render full buffer.
  // Use to diagnose garbled rendering — if FULL_RENDER fixes it, the bug
  // is in changesToAnsi (diff → ANSI serialization).
  if (FULL_RENDER) {
    return bufferToAnsi(next, mode, ctx)
  }

  // Fullscreen mode: diff and emit only changes
  const { pool, count } = diffBuffers(prev, next)

  if (DEBUG_OUTPUT) {
    // eslint-disable-next-line no-console
    console.error(`[SILVERY_DEBUG_OUTPUT] diffBuffers: ${count} changes`)
    const debugLimit = Math.min(count, 10)
    for (let i = 0; i < debugLimit; i++) {
      const change = pool[i]!
      // eslint-disable-next-line no-console
      console.error(`  (${change.x},${change.y}): "${change.cell.char}"`)
    }
    if (count > 10) {
      // eslint-disable-next-line no-console
      console.error(`  ... and ${count - 10} more`)
    }
  }

  if (count === 0) {
    return "" // No changes
  }

  // Wide characters are handled atomically in changesToAnsi():
  // - Wide char main cells emit the character and advance cursor by 2
  // - Continuation cells are skipped (handled with their main cell)
  // - Orphaned continuation cells (main cell unchanged) trigger a
  //   re-emit of the main cell from the buffer
  const { output: incrOutput } = changesToAnsi(pool, count, mode, ctx, next)

  // Log output sizes when debug or strict-accumulate is enabled
  if (DEBUG_OUTPUT || isStrictAccumulate()) {
    const bytes = Buffer.byteLength(incrOutput)
    try {
      const fs = require("fs")
      fs.appendFileSync(
        "/tmp/silvery-sizes.log",
        `changesToAnsi: ${count} changes, ${bytes} bytes\n`,
      )
    } catch {}
  }

  // SILVERY_STRICT_OUTPUT: verify that the incremental ANSI output produces the
  // same visible terminal state as a fresh render. Catches bugs in changesToAnsi
  // that SILVERY_STRICT (buffer-level check) cannot detect.
  if (isStrictOutput()) {
    verifyOutputEquivalence(prev, next, incrOutput, mode, ctx)
  }

  // SILVERY_STRICT_ACCUMULATE: verify that the accumulated output from ALL frames
  // produces the same terminal state as a fresh render of the current buffer.
  // Catches compounding errors that per-frame verification misses.
  if (isStrictAccumulate()) {
    accState.accumulatedAnsi += incrOutput
    accState.accumulateFrameCount++
    verifyAccumulatedOutput(next, mode, ctx, accState)
  }

  return incrOutput
}

/**
 * Check if a line has any non-space content.
 */
function lineHasContent(buffer: TerminalBuffer, y: number): boolean {
  for (let x = 0; x < buffer.width; x++) {
    const ch = buffer.getCellChar(x, y)
    if (ch !== " " && ch !== "") {
      return true
    }
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
 * @param termRows Terminal height cap (may limit visible rows)
 */
function inlineCursorSuffix(
  cursorPos: CursorState | null | undefined,
  buffer: TerminalBuffer,
  termRows?: number,
): string {
  if (!cursorPos?.visible) {
    // No active cursor — hide it
    return "\x1b[?25l"
  }

  // Determine the visible row range (same logic as bufferToAnsi for inline)
  const lastContentLine = findLastContentLine(buffer)
  const maxLine = lastContentLine
  let startLine = 0
  const maxOutputLines =
    termRows != null ? Math.min(lastContentLine + 1, termRows) : lastContentLine + 1
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
  termRows?: number,
  cursorPos?: CursorState | null,
  ctx: OutputContext = defaultContext,
): string {
  // Guard: fall back to full render for complex cases
  if (
    scrollbackOffset > 0 ||
    prev.width !== next.width ||
    prev.height !== next.height ||
    state.prevCursorRow < 0
  ) {
    return inlineFullRender(state, prev, next, scrollbackOffset, termRows, cursorPos, ctx)
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
    return inlineFullRender(state, prev, next, scrollbackOffset, termRows, cursorPos, ctx)
  }

  // Diff buffers
  const { pool, count } = diffBuffers(prev, next)
  if (count === 0 && nextContentLines === prevContentLines) return ""

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
  const changes = changesToAnsi(pool, count, "inline", ctx, next, startLine, effectiveOutputLines)
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
    // Now at new bottom row. Erase orphan lines below.
    for (let y = maxOutputLines; y < prevMaxOutputLines; y++) {
      output += "\n\r\x1b[K"
    }
    // Move back up to new bottom
    const up = prevMaxOutputLines - maxOutputLines
    if (up > 0) output += `\x1b[${up}A`
  } else {
    // Same height: move to bottom row if not already there
    if (finalY >= 0 && finalY < bottomRow) {
      const dy = bottomRow - finalY
      output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
    }
  }

  output += inlineCursorSuffix(cursorPos ?? null, next, termRows)

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
  termRows?: number,
  cursorPos?: CursorState | null,
  ctx: OutputContext = defaultContext,
): string {
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
  const cursorOffset =
    termRows != null && !isStrictOutput()
      ? Math.min(rawCursorOffset, termRows - 1)
      : rawCursorOffset

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
  let output = prefix + bufferToAnsi(next, "inline", ctx, maxOutputLines)

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
  output += inlineCursorSuffix(cursorPos ?? null, next, termRows)

  // Update cursor tracking for incremental rendering on next frame
  let startLine = 0
  if (termRows != null && nextContentLines > termRows) startLine = nextContentLines - termRows
  updateInlineCursorRow(state, cursorPos, maxOutputLines, startLine)

  return output
}

/**
 * Convert entire buffer to ANSI string.
 *
 * @param maxRows Optional cap on number of rows to output (inline mode).
 *   When content exceeds terminal height, this prevents scrollback corruption.
 */
function bufferToAnsi(
  buffer: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
  ctx: OutputContext = defaultContext,
  maxRows?: number,
): string {
  let output = ""
  let currentStyle: Style | null = null
  let currentHyperlink: string | undefined

  // For inline mode, only render up to the last line with content.
  // When content exceeds terminal height (maxRows), show the bottom of the
  // buffer so the footer and latest content stay visible.
  let maxLine = mode === "inline" ? findLastContentLine(buffer) : buffer.height - 1
  let startLine = 0
  if (maxRows != null && maxLine >= maxRows) {
    startLine = maxLine - maxRows + 1
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
    // Move to start of line
    if (y > startLine || mode === "inline") {
      output += "\r"
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
      if (cell.wide) x++
    }

    // Close any open hyperlink at end of row
    if (currentHyperlink) {
      output += "\x1b]8;;\x1b\\"
      currentHyperlink = undefined
    }

    // Reset style before clear-to-end and newline to prevent background
    // color from filling the right margin or bleeding into the next line.
    // \x1b[K] uses current SGR attributes for the erased area.
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      output += "\x1b[0m"
      currentStyle = null
    }
    // Clear to end of line (removes any leftover content from previous render)
    output += "\x1b[K"

    // Move to next line (except for last line)
    if (y < maxLine) {
      // In inline mode, use \r\n instead of bare \n to cancel DECAWM
      // pending-wrap state. When the line fills exactly `cols` characters,
      // the cursor enters pending-wrap at position cols. A bare \n in that
      // state causes a double line advance in some terminals (Ghostty, iTerm2).
      // The \r first moves to column 0 (canceling pending-wrap), then \n
      // advances one row cleanly.
      output += mode === "inline" ? "\r\n" : "\n"
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
// Pre-allocated diff pool
// ============================================================================

/**
 * Create a fresh CellChange with empty cell data.
 * Used to populate the pre-allocated pool.
 */
function createEmptyCellChange(): CellChange {
  return {
    x: 0,
    y: 0,
    cell: {
      char: " ",
      fg: null,
      bg: null,
      underlineColor: null,
      attrs: {},
      wide: false,
      continuation: false,
    },
  }
}

/** Pre-allocated pool of CellChange objects, reused across frames. */
const diffPool: CellChange[] = []

/** Current pool capacity. */
let diffPoolCapacity = 0

/**
 * Ensure the diff pool has at least `capacity` entries.
 * Grows the pool if needed; never shrinks.
 */
function ensureDiffPoolCapacity(capacity: number): void {
  if (capacity <= diffPoolCapacity) return
  for (let i = diffPoolCapacity; i < capacity; i++) {
    diffPool.push(createEmptyCellChange())
  }
  diffPoolCapacity = capacity
}

/**
 * Write cell data from a buffer into a pre-allocated CellChange entry.
 * Uses readCellInto for zero-allocation reads.
 */
function writeCellChange(change: CellChange, x: number, y: number, buffer: TerminalBuffer): void {
  change.x = x
  change.y = y
  buffer.readCellInto(x, y, change.cell)
}

/**
 * Write empty cell data into a pre-allocated CellChange entry.
 * Used for shrink regions where cells need to be cleared.
 */
function writeEmptyCellChange(change: CellChange, x: number, y: number): void {
  change.x = x
  change.y = y
  const cell = change.cell
  cell.char = " "
  cell.fg = null
  cell.bg = null
  cell.underlineColor = null
  // Reset attrs fields
  const attrs = cell.attrs
  attrs.bold = undefined
  attrs.dim = undefined
  attrs.italic = undefined
  attrs.underline = undefined
  attrs.underlineStyle = undefined
  attrs.blink = undefined
  attrs.inverse = undefined
  attrs.hidden = undefined
  attrs.strikethrough = undefined
  cell.wide = false
  cell.continuation = false
}

/**
 * Diff result: pool reference + count (avoids per-frame array allocation).
 */
interface DiffResult {
  pool: CellChange[]
  count: number
}

/** Reusable diff result object (avoids allocating a new one per frame). */
const diffResult: DiffResult = { pool: diffPool, count: 0 }

/**
 * Diff two buffers and return changes via pre-allocated pool.
 *
 * Optimization: Uses a pre-allocated pool of CellChange objects to avoid
 * allocating new objects per changed cell. Uses readCellInto for
 * zero-allocation cell reads. The pool grows as needed but is reused
 * between frames. Returns a pool+count pair instead of slicing the array.
 */
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): DiffResult {
  // Ensure pool is large enough for worst case (all cells changed).
  // Wide→narrow transitions emit an extra change for the continuation cell,
  // so worst case is 1.5x (every other cell could be a wide→narrow transition).
  const cells = Math.max(prev.width, next.width) * Math.max(prev.height, next.height)
  const maxChanges = cells + (cells >> 1) // 1.5x
  ensureDiffPoolCapacity(maxChanges)

  let changeCount = 0

  // Dimension mismatch means we need to re-render everything visible
  const height = Math.min(prev.height, next.height)
  const width = Math.min(prev.width, next.width)

  // Use dirty row bounding box to narrow the scan range.
  // If no rows are dirty, minDirtyRow is -1 and the loop body is skipped.
  const startRow = next.minDirtyRow === -1 ? 0 : next.minDirtyRow
  const endRow = next.maxDirtyRow === -1 ? -1 : Math.min(next.maxDirtyRow, height - 1)

  for (let y = startRow; y <= endRow; y++) {
    // Skip individual clean rows within the bounding box
    if (!next.isRowDirty(y)) continue

    // Fast row-level pre-check: if all packed metadata, chars, AND Map-based
    // extras (true colors, underline colors, hyperlinks) match, skip per-cell
    // comparison entirely. This catches rows marked dirty by fill() or
    // scrollRegion() that didn't actually change content.
    // NOTE: rowExtrasEquals is essential — rowMetadataEquals only checks packed
    // flags (e.g., "has true color fg"), not the actual RGB values in the Maps.
    if (
      next.rowMetadataEquals(y, prev) &&
      next.rowCharsEquals(y, prev) &&
      next.rowExtrasEquals(y, prev)
    )
      continue

    for (let x = 0; x < width; x++) {
      // Use buffer's optimized cellEquals which compares packed metadata first
      if (!next.cellEquals(x, y, prev)) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++

        // Wide char transition: when prev had a wide char and next doesn't,
        // we must also emit the continuation position (x+1) as a change.
        // The terminal's state at x+1 contains the second half of the wide
        // char, but the buffer may show x+1 as "unchanged" (both prev and
        // next are ' '). Without this explicit change, changesToAnsi skips
        // x+1 and the terminal retains the wide char remnant, causing
        // cursor drift.
        if (x + 1 < width && prev.isCellWide(x, y) && !next.isCellWide(x, y)) {
          writeCellChange(diffPool[changeCount]!, x + 1, y, next)
          changeCount++
        }
      }
    }
  }

  // Handle size growth: add all cells in new areas.
  // Width growth covers the right strip (x >= prev.width) for ALL rows.
  // Height growth covers the bottom strip (y >= prev.height) but only up to
  // prev.width to avoid double-counting the corner with width growth.
  const widthGrew = next.width > prev.width
  if (widthGrew) {
    for (let y = 0; y < next.height; y++) {
      for (let x = prev.width; x < next.width; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }
  if (next.height > prev.height) {
    // When width also grew, only iterate x=0..prev.width (the rest was
    // already covered by width growth above). Otherwise iterate full width.
    const xEnd = widthGrew ? prev.width : next.width
    for (let y = prev.height; y < next.height; y++) {
      for (let x = 0; x < xEnd; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }

  // Handle size shrink: clear cells in old-but-not-new areas.
  // Width shrink covers x >= next.width for the shared height.
  // Height shrink covers y >= next.height but only up to next.width when
  // width also shrank, to avoid double-counting the corner.
  const widthShrank = prev.width > next.width
  if (widthShrank) {
    for (let y = 0; y < height; y++) {
      for (let x = next.width; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }
  if (prev.height > next.height) {
    // When width also shrank, the corner (x >= next.width, y >= next.height)
    // was NOT covered by width shrink (which only iterates y < height =
    // min(prev.height, next.height) = next.height). So iterate full prev.width.
    for (let y = next.height; y < prev.height; y++) {
      for (let x = 0; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }

  if (changeCount > maxChanges) {
    throw new Error(
      `diffBuffers: changeCount ${changeCount} exceeds pool capacity ${maxChanges} ` +
        `(prev ${prev.width}x${prev.height}, next ${next.width}x${next.height})`,
    )
  }

  diffResult.pool = diffPool
  diffResult.count = changeCount
  return diffResult
}

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
 * @param mode Render mode: "fullscreen" uses absolute positioning,
 *   "inline" uses relative cursor movement
 * @param buffer The current buffer, used to look up main cells for orphaned
 *   continuation cells (optional for backward compatibility)
 * @param startLine For inline mode: first visible buffer row (for termRows capping)
 * @param maxOutputLines For inline mode: number of visible rows
 */
function changesToAnsi(
  pool: CellChange[],
  count: number,
  mode: "fullscreen" | "inline" = "fullscreen",
  ctx: OutputContext = defaultContext,
  buffer?: TerminalBuffer,
  startLine = 0,
  maxOutputLines = Infinity,
): ChangesResult {
  if (count === 0) return { output: "", finalY: -1 }

  // Sort by position for optimal cursor movement (in-place, no allocation)
  sortPoolByPosition(pool, count)

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

  for (let i = 0; i < count; i++) {
    const change = pool[i]!
    let x = change.x
    const y = change.y
    let cell = change.cell

    // In inline mode, skip changes outside the visible range
    if (isInline && (y < startLine || y >= endLine)) continue

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
// Color code helpers — emit shortest SGR form for each color type
// =============================================================================

/**
 * Emit the shortest SGR code string for a foreground color.
 * - Basic 0-7: 4-bit code (30+N)
 * - Extended 8-255: 256-color (38;5;N)
 * - RGB: true color (38;2;R;G;B)
 */
function fgColorCode(color: number | { r: number; g: number; b: number }): string {
  if (typeof color === "number") {
    if (color >= 0 && color <= 7) return `${30 + color}`
    return `38;5;${color}`
  }
  return `38;2;${color.r};${color.g};${color.b}`
}

/**
 * Emit the shortest SGR code string for a background color.
 * - Basic 0-7: 4-bit code (40+N)
 * - Extended 8-255: 256-color (48;5;N)
 * - RGB: true color (48;2;R;G;B)
 */
function bgColorCode(color: number | { r: number; g: number; b: number }): string {
  if (typeof color === "number") {
    if (color >= 0 && color <= 7) return `${40 + color}`
    return `48;5;${color}`
  }
  return `48;2;${color.r};${color.g};${color.b}`
}

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

  // Build individual escape sequences (chalk-compatible: one \x1b[Xm per attribute)
  let result = ""

  // Foreground color
  if (fg !== null) {
    result += `\x1b[${fgColorCode(fg)}m`
  }

  // Background color (DEFAULT_BG sentinel = terminal default, skip)
  if (bg !== null && !isDefaultBg(bg)) {
    result += `\x1b[${bgColorCode(bg)}m`
  }

  // Attributes
  if (style.attrs.bold) result += "\x1b[1m"
  if (style.attrs.dim) result += "\x1b[2m"
  if (style.attrs.italic) result += "\x1b[3m"

  // Underline: use SGR 4:x if style specified, otherwise simple SGR 4
  if (!ctx.caps.underlineStyles) {
    // Terminal doesn't support SGR 4:x — use simple SGR 4
    if (style.attrs.underline || style.attrs.underlineStyle) result += "\x1b[4m"
  } else {
    const underlineStyle = style.attrs.underlineStyle
    const sgrSubparam = underlineStyleToSgr(underlineStyle)
    if (sgrSubparam !== null && sgrSubparam !== 0) {
      result += `\x1b[4:${sgrSubparam}m`
    } else if (style.attrs.underline) {
      result += "\x1b[4m"
    }
  }

  // Use SGR 7 for inverse — lets the terminal correctly swap fg/bg
  // (including default terminal colors that have no explicit ANSI code)
  if (style.attrs.inverse) result += "\x1b[7m"
  if (style.attrs.strikethrough) result += "\x1b[9m"

  // Append underline color if specified (SGR 58) — skip for limited terminals
  if (
    ctx.caps.underlineColor &&
    style.underlineColor !== null &&
    style.underlineColor !== undefined
  ) {
    if (typeof style.underlineColor === "number") {
      result += `\x1b[58;5;${style.underlineColor}m`
    } else {
      result += `\x1b[58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}m`
    }
  }

  return result
}

// =============================================================================
// SILVERY_STRICT_OUTPUT: ANSI output verification via virtual terminal replay
// =============================================================================

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
interface StyledCell {
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
      if (i + 1 < parts.length && parts[i + 1] === "5" && i + 2 < parts.length) {
        sgr.fg = parseInt(parts[i + 2]!)
        i += 2
      } else if (i + 1 < parts.length && parts[i + 1] === "2" && i + 4 < parts.length) {
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
      if (i + 1 < parts.length && parts[i + 1] === "5" && i + 2 < parts.length) {
        sgr.bg = parseInt(parts[i + 2]!)
        i += 2
      } else if (i + 1 < parts.length && parts[i + 1] === "2" && i + 4 < parts.length) {
        sgr.bg = {
          r: parseInt(parts[i + 2]!),
          g: parseInt(parts[i + 3]!),
          b: parseInt(parts[i + 4]!),
        }
        i += 4
      }
    } else if (n === 49) {
      sgr.bg = null
    } else if (n >= 90 && n <= 97) {
      sgr.fg = n - 90 + 8 // bright colors: 8-15
    } else if (n >= 100 && n <= 107) {
      sgr.bg = n - 100 + 8
    }
    // 58/59 (underline color) not tracked in cell comparison for now
    i++
  }
}

/**
 * Replay ANSI output tracking both characters AND SGR styles.
 * Returns a 2D grid of StyledCell objects.
 */
export function replayAnsiWithStyles(
  width: number,
  height: number,
  ansi: string,
  ctx: OutputContext = defaultContext,
): StyledCell[][] {
  const screen: StyledCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => createDefaultStyledCell()),
  )
  let cx = 0
  let cy = 0
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
          if (params === "") {
            cx = 0
            cy = 0
          } else {
            const cmdParts = params.split(";")
            cy = Math.max(0, (parseInt(cmdParts[0]!) || 1) - 1)
            cx = Math.max(0, (parseInt(cmdParts[1]!) || 1) - 1)
          }
        } else if (cmd === "K") {
          // Erase to end of line — fills with current bg (or default)
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
        } else if (cmd === "A") {
          cy = Math.max(0, cy - (parseInt(params) || 1))
        } else if (cmd === "B") {
          cy = Math.min(height - 1, cy + (parseInt(params) || 1))
        } else if (cmd === "C") {
          cx = Math.min(width - 1, cx + (parseInt(params) || 1))
        } else if (cmd === "D") {
          cx = Math.max(0, cx - (parseInt(params) || 1))
        } else if (cmd === "G") {
          cx = Math.max(0, (parseInt(params) || 1) - 1)
        } else if (cmd === "J") {
          if (params === "2") {
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                screen[y]![x] = createDefaultStyledCell()
              }
          }
        } else if (cmd === "m") {
          // SGR — apply to current state
          applySgrParams(params, sgr)
        }
        // Skip DEC modes (h/l), etc.
      } else if (ansi[i + 1] === "]") {
        // OSC: extract payload and check for OSC 66 (text sizing)
        i += 2
        let oscPayload = ""
        while (i < ansi.length) {
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
            i += 2
            break
          }
          if (ansi[i] === "\x07") {
            i++
            break
          }
          oscPayload += ansi[i]
          i++
        }
        // OSC 66: text sizing — format is "66;w=N;TEXT"
        // Extract TEXT and process it as a character with the declared width
        if (oscPayload.startsWith("66;")) {
          const semiIdx = oscPayload.indexOf(";", 3)
          if (semiIdx !== -1) {
            const text = oscPayload.slice(semiIdx + 1)
            const widthParam = oscPayload.slice(3, semiIdx)
            const declaredWidth = widthParam.startsWith("w=")
              ? parseInt(widthParam.slice(2)) || 1
              : 1
            if (cy < height && cx < width) {
              const cell = screen[cy]![cx]!
              cell.char = text
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
              if (declaredWidth > 1 && cx + 1 < width) {
                const cont = screen[cy]![cx + 1]!
                cont.char = " "
                cont.fg = null
                cont.bg = sgr.bg
                cont.bold = false
                cont.dim = false
                cont.italic = false
                cont.underline = false
                cont.blink = false
                cont.inverse = false
                cont.hidden = false
                cont.strikethrough = false
              }
              cx += declaredWidth
            }
          }
        }
        // Other OSC sequences (8=hyperlinks, etc.) are skipped
      } else if (ansi[i + 1] === ">") {
        i += 2
        while (i < ansi.length && ansi[i] !== "\x1b") i++
      } else {
        i += 2
      }
    } else if (ansi[i] === "\r") {
      cx = 0
      i++
    } else if (ansi[i] === "\n") {
      cy = Math.min(height - 1, cy + 1)
      i++
    } else {
      // Extract a full grapheme cluster (handles surrogate pairs and multi-codepoint sequences
      // like flag emoji 🇺🇸 which are 2 regional indicator codepoints = 4 UTF-16 code units)
      const cp = ansi.codePointAt(i)!
      // Advance past this codepoint (2 code units if surrogate pair, 1 otherwise)
      const cpLen = cp > 0xffff ? 2 : 1
      // Collect combining marks and joiners that follow (ZWJ sequences, variation selectors, etc.)
      let grapheme = String.fromCodePoint(cp)
      let j = i + cpLen
      let prevWasZwj = false
      while (j < ansi.length) {
        const nextCp = ansi.codePointAt(j)!
        // Combining marks (U+0300-U+036F, U+20D0-U+20FF, U+FE00-U+FE0F variation selectors),
        // ZWJ (U+200D), regional indicators following another regional indicator.
        // After ZWJ, the next codepoint is always consumed (it's the joinee — e.g.,
        // 🏃‍♂️ = runner + ZWJ + male sign + VS16: male sign is NOT a combining mark
        // but must be part of this grapheme cluster).
        const isCombining =
          prevWasZwj || // Joinee after ZWJ
          (nextCp >= 0x0300 && nextCp <= 0x036f) || // Combining Diacritical Marks
          (nextCp >= 0x20d0 && nextCp <= 0x20ff) || // Combining Diacritical Marks for Symbols
          (nextCp >= 0xfe00 && nextCp <= 0xfe0f) || // Variation Selectors
          nextCp === 0xfe0e ||
          nextCp === 0xfe0f || // Text/Emoji presentation
          nextCp === 0x200d || // ZWJ
          (nextCp >= 0xe0100 && nextCp <= 0xe01ef) || // Variation Selectors Supplement
          // Skin tone modifiers (Fitzpatrick scale)
          (nextCp >= 0x1f3fb && nextCp <= 0x1f3ff) ||
          // Regional indicator following a regional indicator (flag sequences)
          (cp >= 0x1f1e6 && cp <= 0x1f1ff && nextCp >= 0x1f1e6 && nextCp <= 0x1f1ff)
        if (!isCombining) break
        prevWasZwj = nextCp === 0x200d
        const nextLen = nextCp > 0xffff ? 2 : 1
        grapheme += String.fromCodePoint(nextCp)
        j += nextLen
      }
      if (cy < height && cx < width) {
        const gw = outputGraphemeWidth(grapheme, ctx)
        const charWidth = gw || 1

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

        // Wide character overwrites the next cell (continuation cell)
        // Real terminals do this automatically — the wide char occupies 2 columns
        if (charWidth > 1 && cx + 1 < width) {
          const cont = screen[cy]![cx + 1]!
          cont.char = " "
          cont.fg = null
          cont.bg = sgr.bg
          cont.bold = false
          cont.dim = false
          cont.italic = false
          cont.underline = false
          cont.blink = false
          cont.inverse = false
          cont.hidden = false
          cont.strikethrough = false
        }
        cx += charWidth
      }
      i = j
    }
  }
  return screen
}

/** Format a color value for display. */
function formatColor(c: number | { r: number; g: number; b: number } | null): string {
  if (c === null) return "default"
  if (typeof c === "number") return `${c}`
  return `rgb(${c.r},${c.g},${c.b})`
}

/**
 * Verify that applying changesToAnsi output to a previous terminal state
 * produces the same visible characters AND styles as a fresh render of the
 * next buffer. Throws on mismatch.
 *
 * This catches SGR style bugs that character-only verification misses.
 */
function verifyOutputEquivalence(
  prev: TerminalBuffer,
  next: TerminalBuffer,
  incrOutput: string,
  mode: "fullscreen" | "inline",
  ctx: OutputContext = defaultContext,
): void {
  const w = Math.max(prev.width, next.width)
  // VT height must accommodate the larger buffer to prevent scrolling artifacts
  // when prev is taller than next (e.g., items removed from a scrollback list).
  // We only compare up to next.height rows — excess rows should be cleared.
  const vtHeight = Math.max(prev.height, next.height)
  const compareHeight = next.height
  // DEBUG: log buffer dimensions
  if (process.env.SILVERY_DEBUG_OUTPUT) {
    // eslint-disable-next-line no-console
    console.error(
      `[VERIFY] prev=${prev.width}x${prev.height} next=${next.width}x${next.height} vtSize=${w}x${vtHeight}`,
    )
  }
  // Replay: fresh prev render + incremental diff applied on top
  const freshPrev = bufferToAnsi(prev, mode, ctx)
  if (process.env.SILVERY_DEBUG_OUTPUT) {
    // eslint-disable-next-line no-console
    console.error(`[VERIFY] freshPrev len=${freshPrev.length} incrOutput len=${incrOutput.length}`)
    // Show incrOutput as escaped string
    const escaped = incrOutput.replace(/\x1b/g, "\\e").replace(/\r/g, "\\r").replace(/\n/g, "\\n")
    // eslint-disable-next-line no-console
    console.error(`[VERIFY] incrOutput: ${escaped.slice(0, 500)}`)
  }
  const screenIncr = replayAnsiWithStyles(w, vtHeight, freshPrev + incrOutput, ctx)
  // Replay: fresh render of next buffer
  const freshNext = bufferToAnsi(next, mode, ctx)
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
      if (c.wide) parts.push(`W@${cx}:${cp}(gw=${outputGraphemeWidth(c.char, ctx)})`)
      if (c.continuation) parts.push(`C@${cx}`)
      // Flag cells where written char width differs from buffer expectation
      const charToWrite = c.char || " "
      const vtWidth = outputGraphemeWidth(charToWrite, ctx)
      const bufWidth = c.wide ? 2 : 1
      if (!c.continuation && vtWidth !== bufWidth) {
        parts.push(
          `MISMATCH@${cx}:${cp}(vtW=${vtWidth},bufW=${bufWidth},tse=${outputTextSizingEnabled(ctx)})`,
        )
      }
    }
    return parts.join(" ")
  }

  // Compare character by character AND style by style
  for (let y = 0; y < compareHeight; y++) {
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
          `SILVERY_STRICT_OUTPUT char mismatch at (${x},${y}): ` +
          `incremental='${incr.char}' fresh='${fresh.char}'\n` +
          `  prev buffer cell: char='${prevCell.char}' bg=${prevCell.bg} wide=${prevCell.wide} cont=${prevCell.continuation}\n` +
          `  next buffer cell: char='${nextCell.char}' bg=${nextCell.bg} wide=${nextCell.wide} cont=${nextCell.continuation}\n` +
          `  incr row: ${incrRow}\n` +
          `  fresh row: ${freshRow}\n` +
          `  prev row: ${prevRow}\n` +
          `Wide/cont cells on row ${y} (next buffer): ${_dumpRowWideCells(next, y)}\n` +
          `Wide/cont cells on row ${y} (prev buffer): ${_dumpRowWideCells(prev, y)}\n` +
          `Column detail around mismatch:\n${colDetails.join("\n")}`
        // eslint-disable-next-line no-console
        console.error(msg)
        throw new IncrementalRenderMismatchError(msg)
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
          `SILVERY_STRICT_OUTPUT style mismatch at (${x},${y}) char='${incr.char}': ` +
          diffs.join(", ") +
          `\n  incremental: fg=${formatColor(incr.fg)} bg=${formatColor(incr.bg)} bold=${incr.bold} dim=${incr.dim}` +
          `\n  fresh:       fg=${formatColor(fresh.fg)} bg=${formatColor(fresh.bg)} bold=${fresh.bold} dim=${fresh.dim}`
        // eslint-disable-next-line no-console
        console.error(msg)
        throw new IncrementalRenderMismatchError(msg)
      }
    }
  }
}

/**
 * Verify that the accumulated output from all frames produces the same
 * terminal state as a fresh render of the current buffer.
 * Catches compounding errors across multiple render frames.
 */
function verifyAccumulatedOutput(
  currentBuffer: TerminalBuffer,
  mode: "fullscreen" | "inline",
  ctx: OutputContext = defaultContext,
  accState: AccumulateState = defaultAccState,
): void {
  const w = accState.accumulateWidth
  const h = accState.accumulateHeight
  // Replay all accumulated output (first render + all incremental updates)
  const screenAccumulated = replayAnsiWithStyles(w, h, accState.accumulatedAnsi, ctx)
  // Replay fresh render of current buffer
  const freshOutput = bufferToAnsi(currentBuffer, mode, ctx)
  const screenFresh = replayAnsiWithStyles(w, h, freshOutput, ctx)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const accum = screenAccumulated[y]![x]!
      const fresh = screenFresh[y]![x]!

      if (accum.char !== fresh.char) {
        const msg =
          `SILVERY_STRICT_ACCUMULATE char mismatch at (${x},${y}) after ${accState.accumulateFrameCount} frames: ` +
          `accumulated='${accum.char}' fresh='${fresh.char}'`
        // eslint-disable-next-line no-console
        console.error(msg)
        throw new IncrementalRenderMismatchError(msg)
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
        // eslint-disable-next-line no-console
        console.error(msg)
        throw new IncrementalRenderMismatchError(msg)
      }
    }
  }
}

/** Compare two SGR color values. */
function sgrColorEquals(
  a: number | { r: number; g: number; b: number } | null,
  b: number | { r: number; g: number; b: number } | null,
): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a === "number" || typeof b === "number") return a === b
  return a.r === b.r && a.g === b.g && a.b === b.b
}
