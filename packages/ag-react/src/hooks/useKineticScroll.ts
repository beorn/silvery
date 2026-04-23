/**
 * useKineticScroll — wheel-event state machine with iOS-style kinetic
 * momentum, suitable for any scroll container (ListView, plain Box with
 * `overflow="scroll"`, anything that accepts a row-space scrollOffset).
 *
 * ## What you get
 *
 *   const { scrollOffset, onWheel, isScrolling } = useKineticScroll({
 *     maxScroll: contentRows - viewportRows,
 *   })
 *
 *   <Box overflow="scroll" scrollOffset={scrollOffset} onWheel={onWheel}>
 *     {rows}
 *   </Box>
 *
 * Hand `maxScroll` to clamp at the end of the content. Leave it undefined
 * while the scrollable region is still mounting; the hook will not clamp
 * upper-bounds until a positive value arrives (the underlying Box's layout
 * phase will clamp regardless, so the viewport is always correct).
 *
 * ## Physics (see ListView for the canonical references)
 *
 * - Inter-event dt drives wheel acceleration: slow isolated click → 1 row,
 *   dense trackpad stream → up to `accelMax` rows per event.
 * - Release (no wheel events for ~60ms) → closed-form exponential decay
 *   pos(t) = start + amplitude·(1 − e^(−t/τ)), τ = 260ms, stops at 6τ or
 *   within 0.5 rows of target.
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

// ── Physics constants (iOS UIScrollView "normal") ─────────────────────
// See the block comment in ListView.tsx for derivation; the same values
// are reused here so both entry points feel identical.

const WHEEL_BASE_STEP = 1
const WHEEL_ACCEL_MAX = 5
const WHEEL_ACCEL_REFERENCE_DT_MS = 180
const WHEEL_ISOLATED_DT_MS = 500

const KINETIC_MAX_VELOCITY = 60
const KINETIC_TIME_CONSTANT_MS = 260
const KINETIC_STOP_AFTER_TAU_MULTIPLES = 6
const KINETIC_STOP_DISTANCE = 0.5
const KINETIC_FRAME_MS = 16
const RELEASE_TIMEOUT_MS = 60

export interface UseKineticScrollOptions {
  /** Upper bound for `scrollOffset` (rows). Undefined = "not yet known" —
   * the hook won't clamp the upper bound but the underlying scroll
   * container will. Keep up-to-date when content size changes. */
  maxScroll?: number
  /** Initial scroll offset. Defaults to 0. */
  initialOffset?: number
}

export interface UseKineticScrollResult {
  /** Current integer row offset. Feed to Box's `scrollOffset` prop. */
  scrollOffset: number
  /** Wheel event handler. Attach to the scroll container's `onWheel`. */
  onWheel: (event: { deltaY: number }) => void
  /** True from the first wheel event until SCROLLBAR_FADE_AFTER_MS after
   * the last one — consumers can gate a scrollbar overlay on this. */
  isScrolling: boolean
  /** Imperatively set the scroll offset. Cancels any in-flight kinetic. */
  setScrollOffset: (offset: number) => void
  /** True while the kinetic animation loop is actively running. */
  isAnimating: boolean
}

/**
 * Scrollbar auto-hide timeout (ms) — exported so consumers that render
 * their own scrollbar can match the component-internal fade timing.
 */
export const SCROLLBAR_FADE_AFTER_MS = 800

export function useKineticScroll(options: UseKineticScrollOptions = {}): UseKineticScrollResult {
  const { maxScroll, initialOffset = 0 } = options
  const [scrollOffset, setScrollOffsetState] = useState<number>(initialOffset)
  const [isScrolling, setIsScrolling] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const scrollFloatRef = useRef<number>(initialOffset)
  const velocityRef = useRef(0)
  const lastWheelTimeRef = useRef(0)
  const maxScrollRef = useRef(maxScroll ?? Number.POSITIVE_INFINITY)
  const momentumRef = useRef<{
    startPos: number
    amplitude: number
    startTime: number
  } | null>(null)
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep maxScrollRef in sync with the prop.
  maxScrollRef.current = maxScroll ?? Number.POSITIVE_INFINITY

  const stopKinetic = useCallback(() => {
    if (loopRef.current !== null) {
      clearInterval(loopRef.current)
      loopRef.current = null
      setIsAnimating(false)
    }
    momentumRef.current = null
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

  useEffect(() => () => {
    stopKinetic()
    clearReleaseTimer()
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
  }, [stopKinetic, clearReleaseTimer])

  const momentumStep = useCallback((): boolean => {
    const m = momentumRef.current
    if (m === null) return false
    const maxS = maxScrollRef.current
    const tau = KINETIC_TIME_CONSTANT_MS
    const t = performance.now() - m.startTime
    if (t >= tau * KINETIC_STOP_AFTER_TAU_MULTIPLES) return false
    const decay = Math.exp(-t / tau)
    const remaining = m.amplitude * decay
    if (Math.abs(remaining) < KINETIC_STOP_DISTANCE) return false
    let pos = m.startPos + m.amplitude * (1 - decay)
    if (pos <= 0) {
      scrollFloatRef.current = 0
      setScrollOffsetState(0)
      return false
    }
    if (pos >= maxS) {
      scrollFloatRef.current = maxS
      setScrollOffsetState(maxS)
      return false
    }
    scrollFloatRef.current = pos
    const rendered = Math.round(pos)
    setScrollOffsetState((prev) => (prev === rendered ? prev : rendered))
    return true
  }, [])

  const startMomentum = useCallback(() => {
    if (loopRef.current !== null) return
    setIsAnimating(true)
    loopRef.current = setInterval(() => {
      if (!momentumStep()) stopKinetic()
    }, KINETIC_FRAME_MS)
  }, [momentumStep, stopKinetic])

  const enterMomentum = useCallback(() => {
    const v = velocityRef.current
    if (Math.abs(v) < 1) {
      velocityRef.current = 0
      return
    }
    const maxS = maxScrollRef.current
    const startPos = scrollFloatRef.current
    const amplitude = v * (KINETIC_TIME_CONSTANT_MS / 1000)
    const rawTarget = startPos + amplitude
    const clampedTarget = Math.max(0, Math.min(Number.isFinite(maxS) ? maxS : rawTarget, rawTarget))
    momentumRef.current = {
      startPos,
      amplitude: clampedTarget - startPos,
      startTime: performance.now(),
    }
    velocityRef.current = 0
    startMomentum()
  }, [startMomentum])

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
      stopKinetic()
      clearReleaseTimer()
      const now = performance.now()
      const rawDt = lastWheelTimeRef.current === 0 ? WHEEL_ISOLATED_DT_MS : now - lastWheelTimeRef.current
      const dt = Math.max(1, Math.min(WHEEL_ISOLATED_DT_MS, rawDt))
      const accel = Math.min(
        WHEEL_ACCEL_MAX,
        Math.max(1, WHEEL_ACCEL_REFERENCE_DT_MS / dt),
      )
      const stepRows = WHEEL_BASE_STEP * accel
      lastWheelTimeRef.current = now
      const maxS = maxScrollRef.current
      let nextFloat = scrollFloatRef.current + dir * stepRows
      if (nextFloat < 0) nextFloat = 0
      else if (nextFloat > maxS) nextFloat = maxS
      scrollFloatRef.current = nextFloat
      const rendered = Math.round(nextFloat)
      setScrollOffsetState((prev) => (prev === rendered ? prev : rendered))
      const vSample = dt >= WHEEL_ISOLATED_DT_MS ? 0 : (dir * stepRows) / (dt / 1000)
      velocityRef.current = Math.max(
        -KINETIC_MAX_VELOCITY,
        Math.min(KINETIC_MAX_VELOCITY, vSample),
      )
      setIsScrolling(true)
      scheduleScrollbarHide()
      scheduleRelease()
    },
    [clearReleaseTimer, scheduleRelease, scheduleScrollbarHide, stopKinetic],
  )

  const setScrollOffset = useCallback(
    (offset: number) => {
      stopKinetic()
      clearReleaseTimer()
      velocityRef.current = 0
      lastWheelTimeRef.current = 0
      const clamped = Math.max(0, Math.min(maxScrollRef.current, offset))
      scrollFloatRef.current = clamped
      setScrollOffsetState(clamped)
    },
    [clearReleaseTimer, stopKinetic],
  )

  return { scrollOffset, onWheel, isScrolling, setScrollOffset, isAnimating }
}
