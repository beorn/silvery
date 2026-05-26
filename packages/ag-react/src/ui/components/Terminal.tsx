/**
 * <Terminal> — render a headless terminal's grid as a silvery subtree.
 *
 * Public renderer for any object that exposes the read-only
 * `TerminalReadable` shape (termless backends, xterm-headless, vterm, vt100,
 * or any in-memory cell grid that quacks the same way). The component is
 * **purely a renderer**: it owns no PTY, no stdin, no alt-screen toggle.
 * The host process feeds the terminal elsewhere (typically from a child
 * PTY's stdout) and passes the readable into the component.
 *
 * See `docs/design/terminal-component.md` for the full API rationale and
 * the `render({ input: false })` companion escape hatch that lets a host
 * process keep stdin for its own PTY pipe while silvery renders visuals
 * around it. The motivating consumer is `termless rec`'s live-overlay
 * (`vendor/termless/packages/cli/src/rec-live-overlay.ts`) — after this
 * component lands, ~80% of that file collapses to a thin shim over
 * <Terminal>.
 */

import React, { useEffect, useMemo, useRef } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useAgNode } from "../../hooks/useAgNode"
import type { SilveryMouseEvent, SilveryWheelEvent } from "@silvery/ag/mouse-event-types"

// ════════════════════════════════════════════════════════════════════════════
// Duck-typed read protocol — matches the relevant subset of @termless/core's
// TerminalReadable interface. We don't import from @termless/core because
// silvery has no dependency on termless; the duck type lets any cell-grid
// source plug in (termless, xterm-headless, vterm, in-memory test fixtures).
// ════════════════════════════════════════════════════════════════════════════

/** RGB color — matches termless's `{ r, g, b }`. */
export interface TerminalRGB {
  r: number
  g: number
  b: number
}

/**
 * A single grid cell — the minimum surface <Terminal> reads. Every backend
 * we care about (termless, xterm-headless, vterm, vt100) returns objects
 * that include all these fields; extra fields (hyperlink, blink, hidden)
 * are tolerated but ignored.
 *
 * `underline` is `boolean | string` to accept termless's `UnderlineStyle =
 * false | "single" | "double" | "curly" | "dotted" | "dashed"`. Anything
 * truthy is treated as "underline on" by the encoder.
 */
export interface TerminalCell {
  char: string
  fg: TerminalRGB | null
  bg: TerminalRGB | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean | string
  strikethrough: boolean
  inverse: boolean
  /** Wide-character leading cell (occupies 2 columns). */
  wide?: boolean
  /** Wide-character continuation cell (skipped during encoding). */
  continuation?: boolean
}

/** Cursor snapshot from the underlying terminal. */
export interface TerminalCursor {
  x: number
  y: number
  visible?: boolean | null
}

/**
 * Read-only terminal contract. Any object that returns cells from
 * `getLines()` and a cursor from `getCursor()` qualifies.
 */
export interface TerminalReadable {
  readonly cols: number
  readonly rows: number
  getLines(): readonly (readonly TerminalCell[])[]
  getCursor(): TerminalCursor
}

/** Mouse event surfaced to consumers — coordinates are cell-based. */
export interface TerminalMouseEvent {
  type: "press" | "release" | "move" | "wheel"
  /** Column (0-based) inside the grid. */
  x: number
  /** Row (0-based) inside the grid. */
  y: number
  button: "left" | "middle" | "right" | "wheelUp" | "wheelDown" | "none"
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean }
}

// ════════════════════════════════════════════════════════════════════════════
// Per-row ANSI encoder — deduplicated SGR delta, padded to exact width.
// Modelled after termless's `rowToAnsi` (vendor/termless/src/render/ansi.ts).
// Kept inline because (a) it's small, (b) silvery has no dep on termless,
// (c) the encoder rarely changes and the cell-shape coupling is already
// part of the public API.
// ════════════════════════════════════════════════════════════════════════════

interface CellStyle {
  fg: TerminalRGB | null
  bg: TerminalRGB | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  inverse: boolean
}

const FRESH_STYLE: CellStyle = {
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  strikethrough: false,
  inverse: false,
}

const SGR_RESET = "\x1b[0m"

function rgbEq(a: TerminalRGB | null, b: TerminalRGB | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function styleOf(cell: TerminalCell): CellStyle {
  return {
    fg: cell.fg,
    bg: cell.bg,
    bold: cell.bold,
    dim: cell.dim,
    italic: cell.italic,
    underline: cell.underline !== false,
    strikethrough: cell.strikethrough,
    inverse: cell.inverse,
  }
}

function sgrDelta(prev: CellStyle, next: CellStyle): string {
  const needsReset =
    (prev.bold && !next.bold) ||
    (prev.dim && !next.dim) ||
    (prev.italic && !next.italic) ||
    (prev.underline && !next.underline) ||
    (prev.strikethrough && !next.strikethrough) ||
    (prev.inverse && !next.inverse) ||
    (prev.fg !== null && next.fg === null) ||
    (prev.bg !== null && next.bg === null)

  const codes: string[] = []
  let base = prev
  if (needsReset) {
    codes.push("0")
    base = FRESH_STYLE
  }
  if (next.bold && !base.bold) codes.push("1")
  if (next.dim && !base.dim) codes.push("2")
  if (next.italic && !base.italic) codes.push("3")
  if (next.underline && !base.underline) codes.push("4")
  if (next.inverse && !base.inverse) codes.push("7")
  if (next.strikethrough && !base.strikethrough) codes.push("9")
  if (next.fg && !rgbEq(base.fg, next.fg)) {
    codes.push(`38;2;${next.fg.r};${next.fg.g};${next.fg.b}`)
  }
  if (next.bg && !rgbEq(base.bg, next.bg)) {
    codes.push(`48;2;${next.bg.r};${next.bg.g};${next.bg.b}`)
  }
  if (codes.length === 0) return ""
  return `\x1b[${codes.join(";")}m`
}

/**
 * Encode a single row of cells into ANSI. Pads or truncates to `cols`
 * glyph cells. Always ends with SGR reset so adjacent text starts clean.
 *
 * Exported so tests can drive the encoder directly without instantiating
 * a full silvery render tree, and so consumers building custom adapters
 * can reuse the same SGR-delta calculation.
 *
 * **Wide-char continuation handling** (bead `@km/termless/15615`): backends
 * disagree on how to mark the continuation cell of a wide grapheme. The
 * legacy contract was "set `continuation: true` on column X+1 after a wide
 * char at X" — vt100, vterm, in-memory test fixtures all do this. But
 * `@termless/xtermjs` (the backend `termless rec` uses) hardcodes
 * `continuation: false` and stores `char: ""` on the continuation column.
 * Without compensation the encoder writes BOTH the wide grapheme AND the
 * empty cell (as a space), emitting 3 visible cells for a 2-column
 * grapheme — every subsequent cell on the row drifts right by 1, the
 * row's right border falls off, and the silvery `<Text>` layout receives
 * `cols+1` glyphs that downstream truncate / clip mid-codepoint into
 * U+FFFD. The fix below treats "previous cell was wide" as load-bearing:
 * the cell immediately after a wide grapheme is ALWAYS skipped, no
 * matter how the backend labels it. This matches the same robustness
 * pattern in `bufferToAnsi` (see `output-phase.ts` §"after writing a
 * wide char, unconditionally skip X+1 instead of relying on the next
 * cell's continuation flag"), one layer down in the pipeline.
 */
export function encodeTerminalRow(row: readonly TerminalCell[], cols: number): string {
  let out = ""
  let state: CellStyle = FRESH_STYLE
  let written = 0
  let prevWasWide = false
  for (let c = 0; c < cols && c < row.length; c++) {
    const cell = row[c]
    if (!cell) {
      // A null cell at the column after a wide grapheme is the wide
      // grapheme's continuation slot — skip it the same way we skip an
      // explicit continuation/empty-after-wide cell below. Otherwise the
      // null-cell padding-space path bumps `written` past the row width.
      if (prevWasWide) {
        prevWasWide = false
        continue
      }
      const delta = sgrDelta(state, FRESH_STYLE)
      if (delta) out += delta
      state = FRESH_STYLE
      out += " "
      written++
      continue
    }
    if (cell.continuation) {
      // Backend marked the cell explicitly as continuation (vt100, vterm,
      // in-memory fixtures). Skip.
      prevWasWide = false
      continue
    }
    if (prevWasWide) {
      // The previous cell was wide. THIS cell is its continuation slot —
      // even if the backend (xterm.js) labels it `continuation: false`
      // with `char: ""`. Skip it; the wide grapheme already accounted
      // for both columns via `written += 2` below.
      prevWasWide = false
      continue
    }
    const want = styleOf(cell)
    const delta = sgrDelta(state, want)
    if (delta) out += delta
    state = want
    out += cell.char || " "
    written += cell.wide ? 2 : 1
    prevWasWide = cell.wide === true
  }
  if (written < cols) {
    const delta = sgrDelta(state, FRESH_STYLE)
    if (delta) out += delta
    state = FRESH_STYLE
    out += " ".repeat(cols - written)
  }
  if (
    state.fg ||
    state.bg ||
    state.bold ||
    state.dim ||
    state.italic ||
    state.underline ||
    state.strikethrough ||
    state.inverse
  ) {
    out += SGR_RESET
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// <Terminal>
// ════════════════════════════════════════════════════════════════════════════

export interface TerminalProps {
  /**
   * The terminal to mirror. Any object matching the read-only
   * `TerminalReadable` duck type works.
   */
  terminal: TerminalReadable
  /**
   * Publish the terminal's cursor position to silvery's caret-as-
   * layout-output pipeline (`cursorOffset` on the underlying <Box>).
   * When `false`, the silvery cursor is left untouched. Default: `true`.
   */
  cursor?: boolean
  /** Override grid width (default: `terminal.cols`). */
  cols?: number
  /** Override grid height (default: `terminal.rows`). */
  rows?: number
  /**
   * Revision counter — bump from the consumer's update loop to force a
   * re-read of the terminal's grid. The component is otherwise
   * structurally stable and the silvery incremental renderer would skip
   * its subtree. See "Reactivity" in the design doc.
   */
  revision?: number
  /**
   * Forward mouse events landing inside the grid to the consumer.
   * Coordinates are cell-based (0-based col/row).
   */
  onMouse?: (event: TerminalMouseEvent) => void
  /**
   * Fire when the rendered grid's dimensions no longer match the
   * underlying terminal's `cols × rows` (typically because the silvery
   * `<Box>` containing <Terminal> was laid out at a different size).
   * Consumers call `terminal.resize()` and/or push the new size to the
   * child PTY via `ioctl TIOCSWINSZ`.
   */
  onResize?: (cols: number, rows: number) => void
  /**
   * Participate in silvery's text-selection system. When `true`, the
   * grid `<Box>` has `userSelect="text"` and mouse-drag selects across
   * cells. Default: `true`.
   */
  selectable?: boolean
  /** Test hook for AutoLocator queries. */
  testID?: string
}

/**
 * Render a headless terminal's grid inside a silvery layout.
 *
 * Layout: the component takes the cell dimensions of its grid as its
 * intrinsic size — `width={cols}`, `height={rows}`. Compose inside any
 * silvery layout (`<Box justifyContent="center">…</Box>`, framed inside
 * a bordered `<Box>`, stacked above a `<Text>` status line, …).
 *
 * @example
 * ```tsx
 * import { Terminal, Box } from "silvery"
 *
 * function Overlay({ child, tick }: { child: TerminalReadable; tick: number }) {
 *   return (
 *     <Box borderStyle="round" padding={1}>
 *       <Terminal terminal={child} revision={tick} />
 *     </Box>
 *   )
 * }
 * ```
 */
export function Terminal(props: TerminalProps): React.ReactElement {
  const {
    terminal,
    cursor = true,
    cols = terminal.cols,
    rows = terminal.rows,
    revision,
    onMouse,
    onResize,
    selectable = true,
    testID,
  } = props

  // Recompute row ANSI strings whenever `revision` (consumer-driven
  // invalidation) or the terminal identity changes. We intentionally do
  // not subscribe to the terminal — that contract varies per backend, so
  // pushing the "when to repaint" decision to the consumer keeps the
  // component backend-agnostic. The dependency on `revision` makes React
  // invalidate the memoized rows when the consumer requests it.
  const rowStrings = useMemo(() => {
    const lines = terminal.getLines()
    // Match `rec-live-overlay`'s historical behavior: show the trailing
    // `terminal.rows` lines (the visible "screen", not the full
    // scrollback). When the grid is shorter than `rows`, pad with empty
    // strings — the encoder produces all-blank lines correctly.
    const sliceStart = Math.max(0, lines.length - terminal.rows)
    const visible = lines.slice(sliceStart)
    const out: string[] = []
    for (let r = 0; r < rows; r++) {
      const row = visible[r] ?? []
      out.push(encodeTerminalRow(row, cols))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, revision, cols, rows])

  // Cursor — translate the terminal's cursor snapshot into a
  // `cursorOffset` prop on the grid Box. The layout phase resolves the
  // offset into absolute caret coordinates (caret-as-layout-output, the
  // canonical post-`view-as-layout-output` path) on the very first
  // frame after mount.
  const cursorSnapshot: TerminalCursor | null = useMemo(() => {
    if (!cursor) return null
    return terminal.getCursor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, terminal, revision])

  // Resize — sample the rendered Box's boxRect and notify the consumer
  // when its cell dimensions no longer match the underlying terminal.
  // `useAgNode` returns `{ node, signals }` once the React tree is
  // committed; `signals.boxRect` is the canonical reactive source.
  const handle = useAgNode()
  const lastReportedRef = useRef<{ cols: number; rows: number } | null>(null)
  useEffect(() => {
    if (!onResize || !handle) return
    const rect = handle.signals.boxRect()
    if (!rect) return
    if (rect.width === cols && rect.height === rows) return
    const last = lastReportedRef.current
    if (last && last.cols === rect.width && last.rows === rect.height) return
    lastReportedRef.current = { cols: rect.width, rows: rect.height }
    onResize(rect.width, rect.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResize, handle, cols, rows, revision])

  // Mouse — translate silvery's bubbling SilveryMouseEvent into the
  // cell-based TerminalMouseEvent and call the consumer.
  const forward = (type: TerminalMouseEvent["type"], e: SilveryMouseEvent): void => {
    if (!onMouse) return
    const rect = handle?.signals.boxRect()
    if (!rect) return
    const x = Math.floor(e.x - rect.x)
    const y = Math.floor(e.y - rect.y)
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return
    onMouse({
      type,
      x,
      y,
      button: mapButton(e),
      modifiers: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey },
    })
  }

  return (
    <Box
      width={cols}
      height={rows}
      flexDirection="column"
      userSelect={selectable ? "text" : undefined}
      testID={testID}
      cursorOffset={
        cursorSnapshot
          ? {
              col: cursorSnapshot.x,
              row: cursorSnapshot.y,
              visible: cursorSnapshot.visible !== false,
            }
          : undefined
      }
      onMouseDown={onMouse ? (e) => forward("press", e) : undefined}
      onMouseUp={onMouse ? (e) => forward("release", e) : undefined}
      onMouseMove={onMouse ? (e) => forward("move", e) : undefined}
      onWheel={onMouse ? (e: SilveryWheelEvent) => forward("wheel", e) : undefined}
    >
      {rowStrings.map((line, r) => (
        // The encoder pads each row to exactly `cols` glyph cells, so
        // <Text> lays out at width=cols every time. Embedded ANSI
        // escapes are parsed by silvery's measure/output phase via
        // `parseAnsiText` — same code path as chalk strings.
        //
        // `bgConflict="ignore"`: <Terminal> mirrors arbitrary EXTERNAL
        // ANSI (a captured terminal grid). Chalk-styled status bars and
        // selection highlights are conflict-rich by nature — an ANSI bg
        // in a cell layered over the silvery buffer bg is *expected*
        // here, not a pipeline bug. The global throw stays a safety net
        // for real silvery-app bugs; only the cells <Terminal> paints
        // are exempt. See `bgConflict` on TextProps.
        // eslint-disable-next-line react/no-array-index-key
        <Text key={r} bgConflict="ignore">
          {line}
        </Text>
      ))}
    </Box>
  )
}

function mapButton(e: SilveryMouseEvent): TerminalMouseEvent["button"] {
  if (e.type === "wheel") {
    const dy = (e as SilveryWheelEvent).deltaY
    if (dy < 0) return "wheelUp"
    if (dy > 0) return "wheelDown"
    return "none"
  }
  switch (e.button) {
    case 0:
      return "left"
    case 1:
      return "middle"
    case 2:
      return "right"
    default:
      return "none"
  }
}
