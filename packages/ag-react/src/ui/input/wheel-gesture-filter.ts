export type WheelGestureDirection = -1 | 1

export interface WheelGestureSample {
  t: number
  deltaY: number
}

type StreamingState = {
  phase: "streaming"
  dir: WheelGestureDirection
  eventCount: number
  lastEventTime: number
}

type PendingState = {
  phase: "pending"
  original: StreamingState
  pendingDir: WheelGestureDirection
  pending: WheelGestureSample[]
  hasInterleavedOriginal: boolean
  lastEventTime: number
}

type WheelGestureState = { phase: "idle" } | StreamingState | PendingState

export interface WheelGestureFilterOptions {
  /**
   * Time after which a new wheel event is treated as a fresh gesture. This
   * does not resolve short tails; it only prevents stale direction bias from
   * carrying across separate user gestures.
   */
  contextExpiryMs?: number
}

const DEFAULT_CONTEXT_EXPIRY_MS = 500
const DEFAULT_REVERSAL_CONFIRMATION_WINDOW_MS = 250
const PENDING_INTERLEAVE_MAX_GAP_MS = 64

const directionOf = (deltaY: number): WheelGestureDirection | 0 => {
  const sign = Math.sign(deltaY)
  if (sign > 0) return 1
  if (sign < 0) return -1
  return 0
}

/**
 * Direction-confirmation filter for wheel streams.
 *
 * A single opposite-direction wheel sample is ambiguous on trackpads: it may
 * be native inertia bounce, or it may be the start of an intentional reversal.
 * The filter therefore buffers opposite samples and waits for enough
 * consecutive evidence to disambiguate:
 * - enough samples match the pending direction: replay them and reverse
 * - dense same-direction inertia arrives during the confirmation window:
 *   apply it without erasing pending reversal evidence
 * - release timeout with pending samples: drop them as an inertia tail
 */
export class WheelGestureFilter {
  #state: WheelGestureState = { phase: "idle" }
  readonly #contextExpiryMs: number

  constructor(options: WheelGestureFilterOptions = {}) {
    this.#contextExpiryMs = options.contextExpiryMs ?? DEFAULT_CONTEXT_EXPIRY_MS
  }

  process(sample: WheelGestureSample): WheelGestureSample[] {
    const dir = directionOf(sample.deltaY)
    if (dir === 0) return []

    if (this.#isExpired(sample.t)) this.reset()

    switch (this.#state.phase) {
      case "idle":
        this.#state = { phase: "streaming", dir, eventCount: 1, lastEventTime: sample.t }
        return [sample]

      case "streaming":
        if (dir === this.#state.dir) {
          this.#state = {
            ...this.#state,
            eventCount: this.#state.eventCount + 1,
            lastEventTime: sample.t,
          }
          return [sample]
        }
        this.#state = {
          phase: "pending",
          original: this.#state,
          pendingDir: dir,
          pending: [sample],
          hasInterleavedOriginal: false,
          lastEventTime: sample.t,
        }
        return []

      case "pending":
        if (this.#shouldDropPendingBeforeProcessing(sample.t)) {
          const original = this.#state.original
          this.#state = {
            phase: "streaming",
            dir: original.dir,
            eventCount: original.eventCount,
            lastEventTime: this.#state.lastEventTime,
          }
          return this.process(sample)
        }

        if (dir === this.#state.pendingDir) {
          const pending = [...this.#state.pending, sample]
          const required = this.#state.original.eventCount >= 3 ? 3 : 2
          if (pending.length < required) {
            this.#state = {
              ...this.#state,
              pending,
              lastEventTime: sample.t,
            }
            return []
          }
          this.#state = {
            phase: "streaming",
            dir,
            eventCount: pending.length,
            lastEventTime: sample.t,
          }
          return pending
        }
        {
          const original = {
            ...this.#state.original,
            eventCount: this.#state.original.eventCount + 1,
            lastEventTime: sample.t,
          }
          if (sample.t - this.#state.lastEventTime > PENDING_INTERLEAVE_MAX_GAP_MS) {
            this.#state = {
              phase: "streaming",
              dir: original.dir,
              eventCount: original.eventCount,
              lastEventTime: sample.t,
            }
            return [sample]
          }
          this.#state = {
            ...this.#state,
            original,
            hasInterleavedOriginal: true,
            lastEventTime: sample.t,
          }
          return [sample]
        }
    }
  }

  release(): void {
    if (this.#state.phase === "pending") {
      this.#state = {
        ...this.#state.original,
        lastEventTime: this.#state.lastEventTime,
      }
    }
  }

  reset(): void {
    this.#state = { phase: "idle" }
  }

  #isExpired(now: number): boolean {
    const state = this.#state
    if (state.phase === "idle") return false
    return now - state.lastEventTime > this.#contextExpiryMs
  }

  #shouldDropPendingBeforeProcessing(now: number): boolean {
    const state = this.#state
    if (state.phase !== "pending") return false
    const firstPending = state.pending[0]
    if (
      firstPending !== undefined &&
      now - firstPending.t > DEFAULT_REVERSAL_CONFIRMATION_WINDOW_MS
    ) {
      return true
    }
    return state.hasInterleavedOriginal && now - state.lastEventTime > PENDING_INTERLEAVE_MAX_GAP_MS
  }
}

export const createWheelGestureFilter = (options?: WheelGestureFilterOptions): WheelGestureFilter =>
  new WheelGestureFilter(options)
