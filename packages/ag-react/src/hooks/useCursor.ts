/**
 * useCursor - Show and position the terminal's blinking cursor.
 *
 * Maps component-relative (col, row) to absolute terminal coordinates
 * using useScrollRect. Per-instance last-writer-wins: only one cursor
 * can be active at a time per silvery instance (the terminal has one hardware cursor).
 *
 * Cursor state is isolated per silvery instance via CursorContext. Each runtime
 * (run(), createApp(), test renderer) provides its own CursorProvider so
 * multiple silvery instances don't fight over cursor position.
 *
 * Falls back to module-level globals when no CursorProvider is present
 * (backward compatibility / deprecation path).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react"
import type { CursorShape } from "@silvery/ag-term/output"
import type { BoxProps } from "@silvery/ag/types"
import { NodeContext } from "../context"
import { useScrollRect, type Rect } from "./useLayout"

// ============================================================================
// Types
// ============================================================================

export interface CursorPosition {
  /** Column offset within the component (0-indexed) */
  col: number
  /** Row offset within the component (0-indexed) */
  row: number
  /** Whether the cursor should be visible. Default: true */
  visible?: boolean
  /** Terminal cursor shape (DECSCUSR). Default: terminal default */
  shape?: CursorShape
}

export interface CursorState {
  /** Absolute terminal X position (0-indexed) */
  x: number
  /** Absolute terminal Y position (0-indexed) */
  y: number
  /** Whether cursor is visible */
  visible: boolean
  /** Terminal cursor shape (DECSCUSR) */
  shape?: CursorShape
  /**
   * Identity of the `useCursor` instance that last wrote this state. Set
   * automatically by the hook on each store write. Used by the
   * clear-on-unmount + clear-on-hide branches to skip the clear when
   * THIS instance no longer owns the state — preventing the last-writer-
   * wins stomp where an inactive sibling instance clears the active
   * one's cursor. See bead `@km/silvery/13011-usecursor-race`. Optional
   * because legacy external writes (Ink compat, direct store pokes) may
   * omit it.
   */
  owner?: number
}

/**
 * Unique-id counter for `useCursor` instances. Module-level so the
 * counter is shared across ALL instances in the process — guarantees
 * uniqueness regardless of CursorProvider scope. Wraps at MAX_SAFE_INTEGER
 * (practically infinite for terminal-UI lifetimes).
 */
let cursorInstanceIdCounter = 0

// ============================================================================
// Cursor Accessors — imperative interface for non-React consumers
// ============================================================================

/**
 * Imperative cursor accessors for non-React code (scheduler, output phase).
 * Created by createCursorStore() and threaded to consumers that can't use hooks.
 */
export interface CursorAccessors {
  getCursorState(): CursorState | null
  subscribeCursor(listener: () => void): () => void
}

// ============================================================================
// Cursor Store — per-instance state + accessors
// ============================================================================

export interface CursorStore {
  state: CursorState | null
  listeners: Set<() => void>
  accessors: CursorAccessors
  setCursorState(state: CursorState | null): void
}

/**
 * Create an isolated cursor store. Each silvery instance gets one.
 * Returns the store (for CursorProvider) and accessors (for scheduler/output).
 */
export function createCursorStore(): CursorStore {
  const store: CursorStore = {
    state: null,
    listeners: new Set(),
    accessors: null!,
    setCursorState(s: CursorState | null) {
      store.state = s
      for (const listener of store.listeners) listener()
    },
  }
  store.accessors = {
    getCursorState: () => store.state,
    subscribeCursor: (listener: () => void) => {
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
  }
  return store
}

// ============================================================================
// React Context
// ============================================================================

const CursorCtx = createContext<CursorStore | null>(null)

/**
 * Provider that gives its subtree an isolated cursor store.
 * Wrap your silvery app root in this to isolate cursor state per instance.
 */
export function CursorProvider({ store, children }: { store: CursorStore; children?: ReactNode }) {
  return React.createElement(CursorCtx.Provider, { value: store }, children)
}

// ============================================================================
// Module-level Fallback (deprecated — for bare render() without provider)
// ============================================================================

let _globalCursorState: CursorState | null = null
let _globalCursorListeners = new Set<() => void>()

function globalSetCursorState(state: CursorState | null): void {
  _globalCursorState = state
  for (const listener of _globalCursorListeners) listener()
}

function globalGetCursorState(): CursorState | null {
  return _globalCursorState
}

function globalSubscribeCursor(listener: () => void): () => void {
  _globalCursorListeners.add(listener)
  return () => {
    _globalCursorListeners.delete(listener)
  }
}

/** For testing -- reset global fallback state between tests. */
export function resetCursorState(): void {
  _globalCursorState = null
  _globalCursorListeners = new Set()
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Show and position the terminal's blinking cursor within this component.
 *
 * The cursor position is relative to the component's screen position.
 * Only one cursor can be active per silvery instance -- last caller with visible=true wins.
 *
 * Uses CursorContext if a CursorProvider is present (per-instance isolation).
 * Falls back to module-level globals otherwise (backward compat).
 *
 * @deprecated Phase 2 of `km-silvery.view-as-layout-output` migrated cursor
 * positioning from a React-effect-chain (`useCursor` → `useScrollRect` →
 * `setCursorState`) to a layout-output prop (`<Box cursorOffset={…}>`). The
 * prop path resolves absolute coordinates synchronously during the layout
 * phase, so the very first frame after a conditional mount emits correct
 * cursor ANSI — fixing `km-silvercode.cursor-startup-position` end-to-end.
 *
 * Migrate consumers by deleting the `useCursor({col, row, visible})` call
 * and adding `cursorOffset={{col, row, visible}}` to the surrounding Box. The
 * layout phase applies border + padding offsets automatically, so consumers
 * no longer need to add `borderColOffset` / `borderRowOffset` manually.
 *
 * This hook remains as a back-compat wrapper that writes to the cursor
 * store; the scheduler still reads the store as a fallback when no
 * `cursorOffset` prop is set on any node. Slated for deletion once all
 * in-tree consumers migrate (TextArea + TextInput already migrated; Ink
 * compat goes through the store directly and is unaffected). See bead
 * `km-silvery.delete-cursor-globals`.
 */
export function useCursor(position: CursorPosition): void {
  const { col, row, visible = true, shape } = position
  const store = useContext(CursorCtx)
  const node = useContext(NodeContext)

  // Resolve set/get functions from context or global fallback
  const set = store ? store.setCursorState.bind(store) : globalSetCursorState
  const get = store ? store.accessors.getCursorState : globalGetCursorState

  // Per-instance identity — stamped on every store write so the clear-
  // on-unmount + clear-on-hide branches can detect "we don't own the
  // cursor anymore" and skip the clear. Fixes the multi-instance race
  // documented in `@km/silvery/13011-usecursor-race`.
  const instanceIdRef = useRef<number>(0)
  if (instanceIdRef.current === 0) {
    cursorInstanceIdCounter += 1
    instanceIdRef.current = cursorInstanceIdCounter
  }

  // Compute content area offset from the parent node's border + padding.
  // useScrollRect provides the node's border-box rect, but cursor
  // col/row are relative to the content area (inside border + padding).
  const props = node?.props as BoxProps | undefined
  const padLeft = props?.paddingLeft ?? props?.paddingX ?? props?.padding ?? 0
  const padTop = props?.paddingTop ?? props?.paddingY ?? props?.padding ?? 0
  const borderLeft = props?.borderStyle ? 1 : 0
  const borderTop = props?.borderStyle ? 1 : 0
  const contentOffsetX = borderLeft + padLeft
  const contentOffsetY = borderTop + padTop

  // Keep current args in refs so the callback always reads fresh values
  const colRef = useRef(col)
  const rowRef = useRef(row)
  const visibleRef = useRef(visible)
  const shapeRef = useRef(shape)
  const setRef = useRef(set)
  const getRef = useRef(get)
  const lastRectRef = useRef<Rect | null>(null)
  const contentOffsetXRef = useRef(contentOffsetX)
  const contentOffsetYRef = useRef(contentOffsetY)
  colRef.current = col
  rowRef.current = row
  visibleRef.current = visible
  shapeRef.current = shape
  setRef.current = set
  getRef.current = get
  contentOffsetXRef.current = contentOffsetX
  contentOffsetYRef.current = contentOffsetY

  // useScrollRect returns the deferred (committed) rect — one frame late
  // vs the in-flight layout, idempotent across convergence passes. The
  // useEffect below reads it and pushes the cursor position to the store.
  // Same observable result as the previous callback form, except the
  // cursor lands on the new position one frame after a layout change
  // (matches the semantics every other reactive layout consumer now sees
  // post the deferred-only switch).
  //
  // Skip when there's no NodeContext — useScrollRect returns the empty
  // sentinel `{0,0,0,0}` in that case, and the test contract for `useCursor`
  // outside a Box parent requires the cursor store to stay untouched.
  const scrollRect = useScrollRect()
  const hasNode = node != null
  useEffect(() => {
    if (!hasNode) return
    lastRectRef.current = scrollRect
    if (!visibleRef.current) {
      return
    }
    setRef.current({
      x: scrollRect.x + contentOffsetXRef.current + colRef.current,
      y: scrollRect.y + contentOffsetYRef.current + rowRef.current,
      visible: true,
      shape: shapeRef.current,
      owner: instanceIdRef.current,
    })
  }, [hasNode, scrollRect.x, scrollRect.y, scrollRect.width, scrollRect.height, scrollRect])

  // When col/row/shape change without a layout change, update cursor
  // position from the last known screen rect. This handles the common case
  // where typing moves the cursor within a component but the component's
  // layout position stays the same (e.g., TextInput cursor moves on keystroke).
  // Write + clear-on-hide in ONE useLayoutEffect — keeps the two
  // operations on the same effect-ordering tier (no cross-tier race
  // where a previous useEffect cleanup nukes the just-written state
  // from a later useLayoutEffect). Owner check guards the clear so an
  // inactive sibling never stomps the active one. Tracking:
  // @km/silvery/13011-usecursor-race.
  const owns = (): boolean => {
    const current = getRef.current()
    if (!current) return false
    // Legacy writes (Ink compat, direct store pokes) may omit owner —
    // treat any owner-less state as "anyone may clear" to preserve
    // backwards compat for non-useCursor writers.
    if (current.owner === undefined) return true
    return current.owner === instanceIdRef.current
  }
  const ownsRef = useRef(owns)
  ownsRef.current = owns

  useLayoutEffect(() => {
    const rect = lastRectRef.current
    if (!rect) return
    if (visible) {
      set({
        x: rect.x + contentOffsetX + col,
        y: rect.y + contentOffsetY + row,
        visible: true,
        shape,
        owner: instanceIdRef.current,
      })
    } else if (ownsRef.current()) {
      // Hiding — clear only if we still own the cursor (another sibling
      // may have already overwritten it).
      set(null)
    }
  }, [col, row, contentOffsetX, contentOffsetY, shape, visible, set])

  // Unmount-only cleanup. Empty deps → cleanup fires ONLY when the
  // component unmounts (not on every visible-prop change). Owner check
  // prevents an inactive sibling's unmount from clearing the active
  // sibling's cursor.
  useEffect(() => {
    return () => {
      if (ownsRef.current()) {
        setRef.current(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional unmount-only
  }, [])
}

// The legacy `getCursorState` / `subscribeCursor` public wrappers were
// removed in km-silvery.delete-cursor-globals (the
// `@km/silvery/12393-delete-cursor-globals` bead). Scheduler callers that
// want cursor visibility wire `cursorAccessors` from `createCursorStore()`
// explicitly; the scheduler falls back to `() => null` when no accessors
// are provided. The module-level `_globalCursorState` /
// `globalSetCursorState` / `globalGetCursorState` / `globalSubscribeCursor`
// helpers above are kept for the @deprecated `useCursor` hook's
// no-provider path (own deletion tracked at km-silvery.delete-use-cursor),
// but are no longer part of the public surface.
