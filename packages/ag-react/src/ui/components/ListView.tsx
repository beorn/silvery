/**
 * ListView - Unified unmounted list component.
 *
 * Merges VirtualView's core (useVirtualizer, viewport rendering, placeholders)
 * with VirtualList's navigation (keyboard, mouse wheel, cursor state) into
 * a single component.
 *
 * @example
 * ```tsx
 * // Passive (parent controls scroll)
 * <ListView
 *   items={logs}
 *   height={20}
 *   renderItem={(item, index) => <LogEntry data={item} />}
 *   estimateHeight={() => 3}
 * />
 *
 * // Navigable (built-in j/k, arrows, PgUp/PgDn, Home/End, G, mouse wheel)
 * <ListView
 *   items={items}
 *   height={20}
 *   nav
 *   renderItem={(item, i, meta) => (
 *     <Text>{meta.isCursor ? '> ' : '  '}{item.name}</Text>
 *   )}
 *   onSelect={(index) => openItem(items[index])}
 * />
 * ```
 */

import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { sumHeights, useVirtualizer } from "../../hooks/useVirtualizer"
import { useInput } from "../../hooks/useInput"
import { Box, type BoxHandle } from "../../components/Box"
import { Text } from "../../components/Text"
import type { AgNode } from "@silvery/ag/types"
import { CacheBackendContext, StdoutContext, TermContext } from "../../context"
import { renderStringSync } from "../../render-string"
import { createHistoryBuffer, createHistoryItem } from "@silvery/ag-term/history-buffer"
import type { HistoryBuffer } from "@silvery/ag-term/history-buffer"
import { createListDocument } from "@silvery/ag-term/list-document"
import type { LiveItemBlock } from "@silvery/ag-term/list-document"
import { createTextSurface } from "@silvery/ag-term/text-surface"
import type { TextSurface } from "@silvery/ag-term/text-surface"
import { composeViewport } from "@silvery/ag-term/viewport-compositor"
import type { ComposedViewport } from "@silvery/ag-term/viewport-compositor"
import { stripAnsi } from "@silvery/ag-term/unicode"
import { isLayoutEngineInitialized } from "@silvery/ag-term/layout-engine"
import { useSearchOptional } from "../../providers/SearchProvider"
import type { MatchRange, SearchMatch } from "@silvery/ag-term/search-overlay"
import { computeMatchRanges } from "@silvery/ag-term/search-overlay"
import { createLogger } from "loggily"

const wheelLog = createLogger("silvery:wheel")

// =============================================================================
// Types
// =============================================================================

/** Metadata passed to renderItem in the third argument */
export interface ListItemMeta {
  /** Whether this item is at the cursor position (nav mode only) */
  isCursor: boolean
  /**
   * Active search query at the time of render. Empty string when no search
   * is in progress (no `SearchProvider` in the tree, or `search` prop not
   * set, or the query is empty).
   *
   * Useful for items rendered as multiple separate Text nodes, where
   * `matchRanges` (offsets into the single `getText(item)` output) can't be
   * projected back onto individual sub-strings without duplicating the
   * splitter logic. Pass `searchQuery` to `computeMatchRanges(segment, q)`
   * per segment — same algorithm, same semantics, per-segment offsets.
   */
  searchQuery: string
  /**
   * Character ranges matched by the active search query within the item's
   * searchable text (the output of `search.getText(item)`). Empty when there
   * is no active query, when `getText` is not configured, or when this
   * item's text contains no matches.
   *
   * Offsets are 0-based, `start` inclusive, `end` exclusive — same as
   * `String.prototype.slice`. Overlapping matches are preserved (e.g. "aa"
   * in "aaaa" produces three ranges). Case-insensitive.
   *
   * Consumers rendering the full `getText` string verbatim can use these
   * ranges directly; consumers rendering the item as multiple segments
   * should use `searchQuery` + `computeMatchRanges(segment, searchQuery)`
   * instead, since whole-item ranges can't be projected across segment
   * boundaries.
   */
  matchRanges: readonly MatchRange[]
}

/** Cache configuration for ListView */
export interface ListViewCacheConfig<T> {
  /**
   * Cache backend mode:
   * - "none": No caching
   * - "virtual": In-memory HistoryBuffer ring buffer (fullscreen/panes)
   * - "terminal": Write to stdout as native scrollback via promoteScrollback (inline mode)
   * - "auto": Auto-select based on CacheBackendContext (set by runtime from rendering mode)
   */
  mode: "none" | "virtual" | "terminal" | "auto"
  /** Predicate for items that can be cached (removed from React tree). */
  isCacheable?: (item: T, index: number) => boolean
  /** Maximum rows in cache buffer. Default: 10_000 */
  capacity?: number
}

/** Search configuration for ListView */
export interface ListViewSearchConfig<T> {
  /** Extract searchable text from an item. When omitted, auto-extracts from rendered content. */
  getText?: (item: T) => string
}

export interface ListViewProps<T> {
  /** Array of items to render */
  items: T[]

  /** Height of the viewport in rows */
  height: number

  /** Estimated height of each item in rows (fixed or per-index function). Default: 1 */
  estimateHeight?: number | ((index: number) => number)

  /** Render function for each item. Third arg provides cursor metadata. */
  renderItem: (item: T, index: number, meta: ListItemMeta) => React.ReactNode

  /** Index to scroll to (declarative override). When set, wins over the
   * internal viewport anchor and cursor-derived scroll — use for programmatic
   * reveal (search matches, "jump to result", etc.). When undefined, the list
   * follows its internal anchor: wheel over it scrolls the viewport with
   * kinetic momentum (cursor stays put); keyboard cursor moves snap the
   * viewport back to the cursor. */
  scrollTo?: number

  /** Extra items to render beyond viewport for smooth scrolling. Default: 5 */
  overscan?: number

  /** Maximum items to render at once. Default: 100 */
  maxRendered?: number

  /** Padding from edge before scrolling (in items). Default: 2 */
  scrollPadding?: number

  /** Show overflow indicators (▲N/▼N). Default: false */
  overflowIndicator?: boolean

  /** Key extractor (defaults to index) */
  getKey?: (item: T, index: number) => string | number

  /** Width of the viewport (optional, uses parent width if not specified) */
  width?: number

  /** Gap between items in rows. Default: 0 */
  gap?: number

  /** Render separator between items (alternative to gap) */
  renderSeparator?: () => React.ReactNode

  /** Called when the visible range reaches near the end of the list (infinite scroll). */
  onEndReached?: () => void
  /** How many items from the end to trigger onEndReached. Default: 5 */
  onEndReachedThreshold?: number

  /**
   * Called when mouse enters an item. Defaults to moving the cursor to that
   * item (hover-to-focus). Provide a custom handler to override this behavior.
   * Only active when nav=true.
   */
  onItemHover?: (index: number) => void
  /**
   * Called when an item is clicked. Defaults to moving the cursor + firing
   * onSelect (click-to-confirm). Provide a custom handler to override.
   * Only active when nav=true.
   */
  onItemClick?: (index: number) => void

  /** Content rendered after all items inside the scroll container (e.g., hidden count indicator) */
  listFooter?: React.ReactNode

  /** Predicate for items already unmounted (cached, pushed to scrollback).
   * Only a contiguous prefix of matching items is removed from the list. */
  unmounted?: (item: T, index: number) => boolean

  // ── Navigable mode ──────────────────────────────────────────────

  /** Enable built-in keyboard (j/k, arrows, PgUp/PgDn, Home/End, G) and mouse wheel */
  nav?: boolean

  /** Currently focused cursor key (controlled). Managed internally when not provided. */
  cursorKey?: number

  /** Called when cursor position changes (keyboard or mouse wheel navigation) */
  onCursor?: (index: number) => void

  /** Called when Enter is pressed on the cursor item */
  onSelect?: (index: number) => void

  /** Whether this ListView is active for keyboard input. Default: true.
   * Set to false when another pane has focus in multi-pane layouts. */
  active?: boolean

  // ── History / Surface ─────────────────────────────────────────

  /** Surface identity for search/selection routing */
  surfaceId?: string

  /** Search configuration (true = auto-extract text from rendered content) */
  search?: boolean | ListViewSearchConfig<T>

  /** Cache configuration (true = auto-cache items above viewport) */
  cache?: boolean | ListViewCacheConfig<T>
}

export interface ListViewHandle {
  /** Imperatively scroll to a specific item index */
  scrollToItem(index: number): void
  /** Get the history buffer (if history.mode === "virtual") */
  getHistoryBuffer(): HistoryBuffer | null
  /** Get the composed viewport (if history.mode === "virtual") */
  getComposedViewport(): ComposedViewport | null
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ESTIMATE_HEIGHT = 1
const DEFAULT_OVERSCAN = 5
const DEFAULT_MAX_RENDERED = 100
const DEFAULT_SCROLL_PADDING = 2

/** Shared no-match sentinel — every renderItem call with no search activity
 * gets the same identity-stable reference so consumers that memoise on
 * `meta.matchRanges` don't see phantom changes each frame. */
const EMPTY_MATCH_RANGES: readonly MatchRange[] = Object.freeze([])

// ── Scroll physics: windowed event buffer + iOS momentum ───────────────
//
// Wheel phase (user actively scrolling). Each wheel event:
//   - dt since last event → acceleration factor (fast gesture → bigger step)
//   - immediate row step for responsiveness
//   - event pushed into a time-windowed ring buffer (last ~150ms of events)
//
// Momentum phase (no wheel events for RELEASE_TIMEOUT_MS). Velocity is
// computed as `sum(signedRows) / spanMs` over the buffer — a net-
// displacement estimate that is structurally robust to:
//   - single-event OS inertia tail (small minority in the sum → negligible)
//   - single-event trackpad jitter (same)
//   - mid-flick sign noise (EMA-smoothed scalars drifted; the buffer sums)
// No velocity threshold, no sign-flip checks, no preserve-across-momentum
// gymnastics — dominant direction wins structurally.
//
// Closed-form decay (Ariya-Hidayat / UIScrollView shape):
//   amplitude = velocity × τ     // total coast distance
//   target    = pos + amplitude
//   pos(t)    = start + amplitude × (1 − exp(−t / τ))
//   stop when t > 6τ or within STOP_DISTANCE rows of target

/** Rows moved per wheel event. Constant — event *frequency* already encodes
 * speed (a fast trackpad stream = many rows/sec naturally); per-event
 * inverse-dt acceleration double-amplifies fast streams and bakes the
 * amplification into momentum velocity. Keep this at 1 per pro's review
 * ("remove per-event acceleration — test this first"). */
const WHEEL_STEP_ROWS = 1
/** Rolling window for velocity estimation. Long enough to average over OS
 * inertia tail (~50ms), short enough that intentional reversal commits
 * within human reaction time (~150-200ms). */
const WHEEL_VELOCITY_WINDOW_MS = 150
/** After this many consecutive same-direction events, the scroll is
 * "sustained" and a single lone opposite event is treated as trackpad
 * noise and dropped. macOS trackpads occasionally emit one reversed event
 * during steady gestures — visible as a 1-row hop back. Two consecutive
 * opposite events always commit (a real reversal). */
const SUSTAINED_SCROLL_THRESHOLD = 3

/** Max absolute velocity (rows/sec). Caps momentum coast distance. */
const KINETIC_MAX_VELOCITY = 80
/** Momentum time constant (ms). */
const KINETIC_TIME_CONSTANT_MS = 180
/** Fraction of `v × τ` to use as momentum amplitude. <1 dampens coast without
 * needing to retune τ (which also affects decay shape). */
const KINETIC_MOMENTUM_GAIN = 0.6
/** Hard cap on coast distance (rows). Raised from 10 → 30 for faster flick
 * throughput — at MAX_VELOCITY=80 × τ=0.18 × GAIN=0.6 the uncapped amplitude
 * is ≈ 8.6 rows, so 30 only clips the very-long-flick outliers while letting
 * normal flicks coast their natural distance (≈ 4-9 rows).
 *
 * Per-flick acceleration: see `KINETIC_ACCEL_BOOST` — consecutive flicks in
 * the same direction compound velocity (iOS-style), letting users reach
 * arbitrary speeds by flicking repeatedly. */
const KINETIC_MAX_COAST_ROWS = 30
/** Velocity boost applied when a new flick begins while momentum is still
 * active in the same direction (iOS-style compounding acceleration). Each
 * subsequent same-direction flick adds `instant_v × BOOST` to the next
 * momentum phase, capped by KINETIC_MAX_VELOCITY so runaway acceleration is
 * impossible. */
const KINETIC_ACCEL_BOOST = 1.6
/** Stop the momentum animation after this many τ (6τ → within 0.25% of target). */
const KINETIC_STOP_AFTER_TAU_MULTIPLES = 6
/** Stop when remaining distance is below this (rows). Higher = snappier end
 * because sub-row animation is invisible in a discrete TUI. */
const KINETIC_STOP_DISTANCE = 1.5
/** Animation loop period in ms — 60Hz sampling of the closed-form curve. */
const KINETIC_FRAME_MS = 16
/** Wait this long with no wheel events before entering momentum phase. */
const RELEASE_TIMEOUT_MS = 60
/** How long (ms) the scrollbar stays visible after the last scroll activity. */
const SCROLLBAR_FADE_AFTER_MS = 800
/** How long (ms) the edge-bump indicator shows after hitting a boundary. */
const EDGE_BUMP_SHOW_MS = 300
/** Pulse period for the edge-bump indicator (ms per half-cycle). */
const EDGE_BUMP_PULSE_MS = 50
/** Cooldown (ms) after a bump: further edge-pushes within this window do NOT
 * re-fire the indicator. Without a cooldown, a continuous wheel gesture at the
 * edge re-arms the 300 ms fuse on every wheel event, stuttering the flash for
 * the duration of the gesture. One flash per gesture is the intended UX. */
const EDGE_BUMP_COOLDOWN_MS = 1500

// =============================================================================
// Measurement
// =============================================================================

/**
 * Wrapper that measures its child's rendered height after layout.
 * Reports the measurement to the virtualizer via measureItem callback.
 * Uses Box's onLayout prop to get the actual rendered height.
 * Does NOT add any layout of its own — the child determines the height.
 */
function MeasuredItem({
  itemKey,
  measureItem,
  children,
}: {
  itemKey: string | number
  measureItem: (key: string | number, height: number) => boolean
  children: React.ReactNode
}): React.ReactElement {
  // Use a ref to always have the latest key/measureItem without re-subscribing.
  // This avoids creating a new onLayout callback on every render.
  const keyRef = useRef(itemKey)
  keyRef.current = itemKey
  const measureRef = useRef(measureItem)
  measureRef.current = measureItem

  const handleLayout = useCallback((rect: { height: number }) => {
    if (rect.height > 0) {
      measureRef.current(keyRef.current, rect.height)
    }
  }, [])

  // Render children inside a transparent wrapper Box with onLayout.
  // The Box inherits the parent's column layout direction and doesn't
  // constrain the child — it simply provides a node for measurement.
  return (
    <Box flexDirection="column" flexShrink={0} onLayout={handleLayout}>
      {children}
    </Box>
  )
}

// =============================================================================
// Component
// =============================================================================

// oxlint-disable-next-line complexity/complexity -- React component — JSX ternaries inflate score
function ListViewInner<T>(
  {
    items,
    height,
    estimateHeight = DEFAULT_ESTIMATE_HEIGHT,
    renderItem,
    scrollTo: scrollToProp,
    overscan = DEFAULT_OVERSCAN,
    maxRendered = DEFAULT_MAX_RENDERED,
    scrollPadding = DEFAULT_SCROLL_PADDING,
    overflowIndicator,
    getKey,
    width,
    gap = 0,
    renderSeparator,
    onEndReached,
    onEndReachedThreshold,
    listFooter,
    unmounted,
    nav,
    cursorKey: cursorKeyProp,
    onCursor,
    onSelect,
    onItemHover,
    onItemClick,
    active,
    surfaceId,
    search: searchProp,
    cache: cacheProp,
  }: ListViewProps<T>,
  ref: React.ForwardedRef<ListViewHandle>,
): React.ReactElement {
  // ── Term context for cache capture width ─────────────────────────
  const term = useContext(TermContext)

  // ── Cache backend context (set by runtime from rendering mode) ───
  const cacheBackendFromContext = useContext(CacheBackendContext)
  const stdoutCtx = useContext(StdoutContext)

  // ── Nav mode: controlled/uncontrolled cursor ─────────
  const isControlled = cursorKeyProp !== undefined
  const [uncontrolledCursor, setUncontrolledCursor] = useState(0)
  const activeCursor = nav ? (isControlled ? cursorKeyProp! : uncontrolledCursor) : -1

  // ── Viewport scroll state (decoupled from cursor, indexed in ROWS) ──
  //
  // Wheel events scroll the viewport without dragging the cursor along
  // (mouse follows hover, keyboard moves focus). `scrollRow` is the row
  // offset of the viewport's top edge — passed to Box as `scrollOffset`
  // (row-precise, not item-"ensure-visible"). Null means "not
  // wheel-scrolling, let nav's scrollTo follow the cursor".
  // `scrollRowFloatRef` is the sub-row accumulator used by the kinetic
  // loop; the rendered `scrollRow` is always an integer.
  //
  // `isScrolling` controls the scrollbar thumb visibility; a setTimeout
  // hides it SCROLLBAR_FADE_AFTER_MS after the last wheel activity.
  const [scrollRow, setScrollRow] = useState<number | null>(null)
  const [isScrolling, setIsScrolling] = useState(false)
  // Fractional position in the scrollable track (0..1) used only by the
  // scrollbar to render at sub-row precision via eighth-block glyphs. The
  // content viewport is row-integer (passed to Box.scrollOffset); this
  // state tracks the same scroll progress at float precision so the thumb
  // can glide 1/8 of a row at a time even when the content hasn't
  // advanced to the next integer row yet.
  const [scrollbarFrac, setScrollbarFrac] = useState(0)
  const scrollRowFloatRef = useRef<number | null>(null)
  // Windowed event buffer — each entry is { t: timestamp ms, rows: signed
  // row delta }. Trimmed to the last WHEEL_VELOCITY_WINDOW_MS on every
  // event. At release, velocity = sum(rows) / span — a net-displacement
  // estimate that structurally rejects tail/jitter noise without
  // per-event heuristics.
  const wheelBufferRef = useRef<Array<{ t: number; rows: number }>>([])
  const lastWheelTimeRef = useRef(0)
  // Directional coalescing — trackpad jitter filter.
  //   sustainedDirRef:   dominant direction in the current streak (-1, 0, +1)
  //   consecSameRef:     count of consecutive events in sustainedDir
  //   consecOppRef:      count of consecutive opposite events (0 = armed)
  // Once consecSameRef ≥ SUSTAINED_SCROLL_THRESHOLD the filter is active: a
  // lone opposite event is dropped and consecOppRef becomes 1 (armed). The
  // NEXT opposite event (before the gesture pauses) commits — legitimate
  // reversals always go through within 2 events. Reset by moveTo() and
  // when the buffer empties after trim (gesture boundary / pause).
  const sustainedDirRef = useRef(0)
  const consecSameRef = useRef(0)
  const consecOppRef = useRef(0)
  // Momentum phase (closed-form exponential decay) state. Populated on
  // release; `null` means "no momentum animation in flight".
  const momentumRef = useRef<{
    startPos: number
    amplitude: number
    startTime: number
  } | null>(null)
  const kineticLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Edge-bump indicator: flips to "top" or "bottom" when a wheel / momentum
  // step would have scrolled past the boundary. Auto-hides via timer — a
  // transient "you've hit the end" cue, NOT a permanent at-edge marker.
  const [bumpedEdge, setBumpedEdge] = useState<"top" | "bottom" | null>(null)
  const bumpHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bumpCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pulse state — toggles every EDGE_BUMP_PULSE_MS while bumpedEdge is
  // active. The indicator Box renders only when isPulseOn is true, so the
  // line appears as a dim on/off flash. Against static chrome (e.g. an
  // inverted top bar), movement is far easier to see than a static line.
  const [isPulseOn, setIsPulseOn] = useState(true)
  // Latest item count — the wheel/kinetic paths close over a stale items.length
  // on each frame otherwise.
  const itemCountRef = useRef(items.length)
  itemCountRef.current = items.length

  const stopKinetic = useCallback(() => {
    if (kineticLoopRef.current !== null) {
      clearInterval(kineticLoopRef.current)
      kineticLoopRef.current = null
    }
    momentumRef.current = null
    // Note: do NOT zero pendingBoostVelocityRef here — handleWheel captures
    // residual velocity *before* calling stopKinetic, and enterMomentum
    // consumes it. Zeroing here would defeat the compounding path. The
    // reset happens naturally in enterMomentum after use.
  }, [])

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [])

  const scheduleScrollbarHide = useCallback(() => {
    if (scrollbarHideTimerRef.current !== null) {
      clearTimeout(scrollbarHideTimerRef.current)
    }
    scrollbarHideTimerRef.current = setTimeout(() => {
      setIsScrolling(false)
      scrollbarHideTimerRef.current = null
      // Scrollbar-lifecycle sync: tie the overscroll indicator to the same
      // idle signal as the scrollbar. When wheel/momentum activity quiesces
      // and the scrollbar fades out, any lingering bump indicator is cleared
      // too — the user has stopped scrolling, so the "you hit the end" cue
      // should not outlive the scrollbar. Keyboard-triggered bumps don't
      // touch `isScrolling`, so they fall through to their own 600 ms timer.
      setBumpedEdge(null)
      if (bumpHideTimerRef.current !== null) {
        clearTimeout(bumpHideTimerRef.current)
        bumpHideTimerRef.current = null
      }
    }, SCROLLBAR_FADE_AFTER_MS)
  }, [])

  // Flash the edge-bump indicator. Called when a scroll attempt was
  // clamped at a boundary — transient "you've hit the end" cue. NOT
  // called when the viewport merely rests at the edge without a push.
  //
  // IMPORTANT: the hide timer is NOT rescheduled on repeat bumps. If the user
  // keeps scrolling against the edge (wheel events every ~30–50 ms), each
  // event would otherwise reset the 300 ms timer, stretching the flash to
  // several seconds. We want the flash bounded to EDGE_BUMP_SHOW_MS from the
  // FIRST bump of a streak. The `bumpHideTimerRef.current !== null` guard
  // means: if a hide timer is already scheduled, leave it alone.
  const flashEdgeBump = useCallback((edge: "top" | "bottom") => {
    // Cooldown guard: one flash per gesture. If a bump fired within the
    // cooldown window, subsequent pushes against the same edge are silenced.
    // The cooldown timer is the single authoritative "can flash" gate.
    if (bumpCooldownTimerRef.current !== null) return
    setBumpedEdge(edge)
    setIsPulseOn(true)
    if (bumpHideTimerRef.current !== null) clearTimeout(bumpHideTimerRef.current)
    bumpHideTimerRef.current = setTimeout(() => {
      setBumpedEdge(null)
      bumpHideTimerRef.current = null
    }, EDGE_BUMP_SHOW_MS)
    // Arm the cooldown: blocks further flashes for EDGE_BUMP_COOLDOWN_MS.
    // Exit cooldown by clearing the ref — next edge push after this fires.
    bumpCooldownTimerRef.current = setTimeout(() => {
      bumpCooldownTimerRef.current = null
    }, EDGE_BUMP_COOLDOWN_MS)
  }, [])

  // Drive the dim on/off pulse while the bump indicator is active.
  useEffect(() => {
    if (bumpedEdge === null) return undefined
    const id = setInterval(() => {
      setIsPulseOn((on) => !on)
    }, EDGE_BUMP_PULSE_MS)
    return () => clearInterval(id)
  }, [bumpedEdge])

  // Cleanup on unmount.
  useEffect(() => () => {
    stopKinetic()
    clearReleaseTimer()
    if (scrollbarHideTimerRef.current !== null) clearTimeout(scrollbarHideTimerRef.current)
    if (bumpHideTimerRef.current !== null) clearTimeout(bumpHideTimerRef.current)
    if (bumpCooldownTimerRef.current !== null) clearTimeout(bumpCooldownTimerRef.current)
  }, [stopKinetic, clearReleaseTimer])

  // Low-level cursor update — does NOT touch wheel/scroll state. Used by
  // the hover path (where content scrolling under a stationary mouse
  // would otherwise fire moveTo repeatedly and keep resetting scroll).
  const setCursorSilently = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, items.length - 1))
      if (!isControlled) setUncontrolledCursor(clamped)
      onCursor?.(clamped)
    },
    [isControlled, items.length, onCursor],
  )

  // Keyboard / programmatic cursor move — snaps viewport back to cursor.
  // Kills any in-flight wheel/momentum animation and release timer.
  const moveTo = useCallback(
    (next: number) => {
      // Intent-based edge-bump: compare REQUESTED position against current
      // bounds (before clamping). If the user pressed j/ArrowDown at the last
      // item, `next` exceeds items.length-1 even though the cursor will clamp
      // to the same value — that's an intent to move past the edge, and we
      // flash the bottom indicator. Mirror for top.
      //
      // Using `cursor`-current (not `next`) as the "from" is critical:
      // setCursorSilently runs NEXT and mutates, so we must read the prior
      // cursor position here. The `cursorRef` indirection would also work; a
      // direct snapshot of `activeCursor` is fine because React guarantees
      // this callback re-binds when activeCursor changes.
      //
      // Bead: km-silvery.overline-attr (intent-based overscroll detection;
      // factored out to km-silvery.overscroll-bump-at-edge for the wheel +
      // kinetic-loop cases that remain follow-up).
      if (next > items.length - 1 && items.length > 0) {
        flashEdgeBump("bottom")
      } else if (next < 0 && items.length > 0) {
        flashEdgeBump("top")
      }
      setCursorSilently(next)
      scrollRowFloatRef.current = null
      setScrollRow(null)
      wheelBufferRef.current = []
      lastWheelTimeRef.current = 0
      sustainedDirRef.current = 0
      consecSameRef.current = 0
      consecOppRef.current = 0
      stopKinetic()
      clearReleaseTimer()
    },
    [clearReleaseTimer, flashEdgeBump, items.length, setCursorSilently, stopKinetic],
  )

  // Max row offset the viewport can have — pre-computed per render below.
  // Populated before this callback fires because React closures capture the
  // render-scope `maxScrollRowRef` which tracks the latest value.
  const maxScrollRowRef = useRef(0)

  // Push the fractional scroll position (0..1) into scrollbar state. Called
  // any time scrollRowFloatRef changes so the scrollbar thumb can render
  // at sub-row precision via eighth-block glyphs.
  const syncScrollbarFrac = useCallback(() => {
    const maxRow = maxScrollRowRef.current
    const float = scrollRowFloatRef.current
    const frac = maxRow > 0 && float !== null ? float / maxRow : 0
    setScrollbarFrac((prev) => {
      const next = Math.max(0, Math.min(1, frac))
      return Math.abs(prev - next) < 0.001 ? prev : next
    })
  }, [])

  // Closed-form momentum sample — evaluates the exponential decay curve at
  // absolute time t relative to release, returns false when the animation
  // should terminate.
  //
  //   pos(t) = start + amplitude × (1 − exp(−t / τ))
  //
  // Where amplitude is the pre-clamped distance to the final target and
  // start is the release-time row offset. Stops at t > 6τ, within
  // KINETIC_STOP_DISTANCE of target, or at either edge.
  const momentumStep = useCallback((): boolean => {
    const m = momentumRef.current
    if (m === null) return false
    const maxRow = maxScrollRowRef.current
    const tau = KINETIC_TIME_CONSTANT_MS
    const t = performance.now() - m.startTime
    if (t >= tau * KINETIC_STOP_AFTER_TAU_MULTIPLES) return false
    const decay = Math.exp(-t / tau)
    const remaining = m.amplitude * decay
    if (Math.abs(remaining) < KINETIC_STOP_DISTANCE) return false
    let pos = m.startPos + m.amplitude * (1 - decay)
    // Hard clamp at edges — zero-remaining terminates. Flash the
    // edge-bump indicator so the user sees why momentum stopped early.
    if (pos <= 0) {
      scrollRowFloatRef.current = 0
      syncScrollbarFrac()
      setScrollRow(0)
      flashEdgeBump("top")
      return false
    }
    if (pos >= maxRow) {
      scrollRowFloatRef.current = maxRow
      syncScrollbarFrac()
      setScrollRow(maxRow)
      flashEdgeBump("bottom")
      return false
    }
    scrollRowFloatRef.current = pos
    syncScrollbarFrac()
    const rendered = Math.round(pos)
    setScrollRow((prev) => (prev === rendered ? prev : rendered))
    return true
  }, [flashEdgeBump, syncScrollbarFrac])

  const startMomentum = useCallback(() => {
    if (kineticLoopRef.current !== null) return
    // Keep scrollbar visible for the duration of the coast — refresh the
    // hide timer each frame. Without this, scrollbar fades mid-coast on
    // long flicks (hide timer fires before momentum ends).
    setIsScrolling(true)
    scheduleScrollbarHide()
    kineticLoopRef.current = setInterval(() => {
      if (!momentumStep()) {
        stopKinetic()
        return
      }
      // Refresh hide timer so scrollbar stays visible through the coast.
      scheduleScrollbarHide()
    }, KINETIC_FRAME_MS)
  }, [momentumStep, scheduleScrollbarHide, stopKinetic])

  // Transition from user-driven wheel to closed-form momentum phase.
  //
  // Velocity comes from the windowed event buffer as a net-displacement
  // estimate over the last WHEEL_VELOCITY_WINDOW_MS:
  //   v = Σ(signedRows) / (windowSpanMs / 1000)
  //
  // Structurally robust to:
  //   - OS inertia tail: tiny opposite-direction events contribute their
  //     real (small) weight to the sum — the flick body dominates.
  //   - Trackpad jitter: same story, per-event noise averages out.
  //   - Intentional reversal: if the user genuinely reverses, the window
  //     fills with opposite events within ~100-150ms, the sum flips, and
  //     the next release fires in the new direction.
  const enterMomentum = useCallback(() => {
    const now = performance.now()
    const buf = wheelBufferRef.current
    // Trim stale entries.
    while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
    if (buf.length < 2) {
      wheelBufferRef.current = []
      return
    }
    const netRows = buf.reduce((s, e) => s + e.rows, 0)
    // Span = first-to-last event time — NOT `now − first.t`. The release
    // timer fires ~60ms after the last event; using `now` systematically
    // dilutes velocity by that idle gap (pro review diagnosis).
    const first = buf[0]!
    const last = buf[buf.length - 1]!
    const spanMs = Math.max(1, last.t - first.t)
    const rawV = (netRows / spanMs) * 1000
    // Add any residual velocity captured from a prior coast we interrupted
    // in the same direction (iOS-style acceleration). Clears after use.
    const boost = pendingBoostVelocityRef.current
    pendingBoostVelocityRef.current = 0
    const compoundedV = rawV + boost
    const v = Math.max(-KINETIC_MAX_VELOCITY, Math.min(KINETIC_MAX_VELOCITY, compoundedV))
    // Consume the buffer — it belongs to the gesture we're now animating.
    wheelBufferRef.current = []
    if (Math.abs(v) < 1) return
    const maxRow = maxScrollRowRef.current
    if (maxRow <= 0) return
    const startPos = scrollRowFloatRef.current ?? 0
    // amplitude = v × τ × gain, then hard-capped to MAX_COAST_ROWS to
    // prevent runaway coast on peak-velocity flicks.
    const rawAmplitude = v * (KINETIC_TIME_CONSTANT_MS / 1000) * KINETIC_MOMENTUM_GAIN
    const amplitude = Math.max(
      -KINETIC_MAX_COAST_ROWS,
      Math.min(KINETIC_MAX_COAST_ROWS, rawAmplitude),
    )
    const rawTarget = startPos + amplitude
    const clampedTarget = Math.max(0, Math.min(maxRow, rawTarget))
    momentumRef.current = {
      startPos,
      amplitude: clampedTarget - startPos,
      startTime: performance.now(),
    }
    wheelLog.debug?.(
      `momentum start v=${v.toFixed(1)} netRows=${netRows.toFixed(2)} spanMs=${spanMs.toFixed(0)} startPos=${startPos.toFixed(2)} amplitude=${(clampedTarget - startPos).toFixed(2)} target=${clampedTarget.toFixed(2)}`,
    )
    startMomentum()
  }, [startMomentum])

  const scheduleRelease = useCallback(() => {
    clearReleaseTimer()
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null
      enterMomentum()
    }, RELEASE_TIMEOUT_MS)
  }, [clearReleaseTimer, enterMomentum])

  // Seed the row-space scroll state from the current viewport position —
  // run on the first wheel event of a gesture so momentum picks up from
  // where the user is looking, not from row 0.
  const rowsAboveViewportRef = useRef(0)

  // Residual velocity (rows/sec) captured from an in-flight momentum coast
  // when a new wheel event interrupts it in the SAME direction. Used by
  // `enterMomentum` to compound — each same-direction flick adds to the
  // prior residual, giving iOS-style acceleration. Zeroed when the user
  // reverses direction or when momentum ends naturally.
  const pendingBoostVelocityRef = useRef(0)

  const handleWheel = useCallback(
    ({ deltaY }: { deltaY: number }) => {
      const maxRow = maxScrollRowRef.current
      if (maxRow <= 0) return
      const now = performance.now()
      const dir = Math.sign(deltaY) || 0
      if (dir === 0) return
      // Capture the residual velocity from any in-flight momentum BEFORE we
      // stop it. If the new flick is in the same direction, this residual
      // compounds into the next momentum phase (iOS-style acceleration).
      // Opposite direction → zero the boost; user is reversing, not
      // accelerating.
      const m = momentumRef.current
      if (m !== null) {
        const tau = KINETIC_TIME_CONSTANT_MS
        const t = performance.now() - m.startTime
        // Instantaneous velocity of the decay curve: v0 × exp(-t/τ), where
        // v0 = amplitude / τ (seconds). Evaluate in rows/sec.
        const decay = Math.exp(-t / tau)
        const instantVRowsPerMs = (m.amplitude / tau) * decay
        const instantVRowsPerSec = instantVRowsPerMs * 1000
        const sameDir = Math.sign(instantVRowsPerSec) === dir
        if (sameDir) {
          pendingBoostVelocityRef.current += instantVRowsPerSec * KINETIC_ACCEL_BOOST
          // Cap so runaway acceleration is impossible even under spam.
          const cap = KINETIC_MAX_VELOCITY
          if (pendingBoostVelocityRef.current > cap) pendingBoostVelocityRef.current = cap
          else if (pendingBoostVelocityRef.current < -cap) pendingBoostVelocityRef.current = -cap
        } else {
          pendingBoostVelocityRef.current = 0
        }
      }
      // Cancel any in-flight momentum — user is actively driving again.
      stopKinetic()
      clearReleaseTimer()
      // First wheel event of a gesture seeds scrollRow from the virtualizer's
      // current viewport-top rows. Clamped to [0, maxRow] because the
      // virtualizer's `scrollOffsetRef` bootstraps at the cursor index,
      // which can exceed maxRow (when cursor is near end of list). Without
      // clamping, the first wheel would trigger a spurious edge-bump.
      if (scrollRowFloatRef.current === null) {
        scrollRowFloatRef.current = Math.max(
          0,
          Math.min(maxRow, rowsAboveViewportRef.current),
        )
      }
      lastWheelTimeRef.current = now
      // Trim buffer to window BEFORE consulting it.
      const buf = wheelBufferRef.current
      while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
      // Gesture boundary: if trim emptied the buffer, the previous streak
      // ended (> WINDOW_MS since last event). Reset directional coalescing.
      if (buf.length === 0) {
        sustainedDirRef.current = 0
        consecSameRef.current = 0
        consecOppRef.current = 0
      }
      // Directional coalescing — drop a single opposite event during a
      // sustained scroll (trackpad jitter filter). Two consecutive opposite
      // events always commit.
      if (sustainedDirRef.current === 0) {
        sustainedDirRef.current = dir
        consecSameRef.current = 1
        consecOppRef.current = 0
      } else if (dir === sustainedDirRef.current) {
        consecSameRef.current += 1
        consecOppRef.current = 0
      } else {
        // Opposite direction.
        if (
          consecSameRef.current >= SUSTAINED_SCROLL_THRESHOLD &&
          consecOppRef.current === 0
        ) {
          // First lone opposite during sustained scroll — noise. Drop
          // entirely: no displacement, no buffer contribution, no
          // scrollbar pulse, no edge-bump flash.
          consecOppRef.current = 1
          wheelLog.debug?.(
            `wheel jitter-filtered deltaY=${deltaY.toFixed(2)} sustainedDir=${sustainedDirRef.current} consecSame=${consecSameRef.current}`,
          )
          return
        }
        // Either no sustained streak yet, or second opposite in a row — a
        // real reversal. Commit the new direction.
        sustainedDirRef.current = dir
        consecSameRef.current = 1
        consecOppRef.current = 0
      }
      // Apply immediate displacement. No per-event acceleration — event
      // frequency already encodes speed. No opposite-to-buffer suppression
      // — that was a heuristic fix for a symptom of the (now-fixed) bug
      // where suppressed events corrupted buffer velocity.
      const prev = scrollRowFloatRef.current
      const rawNext = prev + dir * WHEEL_STEP_ROWS
      let nextFloat = rawNext
      if (nextFloat < 0) nextFloat = 0
      else if (nextFloat > maxRow) nextFloat = maxRow
      const appliedRows = nextFloat - prev
      // Intent-based edge-bump — fire whenever the user pushed past the edge,
      // including the "already at edge, push further" case that the strict
      // `<` / `>` comparison missed. The request is `dir * WHEEL_STEP_ROWS`;
      // whenever that request is non-zero AND the clamped result is flush
      // against the corresponding edge, the indicator fires.
      //
      // Why: previously the formula was `rawNext > maxRow` (strict), so when
      // a user started with the viewport already at the bottom (prev = maxRow)
      // and wheel-scrolled down, rawNext = maxRow + 1 DID fire — but when the
      // seeded prev was fractionally below maxRow (e.g. maxRow - 0.3) and step
      // = 1, rawNext = maxRow + 0.7 fired. The trouble case was any path where
      // rawNext landed EXACTLY at maxRow (never strictly past it) — no bump.
      // Matching the keyboard intent model (moveTo), we now treat "pushed AND
      // ended at the edge" as overscroll intent regardless of transition
      // shape.
      if (dir > 0 && nextFloat >= maxRow) flashEdgeBump("bottom")
      else if (dir < 0 && nextFloat <= 0) flashEdgeBump("top")
      scrollRowFloatRef.current = nextFloat
      syncScrollbarFrac()
      const rendered = Math.round(nextFloat)
      setScrollRow((prevInt) => (prevInt === rendered ? prevInt : rendered))
      // Push APPLIED rows (not intended) into the buffer — edge-clamped
      // events and the rare zero-motion event contribute their real
      // contribution to velocity, not a synthetic one.
      if (appliedRows !== 0) {
        buf.push({ t: now, rows: appliedRows })
      }
      wheelLog.debug?.(
        `wheel deltaY=${deltaY.toFixed(2)} applied=${appliedRows.toFixed(2)} anchorFloat=${nextFloat.toFixed(2)} buf=[${buf.length} events, netRows=${buf.reduce((s, e) => s + e.rows, 0).toFixed(1)}]`,
      )
      // Scrollbar on — auto-hide refreshes on each event.
      setIsScrolling(true)
      scheduleScrollbarHide()
      // After a short pause, roll buffer into momentum.
      scheduleRelease()
    },
    [
      clearReleaseTimer,
      flashEdgeBump,
      scheduleRelease,
      scheduleScrollbarHide,
      stopKinetic,
      syncScrollbarFrac,
    ],
  )

  // Observe search bar state — while the bar is open, the app-wide
  // SearchBindings consumes Enter for "next match". ListView must NOT also
  // fire onSelect (which would open a detail pane or similar). Guarding on
  // isActive keeps the two event consumers from firing together.
  const searchCtx = useSearchOptional()
  const searchActiveRef = useRef(false)
  searchActiveRef.current = searchCtx?.isActive ?? false

  // Keyboard input for nav mode
  useInput(
    (input, key) => {
      if (!nav) return
      const cur = activeCursor
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + Math.floor(height / 2))
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - Math.floor(height / 2))
      else if (key.return && !searchActiveRef.current) onSelect?.(cur)
    },
    { isActive: nav && active !== false },
  )

  // Resolve viewport target in priority order:
  //   1. scrollToProp (declarative override — e.g. programmatic reveal)
  //   2. scrollRow set (wheel is driving — Box uses scrollOffset below,
  //      scrollTo stays undefined so it doesn't compete)
  //   3. activeCursor (nav mode default — viewport follows cursor)
  //   4. undefined (passive list with no scroll position opinion)
  const scrollTo =
    scrollToProp !== undefined
      ? scrollToProp
      : scrollRow !== null
        ? undefined
        : nav
          ? activeCursor
          : undefined

  // ── Resolve cache config ─────────────────────────────────────────
  // When cache=true, use "auto" mode which reads CacheBackendContext.
  // When cache={ mode: "auto" }, also reads context. Otherwise use the explicit mode.
  const cacheConfig =
    typeof cacheProp === "object" ? cacheProp : cacheProp ? { mode: "auto" as const } : undefined
  const rawCacheMode = cacheConfig?.mode ?? "none"
  // Resolve "auto" → context-driven backend selection
  const cacheMode =
    rawCacheMode === "auto"
      ? cacheBackendFromContext === "terminal"
        ? "terminal"
        : "virtual"
      : rawCacheMode
  const cacheBufferRef = useRef<HistoryBuffer | null>(null)
  if (cacheMode === "virtual" && !cacheBufferRef.current) {
    cacheBufferRef.current = createHistoryBuffer(cacheConfig?.capacity ?? 10_000)
  }
  const cacheBuffer = cacheBufferRef.current

  // ── Resolve search config ─────────────────────────────────────────
  const searchConfig = typeof searchProp === "object" ? searchProp : searchProp ? {} : undefined
  const getText = searchConfig?.getText ?? (searchConfig ? (item: T) => String(item) : undefined)

  // ── Active search query (for renderItem meta) ─────────────────────
  //
  // Read from the optional SearchProvider context. When there is no
  // provider, no `search` prop, or the query is empty, this is "" — meta
  // carries the empty string and callers render plainly. A non-empty
  // query flows through to every visible item's `meta.matchRanges`
  // computation below, so highlighting stays in lock-step with the
  // provider's own match cycling.
  const activeSearchQuery = searchConfig && searchCtx ? searchCtx.query : ""

  // Compute cached prefix from isCacheable
  let cachedCount = 0
  if ((cacheMode === "virtual" || cacheMode === "terminal") && cacheConfig?.isCacheable) {
    for (let i = 0; i < items.length; i++) {
      if (!cacheConfig.isCacheable(items[i]!, i)) break
      cachedCount++
    }
  }

  // Push newly cached items to buffer or terminal scrollback
  const prevCachedRef = useRef(0)
  if (
    cachedCount > prevCachedRef.current &&
    (cacheMode === "virtual" || cacheMode === "terminal")
  ) {
    const captureWidth = width ?? term?.cols ?? 80
    const canCapture = isLayoutEngineInitialized()
    for (let i = prevCachedRef.current; i < cachedCount; i++) {
      const item = items[i]!
      const key = getKey?.(item, i) ?? i
      let ansi: string
      if (canCapture) {
        // Render the item's element through the pipeline to get real ANSI
        // (borders, padding, colors — everything the user saw). Cache
        // capture runs for items that have scrolled out of view and
        // become immutable scrollback; search highlights belong to the
        // live viewport only, so the meta passed here is "no search".
        try {
          const element = renderItem(item, i, {
            isCursor: false,
            searchQuery: "",
            matchRanges: EMPTY_MATCH_RANGES,
          })
          ansi = renderStringSync(element as React.ReactElement, {
            width: captureWidth,
            plain: false,
            trimTrailingWhitespace: true,
            trimEmptyLines: false,
          })
        } catch {
          // Fallback to plain text if render fails
          ansi = getText?.(item) ?? String(item)
        }
      } else {
        // Layout engine not ready — fallback to plain text
        ansi = getText?.(item) ?? String(item)
      }

      if (cacheMode === "terminal") {
        // Terminal mode: write to stdout as native scrollback via promoteScrollback.
        // The terminal IS the buffer — no need to store in HistoryBuffer.
        const lineCount = ansi.split("\n").length
        stdoutCtx?.promoteScrollback?.(`${ansi}\x1b[K\r\n`, lineCount)
      } else if (cacheBuffer) {
        // Virtual mode: store in HistoryBuffer ring buffer
        cacheBuffer.push(createHistoryItem(key, ansi, captureWidth))
      }
    }
    prevCachedRef.current = cachedCount
  }

  // Merge cached prefix with external unmounted prop.
  // Only unmount cached items when the cache backend can display them:
  // - "terminal": items promoted to real terminal scrollback (inline mode)
  // - "virtual": items stored in HistoryBuffer for virtual scrollback viewer
  // - "retain": items cached but kept in the render tree (plain fullscreen
  //   without virtual scrollback — unmounting would make items invisible)
  const shouldUnmountCached = cacheBackendFromContext !== "retain" && cachedCount > 0
  const effectiveUnmounted = useMemo(() => {
    if (!shouldUnmountCached) return unmounted
    if (!unmounted) {
      return (_item: T, index: number) => index < cachedCount
    }
    return (item: T, index: number) => {
      if (index < cachedCount) return true
      return unmounted(item, index)
    }
  }, [shouldUnmountCached, cachedCount, unmounted])

  // ── Virtual prefix computation ──────────────────────────────────────
  let unmountedCount = 0
  if (effectiveUnmounted) {
    for (let i = 0; i < items.length; i++) {
      if (!effectiveUnmounted(items[i]!, i)) break
      unmountedCount++
    }
  }

  // Slice items to exclude virtual prefix
  const activeItems = unmountedCount > 0 ? items.slice(unmountedCount) : items

  // Adjust scrollTo to account for virtual items
  const adjustedScrollTo =
    scrollTo !== undefined ? Math.max(0, scrollTo - unmountedCount) : undefined

  // ── Adapt estimateHeight for unmounted offset ──────────────────
  const adjustedEstimateHeight = useMemo(() => {
    if (typeof estimateHeight === "number") return estimateHeight
    if (unmountedCount > 0) {
      return (index: number) => estimateHeight(index + unmountedCount)
    }
    return estimateHeight
  }, [estimateHeight, unmountedCount])

  // ── useVirtualizer ──────────────────────────────────────────────
  const wrappedGetKey = useMemo(() => {
    if (!getKey) return undefined
    if (unmountedCount === 0) return (index: number) => getKey(activeItems[index]!, index)
    return (index: number) => getKey(activeItems[index]!, index + unmountedCount)
  }, [getKey, activeItems, unmountedCount])

  // Scroll container AgNode — captured after mount so useVirtualizer can
  // subscribe to layout-phase's scrollState signal. Until the Box mounts
  // (first render), this is null and useVirtualizer uses bootstrap mode.
  const boxHandleRef = useRef<BoxHandle>(null)
  const [containerNode, setContainerNode] = useState<AgNode | null>(null)
  useLayoutEffect(() => {
    const node = boxHandleRef.current?.getNode() ?? null
    setContainerNode(node)
  }, [])

  // Count of trailing extra children rendered between the visible items and
  // the trailing placeholder (listFooter). useVirtualizer uses this to
  // correctly map `scrollState.lastVisibleChild` back to a virtual item.
  const trailingExtraChildren = listFooter != null && listFooter !== false ? 1 : 0

  const {
    range,
    leadingHeight,
    trailingHeight,
    hiddenBefore,
    hiddenAfter,
    scrollOffset,
    scrollToItem,
    measureItem,
    measuredHeights,
  } = useVirtualizer({
    count: activeItems.length,
    estimateHeight: adjustedEstimateHeight,
    viewportHeight: height,
    scrollTo: adjustedScrollTo,
    scrollPadding,
    overscan,
    maxRendered,
    gap,
    getItemKey: wrappedGetKey,
    onEndReached,
    onEndReachedThreshold,
    containerNode,
    trailingExtraChildren,
  })

  // ── Surface / search registration ────────────────────────────────
  const textSurfaceRef = useRef<TextSurface | null>(null)
  const composedViewportRef = useRef<ComposedViewport | null>(null)

  // Stable refs for the effect closure to avoid re-running on every items change
  const itemsRef = useRef(items)
  itemsRef.current = items
  const unmountedCountRef = useRef(unmountedCount)
  unmountedCountRef.current = unmountedCount
  const getTextRef = useRef(getText)
  if (getText) getTextRef.current = getText
  const getKeyRef = useRef(getKey)
  getKeyRef.current = getKey

  // Stable ref to scrollToItem so the search reveal closure doesn't go stale
  const scrollToItemRef = useRef(scrollToItem)
  scrollToItemRef.current = scrollToItem

  // Stable ref to moveTo so the search reveal closure can move the nav
  // cursor without stale-closure issues. In nav mode, scrollToItem is a
  // no-op (Box.scrollTo is overridden by activeCursor), so reveal must
  // route through moveTo → onCursor → App's cursor state instead.
  const moveToRef = useRef(moveTo)
  moveToRef.current = moveTo
  const navRef = useRef(nav)
  navRef.current = nav

  // Create and maintain ListDocument + TextSurface when surfaceId is set
  useEffect(() => {
    if (!surfaceId || cacheMode !== "virtual" || !cacheBuffer) return

    const getLiveItems = (): LiveItemBlock[] => {
      const currentItems = itemsRef.current
      const currentUnmountedCount = unmountedCountRef.current
      const currentGetText = getTextRef.current
      const currentGetKey = getKeyRef.current
      const live: LiveItemBlock[] = []
      for (let i = currentUnmountedCount; i < currentItems.length; i++) {
        const item = currentItems[i]!
        const text = currentGetText?.(item) ?? String(item)
        const rows = text.split("\n")
        const plainTextRows = rows.map((r) => stripAnsi(r))
        live.push({
          key: currentGetKey?.(item, i) ?? i,
          itemIndex: i,
          rows,
          plainTextRows,
        })
      }
      return live
    }

    const document = createListDocument(cacheBuffer, getLiveItems)
    const surface = createTextSurface({
      id: surfaceId,
      document,
      viewportToDocument: (viewportRow: number) => viewportRow + cacheBuffer.totalRows,
      onReveal: () => {
        // Could be extended later for scroll-to-row
      },
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    textSurfaceRef.current = surface

    return () => {
      textSurfaceRef.current = null
    }
  }, [surfaceId, cacheMode, cacheBuffer])

  // ── Search registration ──────────────────────────────────────────
  // Register as Searchable in SearchProvider when `search` prop is set.
  // The search function scans all items' text for query matches.
  // The reveal function scrolls the matching item into view.
  //
  // Uses the explicit `surfaceId` when provided (multi-pane routing), and
  // falls back to an auto-generated id from useId so that single-pane
  // apps get a working searchable without boilerplate. The provider's
  // getActiveSearchable() handles both — explicit focusedId wins,
  // otherwise the only registered searchable is selected.
  const autoSearchableId = useId()
  const searchableId = surfaceId ?? autoSearchableId
  useEffect(() => {
    if (!searchConfig || !searchCtx) return

    const searchable = {
      search(query: string): SearchMatch[] {
        if (!query) return []
        const currentItems = itemsRef.current
        const currentGetText = getTextRef.current
        const lowerQuery = query.toLowerCase()
        const matches: SearchMatch[] = []
        let row = 0
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]!
          const text = currentGetText?.(item) ?? String(item)
          const lines = text.split("\n")
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx]!
            const lowerLine = line.toLowerCase()
            let col = 0
            while (col < lowerLine.length) {
              const found = lowerLine.indexOf(lowerQuery, col)
              if (found === -1) break
              matches.push({ row: row + lineIdx, startCol: found, endCol: found + query.length })
              col = found + 1
            }
          }
          row += lines.length
        }
        return matches
      },
      reveal(match: SearchMatch): void {
        // Find which item contains this row
        const currentItems = itemsRef.current
        const currentGetText = getTextRef.current
        let row = 0
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]!
          const text = currentGetText?.(item) ?? String(item)
          const lineCount = text.split("\n").length
          if (match.row < row + lineCount) {
            // Route to the correct consumer:
            //  - nav mode: move the cursor (scrollTo is overridden by
            //    activeCursor in nav mode, so moveTo is the only thing
            //    that actually brings the match into view + lets the
            //    App observe the new position via onCursor).
            //  - passive mode: scroll the viewport.
            if (navRef.current) {
              // moveTo takes original (pre-unmounted) indices — same as
              // items[i]. It clamps internally.
              moveToRef.current(i)
            } else {
              scrollToItemRef.current(Math.max(0, i - unmountedCountRef.current))
            }
            return
          }
          row += lineCount
        }
      },
    }

    return searchCtx.registerSearchable(searchableId, searchable)
  }, [searchConfig, searchCtx, searchableId])

  // Compute composed viewport when history is active
  if (cacheMode === "virtual" && cacheBuffer) {
    composedViewportRef.current = composeViewport({
      history: cacheBuffer,
      viewportHeight: height,
      scrollOffset: 0, // At tail by default; scroll offset would come from external state
    })
  }

  // ── Ref ───────────────────────────────────────────────────────────
  // Wrap scrollToItem to accept original indices (before virtual adjustment)
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        scrollToItem(Math.max(0, index - unmountedCount))
      },
      getHistoryBuffer(): HistoryBuffer | null {
        return cacheBufferRef.current
      },
      getComposedViewport(): ComposedViewport | null {
        return composedViewportRef.current
      },
    }),
    [scrollToItem, unmountedCount],
  )

  // ── Mouse wheel handler ─────────────────────────────────────────
  // Wheel over the list scrolls its viewport with iOS-style kinetic
  // momentum (mouse follows hover, keyboard moves focus). Cursor is
  // untouched by scrolling. Any subsequent keyboard cursor move snaps the
  // viewport back to the cursor via `moveTo`. Physics: inter-event dt
  // drives wheel acceleration; closed-form exponential decay runs during
  // the momentum phase. See `handleWheel` + `enterMomentum` above.
  const onWheel = handleWheel

  // ── Empty state ─────────────────────────────────────────────────
  if (activeItems.length === 0) {
    return (
      <Box flexDirection="column" height={height} width={width}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  const { startIndex, endIndex } = range
  const visibleItems = activeItems.slice(startIndex, endIndex)

  // STRICT invariant: virtualizer's leadingHeight must equal
  // sumHeights(0, startIndex) — i.e. the placeholder row-count matches the
  // prefix-sum the virtualizer used internally. This catches drift between
  // window-placement math and placeholder-height math (e.g. the divergence
  // that caused the column-top-disappears bug class). Scoped here (not in
  // the hook) because it exercises a user-visible contract that affects
  // overflow math.
  //
  // NOTE: The /pro review's stronger form ("sumHeights(0, virtualizer.scrollOffset)
  // == leadingHeight") does NOT hold in general — the virtualizer's `scrollOffset`
  // is viewport-top-item-index while `startIndex` can sit below it by up to
  // `overscan` items (start = max(0, scrollOffset - overscan)). The stronger
  // form only holds when overscan doesn't pull `start` back (scrollOffset=0 or
  // viewport at count-end). We instead check the always-true internal
  // consistency invariant — any violation points to a virtualizer math bug.
  if (process?.env?.SILVERY_STRICT) {
    const strict = process.env.SILVERY_STRICT
    const shouldThrow = strict === "2"
    const expectedLeading = sumHeights(
      0,
      startIndex,
      adjustedEstimateHeight,
      gap,
      measuredHeights,
      wrappedGetKey,
    )
    // Allow 1 row of floating-point slack for avgMeasured fallback divisions.
    if (Math.abs(leadingHeight - expectedLeading) > 1) {
      const msg =
        `[SILVERY_STRICT] ListView leadingHeight ${leadingHeight} diverges from ` +
        `sumHeights(0, startIndex=${startIndex})=${expectedLeading} ` +
        `(scrollOffset=${scrollOffset}, count=${activeItems.length})`
      if (shouldThrow) throw new Error(msg)
      else console.warn(msg)
    }
  }

  // Calculate scrollTo index for silvery Box overflow="scroll"
  //
  // When the user is wheel-driving (scrollRow !== null), suppress
  // scrollTo entirely — Box's `scrollOffset` prop (below) drives the
  // viewport directly in row space. If we kept passing scrollTo too, the
  // layout phase's edge-based scroll would snap viewport back to the
  // cursor whenever the cursor drifted off-screen, undoing the wheel.
  const hasTopPlaceholder = leadingHeight > 0
  const currentScrollTarget =
    adjustedScrollTo !== undefined
      ? Math.max(0, Math.min(adjustedScrollTo, activeItems.length - 1))
      : scrollOffset
  const selectedIndexInSlice = currentScrollTarget - startIndex
  const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice
  const boxScrollTo =
    scrollRow !== null
      ? undefined
      : isSelectedInSlice
        ? Math.max(0, scrollToIndex)
        : undefined

  // Scrollbar geometry — indexed on ROW (vertical position), not item#.
  // Item-indexed thumb jumps erratically when item heights vary, because
  // "50% through the items" is not "50% through the rendered content"
  // when early items are tall and late items short (or vice-versa).
  //
  //   totalRows     = sum of every item's measured row height (or its
  //                   estimate for unmeasured items). Stable across a
  //                   scroll — depends on count + measurement cache only,
  //                   not on the render window.
  //   scrollable    = totalRows − trackHeight (rows the user can reveal
  //                   by scrolling, excluding the always-visible viewport).
  //   thumbHeight   = trackHeight × trackHeight / totalRows
  //                   (viewport fraction of total, CSS-scrollbar shape).
  //   thumbTop      = trackRemainder × leadingHeight / scrollable
  //                   (row offset of viewport top → thumb top).
  //
  // `leadingHeight` comes from the virtualizer and is the measured row
  // offset above the first visible item — this is exactly what a browser
  // scrollbar uses, so tall items before the viewport correctly push the
  // thumb further down than short ones.
  const trackHeight = Math.max(1, height)
  // Stable total-content height for THUMB SIZE: item count × estimate
  // (ignores the measurement cache) — TanStack Virtual / react-window
  // convention. A measurement-sum-based total would shrink/grow the thumb
  // as the user scrolls into unmeasured items, producing a visible resize
  // jitter that's more distracting than a slight inaccuracy.
  //
  // `estimateAsNumber` folds function-estimates into an average by sampling
  // index 0; for uniform-height lists this is exact, and for variable-height
  // the thumb is mildly imprecise in size but doesn't jitter.
  const estimateAsNumber =
    typeof estimateHeight === "number" ? estimateHeight : estimateHeight(0)
  const totalRowsStable = Math.max(1, activeItems.length * (estimateAsNumber + gap))
  // Accurate rows-above-viewport for THUMB POSITION: uses measurement cache
  // (items that have scrolled past are always measured → stable in use).
  const totalRowsMeasured = Math.max(
    1,
    sumHeights(
      0,
      activeItems.length,
      adjustedEstimateHeight,
      gap,
      measuredHeights,
      wrappedGetKey,
    ),
  )
  const totalRows = totalRowsMeasured
  // Rows scrolled past the viewport top — the exact measurement a browser
  // uses for scrollbar position. `leadingHeight` from the virtualizer is
  // `sumHeights(0, startIndex)` where startIndex = scrollOffset − overscan,
  // so it underestimates "rows above viewport" by the overscan window and
  // lags the thumb behind the content. Use `scrollOffset` (viewport-top
  // item index) + sumHeights directly.
  const rowsAboveViewport = sumHeights(
    0,
    scrollOffset,
    adjustedEstimateHeight,
    gap,
    measuredHeights,
    wrappedGetKey,
  )
  const thumbHeight =
    totalRowsStable > trackHeight
      ? Math.max(1, Math.floor((trackHeight * trackHeight) / totalRowsStable))
      : 0
  const scrollableRows = Math.max(1, totalRows - trackHeight)
  const trackRemainder = trackHeight - thumbHeight
  // When the user is wheel-driving, derive thumb from our own `scrollRow`
  // (exact row offset). Otherwise use the virtualizer's measurement-based
  // `rowsAboveViewport` (keyboard-following mode).
  const effectiveRowsAbove = scrollRow !== null ? scrollRow : rowsAboveViewport
  // Keep refs fresh for the wheel / momentum callbacks (captured via
  // closure with stable identity).
  maxScrollRowRef.current = scrollableRows
  rowsAboveViewportRef.current = rowsAboveViewport
  // Thumb position is driven by `scrollbarFrac` (0..1) below — a float state
  // that's updated on every wheel/momentum step via syncScrollbarFrac, so the
  // thumb slides at 1/8-row precision even while the content viewport
  // (row-integer) hasn't advanced. Content clamp lives in `handleWheel` +
  // `momentumStep` (scrollRow clamped to [0, maxRow], momentum amplitude
  // pre-clamped — no rubber-band overshoot). `effectiveRowsAbove` remains
  // unused here because showScrollbar is only true after wheel activity,
  // during which scrollbarFrac is always fresh.
  void effectiveRowsAbove
  const showScrollbar = isScrolling && thumbHeight > 0 && thumbHeight < trackHeight

  return (
    <Box position="relative" flexDirection="column" height={height} width={width}>
    <Box
      ref={boxHandleRef}
      flexDirection="column"
      height={height}
      width={width}
      overflow="scroll"
      scrollTo={boxScrollTo}
      scrollOffset={scrollRow ?? undefined}
      overflowIndicator={overflowIndicator}
      onWheel={onWheel}
    >
      {/* Leading placeholder for virtual height.
       *
       * `representsItems` tells the parent scroll container that this one
       * placeholder Box stands in for `hiddenBefore` (= startIndex) logical
       * items — so when it's fully scrolled above the viewport, the parent's
       * `hiddenAbove` is incremented by that count (→ `▲N` shows real items).
       * Without this, the ▲N indicator would always say `1` while many items
       * are actually above the render window. */}
      {leadingHeight > 0 && (
        <Box height={leadingHeight} flexShrink={0} representsItems={hiddenBefore} />
      )}

      {/* Render visible items with height measurement */}
      {visibleItems.map((item, i) => {
        const originalIndex = startIndex + i + unmountedCount
        const key = getKey ? getKey(item, originalIndex) : startIndex + i
        const isLast = i === visibleItems.length - 1
        // Search-match metadata — computed per visible item (bounded by
        // maxRendered, typically < 100) so centralising the algorithm here
        // costs nothing vs the consumer re-scanning in renderItem. When
        // search is not configured (`getText` unset) or there's no active
        // query, both fields collapse to empty and the consumer renders
        // plainly. See ListItemMeta docstring for per-segment usage.
        const itemMatchRanges: readonly MatchRange[] =
          activeSearchQuery !== "" && getText
            ? computeMatchRanges(getText(item), activeSearchQuery)
            : EMPTY_MATCH_RANGES
        const meta: ListItemMeta = {
          isCursor: originalIndex === activeCursor,
          searchQuery: activeSearchQuery,
          matchRanges: itemMatchRanges,
        }
        // Use wrappedGetKey (index within activeItems) for measurement cache
        const measureKey = wrappedGetKey ? wrappedGetKey(startIndex + i) : startIndex + i

        // In nav mode, wrap each item with hover/click handlers so that
        // hovering moves the keyboard cursor and clicking confirms the
        // selection. The wrapper is always added when nav is on and active
        // — previously it was only added when the app provided
        // onItemHover/onItemClick explicitly, which meant hover silently
        // did nothing for apps that wanted the defaults.
        const rendered = renderItem(item, originalIndex, meta)
        const itemNode =
          nav && active !== false ? (
            <Box
              onMouseEnter={
                onItemHover
                  ? () => onItemHover(originalIndex)
                  : // Hover updates the cursor but does NOT reset
                    // wheel/scroll state. Otherwise, content scrolling
                    // under a stationary mouse would fire onMouseEnter
                    // on each newly-revealed item, each call would
                    // clobber the in-flight scroll anchor, and the next
                    // wheel event would re-seed from the (now stale)
                    // virtualizer position — manifesting as a sudden
                    // 30+ row jump after a brief pause mid-flick.
                    () => setCursorSilently(originalIndex)
              }
              onClick={
                onItemClick
                  ? () => onItemClick(originalIndex)
                  : () => {
                      moveTo(originalIndex)
                      onSelect?.(originalIndex)
                    }
              }
            >
              {rendered}
            </Box>
          ) : (
            rendered
          )

        return (
          <React.Fragment key={key}>
            <MeasuredItem itemKey={measureKey} measureItem={measureItem}>
              {itemNode}
            </MeasuredItem>
            {!isLast && renderSeparator && renderSeparator()}
            {!isLast && gap > 0 && !renderSeparator && <Box height={gap} flexShrink={0} />}
          </React.Fragment>
        )
      })}

      {/* Footer content (e.g., filter hidden count) */}
      {listFooter}

      {/* Trailing placeholder for virtual height.
       *
       * See leading placeholder above for why `representsItems` is set — the
       * trailing version covers `hiddenAfter` (= count - endIndex) items that
       * are beyond the render window on the bottom side. */}
      {trailingHeight > 0 && (
        <Box height={trailingHeight} flexShrink={0} representsItems={hiddenAfter} />
      )}
    </Box>
    {/* Scrollbar overlay — absolute-positioned on the right edge so it
     * doesn't steal a column from content. Track is implicit (transparent);
     * only the thumb draws. The thumb renders via eighth-block Unicode
     * glyphs so its vertical position slides at 1/8-row precision even when
     * the content viewport (row-integer) hasn't advanced.
     *
     * Corner stops are short horizontal bracket lines extending LEFT from
     * the scrollbar column at the top and bottom of the track — a visual
     * cue where the track ends, appearing/hiding with the same auto-hide
     * timer as the thumb. */}
    {showScrollbar && (() => {
      const thumbTopFloat = scrollbarFrac * trackRemainder
      const thumbBottomFloat = thumbTopFloat + thumbHeight
      const firstRow = Math.floor(thumbTopFloat)
      const lastRow = Math.min(trackHeight - 1, Math.ceil(thumbBottomFloat) - 1)
      const EIGHTHS = "▁▂▃▄▅▆▇█"
      const rows: React.ReactNode[] = []
      for (let r = firstRow; r <= lastRow; r++) {
        const isFirst = r === firstRow
        const isLast = r === lastRow
        const fractionalTop = isFirst && thumbTopFloat !== firstRow
        const fractionalBottom = isLast && thumbBottomFloat !== lastRow + 1
        if (fractionalTop) {
          // Portion of this cell filled (from the bottom). Use lower-N-eighths
          // glyphs which paint a bar rising from the bottom of the cell.
          const portion = 1 - (thumbTopFloat - firstRow)
          const idx = Math.max(0, Math.round(portion * 8) - 1)
          const glyph = EIGHTHS[idx]!
          rows.push(
            <Text key={r} color="$muted">
              {glyph}
            </Text>,
          )
        } else if (fractionalBottom) {
          // Portion of this cell filled (from the top). The lower-N-eighths
          // glyph family only fills from the bottom, so we invert: render a
          // lower-(8-N) glyph with swapped colors — track below the thumb,
          // thumb above.
          const portion = thumbBottomFloat - lastRow
          const idx = Math.max(0, Math.round((1 - portion) * 8) - 1)
          const glyph = EIGHTHS[idx]!
          rows.push(
            <Text key={r} color="$bg" backgroundColor="$muted">
              {glyph}
            </Text>,
          )
        } else {
          // Fully-filled thumb row.
          rows.push(
            <Text key={r} color="$muted" backgroundColor="$muted">
              █
            </Text>,
          )
        }
      }
      // Edge-bump indicator — a transient cue that fires only when a
      // scroll attempt was clamped at a boundary. Renders as a thin
      // full-width line at the TOP edge of the first visible row (top
      // bump) or the BOTTOM edge of the last visible row (bottom bump):
      // Bar paints the full ListView width (left/right:0) using a bg-only
      // Box — no Text child — so cell characters beneath are preserved.
      return (
        <Box
          position="absolute"
          top={firstRow}
          right={0}
          width={1}
          flexDirection="column"
        >
          {rows}
        </Box>
      )
    })()}
    {/* Overscroll indicator — spans the entire ListView width: a
      * transparent SGR overlay on the first line (top) or the last
      * visible line (bottom). Transient: the flash timer auto-hides
      * after EDGE_BUMP_SHOW_MS, BUT we also gate on the scroll position
      * still being at the corresponding edge. If the user scrolls away
      * from the edge before the timer fires, the indicator vanishes
      * immediately — it's meaningless when the edge line isn't on
      * screen anymore.
      *
      * Rendered OUTSIDE the scrollbar branch because the scrollbar auto-
      * hides on `isScrolling` and keyboard nav (j/k/ArrowDown/ArrowUp)
      * doesn't currently flip `isScrolling`. The indicator has its own
      * EDGE_BUMP_SHOW_MS lifecycle and must render regardless of the
      * scrollbar's visibility.
      *
      * Edge asymmetry (top = overline, bottom = underline):
      * SGR 53 (overline) draws the line ABOVE the character cell; SGR 4
      * (underline) draws BELOW. The top indicator uses overline so the
      * line sits against the very top of the first row — "you're bumped
      * against the top" — instead of reading as "this row's content is
      * underlined". The bottom indicator uses underline for the mirror
      * reason. Bead: km-silvery.overline-attr.
      *
      * Rendering: the Box has no `backgroundColor`, only the attr prop,
      * so mergeAttrsInRect (km-silvery.text-box-attr-props) layers the
      * SGR on every cell in the row WITHOUT overwriting the text glyph /
      * fg / bg underneath. */}
    {/* Edge-bump indicator — a small 10-char pulsed line in the corner
      * opposite the direction you pushed. Top-bump puts the line in the
      * top-right; bottom-bump puts it in the bottom-right. Full-width
      * lines were too busy and fought with row content. Corner placement
      * is a peripheral-vision cue — visible enough to catch the eye,
      * subtle enough not to overlay the reading area.
      *
      * Top uses SGR 53 (overline, draws line ABOVE the cell); bottom uses
      * SGR 4 (underline, BELOW the cell). Against an inverted-bg chrome
      * line (e.g. a status bar), the thin attr-line + $fg pulse is legible
      * without bolding the text underneath. */}
    {/* Flush-to-edge block characters — ▔ (U+2594 UPPER ONE EIGHTH BLOCK)
      * paints at the top of the cell, ▁ (U+2581 LOWER ONE EIGHTH BLOCK)
      * at the bottom. Thicker than SGR overline/underline but visually
      * positioned identically (flush to the cell edge), so the bump reads
      * as "edge of viewport" not "middle of this row is highlighted". */}
    {bumpedEdge === "top" && isPulseOn && (
      <Box position="absolute" top={0} right={1} flexDirection="row">
        <Text color="$fg">▔▔▔▔▔▔▔▔▔▔</Text>
      </Box>
    )}
    {bumpedEdge === "bottom" && isPulseOn && (
      <Box position="absolute" top={trackHeight - 1} right={1} flexDirection="row">
        <Text color="$fg">▁▁▁▁▁▁▁▁▁▁</Text>
      </Box>
    )}
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const ListView = forwardRef(ListViewInner) as <T>(
  props: ListViewProps<T> & { ref?: React.ForwardedRef<ListViewHandle> },
) => React.ReactElement
