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
import { makeMeasureKey } from "../../hooks/useVirtualizer"
import { useScrollState } from "../../hooks/useScrollState"
import { useInput } from "../../hooks/useInput"
import { useHover } from "../../hooks/useHover"
import type { SilveryMouseEvent } from "@silvery/ag/mouse-event-types"
import { Box, type BoxHandle } from "../../components/Box"
import { Text } from "../../components/Text"
import type { AgNode } from "@silvery/ag/types"
import { CacheBackendContext, StdoutContext, TermContext } from "../../context"
import { renderStringSync } from "../../render-string"
import { createHeightModel, type HeightModel } from "./list-view/height-model"
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

/**
 * Virtualization strategy for ListView.
 *
 * - **`"none"`** — render every item, no windowing. The right default for
 *   small lists where the overhead of windowing exceeds the cost of rendering
 *   everything. Maintains correctness — no scroll-extent estimation, no
 *   measurement cache invariants to track.
 * - **`"index"`** — index-window virtualisation. The window is anchored to
 *   the viewport (via layout-phase's `firstVisibleChild`) and bounded by
 *   item count + estimated row count. Cursor is a secondary constraint —
 *   it stays renderable even when scrolled far away. The right choice for
 *   chat/log surfaces where wrap is variable but per-item rendering is
 *   cheap.
 * - **`"measured"`** — pixel-aware measured virtualisation (when `height`
 *   prop is set). Currently delegates to the legacy `useVirtualizer` path
 *   that already measures items and computes pixel-accurate placeholders.
 *   The placeholder for a future anchor-preserving rewrite.
 *
 * Default: `"none"` if `items.length <= virtualizationThreshold`, else
 * `"index"` (when `height` is omitted) or `"measured"` (when `height` is
 * set). Pass an explicit value to opt out of the small-list-renders-all
 * default.
 */
export type VirtualizationStrategy = "none" | "index" | "measured"

/**
 * Auto-follow policy for `ListView`. See the `follow` prop docstring
 * for the full contract. `"end"` mirrors the chat-style "stick to the
 * end" behaviour previously gated by `stickyBottom={true}`; `"none"`
 * is the default (no auto-follow).
 */
export type FollowPolicy = "none" | "end"

export interface ListViewProps<T> {
  /** Array of items to render */
  items: T[]

  /**
   * Height of the viewport in rows.
   *
   * When provided: ListView pixel-virtualises against this height — measures
   * each item, computes a precise visible window, and renders only those
   * items (plus `overscan` slack on each side).
   *
   * When omitted: ListView is **height-independent**. It renders as
   * `flex-grow=1 overflow=scroll` and uses **index-window virtualisation**:
   * a window of `[cursor - overscan, cursor + overscan]` items renders, and
   * the parent's `overflow=scroll` clips what doesn't fit. No pixel-windowing
   * means no `useBoxRect`-derived first-frame zero-read class — wrap and
   * layout settle on the first paint.
   *
   * Most lists are smaller than `2 × overscan` items and effectively render
   * unvirtualised in this mode. The trade-off: an arbitrarily long list with
   * the cursor far from a hot region renders up to `2 × overscan + 1` items
   * regardless of how many actually fit in the viewport. Default overscan is
   * 50, so the upper bound is ~101 rendered items — well within React + the
   * pipeline's comfort zone.
   */
  height?: number

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

  /**
   * Virtualization strategy. See `VirtualizationStrategy`.
   *
   * Default: `"none"` when `items.length <= virtualizationThreshold`
   * (the small-list-renders-all default). Above the threshold the default
   * is `"index"` (height-independent mode) or `"measured"` (pixel-mode
   * with a fixed `height`). Pass an explicit value to override.
   */
  virtualization?: VirtualizationStrategy

  /**
   * Item count threshold below which the default strategy is `"none"`
   * (render every item). Above this threshold ListView switches to its
   * size-aware default. Lifted into a prop so consumers with cheap items
   * can raise the bar (e.g. 500 trivial Text rows) and consumers with
   * expensive items can lower it. Default: 100.
   */
  virtualizationThreshold?: number

  /**
   * Auto-follow policy. Determines how the viewport tracks growing item
   * count when the user is "at the end" of the list.
   *
   * - `"none"` (default): viewport never auto-follows. Cursor or scroll
   *   prop drives position; items appended at the tail leave viewport
   *   alone unless cursor pins to the last item.
   * - `"end"`: chat-style auto-follow. When the LAST VISIBLE ROW is in
   *   the viewport, items appended at the tail auto-scroll so the new
   *   tail stays in view. When the user scrolls up (away from the
   *   bottom), auto-follow is disabled — viewport stays put as items
   *   are appended. When the user returns to the bottom, auto-follow
   *   resumes.
   *
   * Crucially, "at end" is computed in VISUAL ROW space, not item-index
   * space — `cursorKey === lastIdx` does NOT imply at-end when the last
   * item is taller than the viewport (cursor on the last item but its
   * tail is still off-screen below). The math uses HeightModel's
   * effective heights to determine whether the bottom of the last
   * item's row range is within the visible viewport.
   *
   * When `follow="end"` is set together with `cursorKey`, the cursor is
   * a SELECTION marker only — it does NOT drive viewport position. This
   * removes the historical race between cursor-pin (`ensureCursorVisible`)
   * and sticky-bottom auto-follow that produced viewport jumps when the
   * last item changed shape.
   *
   * Pair with `onAtBottomChange` to render a sticky-toggle UI or
   * overscroll indicator. Default: `"none"`.
   */
  follow?: FollowPolicy

  /**
   * @deprecated Use `follow="end"` instead. `stickyBottom={true}` is
   * an alias kept for one cycle to ease migration. Removal in a future
   * release.
   *
   * Chat-style "stick to the end" auto-follow. When `true` and the viewport
   * is at the bottom of the list, items appended at the tail trigger an
   * auto-scroll so the new tail stays in view. When the user scrolls up
   * (away from the bottom), auto-follow is disabled — the viewport stays
   * put as items are appended. When the user returns to the bottom,
   * auto-follow resumes.
   */
  stickyBottom?: boolean

  /**
   * Fires when the viewport transitions between "at bottom" and
   * "scrolled away". Receives `true` when the viewport reaches the bottom
   * (auto-follow active), `false` when the user scrolls away from the
   * bottom (auto-follow paused).
   *
   * Edge-triggered — only fires on transitions, not on every render. The
   * initial mount fires once with the resolved at-bottom state. Use this to
   * render an "↓ jump to latest" button, a sticky-mode indicator, or to
   * mirror the auto-follow state into external store. No call when
   * `stickyBottom` is unset and the viewport never enters auto-follow mode.
   */
  onAtBottomChange?: (atBottom: boolean) => void

  /**
   * Maximum total estimated row count for the rendered window in `"index"`
   * mode. The window expands until either `maxRendered` (item budget) or
   * this value (row budget) is exhausted — whichever comes first.
   *
   * Why both: 50 items of 1 row each is cheap (50 rows of work), but 50
   * items of 5 rows each is expensive (250 rows of work). Capping by item
   * count alone over-renders for tall items; capping by row count alone
   * under-renders for short items. Both budgets together adapt to content
   * shape automatically.
   *
   * Default: 200. Roughly 4-10 viewport-heights of content depending on
   * row size — enough overscan for smooth scroll, bounded enough to keep
   * the React + pipeline budget healthy.
   */
  maxEstimatedRows?: number
}

export interface ListViewHandle {
  /** Imperatively scroll to a specific item index */
  scrollToItem(index: number): void
  /**
   * Imperatively scroll the viewport by `rows` rows. Positive scrolls down
   * (further into the list), negative scrolls up. Clamped to
   * `[0, maxScrollRow]`. Seeds from the current measured viewport position
   * the first time it's called in a wheel-style gesture (mirrors the wheel
   * handler's seed logic). Does NOT move the cursor; this is viewport-only.
   *
   * Calling `scrollBy` disengages `follow="end"` auto-follow until the
   * caller explicitly calls `scrollToBottom()` (or the user wheels back to
   * the bottom edge — same semantics as the wheel handler).
   */
  scrollBy(rows: number): void
  /**
   * Imperatively scroll to the top of the list (row 0). Disengages
   * `follow="end"` auto-follow.
   */
  scrollToTop(): void
  /**
   * Imperatively scroll to the bottom of the list (row maxScrollRow). When
   * the ListView has `follow="end"` set, this also re-arms the auto-follow
   * snap so subsequent appends keep the tail visible — mirrors the
   * "user wheels back to the bottom" semantics.
   */
  scrollToBottom(): void
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
/**
 * Index-window overscan — used in height-independent mode (`height` prop
 * omitted). Generously sized so that most lists render every item and the
 * "virtualised" branch never produces a user-visible cliff. The trade-off
 * is a ~101-item upper bound on simultaneously-rendered items in this
 * mode, which is well within React + pipeline budget.
 */
const DEFAULT_INDEX_WINDOW_OVERSCAN = 50
const DEFAULT_MAX_RENDERED = 100
const DEFAULT_SCROLL_PADDING = 2
/** Item-count cutoff for the small-list-renders-all default. Below this,
 * the default `virtualization` is `"none"` (no windowing) regardless of
 * `height`. Most lists in real apps are well below this — the default
 * exists so callers don't have to opt out of windowing for their 30-row
 * settings panel. */
const DEFAULT_VIRTUALIZATION_THRESHOLD = 100
/** Default row-count budget for index-window expansion. The index window
 * grows until either `maxRendered` (item count) or this (estimated total
 * rows) is hit. Tall items hit the row budget first, short items hit the
 * item budget first — same React + pipeline cost either way. */
const DEFAULT_MAX_ESTIMATED_ROWS = 200

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

// =============================================================================
// Measurement
// =============================================================================

/**
 * Wrapper that measures its child's rendered height after layout.
 * Reports the measurement to the virtualizer via measureItem callback,
 * including the rendered width so the cache invalidates cleanly on pane
 * resize.
 *
 * Width is forwarded as the third argument to `measureItem(key, height,
 * width)` — wrapped content's height is a function of available width, so
 * caching by id alone produces stale heights once a pane is resized. The
 * virtualizer composes `${itemKey}:${width}` internally; callers don't
 * see the composite key.
 *
 * Does NOT add any layout of its own — the child determines the height.
 */
function MeasuredItem({
  itemKey,
  measureItem,
  children,
}: {
  itemKey: string | number
  measureItem: (key: string | number, height: number, width?: number) => boolean
  children: React.ReactNode
}): React.ReactElement {
  // Use a ref to always have the latest key/measureItem without re-subscribing.
  // This avoids creating a new onLayout callback on every render.
  const keyRef = useRef(itemKey)
  keyRef.current = itemKey
  const measureRef = useRef(measureItem)
  measureRef.current = measureItem

  const handleLayout = useCallback((rect: { width: number; height: number }) => {
    if (rect.height > 0) {
      // Forward width so the virtualizer keys the cache by `(id, width)`.
      // Round to integer columns — a fractional width won't differ
      // meaningfully from the integer one for cache hit purposes, and
      // floating-point keys produce noisy duplicates after resize churn.
      const w = rect.width > 0 ? Math.round(rect.width) : undefined
      measureRef.current(keyRef.current, rect.height, w)
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
    overscan: overscanProp,
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
    virtualization: virtualizationProp,
    virtualizationThreshold = DEFAULT_VIRTUALIZATION_THRESHOLD,
    maxEstimatedRows = DEFAULT_MAX_ESTIMATED_ROWS,
    follow,
    stickyBottom = false,
    onAtBottomChange,
  }: ListViewProps<T>,
  ref: React.ForwardedRef<ListViewHandle>,
): React.ReactElement {
  // ── Height-independent mode (Phase 3 of km-silvery.view-as-layout-output) ──
  //
  // When `height` is omitted, ListView lets flex propagate the actual
  // viewport height (parent owns the constraint via `flex-grow=1
  // overflow=scroll`) and switches to **index-window virtualisation** —
  // anchored to the viewport (via layout-phase's `firstVisibleChild`) and
  // bounded by both an item budget (`maxRendered`) and a row budget
  // (`maxEstimatedRows`). No pixel-windowing, no first-render zero-read
  // class.
  //
  // The pixel-mode path (`height` provided) is unchanged — existing tests
  // and callers that still want a fixed-height viewport keep working.
  const isHeightIndependent = height === undefined
  const overscan =
    overscanProp ?? (isHeightIndependent ? DEFAULT_INDEX_WINDOW_OVERSCAN : DEFAULT_OVERSCAN)

  // Resolved virtualization strategy. Below the threshold, default is
  // "none" (small lists render everything). Above, default is "index" for
  // height-independent mode and "measured" for pixel mode.
  const resolvedVirtualization: VirtualizationStrategy =
    virtualizationProp ??
    (items.length <= virtualizationThreshold ? "none" : isHeightIndependent ? "index" : "measured")

  // ── Resolved follow policy ──────────────────────────────────────
  //
  // Bead `km-silvery.listview-followpolicy-split`: explicit `follow`
  // prop is the canonical knob; `stickyBottom={true}` is a deprecated
  // alias (kept one cycle for migration). When both are set, explicit
  // `follow` wins.
  const resolvedFollow: FollowPolicy = follow ?? (stickyBottom ? "end" : "none")

  // `pendingFollowSnapRef` — true when a follow="end" snap-to-bottom
  // is owed. Set on mount when `follow="end"` and on every transition
  // back to atEnd via wheel; cleared once the snap is applied (when
  // maxRow becomes known via layout). This survives the first 1-2
  // pre-measurement commits where maxRow is 0. Declared early so the
  // `scrollTo` resolution further down can read it.
  const pendingFollowSnapRef = useRef<boolean>(false)
  const followInitialisedRef = useRef<boolean>(false)
  if (!followInitialisedRef.current) {
    followInitialisedRef.current = true
    pendingFollowSnapRef.current = resolvedFollow === "end"
  }

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
  // step would have scrolled past the boundary. Renders as a steady corner
  // tick while the viewport is AT the edge; cleared by leaving the edge or
  // by the scrollbar-idle timer. No flash / strobe — an earlier version had
  // a time-bounded flash but every attempt leaked timer state across React
  // re-renders and produced "stuck flashing" reports. The indicator simply
  // appearing in one frame IS the attention-grab; no animation needed.
  const [bumpedEdge, setBumpedEdge] = useState<"top" | "bottom" | null>(null)
  // Latest item count — the wheel/kinetic paths close over a stale items.length
  // on each frame otherwise.
  const itemCountRef = useRef(items.length)
  itemCountRef.current = items.length
  // Cursor index mirrored into a ref so handleWheel can use it without
  // recreating the callback on every cursor move (would thrash wheel state).
  const activeCursorRef = useRef(0)
  activeCursorRef.current = activeCursor

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
      // Scrollbar auto-hides after idle → overscroll indicator goes with it.
      // The user has stopped scrolling; the "you hit the end" cue is stale.
      setBumpedEdge(null)
    }, SCROLLBAR_FADE_AFTER_MS)
  }, [])

  // Show the edge-bump indicator. Called when a scroll attempt was clamped
  // at a boundary. The indicator stays visible (at-edge render gate) until
  // the user scrolls away OR the scrollbar-idle timer fires. No flash /
  // strobe — plain appear-and-stay. Prior animated-flash designs couldn't
  // survive React reconciler re-runs cleanly (see bumpedEdge comment above).
  const flashEdgeBump = useCallback((edge: "top" | "bottom") => {
    setBumpedEdge(edge)
  }, [])

  // Cleanup on unmount.
  useEffect(
    () => () => {
      stopKinetic()
      clearReleaseTimer()
      if (scrollbarHideTimerRef.current !== null) clearTimeout(scrollbarHideTimerRef.current)
    },
    [stopKinetic, clearReleaseTimer],
  )

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
      // First wheel event of a gesture — seed scrollRowFloat.
      //
      // Previously used Math.min(maxRow, rowsAboveViewportRef.current) which
      // works for MOST cases but fails at startup when the cursor is pinned
      // to the last item (km-logview follow-mode): the virtualizer's
      // rowsAboveViewport can lag the cursor-based true position, so the
      // seed comes in well below maxRow. First wheel-down then moves us
      // FROM the seed value, never reaching the edge, and the overscroll
      // indicator doesn't fire.
      //
      // Fix: if the cursor is pinned to an endpoint (first or last item),
      // seed directly to the corresponding edge (0 or maxRow) regardless
      // of rowsAboveViewport's lag. Otherwise fall back to the measured
      // value.
      if (scrollRowFloatRef.current === null) {
        const cursorIdx = activeCursorRef.current
        const lastIdx = itemCountRef.current - 1
        if (cursorIdx >= lastIdx && lastIdx >= 0) {
          scrollRowFloatRef.current = maxRow
        } else if (cursorIdx <= 0) {
          scrollRowFloatRef.current = 0
        } else {
          scrollRowFloatRef.current = Math.max(0, Math.min(maxRow, rowsAboveViewportRef.current))
        }
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
      // Edge-clamp jitter filter — when the user is sustained-pushing
      // INTO an edge (anchor at 0 with sustainedDir=-1, or at maxRow
      // with sustainedDir=+1), aggressively drop any opposite-direction
      // event regardless of `consecSame`. Trackpad inertia bounces
      // produce spurious reverse events at the edge: the user has
      // clearly committed to "scroll past the edge," and the bounce
      // should not be treated as an intentional reversal.
      //
      // Without this, repeated wheel-up at the top edge with one
      // bounce produces visible scroll-row oscillation between 0 and
      // 1 — the bounce slips through the standard
      // `consecSame >= SUSTAINED_SCROLL_THRESHOLD` gate (which only
      // activates after 3 same-direction events) and applies as a
      // real reversal, jumping anchor from 0 to 1, then the next
      // genuine wheel-up pulls it back to 0. Bead:
      // km-silvery.scroll-top-edge-oscillation.
      const anchor = scrollRowFloatRef.current ?? 0
      const sustainedDir = sustainedDirRef.current
      const atTopWithUpwardSustained = anchor <= 0 && sustainedDir === -1
      const atBottomWithDownwardSustained = anchor >= maxRow && sustainedDir === 1
      const atSustainedEdge = atTopWithUpwardSustained || atBottomWithDownwardSustained
      if (atSustainedEdge && dir !== sustainedDir) {
        wheelLog.debug?.(
          `wheel edge-jitter-filtered deltaY=${deltaY.toFixed(2)} anchor=${anchor.toFixed(2)} sustainedDir=${sustainedDir}`,
        )
        return
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
        if (consecSameRef.current >= SUSTAINED_SCROLL_THRESHOLD && consecOppRef.current === 0) {
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

  // True while the user is mid-drag on the scrollbar thumb (mousedown
  // not yet matched by mouseup or mouseleave). Drives `onMouseMove`'s
  // decision to keep the thumb glued to the cursor — without this,
  // moves would fire constantly while the cursor passes over the
  // track without intent.
  const scrollbarDraggingRef = useRef(false)

  // Set the viewport position from a fractional 0..1 value. Used by
  // scrollbar click-to-position (click the track at frac=0.6 → snap
  // viewport to 60% of the way through the content) and the
  // scroll-to-bottom floating button (frac=1).
  //
  // - clamps frac to [0, 1]
  // - kills any in-flight kinetic momentum (user is taking explicit control)
  // - clears `pendingFollowSnapRef` UNLESS we landed at the end (then
  //   re-arm follow="end" so subsequent appends keep the tail visible)
  const scrollToFrac = useCallback(
    (frac: number) => {
      const maxRow = maxScrollRowRef.current
      if (maxRow <= 0) return
      const clampedFrac = Math.max(0, Math.min(1, frac))
      const target = clampedFrac * maxRow
      stopKinetic()
      clearReleaseTimer()
      scrollRowFloatRef.current = target
      const rendered = Math.round(target)
      setScrollRow((prev) => (prev === rendered ? prev : rendered))
      // At the end? Re-arm follow="end" so streaming appends stay visible.
      // Anywhere else: cancel pending snap so the viewport doesn't jump.
      if (clampedFrac >= 1 - 1 / Math.max(1, maxRow) && resolvedFollow === "end") {
        pendingFollowSnapRef.current = true
      } else {
        pendingFollowSnapRef.current = false
      }
      setIsScrolling(true)
      scheduleScrollbarHide()
    },
    [clearReleaseTimer, resolvedFollow, scheduleScrollbarHide, stopKinetic],
  )

  // Observe search bar state — while the bar is open, the app-wide
  // SearchBindings consumes Enter for "next match". ListView must NOT also
  // fire onSelect (which would open a detail pane or similar). Guarding on
  // isActive keeps the two event consumers from firing together.
  const searchCtx = useSearchOptional()
  const searchActiveRef = useRef(false)
  searchActiveRef.current = searchCtx?.isActive ?? false

  // Keyboard input for nav mode.
  //
  // PageUp/PageDown and Ctrl-D/Ctrl-U use a "page step" — half the visible
  // viewport when `height` is known. In height-independent mode (no
  // `height`), the visible row count isn't measurable from inside ListView,
  // so we fall back to half the index-window overscan as a sensible page
  // step (≈ 25 items by default, comparable to a typical viewport).
  const pageStep = isHeightIndependent
    ? Math.max(1, Math.floor(overscan / 2))
    : Math.max(1, Math.floor((height as number) / 2))
  useInput(
    (input, key) => {
      if (!nav) return
      const cur = activeCursor
      if (input === "j" || key.downArrow) moveTo(cur + 1)
      else if (input === "k" || key.upArrow) moveTo(cur - 1)
      else if (input === "G" || key.end) moveTo(items.length - 1)
      else if (key.home) moveTo(0)
      else if (key.pageDown || (input === "d" && key.ctrl)) moveTo(cur + pageStep)
      else if (key.pageUp || (input === "u" && key.ctrl)) moveTo(cur - pageStep)
      else if (key.return && !searchActiveRef.current) onSelect?.(cur)
    },
    { isActive: nav && active !== false },
  )

  // Resolve viewport target in priority order:
  //   1. scrollToProp (declarative override — e.g. programmatic reveal)
  //   2. scrollRow set (wheel is driving — Box uses scrollOffset below,
  //      scrollTo stays undefined so it doesn't compete)
  //   3. follow="end" + first paint pending snap → pin to the LAST
  //      item's index so Box's ensure-visible math lands the viewport
  //      at the bottom synchronously, even before the row-space snap
  //      effect has run. After the first paint, scrollRow takes over.
  //      Cursor is NOT used here — that's the bead's whole point
  //      (`km-silvery.listview-followpolicy-split`: cursor is a
  //      SELECTION marker, not a scroll authority).
  //   4. activeCursor (nav mode default — viewport follows cursor)
  //   5. undefined (passive list with no scroll position opinion)
  const followEndPendingScrollTarget =
    resolvedFollow === "end" && pendingFollowSnapRef.current && items.length > 0
      ? items.length - 1
      : undefined
  const scrollTo =
    scrollToProp !== undefined
      ? scrollToProp
      : scrollRow !== null
        ? undefined
        : resolvedFollow === "end"
          ? followEndPendingScrollTarget
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
  // Viewport width and height tracked via the inner Box's onLayout. Width is
  // forwarded to `useVirtualizer({ viewportWidth })` so the measurement
  // cache invalidates on pane resize. Height is used in height-independent
  // mode to size the row budget against the actually-visible viewport.
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const node = boxHandleRef.current?.getNode() ?? null
    setContainerNode(node)
  }, [])
  const handleContainerLayout = useCallback((rect: { width: number; height: number }) => {
    const w = rect.width > 0 ? Math.round(rect.width) : 0
    const h = rect.height > 0 ? Math.round(rect.height) : 0
    setViewportSize((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev
      return { w, h }
    })
  }, [])

  // Count of trailing extra children rendered between the visible items and
  // the trailing placeholder (listFooter). useVirtualizer uses this to
  // correctly map `scrollState.lastVisibleChild` back to a virtual item.
  const trailingExtraChildren = listFooter != null && listFooter !== false ? 1 : 0

  // In height-independent mode we still call `useVirtualizer` so that the
  // measurement cache, `scrollToItem`, and the cache/search pipelines keep
  // working — but we override its window with our own index-window below
  // and never render leading/trailing pixel placeholders. Pass a synthetic
  // viewport height that's "tall enough" to cover the index window so the
  // virtualizer's bookkeeping doesn't think nothing fits.
  const virtualizerEstimateAsNumber =
    typeof adjustedEstimateHeight === "number" ? adjustedEstimateHeight : adjustedEstimateHeight(0)
  const syntheticViewportHeight =
    (overscan * 2 + 1) * (Math.max(1, virtualizerEstimateAsNumber) + gap)
  const virtualizerViewportHeight = isHeightIndependent
    ? syntheticViewportHeight
    : (height as number)

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
    viewportHeight: virtualizerViewportHeight,
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
    // Width-keyed measurement cache: pass the actual rendered viewport
    // width so heights captured at width=80 don't leak into a width=40
    // re-render (wrapped content's height is width-dependent).
    viewportWidth: viewportSize?.w,
  })

  // ── HeightModel — canonical height-math source ────────────────────
  //
  // Phase 2 of `km-silvery.listview-heightmodel-unify`: replaces the
  // ad-hoc `sumHeights()` callsites + `totalRowsMeasured` /
  // `rowsAboveViewport` / `indexLeadingSpacer` / `indexTrailingSpacer`
  // triplets with a Fenwick-backed prefix-sum tree. The model's
  // `effective height per index` mirrors `sumHeights` semantics —
  // measured-when-available, otherwise avgMeasured fallback (when any
  // measurements exist), otherwise the original estimate. Encoding the
  // fallback in the estimate keeps the model itself a thin
  // O(log n)-prefix-sum primitive while preserving the user-visible
  // behaviour shipped in earlier ListView fixes (Stream J / Stream O).
  //
  // The model is allocated once and reconfigured per render via
  // `update({...})`. A reconfigure rebuilds the Fenwick tree (O(n log n))
  // — for typical list sizes (n ≤ 200) this is ~1500 ops, dwarfed by
  // React render cost. Prefix-sum queries are O(log n) thereafter.
  const heightModelRef = useRef<HeightModel | null>(null)
  if (heightModelRef.current === null) {
    heightModelRef.current = createHeightModel({
      itemCount: 0,
      estimate: () => 1,
      gap: 0,
    })
  }
  const heightModel = heightModelRef.current

  // Average measured height — used as a fallback for unmeasured items
  // when ANY measurements exist (mirrors `sumHeights` semantics; without
  // this fallback, leading/trailing placeholders overshoot when the
  // original estimate diverges from actual heights). When no
  // measurements have arrived yet, this is undefined and we fall back to
  // the original estimate.
  let avgMeasuredHeight: number | undefined
  if (measuredHeights.size > 0) {
    let total = 0
    for (const h of measuredHeights.values()) total += h
    avgMeasuredHeight = total / measuredHeights.size
  }

  // Build the effective-height estimator. This mirrors the per-item
  // resolution that `sumHeights` performs internally: measured cache
  // first (keyed by `(itemKey, viewportWidth)`), avgMeasured fallback,
  // then estimate. Captured by HeightModel via `update({estimate})` —
  // the Fenwick tree rebuild reads each index through this function.
  const effectiveEstimate = (index: number): number => {
    if (measuredHeights.size > 0) {
      const baseKey = wrappedGetKey ? wrappedGetKey(index) : index
      const cacheKey = makeMeasureKey(baseKey, viewportSize?.w)
      const measured = measuredHeights.get(cacheKey)
      if (measured !== undefined) return measured
      if (avgMeasuredHeight !== undefined) return avgMeasuredHeight
    }
    return typeof adjustedEstimateHeight === "function"
      ? adjustedEstimateHeight(index)
      : adjustedEstimateHeight
  }

  // Reconfigure the model for this render. Estimate-identity changes
  // every render (it closes over the live `measuredHeights` map), which
  // forces a Fenwick rebuild — that's the price of single-source-of-truth
  // height math. For n ≤ 200 the cost is negligible; for larger lists
  // the rebuild can be amortised by switching to `setMeasured` deltas
  // tracked across renders, deferred to Phase 3 if profiling shows it.
  heightModel.update({
    itemCount: activeItems.length,
    gap,
    estimate: effectiveEstimate,
  })

  // ── Viewport-anchored windowing (height-independent / "index" mode) ──
  //
  // Anchor to viewport first, cursor second. Layout-phase publishes
  // `firstVisibleChild` / `lastVisibleChild` for the inner scroll
  // container — these are AgNode child indices that include any leading
  // spacer Box. The mapping
  //
  //     viewportItemStart = firstVisibleChild - leadingOffset + prevStart
  //
  // gives us the virtual-item index of the topmost rendered item. We then
  // window `[viewportItemStart - overscan, viewportItemEnd + overscan)`
  // and union with the cursor so it stays renderable even when scrolled
  // far from the cursor's position.
  //
  // When scrollState isn't available yet (first render before the inner
  // box mounts), we fall back to `cursor ± overscan` — the bootstrap
  // window that always contains the cursor.
  //
  // We track the previous frame's window structure in a ref so we can map
  // the child indices back to virtual-item indices without re-measuring.
  const indexWindowPrevRef = useRef<{
    startIndex: number
    endIndex: number
    hasLeadingSpacer: boolean
  }>({ startIndex: 0, endIndex: 0, hasLeadingSpacer: false })
  const innerScrollState = useScrollState(containerNode ?? null)

  const cursorAnchor = Math.max(0, Math.min(activeItems.length - 1, scrollOffset))

  // Compute the index window for "index" virtualization mode.
  let indexWindowStart: number
  let indexWindowEnd: number
  const indexEstAsNumber =
    typeof adjustedEstimateHeight === "number" ? adjustedEstimateHeight : adjustedEstimateHeight(0)
  const safeEstHeight = Math.max(1, indexEstAsNumber)

  if (resolvedVirtualization === "index") {
    // Try to derive a viewport-anchor item index from layout-phase's
    // `firstVisibleChild`. If unavailable, fall back to the cursor.
    let viewportFirstItem: number | null = null
    let viewportLastItem: number | null = null
    if (
      innerScrollState !== null &&
      innerScrollState.viewportHeight > 0 &&
      indexWindowPrevRef.current.endIndex > indexWindowPrevRef.current.startIndex
    ) {
      const prev = indexWindowPrevRef.current
      const leadingOffset = prev.hasLeadingSpacer ? 1 : 0
      const realItemEnd = leadingOffset + (prev.endIndex - prev.startIndex)
      // Map firstVisibleChild back to a virtual item.
      const f = innerScrollState.firstVisibleChild
      const l = innerScrollState.lastVisibleChild
      if (f >= leadingOffset && f < realItemEnd) {
        viewportFirstItem = prev.startIndex + (f - leadingOffset)
      } else if (f < leadingOffset) {
        // Leading spacer is on screen — viewport sits above the rendered
        // window. Anchor at prev.startIndex (the first rendered item) and
        // expand backward via overscan; the spacer height tells us nothing
        // about exactly which earlier item is at top, but next frame's
        // re-mount will refine.
        viewportFirstItem = prev.startIndex
      }
      if (l >= leadingOffset && l < realItemEnd) {
        viewportLastItem = prev.startIndex + (l - leadingOffset)
      } else if (l >= realItemEnd) {
        viewportLastItem = prev.endIndex - 1
      }
    }

    // Cursor extends the viewport-anchored window: it must stay
    // renderable even when the user has scrolled far from it. But if the
    // cursor is far from the viewport, we don't render its neighborhood
    // — just keep cursor itself in the rendered slice.
    const anchorFirst = viewportFirstItem ?? cursorAnchor
    const anchorLast = viewportLastItem ?? cursorAnchor

    let start = Math.max(0, anchorFirst - overscan)
    let end = Math.min(activeItems.length, anchorLast + overscan + 1)

    // Apply the row budget. Walk forward from `anchorFirst` (or the
    // cursor, whichever is the centroid), accumulating estimated rows
    // until either `maxRendered` or `maxEstimatedRows` is hit.
    //
    // We measure the budget by summing measured heights when available,
    // estimate otherwise. A single tall item never blocks rendering — at
    // minimum we keep the anchor + a 1-item neighborhood.
    const budgetRow = Math.max(safeEstHeight, maxEstimatedRows)
    const budgetItem = Math.max(1, maxRendered)

    // Estimate row count for [start, end).
    const rowsForRange = (s: number, e: number): number => {
      if (e <= s) return 0
      // Cheap approximation: use measured heights if any have been
      // captured for the cache, otherwise estimate. Avoids the full
      // prefix-sum query inside the budget loop.
      if (measuredHeights.size === 0) return (e - s) * safeEstHeight
      // Phase 2: query HeightModel — O(log n) prefix difference matches
      // the prior `sumHeights(s, e, …)` semantics (measured /
      // avgMeasured / estimate per index, plus (count-1) inter-item gap).
      const m = e - s
      return heightModel.prefixSum(e) - heightModel.prefixSum(s) + Math.max(0, m - 1) * gap
    }

    // Shrink the window from BOTH ends until both budgets are satisfied.
    // Shrink toward the anchor so we keep items closest to the visible
    // viewport. The cursor must remain inside the window.
    const cursorInWindow = (s: number, e: number): boolean => cursorAnchor >= s && cursorAnchor < e

    while (end - start > budgetItem || rowsForRange(start, end) > budgetRow) {
      if (end - start <= 1) break
      // Decide which end to trim. Prefer trimming the side farther from
      // the anchor + cursor.
      const anchorMid = Math.floor((anchorFirst + anchorLast) / 2)
      const distStart = Math.abs(anchorMid - start)
      const distEnd = Math.abs(anchorMid - (end - 1))
      let nextStart = start
      let nextEnd = end
      if (distEnd > distStart) {
        nextEnd = end - 1
      } else {
        nextStart = start + 1
      }
      // Don't trim across the cursor — keep cursor renderable.
      if (cursorInWindow(start, end) && !cursorInWindow(nextStart, nextEnd)) {
        // Trim the OTHER side instead.
        if (nextStart !== start) {
          nextStart = start
          nextEnd = end - 1
        } else {
          nextEnd = end
          nextStart = start + 1
        }
        if (!cursorInWindow(nextStart, nextEnd)) break // stuck — exit
      }
      start = nextStart
      end = nextEnd
    }

    indexWindowStart = start
    indexWindowEnd = end
  } else if (resolvedVirtualization === "none") {
    // Render every item — no windowing. Correct for small lists.
    indexWindowStart = 0
    indexWindowEnd = activeItems.length
  } else {
    // "measured" — pixel-mode virtualisation, use the virtualizer's window.
    indexWindowStart = range.startIndex
    indexWindowEnd = range.endIndex
  }

  // Capture this frame's window structure for next frame's viewport
  // mapping. `hasLeadingSpacer` is computed below alongside the spacer
  // sizes — we update the ref after that.

  const usingIndexWindow = resolvedVirtualization === "index"
  const usingNoVirtualization = resolvedVirtualization === "none"
  const effectiveStartIndex = indexWindowStart
  const effectiveEndIndex = indexWindowEnd

  // Spacer heights for "index" mode — preserve scroll extent so
  // scrollbar / scroll-position math sees the full virtual list height,
  // not just the rendered window. HeightModel encodes the per-index
  // effective height (measured / avgMeasured / estimate) and gives us
  // O(log n) prefix sums; spacer math becomes two prefix queries.
  //
  // Phase 2 (`km-silvery.listview-heightmodel-unify`) — formerly two
  // `sumHeights(s, e, …)` calls; the model now owns this math.
  //
  // Gap accounting matches `sumHeights(s, e)`: for a contiguous range
  // [s, e) of m=e-s items the gap contribution is max(0, m-1)*gap
  // (gaps between items in the range; cross-boundary gaps to neighbours
  // outside the range are NOT counted — that mirrors the rendered
  // layout, which inserts a gap-Box only between visible items, never
  // between the spacer and the first visible item).
  //
  //   sumHeights(0, start) = prefixSum(start) + max(0, start-1)*gap
  //   sumHeights(end, n)   = (totalRows - prefixSum(end) - (n-1)*gap)
  //                          + max(0, n-end-1)*gap
  //                        = (sum of heights[end..n)) + (n-end-1)*gap
  const totalGapAccount = Math.max(0, activeItems.length - 1) * gap
  const indexLeadingSpacer = usingIndexWindow
    ? heightModel.prefixSum(indexWindowStart) +
      Math.max(0, indexWindowStart - 1) * gap
    : 0
  const indexTrailingSpacer = usingIndexWindow
    ? heightModel.totalRows() -
      heightModel.prefixSum(indexWindowEnd) -
      totalGapAccount +
      Math.max(0, activeItems.length - indexWindowEnd - 1) * gap
    : 0

  // Effective values used by the render path. In "measured" mode (pixel),
  // use the virtualizer's leading/trailing. In "index" mode, use our
  // spacer sums. In "none" mode, no spacers (everything renders).
  const effectiveLeadingHeight = usingIndexWindow
    ? indexLeadingSpacer
    : usingNoVirtualization
      ? 0
      : leadingHeight
  const effectiveTrailingHeight = usingIndexWindow
    ? indexTrailingSpacer
    : usingNoVirtualization
      ? 0
      : trailingHeight
  const effectiveHiddenBefore = usingIndexWindow
    ? indexWindowStart
    : usingNoVirtualization
      ? 0
      : hiddenBefore
  const effectiveHiddenAfter = usingIndexWindow
    ? Math.max(0, activeItems.length - indexWindowEnd)
    : usingNoVirtualization
      ? 0
      : hiddenAfter

  // Update prev-window ref AFTER computing the spacer sums (so the
  // hasLeadingSpacer flag matches what's about to render).
  indexWindowPrevRef.current = {
    startIndex: indexWindowStart,
    endIndex: indexWindowEnd,
    hasLeadingSpacer: effectiveLeadingHeight > 0,
  }

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

  // Compute composed viewport when history is active. In height-independent
  // mode the synthetic viewport height is used — the consumer of
  // `composedViewport` is the (currently unused, ref-only) virtual
  // scrollback path; passing `virtualizerViewportHeight` keeps it
  // internally consistent with `useVirtualizer` above.
  if (cacheMode === "virtual" && cacheBuffer) {
    composedViewportRef.current = composeViewport({
      history: cacheBuffer,
      viewportHeight: virtualizerViewportHeight,
      scrollOffset: 0, // At tail by default; scroll offset would come from external state
    })
  }

  // ── Ref ───────────────────────────────────────────────────────────
  // Wrap scrollToItem to accept original indices (before virtual adjustment).
  //
  // `scrollBy` / `scrollToTop` / `scrollToBottom` operate on the row-space
  // viewport position (NOT cursor index). They mirror the wheel handler's
  // mutation pattern: seed `scrollRowFloatRef` if null, clamp to the
  // current `maxScrollRowRef.current`, then push through `setScrollRow` so
  // the inner Box's `scrollOffset` reflects the new position. Cursor is
  // untouched — same "mouse follows hover, keyboard moves focus"
  // separation the wheel handler enforces.
  useImperativeHandle(
    ref,
    () => ({
      scrollToItem(index: number) {
        scrollToItem(Math.max(0, index - unmountedCount))
      },
      scrollBy(rows: number) {
        const maxRow = maxScrollRowRef.current
        if (maxRow <= 0) return
        // Seed from measured viewport position the first time we're called
        // (or the first time after a moveTo() reset scrollRowFloatRef to
        // null). Mirrors the wheel-seed logic so keyboard scroll picks up
        // exactly where the user is looking.
        if (scrollRowFloatRef.current === null) {
          const cursorIdx = activeCursorRef.current
          const lastIdx = itemCountRef.current - 1
          if (cursorIdx >= lastIdx && lastIdx >= 0) {
            scrollRowFloatRef.current = maxRow
          } else if (cursorIdx <= 0) {
            scrollRowFloatRef.current = 0
          } else {
            scrollRowFloatRef.current = Math.max(
              0,
              Math.min(maxRow, rowsAboveViewportRef.current),
            )
          }
        }
        const prev = scrollRowFloatRef.current
        const next = Math.max(0, Math.min(maxRow, prev + rows))
        if (next === prev) return
        scrollRowFloatRef.current = next
        const rendered = Math.round(next)
        setScrollRow((prevInt) => (prevInt === rendered ? prevInt : rendered))
        // Calling scrollBy means the user is taking explicit control of
        // the viewport — clear any pending follow="end" snap so the
        // viewport doesn't jump back to the tail on next render.
        pendingFollowSnapRef.current = false
      },
      scrollToTop() {
        scrollRowFloatRef.current = 0
        setScrollRow(0)
        pendingFollowSnapRef.current = false
      },
      scrollToBottom() {
        const maxRow = maxScrollRowRef.current
        scrollRowFloatRef.current = maxRow
        setScrollRow(maxRow)
        // Re-arm follow="end" auto-follow — on the next render the
        // pending-snap path takes over and subsequent appends keep the
        // tail visible. No-op when `follow !== "end"`.
        if (resolvedFollow === "end") {
          pendingFollowSnapRef.current = true
        }
      },
      getHistoryBuffer(): HistoryBuffer | null {
        return cacheBufferRef.current
      },
      getComposedViewport(): ComposedViewport | null {
        return composedViewportRef.current
      },
    }),
    [scrollToItem, unmountedCount, resolvedFollow],
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
    return isHeightIndependent ? (
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        width={width}
      >
        {/* Empty - nothing to render */}
      </Box>
    ) : (
      <Box flexDirection="column" height={height} width={width}>
        {/* Empty - nothing to render */}
      </Box>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  const startIndex = effectiveStartIndex
  const endIndex = effectiveEndIndex
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
  // STRICT invariant only applies in pixel-virtualisation mode
  // (`virtualization="measured"`). The "index" and "none" modes override
  // both the window and the placeholder heights — the virtualizer's
  // `leadingHeight` is unrelated to the user-visible spacer in those
  // cases.
  if (resolvedVirtualization === "measured" && process?.env?.SILVERY_STRICT) {
    const strict = process.env.SILVERY_STRICT
    const shouldThrow = strict === "2"
    // Phase 2 (`km-silvery.listview-heightmodel-unify`) keeps `sumHeights`
    // here intentionally — it's an INDEPENDENT computation against which
    // the virtualizer's `leadingHeight` is cross-checked. Replacing it
    // with HeightModel would make this a self-consistency tautology
    // (HeightModel and the virtualizer's leadingHeight share the same
    // `effectiveEstimate` resolution at runtime).
    const expectedLeading = sumHeights(
      0,
      range.startIndex,
      adjustedEstimateHeight,
      gap,
      measuredHeights,
      wrappedGetKey,
      viewportSize?.w,
    )
    // Allow 1 row of floating-point slack for avgMeasured fallback divisions.
    if (Math.abs(leadingHeight - expectedLeading) > 1) {
      const msg =
        `[SILVERY_STRICT] ListView leadingHeight ${leadingHeight} diverges from ` +
        `sumHeights(0, startIndex=${range.startIndex})=${expectedLeading} ` +
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
  const hasTopPlaceholder = effectiveLeadingHeight > 0
  const currentScrollTarget =
    adjustedScrollTo !== undefined
      ? Math.max(0, Math.min(adjustedScrollTo, activeItems.length - 1))
      : scrollOffset
  const selectedIndexInSlice = currentScrollTarget - startIndex
  const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length
  const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice
  const boxScrollTo =
    scrollRow !== null ? undefined : isSelectedInSlice ? Math.max(0, scrollToIndex) : undefined

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
  // Scrollbar geometry uses the explicit `height` prop in pinned-height
  // mode, and the live measured viewport height (via the inner Box's
  // `onLayout` → `viewportSize.h`) in height-independent (flex) mode. The
  // measured height isn't known until first layout — until then we use 0,
  // which makes `showScrollbar` evaluate false (thumbHeight < trackHeight
  // collapses) so nothing renders pre-measurement.
  const trackHeight = isHeightIndependent
    ? Math.max(1, viewportSize?.h ?? 0)
    : Math.max(1, height ?? 1)
  // Total-content height for THUMB SIZE.
  //
  // Original strategy was item-count × estimate (TanStack convention) on the
  // theory that measurement-sum-based totals jitter as the user scrolls into
  // unmeasured items.
  //
  // Failure mode (silvercode bead km-silvery.listview-thumb-too-big-when-items-tall):
  // when items are systematically TALLER than the estimate (chat with multi-
  // line assistant messages: estimate=1, actual ~10-50 rows), `estimate × N`
  // underestimates total content by 10-50×. The thumb computes `track²/total`
  // and ends up nearly the size of the track even though the user only sees
  // ~5% of content. Anti-fix.
  //
  // The jitter concern only applies when measurement reveals items SHORTER
  // than estimate. Estimate=1 makes that impossible (nothing measures shorter
  // than 1 row). For chat-shaped lists, measurement is monotonically
  // increasing as items render → the thumb shrinks smoothly toward truth as
  // measurement catches up, with no oscillation.
  //
  // Resolution: use `max(stable, measured)` for thumb size — same shape the
  // visibility gate already uses. Estimate-correct lists keep their stable
  // thumb. Lists with under-estimated items get the accurate (measurement-
  // based) thumb without jitter.
  //
  // `estimateAsNumber` folds function-estimates into an average by sampling
  // index 0; for uniform-height lists this is exact, and for variable-height
  // the thumb is mildly imprecise in size but doesn't jitter.
  const estimateAsNumber = typeof estimateHeight === "number" ? estimateHeight : estimateHeight(0)
  const totalRowsStable = Math.max(1, activeItems.length * (estimateAsNumber + gap))
  // Accurate rows-above-viewport for THUMB POSITION: uses measurement cache
  // (items that have scrolled past are always measured → stable in use).
  // HeightModel encodes the same `effectiveEstimate` resolution that
  // `sumHeights(0, n, …)` performed pre-Phase-2, so this is identity.
  const totalRowsMeasured = Math.max(1, heightModel.totalRows())
  const totalRows = totalRowsMeasured
  // Overflow detection for the scrollbar VISIBILITY GATE: take the maximum
  // of estimate-based and measurement-based totals. Estimate alone misses
  // overflow when items are taller than `estimateHeight` (silvercode shape:
  // multi-line AssistantBlocks with default estimate=1 hide overflow even
  // when content is 5× the viewport). Measured alone would cause a false
  // negative on the very first paint before any measurements arrive.
  // Using the max keeps the visibility gate honest in both cases while
  // leaving thumb SIZE driven by the stable estimate (no jitter).
  const totalRowsForOverflow = Math.max(totalRowsStable, totalRowsMeasured)
  // Auto-flash the scrollbar when item count grows — gives the user a
  // brief "your relative position just shifted" cue (e.g. new chat messages
  // arriving while reading the tail). Comparing item count rather than
  // totalRows avoids false-positive flashes during initial measurement
  // ramp-up where height grows as items are measured but no content was
  // actually added. Same auto-hide timer as wheel events.
  const prevItemCountRef = useRef(activeItems.length)
  // Follow-end + atBottom transition tracking.
  //
  // `prevAtBottomRef` records the at-bottom state from the prior commit so
  // we can fire `onAtBottomChange` only on transitions (edge-triggered).
  // `prevMaxScrollRowRef` records the prior maxScrollRow so we can detect
  // "user was sitting at maxRow and items just grew" — the trigger for
  // follow="end" auto-follow.
  //
  // Initialised to a sentinel so the first effect run unconditionally
  // emits the initial at-bottom value to onAtBottomChange.
  const prevAtBottomRef = useRef<boolean | null>(null)
  const prevMaxScrollRowRef = useRef<number | null>(null)
  // `pendingFollowSnapRef` is declared earlier (next to `resolvedFollow`)
  // because `scrollTo` resolution reads it before this effect block.
  // Snapshot the row-space measurements that the effect needs. The
  // effect closes over `scrollRow` (state) but reads `maxScrollRowRef` /
  // `rowsAboveViewportRef` via mutable refs — safe under React
  // concurrent rendering because both refs are written synchronously
  // during the SAME render that schedules the effect.
  useEffect(() => {
    const prevCount = prevItemCountRef.current
    const grew = activeItems.length > prevCount
    if (grew) {
      setIsScrolling(true)
      scheduleScrollbarHide()
      // Stale-bump cleanup. A `bumpedEdge` set by a prior wheel/keyboard
      // overscroll attempt is bound to the boundary as it was THEN. Once
      // items append, the boundary moved — `scrollableRows` leaps ahead
      // while `rowsAboveViewport` lags one layout cycle behind, and the
      // at-edge render gate (`effectiveRowsAbove >= scrollableRows`)
      // toggles between true/false on each commit until the cursor
      // catches up. That manifests as a flickering bottom indicator
      // during streaming chat append. Clearing on append removes the
      // stale cue — the user has new content to see, the "you hit the
      // end" cue from before is no longer accurate.
      setBumpedEdge(null)
    }
    prevItemCountRef.current = activeItems.length

    // Compute current "at end" state in VISUAL ROW space.
    //
    // The bead-`km-silvery.listview-followpolicy-split` redesign:
    // "atEnd" is no longer cursor-position dependent. A cursor at the
    // last item does NOT imply at-end when that item is taller than
    // the viewport (cursor-on-last-item, but its bottom row is still
    // off-screen below). The math compares the bottom edge of the
    // viewport against the total rendered row count:
    //
    //   topRow    = scrollRow ?? rowsAboveViewportRef.current
    //   bottomRow = topRow + viewportHeight
    //   atEnd     = bottomRow >= totalRows - 0.5  // 0.5-row tolerance
    //
    // For the legacy `scrollRow !== null` (wheel-driving) path the
    // formula reduces to `scrollRow >= maxScrollRow - 0.5`; the
    // unified form also handles cursor-following mode correctly when
    // scrollRow is null.
    const maxRow = maxScrollRowRef.current
    const topRow = scrollRow !== null ? scrollRow : rowsAboveViewportRef.current
    const bottomRow = topRow + trackHeight
    const totalContentRows = heightModel.totalRows()
    const computedAtEnd = bottomRow >= totalContentRows - 0.5

    // Auto-follow: when `follow="end"` is engaged, snap scrollRow to
    // maxRow when:
    //   1. PENDING SNAP from initial mount or wheel-back-to-bottom.
    //      `pendingFollowSnapRef` survives the first 1-2 pre-measurement
    //      commits where maxRow is still 0 — once layout produces a
    //      real maxRow, the snap fires and the flag clears.
    //   2. ITEMS GREW while previously at-end. Keeps the appended tail
    //      visible regardless of whether scrollRow was previously null
    //      (the legacy gate required wheel-driving mode — follow="end"
    //      owns the viewport unconditionally while atEnd holds).
    const wasAtEndPrev = prevAtBottomRef.current === true
    const pendingSnap = pendingFollowSnapRef.current
    // Gate the snap on a *measured viewport* — avoids snapping during
    // the first render where `trackHeight` falls back to 1
    // (viewportSize not yet measured) and `scrollableRows` collapses
    // to a phantom small number. Without this gate, the snap fires
    // with a tiny `maxRow` and the viewport freezes near the top with
    // `pendingFollowSnap` already cleared.
    const viewportReady = !isHeightIndependent || (viewportSize?.h ?? 0) > 0
    // User-wheel-vs-auto-follow race guard: if the user is actively
    // wheel-driving (scrollRow !== null) and has scrolled BELOW the
    // current end (scrollRow < prevMaxRow - threshold), respect their
    // intent — don't snap them back to the bottom on the next streaming
    // commit. Without this, a user who wheels up by 1 row while items
    // are streaming gets dragged back to the tail every commit and
    // oscillates between maxRow-1 and maxRow until streaming stops.
    //
    // The gate is tight on purpose: only suppress when `scrollRow` is
    // strictly NOT-at-end relative to the PRIOR maxRow (so we don't
    // accidentally suppress the snap on a normal items-grew commit
    // where the user is still at the tail and scrollRow just lags
    // maxRow by a few rows due to the in-flight grow).
    const prevMaxRow = prevMaxScrollRowRef.current
    const userScrolledAway =
      scrollRow !== null && prevMaxRow !== null && scrollRow < prevMaxRow - 0.5
    const shouldSnap =
      resolvedFollow === "end" &&
      viewportReady &&
      maxRow > 0 &&
      !userScrolledAway &&
      (pendingSnap || (grew && wasAtEndPrev))
    if (shouldSnap) {
      scrollRowFloatRef.current = maxRow
      setScrollRow(maxRow)
      pendingFollowSnapRef.current = false
    }
    prevMaxScrollRowRef.current = maxRow

    // When we're snapping, the post-snap state IS at-end — even though
    // the scrollRow we read above is stale (the previous frame's value,
    // before the items grew). Treat the snap as the authoritative
    // truth; otherwise an items-grew commit would fire a transient
    // `false` transition before the snap-driven recommit fires `true`,
    // doubling the callback emission rate. Bead:
    // `km-silvery.listview-followpolicy-split`.
    const atBottom = shouldSnap ? true : computedAtEnd

    // Edge-triggered transition callback. Fires on the initial commit
    // unconditionally (sentinel `null`) and on every subsequent change.
    if (onAtBottomChange && prevAtBottomRef.current !== atBottom) {
      onAtBottomChange(atBottom)
    }
    prevAtBottomRef.current = atBottom
  }, [
    activeItems.length,
    scheduleScrollbarHide,
    scrollRow,
    activeCursor,
    nav,
    resolvedFollow,
    trackHeight,
    // `measuredHeights.size` makes the effect re-run as new
    // measurements arrive — required for the follow="end" snap-to-end
    // path, where the first commit has size=0 (maxRow=0, snap deferred)
    // and a later commit has size=N (maxRow=real, snap fires).
    measuredHeights.size,
    // `viewportSize.h` makes the effect re-run when the viewport
    // becomes measurable — gates the follow="end" first-paint snap on
    // a real `trackHeight` (without this, trackHeight=1 fallback fires
    // a phantom snap before viewport is known).
    viewportSize?.h,
    isHeightIndependent,
    heightModel,
    onAtBottomChange,
  ])
  // Rows scrolled past the viewport top — the exact measurement a browser
  // uses for scrollbar position. `leadingHeight` from the virtualizer is
  // `sumHeights(0, startIndex)` where startIndex = scrollOffset − overscan,
  // so it underestimates "rows above viewport" by the overscan window and
  // lags the thumb behind the content. Query HeightModel directly — same
  // semantics as the prior `sumHeights(0, scrollOffset, …)` (measured /
  // avgMeasured / estimate per index, plus inter-item gap accounting).
  const rowsAboveViewport =
    heightModel.prefixSum(scrollOffset) + Math.max(0, scrollOffset - 1) * gap
  // Thumb size uses `max(stable, measured)` (same shape as the visibility
  // gate above). For estimate-correct lists this collapses to the stable
  // value; for lists whose actual content is taller than the estimate
  // (silvercode chat: estimate=1, actual ~10-50 rows per assistant block)
  // the measured total dominates and the thumb shrinks toward truth.
  // Bead: km-silvery.listview-thumb-too-big-when-items-tall.
  const totalRowsForThumb = Math.max(totalRowsStable, totalRowsMeasured)
  const overflowing = totalRowsForOverflow > trackHeight
  const thumbHeight = overflowing
    ? Math.max(
        1,
        Math.floor((trackHeight * trackHeight) / Math.max(totalRowsForThumb, trackHeight + 1)),
      )
    : 0
  // SCROLL CAP — `scrollRow` is clamped to [0, scrollableRows] in wheel +
  // momentum + keyboard handlers. Uses `totalRowsMeasured` directly (NOT
  // `max(stable, measured)` — that's the visibility gate's job).
  //
  // The visibility gate (`totalRowsForOverflow = max(stable, measured)`)
  // and the scroll cap have inverse failure modes:
  //
  // - Visibility gate: a false negative is BAD — scrollbar disappears even
  //   though content overflows. Stream J fixed this by taking the max of
  //   stable + measured so the gate is conservative-toward-overflowing.
  //
  // - Scroll cap: a TOO-GENEROUS cap is BAD — user wheel-scrolls past the
  //   actual content end and the viewport renders an empty row window past
  //   the last item (silvercode --resume with a long system prompt: tall
  //   first item drives `avgMeasured` up, every unmeasured item below the
  //   viewport gets that high fallback, `totalRowsMeasured` overshoots
  //   actual content by 3-5×; combined with `max(stable, measured)`,
  //   `scrollableRows` runs many times past content end → blank viewport).
  //   A briefly-tight cap during initial measurement ramp-up is a minor
  //   cosmetic issue; an overshoot into empty space is severe.
  //
  // Floor at 0 (not 1) so when content fits, `maxRow = 0` and
  // `handleWheel` / `enterMomentum` early-return — no spurious overscroll
  // bump on a list whose content fits.
  //
  // Bead: km-silvery.listview-scroll-overshoot (regression from 8c63cfb9).
  const scrollableRows = Math.max(0, totalRowsMeasured - trackHeight)
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
  // effectiveRowsAbove is consumed below by the edge-bump render gate.
  // Scrollbar overlay is enabled in both pinned-height and height-independent
  // (flex) modes. In flex mode `trackHeight` comes from the inner Box's
  // measured rect (via `viewportSize.h`), so until first layout we don't
  // render anything (thumbHeight ≥ trackHeight short-circuits below).
  const showScrollbar = isScrolling && thumbHeight > 0 && thumbHeight < trackHeight

  // Outer wrapper + inner scroll container.
  //
  // - Pixel-virtualisation mode (height set): outer + inner both pin
  //   `height={height}`, exactly the prior behaviour.
  // - Height-independent mode (height undefined): outer + inner both
  //   `flex-grow=1 flex-shrink=1 minHeight=0` so flex propagates the
  //   parent's available height; inner keeps `overflow="scroll"` so
  //   content beyond the viewport clips naturally.
  const outerSizing = isHeightIndependent
    ? { flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0 }
    : { height }
  const innerSizing = isHeightIndependent
    ? { flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0 }
    : { height }

  return (
    <Box position="relative" flexDirection="column" {...outerSizing} width={width}>
      <Box
        ref={boxHandleRef}
        flexDirection="column"
        {...innerSizing}
        width={width}
        overflow="scroll"
        scrollTo={boxScrollTo}
        scrollOffset={scrollRow ?? undefined}
        overflowIndicator={overflowIndicator}
        onWheel={onWheel}
        onLayout={handleContainerLayout}
      >
        {/* Leading placeholder for virtual height.
         *
         * `representsItems` tells the parent scroll container that this one
         * placeholder Box stands in for `hiddenBefore` (= startIndex) logical
         * items — so when it's fully scrolled above the viewport, the parent's
         * `hiddenAbove` is incremented by that count (→ `▲N` shows real items).
         * Without this, the ▲N indicator would always say `1` while many items
         * are actually above the render window. */}
        {effectiveLeadingHeight > 0 && (
          <Box
            height={effectiveLeadingHeight}
            flexShrink={0}
            representsItems={effectiveHiddenBefore}
          />
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
        {effectiveTrailingHeight > 0 && (
          <Box
            height={effectiveTrailingHeight}
            flexShrink={0}
            representsItems={effectiveHiddenAfter}
          />
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
      {showScrollbar &&
        (() => {
          // Snap near-1 frac to exactly 1 so the thumb reaches the track end.
          // The setScrollbarFrac threshold (Math.abs < 0.001) can leave frac at
          // 0.9999… which then propagates through the float math as a thumb
          // that's 0.008 rows short of the track bottom — visible as a 1-cell
          // gap because the fractional-bottom branch renders a partial block
          // instead of "█".
          const frac = scrollbarFrac > 0.999 ? 1 : scrollbarFrac < 0.001 ? 0 : scrollbarFrac
          const thumbTopFloat = frac * trackRemainder
          const thumbBottomFloat = thumbTopFloat + thumbHeight
          const firstRow = Math.floor(thumbTopFloat)
          const lastRow = Math.min(trackHeight - 1, Math.ceil(thumbBottomFloat) - 1)
          const EIGHTHS = "▁▂▃▄▅▆▇█"
          // Track interaction: click-to-position + drag-while-held.
          //
          // - `onMouseDown`: snap to click position (centered on click row
          //   so the thumb's middle lands under the cursor) AND arm the
          //   drag-tracking flag.
          // - `onMouseMove` (only fires while cursor is over the track,
          //   which is what we want — leaving the column ends the drag
          //   gracefully): if armed, update scroll continuously so the
          //   thumb tracks the cursor.
          // - `onMouseUp` / `onMouseLeave`: end the drag.
          //
          // Centering: a click at row Y aims to put the thumb's middle
          // at Y. Without the half-thumb subtraction, a click at the
          // very bottom of the track lands frac = (trackHeight-1) /
          // (trackHeight-thumbHeight) — never quite 1.
          const fracFromY = (clientY: number, trackTopY: number): number => {
            const relativeY = clientY - trackTopY
            const centeredY = relativeY - thumbHeight / 2
            const denom = Math.max(1, trackHeight - thumbHeight)
            return centeredY / denom
          }
          const handleTrackMouseDown = (e: SilveryMouseEvent): void => {
            const node = e.currentTarget
            const rect = node.screenRect ?? node.boxRect
            if (!rect || rect.height <= 0) return
            scrollbarDraggingRef.current = true
            scrollToFrac(fracFromY(e.clientY, rect.y))
            e.stopPropagation()
          }
          const handleTrackMouseMove = (e: SilveryMouseEvent): void => {
            if (!scrollbarDraggingRef.current) return
            const node = e.currentTarget
            const rect = node.screenRect ?? node.boxRect
            if (!rect || rect.height <= 0) return
            scrollToFrac(fracFromY(e.clientY, rect.y))
            e.stopPropagation()
          }
          const handleTrackMouseUp = (_e: SilveryMouseEvent): void => {
            scrollbarDraggingRef.current = false
          }
          // Epsilon compare for fractional edges — a floating-point near-equal
          // shouldn't render a partial glyph.
          const EPS = 0.001
          const rows: React.ReactNode[] = []
          for (let r = firstRow; r <= lastRow; r++) {
            const isFirst = r === firstRow
            const isLast = r === lastRow
            const fractionalTop = isFirst && Math.abs(thumbTopFloat - firstRow) > EPS
            const fractionalBottom = isLast && Math.abs(thumbBottomFloat - (lastRow + 1)) > EPS
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
          // The full-height interactive track wraps the thumb. The
          // mousedown/move/up triple drives both click-to-position
          // (mousedown alone) and drag-while-held (continuous moves).
          // The thumb itself renders as an absolutely-positioned child
          // of the track so clicks on the thumb body resolve to a
          // track-relative y identically to clicks on empty track.
          //
          // `userSelect="none"` prevents silvery's selection feature
          // from intercepting the mousedown — without it, the click
          // would start a text-selection drag and our handlers would
          // never see the event.
          return (
            <Box
              position="absolute"
              top={0}
              right={0}
              width={1}
              height={trackHeight}
              flexDirection="column"
              userSelect="none"
              onMouseDown={handleTrackMouseDown}
              onMouseMove={handleTrackMouseMove}
              onMouseUp={handleTrackMouseUp}
              onMouseLeave={handleTrackMouseUp}
            >
              <Box position="absolute" top={firstRow} right={0} width={1} flexDirection="column">
                {rows}
              </Box>
            </Box>
          )
        })()}
      {/* Overscroll indicator — 10-char HALF-BLOCK in the right corner of
       * the top or bottom row. Top uses ▀ (U+2580 UPPER HALF BLOCK,
       * flush-top, 4/8 cell height); bottom uses ▄ (U+2584 LOWER HALF
       * BLOCK, flush-bottom, 4/8 cell height). Half-block is the tallest
       * symmetric edge-flush option in Unicode — there's no upper-quarter
       * glyph, so going bigger than 1/8 means going to 1/2 directly.
       * Color $muted matches the scrollbar thumb — same chrome vocabulary.
       *
       * No animation — indicator appears when bumpedEdge is set and
       * disappears when the user leaves the edge or the scrollbar-idle
       * timer fires. The AT-EDGE RENDER GATE (effectiveRowsAbove checks)
       * hides it the instant the user scrolls away, even if bumpedEdge is
       * still non-null. Rendered OUTSIDE the scrollbar branch so keyboard
       * nav (which doesn't flip isScrolling) still shows the bump. */}
      {bumpedEdge === "top" && effectiveRowsAbove <= 0 && (
        <Box position="absolute" top={0} right={1} flexDirection="row">
          <Text color="$muted">▀▀▀▀▀▀▀▀▀▀</Text>
        </Box>
      )}
      {bumpedEdge === "bottom" && effectiveRowsAbove >= scrollableRows && (
        <Box position="absolute" top={trackHeight - 1} right={1} flexDirection="row">
          <Text color="$muted">▄▄▄▄▄▄▄▄▄▄</Text>
        </Box>
      )}
      {/* Scroll-to-bottom floating button — chat-style affordance that
       * surfaces when the user is more than one viewport above the end
       * (i.e. has scrolled away from streaming content). Click snaps the
       * viewport to the bottom and re-arms `follow="end"` auto-follow.
       *
       * Only meaningful for chat-style auto-follow lists (`follow="end"`):
       * for plain navigation lists, pulling the user back to the tail
       * isn't necessarily what they want, so we keep the affordance
       * scoped to the case where it's a clear UX win. */}
      {resolvedFollow === "end" &&
        scrollableRows > 0 &&
        scrollableRows - effectiveRowsAbove > trackHeight && (
          <ScrollToBottomButton onClick={() => scrollToFrac(1)} />
        )}
    </Box>
  )
}

/**
 * Floating "Scroll to latest" button.
 *
 * Shown as a centered overlay at the bottom of a ListView when the user
 * is more than one viewport-height away from the end (chat-style "you've
 * scrolled away from streaming content" cue).
 *
 * Visual states:
 *   - Idle: rounded pill, $mutedbg background, $muted text
 *   - Armed (hover): inverse — $primary background, $bg text — the macOS
 *     "active button" affordance
 */
function ScrollToBottomButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const bg = isHovered ? "$primary" : "$mutedbg"
  const fg = isHovered ? "$bg" : "$muted"
  // The outer wrapper is the bottom-row centering container. We do
  // NOT set `pointerEvents="none"` on it — silvery's hit test skips
  // the entire subtree of a `pointerEvents="none"` absolute node, so
  // the inner button's `pointerEvents="auto"` was never reached and
  // the click vanished into the chat content behind. With the wrapper
  // hittable (default "auto"), clicks land on either the button (which
  // fires onClick) or the empty centering space (which the userSelect
  // gate below blocks from arming a selection).
  //
  // `userSelect="none"` on the wrapper means clicks anywhere in the
  // bottom row treat the area as non-selectable — no surprise text-
  // selection start when the user grazes near the button.
  return (
    <Box
      position="absolute"
      bottom={1}
      left={0}
      right={0}
      flexDirection="row"
      justifyContent="center"
      userSelect="none"
    >
      <Box
        flexDirection="row"
        paddingX={1}
        backgroundColor={bg}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      >
        <Text color={fg}>↓ Latest</Text>
      </Box>
    </Box>
  )
}

// Export with forwardRef - use type assertion for generic component
export const ListView = forwardRef(ListViewInner) as <T>(
  props: ListViewProps<T> & { ref?: React.ForwardedRef<ListViewHandle> },
) => React.ReactElement
