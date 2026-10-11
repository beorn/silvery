/**
 * Hybrid output emission — per-mode emitters.
 *
 * Three emission modes, picked per-row by `pickEmissionMode` in
 * `output-density.ts`. All three mutate a shared `OutputEmitState` so that
 * cursor and style state carries across rows (enabling the `\r\n` shortcut
 * and avoiding redundant SGR transitions).
 *
 * Tracking: km-silvery.known-limits.hybrid-output
 *
 * Phase 2 implementation. Phase 3 will wire these into output-phase.ts
 * behind the SILVERY_HYBRID_OUTPUT feature flag. Until then, the new
 * emitters are reachable only via direct unit tests; legacy `changesToAnsi`
 * is unchanged.
 */

import { sanitizeHyperlinkTarget } from "@silvery/ansi"
import {
  type Style,
  type TerminalBuffer,
  createMutableCell,
  hasActiveAttrs,
  styleEquals,
} from "../buffer"
import type { DirtyRowSummary } from "./output-density"
import type { CellChange } from "./types"
import {
  type OutputContext,
  _internalStyleTransition as styleTransition,
  _internalWrapTextSizing as wrapTextSizing,
} from "./output-phase"

/**
 * Mutable state threaded through each per-row emitter so that cross-row
 * cursor and style transitions are as cheap as the current `changesToAnsi`
 * single-pass implementation.
 *
 * Zero-allocation discipline: this is reused across rows and across frames.
 * The `OutputEmitState` lives in the `createOutputPhase` closure alongside
 * `InlineCursorState`.
 */
export interface OutputEmitState {
  /** Accumulated ANSI output for the current frame. */
  output: string
  /** Current terminal cursor column, render-relative. -1 means uninitialized. */
  cursorX: number
  /** Current terminal cursor row, render-relative. -1 means uninitialized. */
  cursorY: number
  /** Previous emitted row (for cross-row shortcut detection). */
  prevY: number
  /** Last emitted cell column (wide-char continuation tracking). */
  lastEmittedX: number
  /** Last emitted cell row (wide-char continuation tracking). */
  lastEmittedY: number
  /** Currently active SGR style, or null if reset. */
  currentStyle: Style | null
  /** Last emitted sanitized OSC 8 URL, or undefined if none is open. */
  currentHyperlink: string | undefined
  /** Inline mode adjustments: subtract from y to get render-relative row. */
  startLine: number
  /** True if emitting in inline mode (relative cursor positioning). */
  isInline: boolean
}

/** Create a fresh `OutputEmitState`. Reused across rows by emitters. */
export function createOutputEmitState(opts?: {
  startLine?: number
  isInline?: boolean
}): OutputEmitState {
  return {
    output: "",
    cursorX: -1,
    cursorY: -1,
    prevY: -1,
    lastEmittedX: -1,
    lastEmittedY: -1,
    currentStyle: null,
    currentHyperlink: undefined,
    startLine: opts?.startLine ?? 0,
    isInline: opts?.isInline ?? false,
  }
}

// ============================================================================
// Shared per-cell emission helper
// ============================================================================

/**
 * Pre-allocated style scratch object — reused across all emitter calls.
 * Per-frame emit state, not per-call.
 */
const reusableCellStyle: Style = {
  fg: null,
  bg: null,
  underlineColor: null,
  attrs: {},
}

/** Pre-allocated cell scratch for buffer reads. */
const reusableCell = createMutableCell()

/**
 * Move the cursor to `(renderY, x)`, choosing the cheapest escape sequence.
 * Mutates `state.output`, `state.cursorX`, `state.cursorY`.
 *
 * - First positioning (`cursorY === -1`): fullscreen uses absolute CUP,
 *   inline uses `\r` + CUF.
 * - Same-row forward jump: CUF (resetting bg first to prevent bleed).
 * - Next-row col-0: `\r\n` (resetting style first).
 * - Same-column down N rows: `\r\x1b[NB` or `\r\n` for N=1.
 * - Inline arbitrary positioning: relative `\x1b[NA/B` + `\r` + CUF.
 * - Fullscreen arbitrary: absolute CUP `\x1b[Y;XH`.
 */
function moveCursorTo(state: OutputEmitState, x: number, renderY: number): void {
  const { cursorX, cursorY, isInline } = state
  if (renderY === cursorY && x === cursorX) return

  // \r\n shortcut: next row at column 0.
  if (cursorY >= 0 && renderY === cursorY + 1 && x === 0) {
    if (
      state.currentStyle &&
      (state.currentStyle.bg !== null || hasActiveAttrs(state.currentStyle.attrs))
    ) {
      state.output += "\x1b[0m"
      state.currentStyle = null
    }
    state.output += "\r\n"
  } else if (cursorY >= 0 && renderY === cursorY && x > cursorX) {
    // Same row forward.
    if (state.currentStyle && state.currentStyle.bg !== null) {
      state.output += "\x1b[0m"
      state.currentStyle = null
    }
    const dx = x - cursorX
    state.output += dx === 1 ? "\x1b[C" : `\x1b[${dx}C`
  } else if (cursorY >= 0 && renderY > cursorY && x === 0) {
    // Same column 0 down N rows.
    if (
      state.currentStyle &&
      (state.currentStyle.bg !== null || hasActiveAttrs(state.currentStyle.attrs))
    ) {
      state.output += "\x1b[0m"
      state.currentStyle = null
    }
    const dy = renderY - cursorY
    state.output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
  } else if (isInline) {
    if (
      state.currentStyle &&
      (state.currentStyle.bg !== null || hasActiveAttrs(state.currentStyle.attrs))
    ) {
      state.output += "\x1b[0m"
      state.currentStyle = null
    }
    const fromRow = cursorY >= 0 ? cursorY : 0
    if (renderY > fromRow) {
      state.output += `\x1b[${renderY - fromRow}B\r`
    } else if (renderY < fromRow) {
      state.output += `\x1b[${fromRow - renderY}A\r`
    } else {
      state.output += "\r"
    }
    if (x > 0) state.output += x === 1 ? "\x1b[C" : `\x1b[${x}C`
  } else {
    state.output += `\x1b[${renderY + 1};${x + 1}H`
  }

  state.cursorX = x
  state.cursorY = renderY
}

/**
 * Emit a single cell at the current cursor position.
 * Caller is responsible for moving the cursor first via `moveCursorTo`.
 *
 * Handles: hyperlink open/close, style transition, char write, wide-char
 * cursor resync. Mutates `state.output`, `state.currentStyle`,
 * `state.currentHyperlink`, `state.cursorX`, `state.lastEmittedX/Y`.
 */
function emitCellAtCursor(
  state: OutputEmitState,
  x: number,
  renderY: number,
  cell: {
    char: string
    fg: Style["fg"]
    bg: Style["bg"]
    underlineColor: Style["underlineColor"]
    attrs: Style["attrs"]
    wide: boolean
    hyperlink?: string
  },
  ctx: OutputContext,
): void {
  // Hyperlink transition. Track the last emitted sanitized URL, not the raw
  // cell value, so a refused target drops OSC 8 without close+open noise.
  if (cell.hyperlink !== state.currentHyperlink) {
    const next = cell.hyperlink ? sanitizeHyperlinkTarget(cell.hyperlink) : undefined
    if (next !== state.currentHyperlink) {
      if (state.currentHyperlink) {
        state.output += "\x1b]8;;\x1b\\"
      }
      if (next) {
        state.output += `\x1b]8;;${next}\x1b\\`
      }
    }
    state.currentHyperlink = next
  }

  // Style transition.
  reusableCellStyle.fg = cell.fg
  reusableCellStyle.bg = cell.bg
  reusableCellStyle.underlineColor = cell.underlineColor
  reusableCellStyle.attrs = cell.attrs
  if (!styleEquals(state.currentStyle, reusableCellStyle)) {
    const prev = state.currentStyle
    const snapshot: Style = {
      fg: cell.fg,
      bg: cell.bg,
      underlineColor: cell.underlineColor,
      attrs: { ...cell.attrs },
    }
    state.output += styleTransition(prev, snapshot, ctx)
    state.currentStyle = snapshot
  }

  // Char (empty → space so terminal advances cursor).
  const char = cell.char || " "
  state.output += wrapTextSizing(char, cell.wide, ctx)

  state.cursorX = x + (cell.wide ? 2 : 1)
  state.cursorY = renderY
  state.lastEmittedX = x
  state.lastEmittedY = renderY - state.startLine // store buffer-relative y

  // Wide-char cursor resync (terminal-bug workaround for flag emoji etc.).
  if (cell.wide) {
    if (state.isInline) {
      if (state.currentStyle && state.currentStyle.bg !== null) {
        state.output += "\x1b[0m"
        state.currentStyle = null
      }
      state.output += "\r"
      if (state.cursorX > 0) {
        state.output += state.cursorX === 1 ? "\x1b[C" : `\x1b[${state.cursorX}C`
      }
    } else {
      state.output += `\x1b[${state.cursorY + 1};${state.cursorX + 1}H`
    }
  }
}

/**
 * Reset row-level state (close hyperlinks, reset bg) when transitioning to
 * a new row. Called at the start of each emitter and at the end of
 * whole-row emissions to prevent right-margin bleed.
 */
function endOfRowReset(state: OutputEmitState): void {
  if (state.currentHyperlink) {
    state.output += "\x1b]8;;\x1b\\"
    state.currentHyperlink = undefined
  }
  if (
    state.currentStyle &&
    (state.currentStyle.bg !== null || hasActiveAttrs(state.currentStyle.attrs))
  ) {
    state.output += "\x1b[0m"
    state.currentStyle = null
  }
}

// ============================================================================
// Mode A — whole-row emission
// ============================================================================

/**
 * Emit an entire row's worth of cells unconditionally, matching the
 * per-cell inner loop of `bufferToAnsi`. Used when `pickEmissionMode`
 * returns `"whole-row"`.
 *
 * Contract:
 * - Writes every cell in `[0, buffer.width)` on row `summary.y`.
 * - Starts with an absolute cursor jump to `(summary.y, 0)`.
 * - Mutates `state` to reflect the final cursor position at
 *   `(summary.y, buffer.width)` (pending-wrap state).
 * - Appends to `state.output`.
 */
export function emitWholeRow(
  summary: DirtyRowSummary,
  buffer: TerminalBuffer,
  ctx: OutputContext,
  state: OutputEmitState,
): void {
  const y = summary.y
  const renderY = state.isInline ? y - state.startLine : y

  // Close hyperlink on row change.
  if (y !== state.prevY && state.currentHyperlink) {
    state.output += "\x1b]8;;\x1b\\"
    state.currentHyperlink = undefined
  }
  state.prevY = y

  // Position cursor at start of row.
  moveCursorTo(state, 0, renderY)

  for (let x = 0; x < buffer.width; x++) {
    buffer.readCellInto(x, y, reusableCell)
    emitCellAtCursor(
      state,
      x,
      renderY,
      {
        char: reusableCell.char,
        fg: reusableCell.fg,
        bg: reusableCell.bg,
        underlineColor: reusableCell.underlineColor,
        attrs: reusableCell.attrs,
        wide: reusableCell.wide,
        hyperlink: reusableCell.hyperlink,
      },
      ctx,
    )
    if (reusableCell.wide) {
      x++ // skip continuation column
    }
  }

  endOfRowReset(state)
  state.cursorX = buffer.width
  state.cursorY = renderY
  state.lastEmittedX = buffer.width - 1
  state.lastEmittedY = y
}

// ============================================================================
// Mode B — run-length emission
// ============================================================================

/**
 * Emit the maximal contiguous runs of dirty cells on a row. Used when
 * `pickEmissionMode` returns `"run-length"`.
 *
 * Contract:
 * - Iterates `summary.runs` in order. For each run, moves the cursor to
 *   `(summary.y, run.start)` then emits cells `[run.start, run.end]`.
 * - Relies on cursor auto-advance within a run — no per-cell CUF.
 * - Mutates `state.cursorX` / `state.cursorY` to reflect the final position
 *   of the last run on the row.
 * - Appends to `state.output`.
 *
 * Run bounds are trusted: `analyzeRowDensity` widens runs to cover both
 * halves of straddling wide chars.
 */
export function emitRuns(
  summary: DirtyRowSummary,
  pool: readonly CellChange[],
  buffer: TerminalBuffer,
  ctx: OutputContext,
  state: OutputEmitState,
): void {
  const y = summary.y
  const renderY = state.isInline ? y - state.startLine : y

  if (y !== state.prevY && state.currentHyperlink) {
    state.output += "\x1b]8;;\x1b\\"
    state.currentHyperlink = undefined
  }
  state.prevY = y

  // Build a quick lookup for cells whose changes are in the pool, keyed
  // by x. For positions inside the run that are NOT in the pool (e.g., a
  // run widened to cover a wide-char half), read from the buffer.
  // Linear scan over the pool slice — the slice is small (one row).
  for (let r = 0; r < summary.runCount; r++) {
    const run = summary.runs[r]!
    moveCursorTo(state, run.start, renderY)

    let x = run.start
    while (x <= run.end) {
      // Locate the change in the pool slice for column x, if any.
      let change: CellChange | undefined
      for (let i = summary.poolStart; i < summary.poolEnd; i++) {
        const c = pool[i]!
        if (c.y !== y) break // pool may have other rows after — but slice limited
        if (c.x === x) {
          change = c
          break
        }
      }

      if (change && !change.cell.continuation) {
        emitCellAtCursor(
          state,
          x,
          renderY,
          {
            char: change.cell.char,
            fg: change.cell.fg,
            bg: change.cell.bg,
            underlineColor: change.cell.underlineColor,
            attrs: change.cell.attrs,
            wide: change.cell.wide,
            hyperlink: change.cell.hyperlink,
          },
          ctx,
        )
        x += change.cell.wide ? 2 : 1
      } else {
        // No change at this column (or only a continuation cell touched).
        // Read from buffer to repaint the cell. This covers wide-char
        // widening and gap-filling within a run.
        buffer.readCellInto(x, y, reusableCell)
        if (reusableCell.continuation && x > 0) {
          // Step back to main cell.
          x -= 1
          buffer.readCellInto(x, y, reusableCell)
          if (reusableCell.continuation) {
            // Should not happen with valid buffers — bail.
            x += 2
            continue
          }
        }
        emitCellAtCursor(
          state,
          x,
          renderY,
          {
            char: reusableCell.char,
            fg: reusableCell.fg,
            bg: reusableCell.bg,
            underlineColor: reusableCell.underlineColor,
            attrs: reusableCell.attrs,
            wide: reusableCell.wide,
            hyperlink: reusableCell.hyperlink,
          },
          ctx,
        )
        x += reusableCell.wide ? 2 : 1
      }
    }
  }
}

// ============================================================================
// Mode C — scatter emission
// ============================================================================

/**
 * Emit dirty cells one by one with explicit cursor jumps between them.
 * Used when `pickEmissionMode` returns `"scatter"`. This is the current
 * behavior of `changesToAnsi`, refactored to take `OutputEmitState` and a
 * per-row pool slice.
 *
 * Contract:
 * - Iterates `pool[summary.poolStart..summary.poolEnd)` in order.
 * - Emits each cell with an explicit cursor jump if the cursor is not
 *   already at the target position.
 * - Handles wide-char continuation cells by looking up the main cell from
 *   the buffer (orphan handling, see `changesToAnsi`).
 * - Mutates `state` to reflect the final cursor position after the last
 *   emitted cell.
 */
export function emitScatter(
  summary: DirtyRowSummary,
  pool: readonly CellChange[],
  buffer: TerminalBuffer,
  ctx: OutputContext,
  state: OutputEmitState,
): void {
  const y = summary.y
  const renderY = state.isInline ? y - state.startLine : y

  if (y !== state.prevY && state.currentHyperlink) {
    state.output += "\x1b]8;;\x1b\\"
    state.currentHyperlink = undefined
  }
  state.prevY = y

  for (let i = summary.poolStart; i < summary.poolEnd; i++) {
    const change = pool[i]!
    let x = change.x
    let cell: typeof change.cell = change.cell

    if (cell.continuation) {
      // Main cell already emitted in this pass — skip.
      if (state.lastEmittedX === x - 1 && state.lastEmittedY === y) continue

      // Orphan continuation — repaint main cell from buffer.
      if (x > 0) {
        x = x - 1
        buffer.readCellInto(x, y, reusableCell)
        if (reusableCell.continuation || !reusableCell.wide) continue
        cell = reusableCell
      } else {
        continue
      }
    }

    moveCursorTo(state, x, renderY)
    emitCellAtCursor(
      state,
      x,
      renderY,
      {
        char: cell.char,
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs,
        wide: cell.wide,
        hyperlink: cell.hyperlink,
      },
      ctx,
    )
    // emitCellAtCursor stores buffer-relative y, but for scatter we want
    // the actual y for cross-cell continuation tracking.
    state.lastEmittedY = y
  }
}
