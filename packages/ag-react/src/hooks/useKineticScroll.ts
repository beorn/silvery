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
/** Default duration for animated scrollTo — calibrated for "feels deliberate
 * but not slow." iOS/Android nav transitions use ~250-300ms; <200ms reads as
 * a jump-with-jitter, >400ms reads as sluggish. */
const DEFAULT_PROGRAMMATIC_SCROLL_MS = 250
/** Maximum overshoot allowed past an edge when `enableElasticEdges`. Picked
 * small so the rendered scrollOffset (which clamps to [0, maxS]) never sits
 * stuck at a bound while sub-row float is still overshooting. */
const ELASTIC_BUDGET_ROWS = 3
/** Resistance coefficient — each unit of current overshoot divides incoming
 * delta by this much more. iOS UIScrollView uses ~0.55 in pixel space; row
 * space is coarser so we use 0.5. Higher = more resistance / stiffer feel. */
const ELASTIC_RESISTANCE_PER_ROW = 0.5
/** Spring-back duration when releasing past an edge. Faster than programmatic
 * scroll because the user already feels the resistance and expects snappy
 * settle. */
const ELASTIC_SPRINGBACK_MS = 200
/** Inter-event interval (ms) above which a wheel sample looks "discrete"
 * (mouse wheel click). Trackpad streams arrive 8-16ms apart; mouse wheels
 * pause 80-200ms between clicks. 50ms separates the two cleanly. */
const CADENCE_DISCRETE_GAP_MS = 50
/** Inter-event interval below which the stream is unambiguously continuous
 * (trackpad). Between this and DISCRETE_GAP_MS we keep the prior mode — a
 * hysteresis band that prevents flapping. */
const CADENCE_CONTINUOUS_GAP_MS = 30
/** Step multiplier applied to mouse-wheel-mode samples — each click moves
 * this many rows instead of 1. Matches typical OS mouse-wheel mappings (3-5
 * lines per notch). */
const DISCRETE_STEP_MULTIPLIER = 3

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
   * When true, synthesize a momentum coast after a wheel stream stops.
   * Default true for backwards compatibility. Set false when the input
   * source already emits inertial wheel events, such as terminal SGR mouse
   * wheels and browser trackpads.
   */
  enableMomentum?: boolean
  /**
   * Fired when wheel or momentum motion is clamped at an edge. Used by
   * ListView to surface an edge-bump indicator. Fires for both directions
   * separately even on repeated bumps; consumers should debounce as needed.
   */
  onEdgeReached?: (edge: "top" | "bottom") => void
  /**
   * Allow `scrollFloat` to overshoot past the edge with diminishing-return
   * resistance, then spring back to the bound on release. Mirrors iOS
   * UIScrollView and Lenis "rubber band" behavior. Off by default; the
   * rendered integer `scrollOffset` always clamps to [0, maxScroll], so the
   * effect is invisible in pure-row terminals — but the physics layer is
   * real (momentum decays naturally instead of clipping at the wall) and
   * canvas/web targets can render the actual overshoot.
   */
  enableElasticEdges?: boolean
  /**
   * Discriminate trackpad (continuous) vs mouse-wheel (discrete) input by
   * inter-event cadence. When enabled and a stream looks like discrete
   * mouse-wheel clicks (≥50ms gaps + |deltaY|≤1), each event jumps
   * `DISCRETE_STEP_MULTIPLIER` rows with no momentum coast — matching the
   * platform expectation that one wheel notch = one chunk of content.
   * Trackpad streams keep the smooth physics path. Off by default; enable
   * after profiling on real mouse hardware (the heuristic is conservative
   * and may need per-app tuning).
   */
  enableInputCadenceDetection?: boolean
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
  /**
   * Animate the scroll position from current to `targetFloat` with
   * cubic ease-out over `durationMs` (default 250ms). Cancels any
   * in-flight momentum or prior animation. User wheel input during the
   * animation cancels it and resumes manual control. Use for declarative
   * scrollTo, scrollToBottom, search-result reveal — anywhere a jump
   * would feel jarring.
   */
  animateToFloat: (targetFloat: number, durationMs?: number) => void
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
    enableMomentum = true,
    enableElasticEdges = false,
    enableInputCadenceDetection = false,
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
  // Active animation state (mutex — only one runs at a time, all share
  // `loopRef`). Three flavors:
  //   - "momentum"  velocity-driven exponential coast after a wheel release
  //   - "ease"      cubic ease-out from current to target (programmatic
  //                 scrollTo + elastic spring-back share this shape)
  type AnimationState =
    | { kind: "momentum"; startPos: number; amplitude: number; startTime: number }
    | {
        kind: "ease"
        startPos: number
        target: number
        startTime: number
        durationMs: number
        cause: "programmatic" | "spring-back"
      }
  const animRef = useRef<AnimationState | null>(null)
  // Inter-event cadence tracking for trackpad-vs-mousewheel discrimination.
  // 'unknown' until enough samples land; transitions in either direction
  // require crossing the relevant threshold (DISCRETE_GAP / CONTINUOUS_GAP).
  const lastWheelTimeRef = useRef(0)
  const cadenceModeRef = useRef<"unknown" | "continuous" | "discrete">("unknown")
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
      // Rendered offset always clamps to the valid range — Box's scroll
      // viewport can't render negative or beyond-max offsets. The float
      // itself is allowed to overshoot when elastic edges are enabled;
      // that drives the spring-back animation but isn't visible at row
      // resolution in the terminal.
      const clampedFloat = Math.max(0, Number.isFinite(maxS) ? Math.min(maxS, float) : float)
      const rendered = Math.round(clampedFloat)
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
    animRef.current = null
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

  const animationStep = useCallback((): boolean => {
    const a = animRef.current
    if (a === null) return false
    const maxS = readMaxScroll()
    if (a.kind === "momentum") {
      const tau = KINETIC_TIME_CONSTANT_MS
      const t = performance.now() - a.startTime
      if (t >= tau * KINETIC_STOP_AFTER_TAU_MULTIPLES) return false
      const decay = Math.exp(-t / tau)
      const remaining = a.amplitude * decay
      if (Math.abs(remaining) < KINETIC_STOP_DISTANCE) return false
      const pos = a.startPos + a.amplitude * (1 - decay)
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
    }
    // Ease-out cubic: 1 - (1-t)^3. Used by both programmatic scrollTo and
    // elastic spring-back. Pure displacement interpolation — no edge
    // bouncing or velocity carryover.
    const elapsed = performance.now() - a.startTime
    const t = a.durationMs > 0 ? Math.min(1, elapsed / a.durationMs) : 1
    if (t >= 1) {
      updatePosition(a.target)
      return false
    }
    const eased = 1 - Math.pow(1 - t, 3)
    const pos = a.startPos + (a.target - a.startPos) * eased
    updatePosition(pos)
    return true
  }, [readMaxScroll, updatePosition])

  const startAnimationLoop = useCallback(() => {
    if (loopRef.current !== null) return
    setIsAnimating(true)
    setIsScrolling(true)
    scheduleScrollbarHide()
    loopRef.current = setInterval(() => {
      if (!animationStep()) {
        stopKinetic()
        return
      }
      scheduleScrollbarHide()
    }, KINETIC_FRAME_MS)
  }, [animationStep, scheduleScrollbarHide, stopKinetic])

  const enterMomentum = useCallback(() => {
    const now = performance.now()
    wheelGestureFilterRef.current.release()
    const buf = wheelBufferRef.current
    while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
    // Elastic spring-back: when the user releases past an edge, return to
    // the bound with ease-out before any velocity-driven momentum runs.
    // Spring-back is mutually exclusive with momentum — we don't compound.
    const cur = scrollFloatRef.current
    const maxSCheck = readMaxScroll()
    if (cur < 0 || (Number.isFinite(maxSCheck) && cur > maxSCheck)) {
      const target = cur < 0 ? 0 : maxSCheck
      wheelBufferRef.current = []
      pendingBoostVelocityRef.current = 0
      animRef.current = {
        kind: "ease",
        startPos: cur,
        target,
        startTime: performance.now(),
        durationMs: ELASTIC_SPRINGBACK_MS,
        cause: "spring-back",
      }
      startAnimationLoop()
      return
    }
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
    animRef.current = {
      kind: "momentum",
      startPos,
      amplitude: clampedTarget - startPos,
      startTime: performance.now(),
    }
    startAnimationLoop()
  }, [maxCoastRows, maxVelocity, readMaxScroll, startAnimationLoop])

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
        const m = animRef.current
        if (m !== null && m.kind === "momentum") {
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
      // Cadence-based mode classification. Done BEFORE the gesture filter
      // so that filter-suppressed bounces (single opposite samples) still
      // contribute to the cadence picture — a pause-then-continue stream
      // shouldn't get reclassified by the filter dropping samples.
      if (enableInputCadenceDetection) {
        const last = lastWheelTimeRef.current
        if (last > 0) {
          const interval = now - last
          const absD = Math.abs(deltaY)
          if (interval >= CADENCE_DISCRETE_GAP_MS && absD <= 1) {
            cadenceModeRef.current = "discrete"
          } else if (interval <= CADENCE_CONTINUOUS_GAP_MS || absD > 1) {
            cadenceModeRef.current = "continuous"
          }
          // else: ambiguous gap, keep current mode (hysteresis)
        }
        lastWheelTimeRef.current = now
      }
      const buf = wheelBufferRef.current
      while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
      const samples = wheelGestureFilterRef.current.process({ t: now, deltaY })
      if (samples.length === 0) return
      const maxS = readMaxScroll()
      const isDiscrete = enableInputCadenceDetection && cadenceModeRef.current === "discrete"
      const stepRows = isDiscrete
        ? WHEEL_STEP_ROWS * wheelMultiplier * DISCRETE_STEP_MULTIPLIER
        : WHEEL_STEP_ROWS * wheelMultiplier
      let nextFloat = scrollFloatRef.current
      for (const sample of samples) {
        const sampleDir = Math.sign(sample.deltaY) || 0
        if (sampleDir === 0) continue
        const prev = nextFloat
        const rawNext = prev + sampleDir * stepRows
        // Edge clamping. Three cases:
        //   - past lower bound (rawNext < 0)
        //   - past upper bound (rawNext > maxS)
        //   - inside bounds — pass through.
        // Discrete (mouse wheel) mode never overshoots — clicks are
        // expected to land on a row, not bounce. Elastic only applies in
        // continuous mode.
        const allowElastic = enableElasticEdges && !isDiscrete
        if (rawNext < 0) {
          if (allowElastic) {
            const overshootPrev = Math.max(0, -prev)
            const resistance = 1 + overshootPrev * ELASTIC_RESISTANCE_PER_ROW
            const resisted = (rawNext - prev) / resistance
            nextFloat = Math.max(-ELASTIC_BUDGET_ROWS, prev + resisted)
          } else {
            nextFloat = 0
          }
        } else if (Number.isFinite(maxS) && rawNext > maxS) {
          if (allowElastic) {
            const overshootPrev = Math.max(0, prev - maxS)
            const resistance = 1 + overshootPrev * ELASTIC_RESISTANCE_PER_ROW
            const resisted = (rawNext - prev) / resistance
            nextFloat = Math.min(maxS + ELASTIC_BUDGET_ROWS, prev + resisted)
          } else {
            nextFloat = maxS
          }
        } else {
          nextFloat = rawNext
        }
        const appliedRows = nextFloat - prev
        // Edge-reached fires whenever a sample lands AT or PAST a bound —
        // including the cursor-pinned-to-edge case where the seeded float
        // already starts at the bound. Tests assert the indicator flashes
        // on every wheel into the wall, not just first contact.
        if (sampleDir > 0 && Number.isFinite(maxS) && nextFloat >= maxS)
          onEdgeReachedRef.current?.("bottom")
        else if (sampleDir < 0 && nextFloat <= 0) onEdgeReachedRef.current?.("top")
        if (appliedRows !== 0) buf.push({ t: sample.t, rows: appliedRows })
      }
      updatePosition(nextFloat)
      setIsScrolling(true)
      scheduleScrollbarHide()
      // Discrete-cadence (mouse-wheel) inputs don't get a momentum coast —
      // each click is its own discrete jump. Continuous inputs follow the
      // standard release-into-momentum path.
      if (isDiscrete) {
        wheelBufferRef.current = []
        pendingBoostVelocityRef.current = 0
      } else if (enableMomentum) {
        scheduleRelease()
      } else {
        wheelGestureFilterRef.current.release()
        wheelBufferRef.current = []
        pendingBoostVelocityRef.current = 0
      }
    },
    [
      clearReleaseTimer,
      enableElasticEdges,
      enableInputCadenceDetection,
      enableMomentum,
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
    cadenceModeRef.current = "unknown"
    lastWheelTimeRef.current = 0
  }, [clearReleaseTimer, stopKinetic])

  const flashScrollbar = useCallback(() => {
    setIsScrolling(true)
    scheduleScrollbarHide()
  }, [scheduleScrollbarHide])

  const animateToFloat = useCallback(
    (targetFloat: number, durationMs: number = DEFAULT_PROGRAMMATIC_SCROLL_MS) => {
      // Cancel any in-flight motion (wheel buffer, momentum, prior animation,
      // pending release timer). After this returns, the only motion is the
      // ease-out from current to target.
      stopKinetic()
      clearReleaseTimer()
      wheelBufferRef.current = []
      wheelGestureFilterRef.current.reset()
      pendingBoostVelocityRef.current = 0
      const maxS = readMaxScroll()
      const clampedTarget = Math.max(
        0,
        Number.isFinite(maxS) ? Math.min(maxS, targetFloat) : targetFloat,
      )
      const startPos = scrollFloatRef.current
      // Skip animation for tiny deltas — sub-row interpolation isn't visible
      // at row resolution and the first frame would just snap anyway.
      if (Math.abs(clampedTarget - startPos) < 0.5 || durationMs <= 0) {
        updatePosition(clampedTarget)
        return
      }
      animRef.current = {
        kind: "ease",
        startPos,
        target: clampedTarget,
        startTime: performance.now(),
        durationMs,
        cause: "programmatic",
      }
      startAnimationLoop()
    },
    [clearReleaseTimer, readMaxScroll, startAnimationLoop, stopKinetic, updatePosition],
  )

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
    animateToFloat,
  }
}
