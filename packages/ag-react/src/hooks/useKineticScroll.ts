/**
 * useKineticScroll — wheel-event state machine with iOS-style kinetic
 * momentum for any scroll container (plain Box with `overflow="scroll"`
 * that accepts row-space scrollOffset; ListView bakes this in already).
 *
 * ## Usage
 *
 *   const { scrollOffset, onWheel, isScrolling } = useKineticScroll({
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
 * ## Physics (shares ListView.tsx's model)
 *
 * - Each wheel event: apply immediate 1-row displacement; push applied
 *   displacement into a rolling buffer of the last ~150ms.
 * - No per-event inverse-dt acceleration — event frequency itself encodes
 *   speed (fast trackpad = many events = fast scroll naturally).
 * - Release (no wheel for ~60ms) → velocity = Σ(bufferRows) /
 *   (last.t − first.t) × 1000; closed-form exponential decay
 *   pos(t) = start + amplitude·(1 − e^(−t/τ)) with τ=180ms, gained and
 *   hard-capped so momentum coasts a modest, predictable distance.
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

/** Rows moved per wheel event. Event frequency encodes speed — no per-event
 * acceleration multiplier (pro review recommendation). */
const WHEEL_STEP_ROWS = 1
/** Rolling window for velocity estimation. */
const WHEEL_VELOCITY_WINDOW_MS = 150
/** Sustained-direction threshold before a lone opposite event is treated
 * as trackpad jitter and dropped. Two consecutive opposites always commit. */
const SUSTAINED_SCROLL_THRESHOLD = 3

/** Max absolute velocity (rows/sec). */
const KINETIC_MAX_VELOCITY = 40
/** Momentum time constant (ms). */
const KINETIC_TIME_CONSTANT_MS = 180
/** Dampen coast distance below v·τ. */
const KINETIC_MOMENTUM_GAIN = 0.6
/** Hard cap on coast distance (rows). */
const KINETIC_MAX_COAST_ROWS = 10
/** Stop momentum after this many τ (6τ → within 0.25% of target). */
const KINETIC_STOP_AFTER_TAU_MULTIPLES = 6
/** Stop when remaining distance falls below this (rows). */
const KINETIC_STOP_DISTANCE = 1.5
/** 60Hz momentum animation. */
const KINETIC_FRAME_MS = 16
/** Wait this long with no wheel events before entering momentum. */
const RELEASE_TIMEOUT_MS = 60
/** Scrollbar auto-hide delay after the last scroll activity. */
export const SCROLLBAR_FADE_AFTER_MS = 800

export interface UseKineticScrollOptions {
  /** Upper bound for `scrollOffset` (rows). Undefined = "not yet known". */
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
   * the last one. */
  isScrolling: boolean
  /** Imperatively set the scroll offset. Cancels any in-flight kinetic. */
  setScrollOffset: (offset: number) => void
  /** True while the momentum animation loop is running. */
  isAnimating: boolean
}

export function useKineticScroll(options: UseKineticScrollOptions = {}): UseKineticScrollResult {
  const { maxScroll, initialOffset = 0 } = options
  const [scrollOffset, setScrollOffsetState] = useState<number>(initialOffset)
  const [isScrolling, setIsScrolling] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const scrollFloatRef = useRef<number>(initialOffset)
  // Rolling event buffer — { time, applied rows }.
  const wheelBufferRef = useRef<Array<{ t: number; rows: number }>>([])
  // Directional coalescing state — see ListView.tsx for rationale.
  const sustainedDirRef = useRef(0)
  const consecSameRef = useRef(0)
  const consecOppRef = useRef(0)
  const momentumRef = useRef<{
    startPos: number
    amplitude: number
    startTime: number
  } | null>(null)
  const maxScrollRef = useRef(maxScroll ?? Number.POSITIVE_INFINITY)
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const buf = wheelBufferRef.current
    while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
    if (buf.length < 2) {
      wheelBufferRef.current = []
      return
    }
    const netRows = buf.reduce((s, e) => s + e.rows, 0)
    const first = buf[0]!
    const last = buf[buf.length - 1]!
    const spanMs = Math.max(1, last.t - first.t)
    const rawV = (netRows / spanMs) * 1000
    const v = Math.max(-KINETIC_MAX_VELOCITY, Math.min(KINETIC_MAX_VELOCITY, rawV))
    wheelBufferRef.current = []
    if (Math.abs(v) < 1) return
    const maxS = maxScrollRef.current
    const startPos = scrollFloatRef.current
    const rawAmplitude = v * (KINETIC_TIME_CONSTANT_MS / 1000) * KINETIC_MOMENTUM_GAIN
    const amplitude = Math.max(
      -KINETIC_MAX_COAST_ROWS,
      Math.min(KINETIC_MAX_COAST_ROWS, rawAmplitude),
    )
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
      const buf = wheelBufferRef.current
      while (buf.length > 0 && now - buf[0]!.t > WHEEL_VELOCITY_WINDOW_MS) buf.shift()
      // Gesture boundary: buffer empty after trim = pause > WINDOW_MS.
      if (buf.length === 0) {
        sustainedDirRef.current = 0
        consecSameRef.current = 0
        consecOppRef.current = 0
      }
      // Drop a lone opposite event during a sustained same-direction streak.
      if (sustainedDirRef.current === 0) {
        sustainedDirRef.current = dir
        consecSameRef.current = 1
        consecOppRef.current = 0
      } else if (dir === sustainedDirRef.current) {
        consecSameRef.current += 1
        consecOppRef.current = 0
      } else {
        if (consecSameRef.current >= SUSTAINED_SCROLL_THRESHOLD && consecOppRef.current === 0) {
          consecOppRef.current = 1
          return
        }
        sustainedDirRef.current = dir
        consecSameRef.current = 1
        consecOppRef.current = 0
      }
      const maxS = maxScrollRef.current
      const prev = scrollFloatRef.current
      const rawNext = prev + dir * WHEEL_STEP_ROWS
      let nextFloat = rawNext
      if (nextFloat < 0) nextFloat = 0
      else if (Number.isFinite(maxS) && nextFloat > maxS) nextFloat = maxS
      const appliedRows = nextFloat - prev
      scrollFloatRef.current = nextFloat
      const rendered = Math.round(nextFloat)
      setScrollOffsetState((prevInt) => (prevInt === rendered ? prevInt : rendered))
      if (appliedRows !== 0) {
        buf.push({ t: now, rows: appliedRows })
      }
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
      wheelBufferRef.current = []
      sustainedDirRef.current = 0
      consecSameRef.current = 0
      consecOppRef.current = 0
      const maxS = maxScrollRef.current
      const clamped = Math.max(0, Number.isFinite(maxS) ? Math.min(maxS, offset) : offset)
      scrollFloatRef.current = clamped
      setScrollOffsetState(clamped)
    },
    [clearReleaseTimer, stopKinetic],
  )

  return { scrollOffset, onWheel, isScrolling, setScrollOffset, isAnimating }
}
