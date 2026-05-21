/**
 * Silvery Viewport — nested-cell-domain composition primitive.
 *
 * A `<Viewport>` is a rectangular region with its OWN cell domain — independent
 * cells, cursor, scroll, color model — composed into the parent silvery tree
 * as an opaque leaf. Designed for embedding foreign rendering engines (xtermjs
 * PTY mirroring, replay frames, snapshots) inside a silvery host without
 * leaking through silvery's bg-coherence invariant.
 *
 * Canonical use case: termless rec-live-overlay paints chrome via silvery, then
 * mounts `<Viewport source={XtermAdapter(child)}>` for the PTY content —
 * structurally eliminating the bg-conflict throw in `render-text.ts`.
 *
 * Design rationale, defer list, and prior art:
 * see bead `@km/silvery/15513-surface-nested-composition-primitive`.
 *
 * Semantics summary (full table in bead body):
 *
 * - Layout: leaf with fixed `cols`×`rows`. Parent positions; if parent rect is
 *   smaller, the Viewport is clipped (not scaled).
 * - Painting: opaque blit of the foreign cell buffer at integer cell
 *   coordinates. Parent paints chrome above/below using normal stacking.
 * - Theme: palette is frozen at mount. Theme tokens (`$bg-surface`, etc.) do
 *   NOT cascade through the Viewport boundary.
 * - Focus: `focusable: false` by default. When focused and `captureInput !==
 *   "none"`, parent translates events to the bound `ForeignSource`.
 * - Mouse: parent delivers normalized `(row, col)` events; the source encodes
 *   them (e.g. xtermjs SGR 1006).
 * - Nesting: v1 rejects `<Viewport>` as a child of `<Viewport>`. Multiplexers
 *   use sibling Viewports in split layouts.
 * - bg-coherence: NOT enforced across the Viewport boundary; inside, the
 *   `ForeignSource` owns correctness.
 *
 * Out of scope for v1 (see bead body for full list): nested local silvery
 * subtree rendering INTO a Viewport, transparency/alpha blending across
 * domains, Viewport-in-Viewport, full IME composition / bidi shaping,
 * worker/process isolation, `LocalSource`.
 */

import type { Cell } from "./types"

/**
 * Read-only cell-grid view — the source-of-truth for a Viewport's painted
 * content. Written by a {@link ForeignSource}, blitted into the parent buffer
 * at output-phase time.
 *
 * Structurally a read-only subset of the silvery `TerminalBuffer` but with
 * `cols`/`rows` naming (matching {@link ViewportProps}) instead of
 * `width`/`height`. The Cell shape is reused verbatim from `@silvery/ag` so
 * sources can construct buffers without depending on a separate cell vocabulary.
 */
export interface CellBuffer {
  readonly cols: number
  readonly rows: number
  /** Read a single cell at Viewport-local `(col, row)`. */
  getCell(col: number, row: number): Cell
}

/**
 * Rectangle within a Viewport's cell grid. Origin `(0, 0)` is the top-left
 * cell of the Viewport's content area — NOT an absolute terminal coordinate.
 *
 * Kept distinct from the global {@link Rect} so the pipeline can translate
 * Viewport-local rects to absolute cells at blit time without ambiguity.
 *
 * Field naming uses `row`/`col` (not `x`/`y`) for the same reason: the global
 * Rect uses Cartesian terminology; cells are addressed in (row, col) order
 * across the rest of the cell-buffer surface.
 */
export interface ViewportRect {
  readonly row: number
  readonly col: number
  readonly width: number
  readonly height: number
}

/**
 * Viewport-internal cursor style hint. The Viewport's cursor is painted INTO
 * its cells (the source decides where), then composited into the parent
 * frame. Independent of the silvery host cursor that lives in
 * {@link LayoutSignals}.
 */
export type ViewportCursorStyle = "block" | "underline" | "bar"

/**
 * Input mode requested by a {@link ForeignSource}. The parent owns global
 * terminal modes (mouse-tracking SGR, raw mode, bracketed paste, focus
 * reporting) and multiplexes events to whichever Viewport is currently
 * focused. Sources declare which event classes they care about so the parent
 * can switch protocol modes deterministically.
 *
 * - `"none"`: source consumes no input (replay frames, static snapshots).
 * - `"keys"`: source wants forwarded key events when its Viewport is focused.
 * - `"mouse"`: source wants normalized `(row, col)` mouse events.
 * - `"all"`: source wants both.
 */
export type ViewportInputMode = "none" | "keys" | "mouse" | "all"

/**
 * Frozen color palette handed to a Viewport at mount. Independent of the
 * parent silvery theme — a Viewport speaks raw colors, not `$tokens`.
 *
 * The source is responsible for mapping its own color model (xtermjs 256-color
 * indices, replay-frame RGB, etc.) onto this palette when it needs theme
 * coherence with the host. Sources that have their own complete color
 * vocabulary (mirroring a real terminal session) may ignore this entirely.
 */
export interface ViewportPalette {
  /** Default background color (any silvery-acceptable color string). */
  background: string
  /** Default foreground color. */
  foreground: string
  /** Optional 16-color ANSI map. Index `0..7` = standard, `8..15` = bright. */
  ansi16?: readonly string[]
}

/**
 * Handle passed to a {@link ForeignSource} at `connect()` time — the
 * thin remote the source uses to push cell content, move the cursor, and
 * negotiate input mode with the parent Viewport.
 *
 * One `ViewportContext` exists per mounted Viewport. The source uses it for
 * the lifetime of the connection; after `disconnect()` the context is
 * invalidated and calls become no-ops.
 */
export interface ViewportContext {
  /** Current Viewport dimensions in cells. */
  dimensions(): { cols: number; rows: number }
  /**
   * Blit cell content into the Viewport's buffer at the given dirty rects.
   * Rects are in Viewport-local coordinates (origin = `(0, 0)` at top-left).
   * The buffer's `(col, row)` indices are absolute within the buffer — the
   * source decides what cells to read for each rect.
   */
  blit(dirtyRects: readonly ViewportRect[], buffer: CellBuffer): void
  /** Move the Viewport's internal cursor. */
  setCursor(pos: { row: number; col: number }, style?: ViewportCursorStyle): void
  /** Force a full Viewport repaint on the next frame. */
  invalidateAll(): void
  /**
   * Ask the parent to route input events of the given mode into this
   * Viewport when it's focused. Parent owns global terminal modes; the
   * request is advisory unless the Viewport is the focused leaf.
   */
  requestInputMode(mode: ViewportInputMode): void
  /**
   * Optional: source emits a window title (xtermjs OSC 0/2). Reserved for
   * future — host may surface it via app chrome, ignored otherwise.
   */
  emitTitle?(title: string): void
}

/**
 * The contract a foreign rendering engine implements to live inside a
 * Viewport.
 *
 * Lifecycle: `<Viewport>` calls `connect(ctx)` on mount and `disconnect()` on
 * unmount. The source then writes into the context at its own cadence —
 * input-driven (xtermjs PTY mirror), timer-driven (replay), or
 * frame-driven (snapshot). The Viewport never polls the source.
 *
 * Implementations (planned):
 * - `XtermAdapter` (Phase B): wraps `@xterm/headless`, mirrors a PTY child.
 * - `ReplaySource`: animation frames for inline previews.
 * - `SnapshotSource`: static frames (GIF encoder, test fixtures).
 * - `LocalSource` (post-MVP): render a silvery subtree INTO a Viewport buffer.
 */
export interface ForeignSource {
  /** Called once at mount. Source captures `ctx` for the connection lifetime. */
  connect(ctx: ViewportContext): void
  /** Called once at unmount. Source releases all resources tied to the context. */
  disconnect(): void
  /**
   * Optional intrinsic size hint. The Viewport MAY snap its dimensions to
   * this on mount — apps that want pixel-perfect chrome should set explicit
   * `cols`/`rows` on `<Viewport>` and ignore the hint.
   */
  desiredSize?(): { cols: number; rows: number }
}

/**
 * Imperative handle returned by `<Viewport ref={...}>`. Apps use this to push
 * content into the Viewport without binding a {@link ForeignSource} — useful
 * for one-shot snapshot blits, test fixtures, or app-driven mirroring where a
 * full source lifecycle would be over-engineered.
 *
 * Both paths can coexist: a source binding and a ref handle on the same
 * Viewport write into the same underlying buffer (last-write-wins per cell).
 */
export interface ViewportRef {
  /** Write cells into the Viewport at the given dirty rects. */
  writeCells(dirtyRects: readonly ViewportRect[], buffer: CellBuffer): void
  /**
   * Convenience: feed raw ANSI bytes. The Viewport's internal terminal
   * emulator (xtermjs in v1) parses them and updates the cell buffer.
   * Apps that already speak the cell vocabulary should prefer
   * {@link writeCells} — `writeAnsi` is for the "I have a PTY producing
   * ANSI bytes" case.
   */
  writeAnsi(chunk: Uint8Array): void
  /** Move the Viewport's internal cursor. */
  setCursor(pos: { row: number; col: number }, style?: ViewportCursorStyle): void
  /**
   * Resize the Viewport (re-runs parent layout; `onResize` fires; bound
   * {@link ForeignSource} sees new dimensions on its next `blit()`).
   */
  resize(cols: number, rows: number): void
  /**
   * Capture the current Viewport buffer as an immutable {@link CellBuffer}
   * snapshot. Used by GIF encoders, snapshot tests, and replay capture.
   */
  snapshot(): CellBuffer
}

/**
 * Per-instance state attached to a `silvery-viewport` AgNode. Owned by the
 * `<Viewport>` React component; read by the pipeline render phase to blit
 * cells into the parent buffer.
 *
 * Lazily created at mount (the host node has no `viewportState` until
 * `<Viewport>` runs its mount effect). After unmount the slot may be
 * cleared, but the AgNode is also torn down at that point.
 *
 * @internal — public callers should not touch this directly; the props +
 * ref handle on `<Viewport>` are the supported surface.
 */
export interface ViewportNodeState {
  /** Backing cell buffer (mutable; the renderer reads via the `CellBuffer` upcast). */
  buffer: CellBuffer
  /** Latest internal cursor position (in Viewport-local cells), or null when hidden. */
  cursor: { row: number; col: number; style: ViewportCursorStyle } | null
  /** Whether the Viewport's internal cursor should paint at all. */
  cursorVisible: boolean
  /** Last input mode the source asked for (or "none" if no source). */
  inputMode: ViewportInputMode
}

/**
 * Public props for `<Viewport>` (v1 — termless-rec target).
 *
 * The MVP shape. See bead `@km/silvery/15513-surface-nested-composition-primitive`
 * for the full defer list (transparency, nested viewports, `LocalSource`,
 * IME composition, full bidi).
 */
export interface ViewportProps {
  /** Viewport width in cells. Required — Viewport is a leaf with fixed size. */
  cols: number
  /** Viewport height in cells. */
  rows: number
  /**
   * Optional ForeignSource bound at mount. May be omitted when the app pushes
   * content imperatively via {@link ViewportRef}.
   */
  source?: ForeignSource
  /** Whether the Viewport can receive focus. Default: `false`. */
  focusable?: boolean
  /**
   * Input modes the Viewport requests when focused. The parent enables the
   * matching protocol modes (mouse SGR, raw input, etc.) only when this
   * Viewport is the focused leaf. Default: `"none"`.
   */
  captureInput?: ViewportInputMode
  /**
   * Scrollback line count for the internal cell buffer. Default: `0`
   * (overlays don't need history; pure mirror use cases keep memory tight).
   */
  scrollback?: number
  /**
   * Clip overflow content to the Viewport's rect (vs. allowing oversize
   * content to escape into the parent). Default: `true`.
   */
  clip?: boolean
  /** Show the Viewport's internal cursor. Default: `true`. */
  cursorVisible?: boolean
  /**
   * Frozen palette for the Viewport's internal color resolution. Set ONCE at
   * mount — does NOT cascade from the parent theme. Pass a derived value if
   * theme coherence with the host is desired; pass `undefined` for the
   * Viewport to use its own defaults (the source decides).
   */
  palette?: ViewportPalette
  /** Fired when the Viewport is resized (parent layout change or `ref.resize`). */
  onResize?: (cols: number, rows: number) => void
  /**
   * Fired when an external consumer (GIF encoder, snapshot test) requests
   * a buffer capture. Returns the current cell buffer for projection.
   */
  onSnapshot?: () => CellBuffer
}
