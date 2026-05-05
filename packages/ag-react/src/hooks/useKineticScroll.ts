/**
 * useKineticScroll — wheel-event state machine with iOS-style kinetic
 * momentum for any scroll container.
 *
 * Single source of truth for silvery's scroll physics. Used directly by
 * `<Box overflow="scroll">` callers, and by `ListView` (which adds cursor
 * coupling, anchoring, and an edge-bump indicator on top).
 *
 * ## Usage
 *
 *   const { scrollOffset, onWheel } = useKineticScroll({
 *     maxScroll: contentRows - viewportRows,
 *   })
 *
 *   <Box overflow="scroll" scrollOffset={scrollOffset} onWheel={onWheel}>
 *     {rows}
 *   </Box>
 *
 * Pass `maxScroll` to clamp at the end of the content. Leave undefined
 * while mounting; the underlying Box's layout phase will clamp regardless.
 *
 * ## Physics
 *
 * - Each wheel event: apply immediate `wheelMultiplier` rows of displacement;
 *   push applied displacement into a rolling buffer of the last ~150ms.
 * - No per-event inverse-dt acceleration — event frequency itself encodes
 *   speed (fast trackpad = many events = fast scroll naturally).
 * - Direction-confirmation filter (`WheelGestureFilter`) drops a single
 *   opposite-direction sample as inertia bounce; two consecutive opposite
 *   samples commit a real reversal.
 * - Release (no wheel for `RELEASE_TIMEOUT_MS`) → velocity = Σ(bufferRows) /
 *   (last.t − first.t) × 1000; closed-form exponential decay
 *   pos(t) = start + amplitude·(1 − e^(−t/τ)) with τ=180ms, gained and
 *   hard-capped so momentum coasts a modest, predictable distance.
 * - Optional same-direction compounding (`enableSameDirCompounding`):
 *   when a new wheel flick interrupts an in-flight coast in the same
 *   direction, the residual instantaneous velocity is added (pure
 *   additive carryover — no multiplier) to the next momentum phase.
 *   `maxVelocity` is the natural cap.
 * - Hard edge clamps on `maxScroll` with velocity zeroed — no overshoot.
 *
 * ## References
 *
 * - Ilya Lobanov — "Scrolling Mechanics of UIScrollView"
 *   https://medium.com/@esskeetit/scrolling-mechanics-of-uiscrollview-142adee1142c
 * - Ariya Hidayat — "Flick List Momentum"
 *   https://ariya.io/2011/10/flick-list-with-its-momentum-scrolling-and-deceleration/
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createWheelGestureFilter } from "../ui/input/wheel-gesture-filter"

/** Rows moved per wheel event before `wheelMultiplier`. Constant — event
 * frequency encodes speed; per-event inverse-dt acceleration would
 * double-amplify fast streams. Keep at 1; tune via `wheelMultiplier`. */
const WHEEL_STEP_ROWS = 1
/** Rolling window for velocity estimation. Long enough to average over OS
 * inertia tail (~50ms), short enough that intentional reversal commits
 * within human reaction time (~150-200ms). */
const WHEEL_VELOCITY_WINDOW_MS = 150
/** Default max absolute velocity (rows/sec). Caps momentum coast distance. */
const DEFAULT_KINETIC_MAX_VELOCITY = 80
/** Momentum time constant (ms). Calibrated for row-quantized rendering —
 * Apple's UIScrollView uses ~325ms (normal), but in a cell grid the longer
 * tail looks like a stuck-then-jump animation. 180ms is responsive yet
 * weighty for a TUI; web/canvas targets may want to override. */
const KINETIC_TIME_CONSTANT_MS = 180
/** Fraction of `v × τ` to use as momentum amplitude. <1 dampens coast without
 * needing to retune τ (which also affects decay shape). */
const KINETIC_MOMENTUM_GAIN = 0.6
/** Default hard cap on coast distance (rows). At MAX_VELOCITY=80 × τ=0.18 ×
 * GAIN=0.6 the uncapped amplitude is ≈ 8.6 rows; 30 only clips long-flick
 * outliers while letting normal flicks coast their natural distance. */
const DEFAULT_KINETIC_MAX_COAST_ROWS = 30
/** Stop momentum after this many τ (6τ → within 0.25% of target). */
const KINETIC_STOP_AFTER_TAU_MULTIPLES = 6
/** Stop when remaining distance falls below this (rows). Higher = snappier
 * end because sub-row animation is invisible in a discrete TUI. */
const KINETIC_STOP_DISTANCE = 1.5
/** Animation loop period in ms — 60Hz sampling of the closed-form curve. */
const KINETIC_FRAME_MS = 16
/** Wait this long with no wheel events before entering momentum phase. */
const RELEASE_TIMEOUT_MS = 60
/** Scrollbar auto-hide delay after the last scroll activity. */
export const SCROLLBAR_FADE_AFTER_MS = 800

export interface UseKineticScrollOptions {
  /**
   * Upper bound for `scrollOffset` (rows). Undefined = "not yet known".
   *
   * Accepts a function for dynamic late-render resolution: ListView
   * computes `scrollableRows` from layout signals AFTER calling the hook,
   * so the function form lets the hook read the freshest value at the
   * moment a wheel/momentum event fires.
   */
  maxScroll?: number | (() => number)
  /** Initial scroll offset. Defaults to 0. */
  initialOffset?: number
  /**
   * Optional callback that returns the float position to seed from when a
   * wheel event arrives after `reset()`. Used by ListView to seed from the
   * cursor's current viewport position (including the cursor-pinned-to-edge
   * case). Falls back to the current `scrollFloat` when omitted.
   */
  getInitialFloat?: () => number
  /** Override max absolute velocity (rows/sec). Default 80. */
  maxVelocity?: number
  /** Override hard cap on coast distance (rows). Default 30. */
  maxCoastRows?: number
  /**
   * User-facing speed knob. Multiplies the per-notch displacement; velocity
   * and coast scale linearly through the buffer math. Default 1.0.
   *
   * Industry conventions for scroll speed: iOS exposes `decelerationRate`
   * (.normal/.fast — affects τ); macOS exposes a tracking-speed slider that
   * scales raw deltaY at the OS level; Lenis exposes `wheelMultiplier`. We
   * follow the Lenis pattern — one number, intuitive, scales the whole feel.
   */
  wheelMultiplier?: number
  /**
   * When true, a new same-direction wheel flick that interrupts an in-flight
   * momentum coast adds the residual instantaneous velocity to the next
   * momentum phase. Pure additive carryover — no multiplier — capped by
   * `maxVelocity`. Off by default.
   */
  enableSameDirCompounding?: boolean
  /**
   * Fired when wheel or momentum motion is clamped at an edge. Used by
   * ListView to surface an edge-bump indicator. Fires for both directions
   * separately even on repeated bumps; consumers should debounce as needed.
   */
  onEdgeReached?: (edge: "top" | "bottom") => void
  /**
   * Fired any time the scroll position changes (wheel-driven or momentum).
   * Receives both the integer rendered offset and the float (sub-row) value.
   */
  onScroll?: (offset: number, float: number) => void
}

export interface UseKineticScrollResult {
  /** Current integer row offset. Feed to Box's `scrollOffset` prop. */
  scrollOffset: number
  /** Float position (sub-row precision). For scrollbar thumb rendering. */
  scrollFloat: number
  /** Fractional position 0..1 across the full scrollable track. */
  scrollFrac: number
  /** Wheel event handler. Attach to the scroll container's `onWheel`. */
  onWheel: (event: { deltaY: number }) => void
  /** True from the first wheel event until SCROLLBAR_FADE_AFTER_MS after
   * the last one. */
  isScrolling: boolean
  /** Imperatively set the scroll offset. Cancels any in-flight kinetic. */
  setScrollOffset: (offset: number) => void
  /** Imperatively set the float scroll position (sub-row precision).
   * Cancels any in-flight kinetic. */
  setScrollFloat: (float: number) => void
  /** Reset all wheel/momentum state. Used by ListView when the cursor
   * moves via keyboard — kills momentum and arms `getInitialFloat` to
   * reseed from the cursor on the next wheel event. */
  reset: () => void
  /**
   * Adjust the scroll position WITHOUT disturbing wheel/momentum state.
   * Used by ListView's `useScrollAnchoring` — when layout reflows shift
   * visible content, the anchor restores visual position by nudging the
   * float forward/back. Resetting the gesture filter on every layout
   * commit would treat a scroll-stream + anchor-reflow combo as a fresh
   * gesture and let inertia bounces seed false reversals.
   */
  nudgeScrollFloat: (float: number) => void
  /** Briefly show the scrollbar (sets `isScrolling=true` and schedules
   * the standard fade timer). Used by ListView when streaming items
   * append — the user gets a transient cue that content moved. */
  flashScrollbar: () => void
  /** True while the momentum animation loop is running. */
  isAnimating: boolean
}

export function useKineticScroll(options: UseKineticScrollOptions = {}): UseKineticScrollResult {
  const {
    maxScroll,
    initialOffset = 0,
    getInitialFloat,
    maxVelocity = DEFAULT_KINETIC_MAX_VELOCITY,
    maxCoastRows = DEFAULT_KINETIC_MAX_COAST_ROWS,
    wheelMultiplier = 1.0,
    enableSameDirCompounding = false,
    onEdgeReached,
    onScroll,
  } = options
  const [scrollOffset, setScrollOffsetState] = useState<number>(initialOffset)
  const [scrollFloat, setScrollFloatState] = useState<number>(initialOffset)
  const [scrollFrac, setScrollFracState] = useState<number>(0)
  const [isScrolling, setIsScrolling] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const scrollFloatRef = useRef<number>(initialOffset)
  // Set true after `reset()`; the next wheel event consults `getInitialFloat`
  // (if provided) to reseed scroll-float before applying displacement.
  const needsSeedRef = useRef(false)
  // Rolling event buffer — { time, applied rows }.
  const wheelBufferRef = useRef<Array<{ t: number; rows: number }>>([])
  const wheelGestureFilterRef = useRef(createWheelGestureFilter())
  const momentumRef = useRef<{
    startPos: number
    amplitude: number
    startTime: number
  } | null>(null)
  // Same-direction compounding carryover (rows/sec), set when a wheel flick
  // interrupts an in-flight coast. Pure additive — no multiplier.
  const pendingBoostVelocityRef = useRef(0)
  // Resolve maxScroll lazily on each read so callers can pass a getter
  // for late-render values (e.g. ListView computes `scrollableRows`
  // post-render). The static-number form still works.
  const maxScrollOptionRef = useRef<number | (() => number) | undefined>(maxScroll)
  maxScrollOptionRef.current = maxScroll
  const readMaxScroll = useCallback((): number => {
    const opt = maxScrollOptionRef.current
    if (typeof opt === "function") return opt()
    return opt ?? Number.POSITIVE_INFINITY
  }, [])
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable refs to callbacks so the wheel handler doesn't churn on every
  // render of the consumer.
  const getInitialFloatRef = useRef(getInitialFloat)
  getInitialFloatRef.current = getInitialFloat
  const onEdgeReachedRef = useRef(onEdgeReached)
  onEdgeReachedRef.current = onEdgeReached
  const onScrollRef = useRef(onScroll)
  onScrollRef.current = onScroll

  const updatePosition = useCallback(
    (float: number) => {
      scrollFloatRef.current = float
      setScrollFloatState((prev) => (Math.abs(prev - float) < 0.001 ? prev : float))
      const maxS = readMaxScroll()
      const frac = Number.isFinite(maxS) && maxS > 0 ? Math.max(0, Math.min(1, float / maxS)) : 0
      setScrollFracState((prev) => (Math.abs(prev - frac) < 0.001 ? prev : frac))
      const rendered = Math.round(float)
      setScrollOffsetState((prev) => (prev === rendered ? prev : rendered))
      onScrollRef.current?.(rendered, float)
    },
    [readMaxScroll],
  )

  const stopKinetic = useCallback(() => {
    if (loopRef.current !== null) {
      clearInterval(loopRef.current)
      loopRef.current = null
      setIsAnimating(false)
    }
    momentumRef.current = null
    // Note: do NOT zero pendingBoostVelocityRef here — onWheel captures
    // residual velocity *before* calling stopKinetic, and enterMomentum
    // consumes it. Zeroing here defeats the compounding path.
  }, [])

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [])

  const scheduleScrollbarHide = useCallback(() => {
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setIsScrolling(false)
      hideTimerRef.current = null
    }, SCROLLBAR_FADE_AFTER_MS)
  }, [])

  useEffect(
    () => () => {
      stopKinetic()
      clearReleaseTimer()
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    },
    [stopKinetic, clearReleaseTimer],
  )

  const momentumStep = useCallback((): boolean => {
    const m = momentumRef.current
    if (m === null) return false
    const maxS = readMaxScroll()
    const tau = KINETIC_TIME_CONSTANT_MS
    const t = performance.now() - m.startTime
    if (t >= tau * KINETIC_STOP_AFTER_TAU_MULTIPLES) return false
    const decay = Math.exp(-t / tau)
    const remaining = m.amplitude * decay
    if (Math.abs(remaining) < KINETIC_STOP_DISTANCE) return false
    const pos = m.startPos + m.amplitude * (1 - decay)
    if (pos <= 0) {
      updatePosition(0)
      onEdgeReachedRef.current?.("top")
      return false
    }
    if (Number.isFinite(maxS) && pos >= maxS) {
      updatePosition(maxS)
      onEdgeReachedRef.current?.("bottom")
      return false
    }
    updatePosition(pos)
    return true
  }, [updatePosition])

  const startMomentum = useCallback(() => {
    if (loopRef.current !== null) return
    setIsAnimating(true)
    setIsScrolling(true)
    scheduleScrollbarHide()
    loopRef.current = setInterval(() => {
      if (!momentumStep()) {
        stopKinetic()
        return
      }
      scheduleScrollbarHide()
    }, KINETIC_FRAME_MS)
  }, [momentumStep, scheduleScrollbarHide, stopKinetic])

  const enterMomentum = useCallback(() => {
    const now = performance.now()
    wheelGestureFilterRef.current.release()
    const buf = wheelBufferRef.current
    while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
    if (buf.length < 2) {
      wheelBufferRef.current = []
      pendingBoostVelocityRef.current = 0
      return
    }
    const netRows = buf.reduce((s, e) => s + e.rows, 0)
    // Span = first-to-last event time — NOT `now − first.t`. The release
    // timer fires ~60ms after the last event; using `now` systematically
    // dilutes velocity by that idle gap.
    const first = buf[0]!
    const last = buf[buf.length - 1]!
    const spanMs = Math.max(1, last.t - first.t)
    const rawV = (netRows / spanMs) * 1000
    // Pure additive same-direction carryover — capped by maxVelocity, which
    // is the natural governor against runaway acceleration.
    const boost = pendingBoostVelocityRef.current
    pendingBoostVelocityRef.current = 0
    const compoundedV = rawV + boost
    const v = Math.max(-maxVelocity, Math.min(maxVelocity, compoundedV))
    wheelBufferRef.current = []
    if (Math.abs(v) < 1) return
    const maxS = readMaxScroll()
    const startPos = scrollFloatRef.current
    const rawAmplitude = v * (KINETIC_TIME_CONSTANT_MS / 1000) * KINETIC_MOMENTUM_GAIN
    const amplitude = Math.max(-maxCoastRows, Math.min(maxCoastRows, rawAmplitude))
    const rawTarget = startPos + amplitude
    const clampedTarget = Number.isFinite(maxS)
      ? Math.max(0, Math.min(maxS, rawTarget))
      : Math.max(0, rawTarget)
    momentumRef.current = {
      startPos,
      amplitude: clampedTarget - startPos,
      startTime: performance.now(),
    }
    startMomentum()
  }, [maxCoastRows, maxVelocity, startMomentum])

  const scheduleRelease = useCallback(() => {
    clearReleaseTimer()
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null
      enterMomentum()
    }, RELEASE_TIMEOUT_MS)
  }, [clearReleaseTimer, enterMomentum])

  const onWheel = useCallback(
    ({ deltaY }: { deltaY: number }) => {
      const dir = Math.sign(deltaY) || 0
      if (dir === 0) return
      // Capture the residual velocity from any in-flight momentum BEFORE we
      // stop it. Same direction → carryover (additive). Opposite → zero.
      if (enableSameDirCompounding) {
        const m = momentumRef.current
        if (m !== null) {
          const tau = KINETIC_TIME_CONSTANT_MS
          const t = performance.now() - m.startTime
          const decay = Math.exp(-t / tau)
          const instantVRowsPerSec = (m.amplitude / tau) * decay * 1000
          const sameDir = Math.sign(instantVRowsPerSec) === dir
          if (sameDir) {
            pendingBoostVelocityRef.current += instantVRowsPerSec
            const cap = maxVelocity
            if (pendingBoostVelocityRef.current > cap) pendingBoostVelocityRef.current = cap
            else if (pendingBoostVelocityRef.current < -cap) pendingBoostVelocityRef.current = -cap
          } else {
            pendingBoostVelocityRef.current = 0
          }
        }
      }
      stopKinetic()
      clearReleaseTimer()
      // Seed from caller-provided source on the first wheel event after reset
      // (ListView uses this for cursor-pinned-to-edge handling).
      if (needsSeedRef.current) {
        needsSeedRef.current = false
        const seedFn = getInitialFloatRef.current
        if (seedFn) scrollFloatRef.current = seedFn()
      }
      const now = performance.now()
      const buf = wheelBufferRef.current
      while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
      const samples = wheelGestureFilterRef.current.process({ t: now, deltaY })
      if (samples.length === 0) return
      const maxS = readMaxScroll()
      const stepRows = WHEEL_STEP_ROWS * wheelMultiplier
      let nextFloat = scrollFloatRef.current
      for (const sample of samples) {
        const sampleDir = Math.sign(sample.deltaY) || 0
        if (sampleDir === 0) continue
        const prev = nextFloat
        const rawNext = prev + sampleDir * stepRows
        if (rawNext < 0) nextFloat = 0
        else if (Number.isFinite(maxS) && rawNext > maxS) nextFloat = maxS
        else nextFloat = rawNext
        const appliedRows = nextFloat - prev
        if (sampleDir > 0 && Number.isFinite(maxS) && nextFloat >= maxS)
          onEdgeReachedRef.current?.("bottom")
        else if (sampleDir < 0 && nextFloat <= 0) onEdgeReachedRef.current?.("top")
        if (appliedRows !== 0) buf.push({ t: sample.t, rows: appliedRows })
      }
      updatePosition(nextFloat)
      setIsScrolling(true)
      scheduleScrollbarHide()
      scheduleRelease()
    },
    [
      clearReleaseTimer,
      enableSameDirCompounding,
      maxVelocity,
      scheduleRelease,
      scheduleScrollbarHide,
      stopKinetic,
      updatePosition,
      wheelMultiplier,
    ],
  )

  const setScrollOffset = useCallback(
    (offset: number) => {
      stopKinetic()
      clearReleaseTimer()
      wheelBufferRef.current = []
      wheelGestureFilterRef.current.reset()
      pendingBoostVelocityRef.current = 0
      const maxS = readMaxScroll()
      const clamped = Math.max(0, Number.isFinite(maxS) ? Math.min(maxS, offset) : offset)
      updatePosition(clamped)
    },
    [clearReleaseTimer, stopKinetic, updatePosition],
  )

  // Same as setScrollOffset but documented to accept fractional values.
  // (setScrollOffset already accepts floats; this alias clarifies intent.)
  const setScrollFloat = setScrollOffset

  // Sub-row position adjustment that preserves wheel/momentum state.
  // Layout-anchor reflow needs to translate visual position without
  // looking like a new gesture or interrupting an in-flight coast.
  const nudgeScrollFloat = useCallback(
    (float: number) => {
      const maxS = readMaxScroll()
      const clamped = Math.max(0, Number.isFinite(maxS) ? Math.min(maxS, float) : float)
      updatePosition(clamped)
    },
    [readMaxScroll, updatePosition],
  )

  const reset = useCallback(() => {
    stopKinetic()
    clearReleaseTimer()
    wheelBufferRef.current = []
    wheelGestureFilterRef.current.reset()
    pendingBoostVelocityRef.current = 0
    needsSeedRef.current = true
  }, [clearReleaseTimer, stopKinetic])

  const flashScrollbar = useCallback(() => {
    setIsScrolling(true)
    scheduleScrollbarHide()
  }, [scheduleScrollbarHide])

  return {
    scrollOffset,
    scrollFloat,
    scrollFrac,
    onWheel,
    isScrolling,
    setScrollOffset,
    setScrollFloat,
    nudgeScrollFloat,
    reset,
    flashScrollbar,
    isAnimating,
  }
}
