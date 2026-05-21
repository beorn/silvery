/**
 * Silvery Viewport Component
 *
 * `<Viewport>` is silvery's nested-cell-domain composition primitive — a
 * rectangular region with its own cell buffer, painted as an opaque blit
 * into the parent silvery tree. Designed for embedding foreign rendering
 * engines (xtermjs PTY mirror, replay frames, snapshots) without leaking
 * through silvery's bg-coherence invariant.
 *
 * See bead `@km/silvery/15513-surface-nested-composition-primitive` for the
 * design rationale, defer list, and prior art; the types live in
 * `@silvery/ag/viewport-types`.
 *
 * v1 restrictions:
 *  - Leaf only — no React children, viewports cannot be nested.
 *  - Theme palette frozen at mount.
 *  - Focus / input routing not yet wired (parent ignores `captureInput`).
 */

import {
  type ForwardedRef,
  type JSX,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react"
import type { AgNode, Cell } from "@silvery/ag/types"
import { trackContentDirty } from "@silvery/ag/dirty-tracking"
import { CONTENT_BIT, getRenderEpoch } from "@silvery/ag/epoch"
import { createCellBuffer, type MutableCellBuffer } from "@silvery/ag/viewport-buffer"
import type {
  CellBuffer,
  ForeignSource,
  ViewportContext,
  ViewportCursorStyle,
  ViewportInputMode,
  ViewportNodeState,
  ViewportProps,
  ViewportRect,
  ViewportRef,
} from "@silvery/ag/viewport-types"

// ============================================================================
// Component
// ============================================================================

/**
 * Render a rectangular viewport with its own cell domain.
 *
 * Pass either a `source` (the source pushes cells through a
 * {@link ViewportContext} at its own cadence) or use the imperative
 * {@link ViewportRef} (the app calls `writeCells` / `setCursor` directly).
 * Both paths write into the same backing buffer — last-write-wins per cell.
 *
 * @example
 * ```tsx
 * // Source-driven (PTY mirror, replay, snapshot)
 * <Viewport cols={80} rows={24} source={xtermAdapter(child)} />
 *
 * // Ref-driven (app pushes cells imperatively)
 * const ref = useRef<ViewportRef>(null)
 * useEffect(() => {
 *   ref.current?.writeCells([{ row: 0, col: 0, width: 5, height: 1 }], buffer)
 * }, [])
 * return <Viewport cols={80} rows={24} ref={ref} />
 * ```
 */
export const Viewport = forwardRef(function Viewport(
  props: ViewportProps,
  ref: ForwardedRef<ViewportRef>,
): JSX.Element {
  const {
    cols,
    rows,
    source,
    cursorVisible = true,
    captureInput = "none",
    onResize,
    onSnapshot,
    // focusable, scrollback, clip, palette are accepted but not yet wired
    // (v1 deferred — see bead @km/silvery/15513).
  } = props

  const nodeRef = useRef<AgNode | null>(null)
  // Backing cell buffer + per-instance state. Created lazily on mount so that
  // hot-reload remounts get fresh state; kept in a ref so re-renders don't
  // reallocate.
  const stateRef = useRef<{
    buffer: MutableCellBuffer
    state: ViewportNodeState
    ctx: ViewportContext
    /** True after `disconnect()`/unmount — calls through `ctx` become no-ops. */
    invalidated: boolean
  } | null>(null)

  // ── 1. Allocate / resize buffer ─────────────────────────────────────────
  // Reallocate on cols/rows change to keep the underlying buffer in sync
  // with the parent layout (the layout node was already updated by the
  // reconciler when the cols/rows props changed — see helpers.LAYOUT_PROPS).
  if (
    stateRef.current === null ||
    stateRef.current.buffer.cols !== cols ||
    stateRef.current.buffer.rows !== rows
  ) {
    const buffer = createCellBuffer(cols, rows)
    const viewportState: ViewportNodeState = {
      buffer,
      cursor: null,
      cursorVisible,
      inputMode: captureInput,
    }
    const ctx = createViewportContext(
      viewportState,
      () => stateRef.current?.invalidated ?? true,
      () => nodeRef.current,
    )
    stateRef.current = { buffer, state: viewportState, ctx, invalidated: false }
  }

  // Keep mutable flags in sync without reallocating the buffer.
  stateRef.current.state.cursorVisible = cursorVisible
  stateRef.current.state.inputMode = captureInput

  // ── 2. Wire viewport state + source lifecycle BEFORE first paint ────────
  // useLayoutEffect runs synchronously after the reconciler commits refs and
  // BEFORE `resetAfterCommit` triggers the silvery render pipeline. This means
  // the viewport's `viewportState` slot and any initial source-pushed cells
  // are visible to the very first frame's render phase — apps don't have to
  // force a second re-render to see the source's startup content.
  useLayoutEffect(() => {
    const node = nodeRef.current
    const slot = stateRef.current
    if (!node || !slot) return
    node.viewportState = slot.state
    if (source) {
      source.connect(slot.ctx)
    }
    return () => {
      try {
        if (source) source.disconnect()
      } finally {
        slot.invalidated = true
        if (node.viewportState === slot.state) {
          node.viewportState = null
        }
      }
    }
  }, [source])

  // ── 4. Resize notification ──────────────────────────────────────────────
  // Fire onResize whenever the React-visible dimensions change. The buffer
  // reallocation above handles the underlying data; this notifies callers.
  const prevDimsRef = useRef<{ cols: number; rows: number } | null>(null)
  useEffect(() => {
    const prev = prevDimsRef.current
    if (!prev || prev.cols !== cols || prev.rows !== rows) {
      prevDimsRef.current = { cols, rows }
      onResize?.(cols, rows)
    }
  }, [cols, rows, onResize])

  // ── 5. Imperative ref handle ────────────────────────────────────────────
  useImperativeHandle(
    ref,
    (): ViewportRef => ({
      writeCells(dirtyRects, buffer) {
        const slot = stateRef.current
        if (!slot) return
        slot.buffer.blit(dirtyRects, buffer)
        // Imperative writes need the same dirty signal as source-driven blit
        // so the next pipeline run paints the change.
        const node = nodeRef.current
        if (node) {
          const epoch = getRenderEpoch()
          if (node.dirtyEpoch !== epoch) {
            node.dirtyBits = CONTENT_BIT
            node.dirtyEpoch = epoch
          } else {
            node.dirtyBits |= CONTENT_BIT
          }
          trackContentDirty(node)
        }
      },
      writeAnsi(_chunk) {
        // v1: not implemented — apps that want ANSI parsing should use an
        // XtermAdapter ForeignSource instead. Tracked for v2.
        throw new Error(
          "Viewport.writeAnsi(): not yet implemented in v1. " +
            "Bind a ForeignSource (e.g. XtermAdapter) to feed raw bytes; " +
            "see bead @km/silvery/15513.",
        )
      },
      setCursor(pos, style) {
        const slot = stateRef.current
        if (!slot) return
        slot.state.cursor = { row: pos.row, col: pos.col, style: style ?? "block" }
        const node = nodeRef.current
        if (node) {
          const epoch = getRenderEpoch()
          if (node.dirtyEpoch !== epoch) {
            node.dirtyBits = CONTENT_BIT
            node.dirtyEpoch = epoch
          } else {
            node.dirtyBits |= CONTENT_BIT
          }
          trackContentDirty(node)
        }
      },
      resize(_nextCols, _nextRows) {
        // v1: ref-driven resize is informational only — the AgNode's layout
        // dimensions are pinned by the cols/rows props. Apps wanting to
        // resize should re-render the <Viewport> with new cols/rows.
        throw new Error(
          "Viewport.resize(): use the cols/rows props on <Viewport> in v1. " +
            "See bead @km/silvery/15513.",
        )
      },
      snapshot() {
        const slot = stateRef.current
        if (!slot) return emptyCellBuffer
        if (onSnapshot) return onSnapshot()
        return slot.buffer.snapshot()
      },
    }),
    [onSnapshot],
  )

  // The host element carries the props (cols/rows pin layout dimensions);
  // viewports are leaves — no React children.
  return <silvery-viewport ref={nodeRef} {...props} />
})

// ============================================================================
// ViewportContext factory
// ============================================================================

/**
 * Build the {@link ViewportContext} a {@link ForeignSource} sees at
 * `connect()` time. The context routes writes into the per-instance
 * {@link ViewportNodeState} stored on the React-side stateRef.
 *
 * After `disconnect()` (component unmount) the `invalidated` check makes
 * all subsequent calls into no-ops — prevents a source whose disconnect
 * is async from writing into a torn-down buffer.
 */
function createViewportContext(
  state: ViewportNodeState,
  isInvalidated: () => boolean,
  getNode: () => AgNode | null,
): ViewportContext {
  /**
   * Mark the host AgNode contentDirty so the next pipeline run blits the
   * updated cell buffer instead of fast-path-skipping the viewport node.
   * Without this, a source that updates the buffer asynchronously (PTY data
   * arriving, replay frame stepping) would have its changes ignored unless
   * some sibling state change also triggered the cascade.
   */
  function markDirty(): void {
    const node = getNode()
    if (!node) return
    const epoch = getRenderEpoch()
    if (node.dirtyEpoch !== epoch) {
      node.dirtyBits = CONTENT_BIT
      node.dirtyEpoch = epoch
    } else {
      node.dirtyBits |= CONTENT_BIT
    }
    trackContentDirty(node)
  }

  return {
    dimensions() {
      return { cols: state.buffer.cols, rows: state.buffer.rows }
    },
    blit(dirtyRects: readonly ViewportRect[], buffer: CellBuffer) {
      if (isInvalidated()) return
      ;(state.buffer as MutableCellBuffer).blit(dirtyRects, buffer)
      markDirty()
    },
    setCursor(pos: { row: number; col: number }, style?: ViewportCursorStyle) {
      if (isInvalidated()) return
      state.cursor = { row: pos.row, col: pos.col, style: style ?? "block" }
      markDirty()
    },
    invalidateAll() {
      if (isInvalidated()) return
      markDirty()
    },
    requestInputMode(mode: ViewportInputMode) {
      if (isInvalidated()) return
      state.inputMode = mode
    },
    // emitTitle intentionally omitted in v1 (host has no chrome to surface it
    // through yet — added when termless rec-live-overlay needs it).
  }
}

// ============================================================================
// Empty fallback CellBuffer (used when snapshot is called before mount)
// ============================================================================

const blankFallbackCell: Cell = Object.freeze({
  char: " ",
  fg: null,
  bg: null,
  attrs: Object.freeze({}),
  wide: false,
  continuation: false,
})

const emptyCellBuffer: CellBuffer = {
  cols: 0,
  rows: 0,
  getCell() {
    return blankFallbackCell
  },
}

// Export type companion for consumers that want to type their refs.
export type { ViewportProps, ViewportRef, ForeignSource } from "@silvery/ag/viewport-types"
