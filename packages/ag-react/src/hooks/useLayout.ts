/**
 * Layout Hooks — three coordinate systems for positioning in silvery.
 *
 * Every silvery node has three rects that differ only by how scroll and
 * sticky offsets are applied. Pick the one that matches your use case:
 *
 * - `useBoxRectDangerously()` — layout position (border-box sized, minus
 *                       padding/border). Use for responsive sizing inside a
 *                       component. Matches CSS `clientWidth`/`clientHeight`
 *                       for the content area.
 * - `useScrollRect()` — scroll-adjusted position, **pre** sticky clamping.
 *                       Use when you need the "natural" position of a node
 *                       in scrolled coordinates (can go off-screen).
 * - `useScreenRect()` — actual paint position on the terminal screen.
 *                       Use for hit testing, cursor positioning, and
 *                       cross-component visual navigation. The CSS
 *                       `getBoundingClientRect()` analogue.
 *
 * ## Deferred semantics (the only contract)
 *
 * Each hook returns the rect as of the **most recent committed layout** —
 * the value as of the last event-batch commit boundary. Within a single
 * batch, the returned value is invariant across every convergence pass;
 * React renders see one value per batch. After the batch's commit boundary
 * fires, the next batch sees the new value.
 *
 * This is the structural fix for the "render reads useBoxRectDangerously AND
 * writes a layout-affecting prop based on it" feedback loop. Under the in-flight
 * model that preceded this hook (pre 2026-05-06), the read returned the
 * latest measurement during the same batch, which could differ between
 * the first and second convergence passes — causing the write to flip
 * between branches and the loop to ping-pong until `MAX_CONVERGENCE_PASSES`
 * capped it. Under deferred semantics the read is invariant for the
 * batch, so the loop completes in one pass.
 *
 * **One-frame-late by design.** A component that mounts shows the
 * empty-rect fallback (`{ x: 0, y: 0, width: 0, height: 0 }`) on its
 * first render and the real rect on the next commit boundary. Layout
 * effects that run on the second render see the real rect and can write
 * positioned terminal escapes (Image, decorations) into the next
 * paintFrame.
 *
 * Components that need same-frame measurements must read `node.boxRect`
 * etc. directly via `useAgNode()` and gate on `useLayoutEffect` —
 * recommended only for leaf primitives in the silvery framework itself.
 *
 * For breakpoint logic, prefer `useResponsiveValue()` or
 * `useResponsiveBoxProps()` — bucketing into stable zones gives more
 * predictable behavior than branching on raw widths.
 *
 * See bead `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.
 */

import { useContext, useLayoutEffect, useReducer, useRef } from "react"
import { effect } from "@silvery/signals"
import { NodeContext } from "../context"
import { type AgNode, type BoxProps, type Rect, rectEqual } from "@silvery/ag/types"
import {
  getLayoutSignals,
  markObservedLayoutSignal,
  resolvePaddingProp,
  type ObservedLayoutSignalKey,
} from "@silvery/ag/layout-signals"

export type { Rect }

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }
const EMPTY_SIZE: BoxSize = { width: 0, height: 0 }

export interface BoxSize {
  width: number
  height: number
}

/**
 * Get the inner content dimensions of a node (border-box minus padding and border).
 * This is the space available for the node's children.
 *
 * `boxRect` is passed in explicitly so the helper derives the inner rect
 * from the committed signal value rather than re-reading `node.boxRect`
 * (which holds the in-flight value mid-batch).
 */
function deriveInnerRect(node: AgNode, boxRect: Rect | null | undefined): Rect | null {
  if (!boxRect) return null

  const props = node.props as BoxProps
  if (!props || node.type === "silvery-text") return boxRect

  // Compute padding (length strings resolve through the engine, #26238)
  const pTop = resolvePaddingProp(node, props.paddingTop ?? props.paddingY ?? props.padding, 1)
  const pBottom = resolvePaddingProp(
    node,
    props.paddingBottom ?? props.paddingY ?? props.padding,
    3,
  )
  const pLeft = resolvePaddingProp(node, props.paddingLeft ?? props.paddingX ?? props.padding, 0)
  const pRight = resolvePaddingProp(node, props.paddingRight ?? props.paddingX ?? props.padding, 2)

  // Compute border (1px per side if borderStyle is set)
  let bTop = 0
  let bBottom = 0
  let bLeft = 0
  let bRight = 0
  if (props.borderStyle) {
    bTop = props.borderTop !== false ? 1 : 0
    bBottom = props.borderBottom !== false ? 1 : 0
    bLeft = props.borderLeft !== false ? 1 : 0
    bRight = props.borderRight !== false ? 1 : 0
  }

  return {
    x: boxRect.x + pLeft + bLeft,
    y: boxRect.y + pTop + bTop,
    width: Math.max(0, boxRect.width - pLeft - pRight - bLeft - bRight),
    height: Math.max(0, boxRect.height - pTop - pBottom - bTop - bBottom),
  }
}

/** Selector that picks which committed rect signal to subscribe to. */
type CommittedRectSignalKey = "boxRectCommitted" | "scrollRectCommitted" | "screenRectCommitted"

/** Selector that picks which in-flight rect signal to subscribe to. */
type InFlightRectSignalKey = "boxRect" | "scrollRect" | "screenRect"

const COMMITTED_RECT_OBSERVED_KEY: Record<CommittedRectSignalKey, ObservedLayoutSignalKey> = {
  boxRectCommitted: "boxRect",
  scrollRectCommitted: "scrollRect",
  screenRectCommitted: "screenRect",
}

const IN_FLIGHT_RECT_OBSERVED_KEY: Record<InFlightRectSignalKey, ObservedLayoutSignalKey> = {
  boxRect: "boxRect",
  scrollRect: "scrollRect",
  screenRect: "screenRect",
}

/**
 * Reactive rect hook (deferred): subscribes to a committed rect signal and
 * re-renders when the value advances at a commit boundary. Returns the
 * rect derived from the committed value via `getCommittedRect`.
 *
 * Within a single event batch the committed signal does not change — every
 * convergence pass sees the same value, so a render that reads
 * useBoxRectDangerously and writes a layout-affecting prop converges in one
 * pass. After the
 * batch's commit boundary (handled by the runtime via
 * `commitLayoutSnapshot`), the next batch's first render sees the new
 * value.
 */
function useReactiveRect(
  getCommittedRect: (committed: Rect | null, node: AgNode) => Rect | null | undefined,
  committedSignalKey: CommittedRectSignalKey,
): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    markObservedLayoutSignal(node, COMMITTED_RECT_OBSERVED_KEY[committedSignalKey])
    const signals = getLayoutSignals(node)
    const rectSignal = signals[committedSignalKey]

    // effect() subscribes to the COMMITTED signal — re-runs when the signal
    // value changes. The committed signal advances only at event-batch
    // commit boundaries (see `commitLayoutSnapshot`), so this fires at most
    // once per batch — never mid-batch — making it impossible to form a
    // feedback edge with a render that branches on the read value.
    const dispose = effect(() => {
      const committed = rectSignal()
      const next = getCommittedRect(committed, node) ?? null
      if (!rectEqual(prevRef.current, next)) {
        prevRef.current = next
        forceUpdate()
      }
    })

    return dispose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (!node) return EMPTY_RECT
  // Synchronous read (called during render): use the committed signal's
  // current value, NOT `node.boxRect` etc. The in-flight rect on the node
  // may have been updated by an earlier convergence pass within this batch
  // — reading it would re-introduce the feedback edge this hook exists to
  // eliminate. The committed signal is invariant for the batch.
  markObservedLayoutSignal(node, COMMITTED_RECT_OBSERVED_KEY[committedSignalKey])
  const signals = getLayoutSignals(node)
  const committed = signals[committedSignalKey]()
  return getCommittedRect(committed, node) ?? EMPTY_RECT
}

// ============================================================================
// boxRect — layout position (border-box minus padding/border)
// ============================================================================

/**
 * **DANGEROUS — measurement read on the render path.** Prefer a declarative
 * primitive (`<Box fitWidth>`, `useResponsiveBoxProps`, `useResponsiveValue`,
 * `useOnBoxRectCommitted`) before reaching for this hook.
 *
 * Returns the inner content dimensions for the current component's nearest
 * Box, as of the most recent committed layout. Width and height reflect
 * the space available for children (border-box minus padding and border),
 * like CSS `clientWidth`/`clientHeight`.
 *
 * ```tsx
 * function Header() {
 *   const { width } = useBoxRectDangerously()
 *   return <Text>{'='.repeat(Math.max(0, width))}</Text>
 * }
 * ```
 *
 * On first render returns `{ x: 0, y: 0, width: 0, height: 0 }`. After the
 * first commit boundary, automatically re-renders with the measured
 * dimensions. This **first-paint zero-rect transition** is the social cost
 * the rename announces — components that branch layout on this hook see a
 * flush-left / collapsed first paint, then re-flow when the real rect
 * commits one event-loop tick later. Visible jank under streaming / dynamic
 * mount / SIGWINCH burst.
 *
 * Use only when:
 * - You need a measurement read in JS control flow (animation, autoscroll
 *   thresholds, hit-testing) that **doesn't drive layout-affecting props**.
 * - No declarative primitive covers the case.
 *
 * Deferred semantics — see this file's docstring for the contract and the
 * one-frame-late behavior.
 *
 * Bead: `@km/silvery/responsive-layout-architecture-reframe` (Phase A.1
 * lands this rename; the full Phase A migrates each consumer to a
 * declarative primitive or, where genuinely needed, to a Suspense-friendly
 * `Promise<Rect>` form coordinated via `RectReadBarrier`).
 */
export function useBoxRectDangerously(): Rect {
  return useReactiveRect((committed, node) => deriveInnerRect(node, committed), "boxRectCommitted")
}

/**
 * Internal dimensions-only variant of the deferred box rect read.
 *
 * This is for framework primitives that build width/height-derived text
 * (Divider, ProgressBar, TextArea wrapping) but do not care where their
 * parent sits on screen. It subscribes to the same committed boxRect signal
 * as `useBoxRectDangerously()`, but only re-renders when the derived inner
 * `{width,height}` changes. Scrolling and virtual-window spacer movement
 * often change x/y without changing dimensions; full-rect subscriptions wake
 * these primitives on every such frame and steal scroll budget.
 */
export function useBoxSize(): BoxSize {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<BoxSize | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    markObservedLayoutSignal(node, "boxSize")
    const signals = getLayoutSignals(node)

    const dispose = effect(() => {
      const rect = deriveInnerRect(node, signals.boxRectCommitted())
      const next = rect ? { width: rect.width, height: rect.height } : EMPTY_SIZE
      const prev = prevRef.current
      if (!prev || prev.width !== next.width || prev.height !== next.height) {
        prevRef.current = next
        forceUpdate()
      }
    })

    return dispose
  }, [node])

  if (!node) return EMPTY_SIZE
  markObservedLayoutSignal(node, "boxSize")
  const rect = deriveInnerRect(node, getLayoutSignals(node).boxRectCommitted())
  return rect ? { width: rect.width, height: rect.height } : EMPTY_SIZE
}

// ============================================================================
// scrollRect — scroll-adjusted position (pre-sticky clamping)
// ============================================================================

/**
 * Returns the scroll-adjusted position for the current component, as of
 * the most recent committed layout.
 *
 * This is the node's position in scroll coordinates, *before* sticky
 * clamping. For non-sticky nodes it equals `useScreenRect()`. For sticky
 * nodes, the scrollRect reflects where the node would be without sticky
 * adjustment — so it can go off-screen (negative y, etc.) when scrolled
 * past.
 *
 * ```tsx
 * function Card({ id }) {
 *   const { y } = useScrollRect()
 *   return <Box>Scroll y: {y}</Box>
 * }
 * ```
 *
 * Deferred semantics — see this file's docstring.
 */
export function useScrollRect(): Rect {
  return useReactiveRect((committed) => committed, "scrollRectCommitted")
}

// ============================================================================
// screenRect — actual paint position on the terminal screen
// ============================================================================

/**
 * Returns the actual paint position on the terminal screen as of the most
 * recent committed layout — the silvery analogue of
 * `getBoundingClientRect()`.
 *
 * For non-sticky nodes this equals `useScrollRect()`. For sticky nodes
 * (`position="sticky"`), it reflects the clamped position where pixels
 * actually land on screen.
 *
 * ```tsx
 * function StickyHeader() {
 *   const { y } = useScreenRect()
 *   return <Box position="sticky" stickyTop={0}>Header at row {y}</Box>
 * }
 * ```
 *
 * Deferred semantics — see this file's docstring.
 */
export function useScreenRect(): Rect {
  return useReactiveRect((committed) => committed, "screenRectCommitted")
}

// ============================================================================
// In-flight escape hatches — read the live (mid-batch) rect signal
// ============================================================================
//
// The reactive `useBoxRectDangerously()` / `useScrollRect()` / `useScreenRect()` hooks
// return the COMMITTED rect (one frame deferred) — see this file's docstring
// for the contract. The committed-only contract eliminates render → write →
// re-measure feedback loops by construction, but it forces components that
// genuinely need first-paint dimensions to wait one frame.
//
// `useBoxRectInFlight()` / `useScrollRectInFlight()` / `useScreenRectInFlight()`
// subscribe to the IN-FLIGHT signal — the rect as written by the most recent
// layout pass within the current convergence cycle. The value can change
// between convergence passes within a single event batch, so a render that
// reads it AND writes a layout-affecting prop CAN form a feedback edge.
//
// **For silvery framework internals only.** Image, useCursor, useGridPosition,
// and ListView's viewport-tracking path are the real consumers — leaf
// primitives whose first-paint measurement is critical for scroll, decoration,
// or absolute-positioning math, and which don't drive layout-affecting props
// back into the React tree. (Lane snapping, once an in-flight consumer here,
// now lives in the engine as the `fitWidth` Box prop and doesn't reach for
// these hooks at all.)
//
// **Lint-gated.** App code (silvercode, km-tui, downstream consumers) must
// not import these hooks — the ESLint rule `silvery/no-in-flight-rect-in-app`
// blocks imports from outside `vendor/silvery/`. App code that needs
// first-paint layout decisions must use `useResponsiveBoxProps` /
// `useResponsiveValue` (declarative, no measurement reads) — the path
// documented in [The Silvery Way §2](../../docs/guide/the-silvery-way.md).
//
// **Why both forms exist.** The deferred form is the safe default; the
// in-flight form is an explicit escape hatch acknowledging that silvery's
// own primitives can't always wait one frame for measurement. Naming the
// escape hatch `*InFlight` makes the cost legible at the call site.
//
// See bead `@km/silvery/usebox-rect-deferred-only-breaks-first-paint`.

/**
 * In-flight reactive rect hook (escape hatch): subscribes to the LIVE rect
 * signal — the value as written by the most recent layout pass within the
 * current convergence cycle. Re-renders when the in-flight value advances,
 * which can happen multiple times per event batch as the convergence loop
 * iterates.
 *
 * Use only inside silvery framework internals where first-paint measurement
 * is required and the consumer does not write layout-affecting props
 * derived from the read. App code must use the deferred form
 * (`useBoxRectDangerously()` / `useScrollRect()` / `useScreenRect()`) or
 * `useResponsiveBoxProps`/`useResponsiveValue` instead.
 */
function useReactiveRectInFlight(
  getDerivedRect: (raw: Rect | null, node: AgNode) => Rect | null | undefined,
  inFlightSignalKey: InFlightRectSignalKey,
): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    markObservedLayoutSignal(node, IN_FLIGHT_RECT_OBSERVED_KEY[inFlightSignalKey])
    const signals = getLayoutSignals(node)
    const rectSignal = signals[inFlightSignalKey]

    // effect() subscribes to the IN-FLIGHT signal — re-runs whenever the
    // signal advances, including mid-batch as the convergence loop iterates.
    // This is intentionally permissive vs the committed form; consumers that
    // can't accept first-paint zero-rect (Image, useCursor, useGridPosition)
    // opt in via this hook.
    const dispose = effect(() => {
      const raw = rectSignal()
      const next = getDerivedRect(raw, node) ?? null
      if (!rectEqual(prevRef.current, next)) {
        prevRef.current = next
        forceUpdate()
      }
    })

    return dispose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (!node) return EMPTY_RECT
  // Synchronous read (called during render): use the in-flight signal
  // directly (NOT `node.boxRect` — that bypasses the reactive subscription
  // edge and would let the render see one value while the effect sees
  // another). The in-flight signal value reflects the most recent layout
  // pass; it may differ between convergence passes within a batch.
  markObservedLayoutSignal(node, IN_FLIGHT_RECT_OBSERVED_KEY[inFlightSignalKey])
  const signals = getLayoutSignals(node)
  const raw = signals[inFlightSignalKey]()
  return getDerivedRect(raw, node) ?? EMPTY_RECT
}

/**
 * Returns the inner content dimensions of the current Box from the IN-FLIGHT
 * signal — the value as of the most recent layout pass, which may change
 * between convergence passes within an event batch.
 *
 * Silvery framework internals only — app code must use
 * {@link useBoxRectDangerously} (deferred) or
 * `useResponsiveBoxProps`/`useResponsiveValue` instead.
 *
 * Unlike {@link useBoxRectDangerously} (the deferred form), this hook returns the
 * measured value on the first render after layout — there is no one-frame
 * fallback. The cost is that a render reading this hook AND writing a
 * layout-affecting prop can form a convergence-loop feedback edge; the
 * lint rule `silvery/no-in-flight-rect-in-app` enforces the call-site
 * scope.
 */
export function useBoxRectInFlight(): Rect {
  return useReactiveRectInFlight((raw, node) => deriveInnerRect(node, raw), "boxRect")
}

/**
 * Returns the scroll-adjusted position from the IN-FLIGHT signal — the
 * value as of the most recent layout pass, which may change between
 * convergence passes within an event batch.
 *
 * Silvery framework internals only — see {@link useBoxRectInFlight} for
 * the contract and the lint rule that gates app-code use.
 */
export function useScrollRectInFlight(): Rect {
  return useReactiveRectInFlight((raw) => raw, "scrollRect")
}

/**
 * Returns the actual paint position from the IN-FLIGHT signal — the value
 * as of the most recent layout pass, which may change between convergence
 * passes within an event batch.
 *
 * Silvery framework internals only — see {@link useBoxRectInFlight} for
 * the contract and the lint rule that gates app-code use.
 */
export function useScreenRectInFlight(): Rect {
  return useReactiveRectInFlight((raw) => raw, "screenRect")
}

// ============================================================================
// Callback observers — fire on commit boundary without triggering re-render
// ============================================================================
//
// The reactive `useBoxRectDangerously()` / `useScrollRect()` / `useScreenRect()` hooks
// re-render the consuming component every time the committed rect advances.
// For hot paths where the rect change should NOT re-render the consumer
// (cursor positioning, grid registry, decoration emission), the callback
// observers below subscribe directly to the committed signal and invoke
// `cb(rect)` at every commit boundary — no React state churn, no re-render.
//
// Restored 2026-05-10 to address the perf regression introduced by removing
// the callback overload from `useBoxRect()` in silvery `63938779b6`. The
// previous callback form was `useBoxRect((rect) => …)` overloaded on the
// reactive hook; that fused two distinct contracts into one signature. The
// observer hooks below split them: reactive read + commit-boundary observer.

/**
 * Subscribes to the committed rect signal and fires `cb(rect)` at each
 * commit boundary, **without** triggering a re-render of the consumer.
 *
 * Use for hot paths where a rect change drives an imperative side effect
 * (cursor store update, registry write, ANSI emission) and there is no
 * render path that needs to reflect the rect.
 *
 * The callback is invoked synchronously from a commit-boundary effect(),
 * with the derived rect (`getDerivedRect` applied to the committed signal
 * value). It is NOT invoked when the derived rect is null. The caller may
 * close over component state via refs; see `useCursor` / `useGridPosition`
 * for canonical patterns.
 */
function useOnRectCommitted(
  cb: (rect: Rect) => void,
  getDerivedRect: (committed: Rect | null, node: AgNode) => Rect | null | undefined,
  committedSignalKey: CommittedRectSignalKey,
): void {
  const node = useContext(NodeContext)
  const cbRef = useRef(cb)
  cbRef.current = cb

  useLayoutEffect(() => {
    if (!node) return

    const signals = getLayoutSignals(node)
    const rectSignal = signals[committedSignalKey]
    let prev: Rect | null = null

    const dispose = effect(() => {
      const committed = rectSignal()
      const next = getDerivedRect(committed, node) ?? null
      if (next == null) return
      if (rectEqual(prev, next)) return
      prev = next
      cbRef.current(next)
    })

    return dispose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])
}

/**
 * Subscribes to the committed boxRect (inner content) and fires `cb` at
 * each commit boundary without re-rendering. See {@link useBoxRectDangerously}
 * for the deferred-rect contract; this is the observer form.
 */
export function useOnBoxRectCommitted(cb: (rect: Rect) => void): void {
  useOnRectCommitted(cb, (committed, node) => deriveInnerRect(node, committed), "boxRectCommitted")
}

/**
 * Subscribes to the committed scrollRect and fires `cb` at each commit
 * boundary without re-rendering.
 */
export function useOnScrollRectCommitted(cb: (rect: Rect) => void): void {
  useOnRectCommitted(cb, (committed) => committed, "scrollRectCommitted")
}

/**
 * Subscribes to the committed screenRect and fires `cb` at each commit
 * boundary without re-rendering.
 */
export function useOnScreenRectCommitted(cb: (rect: Rect) => void): void {
  useOnRectCommitted(cb, (committed) => committed, "screenRectCommitted")
}
