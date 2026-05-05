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
 * - next sample returns to the original direction: drop pending, apply current
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
          lastEventTime: sample.t,
        }
        return []

      case "pending":
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
          const original = this.#state.original
          this.#state = {
            phase: "streaming",
            dir: original.dir,
            eventCount: original.eventCount + 1,
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
}

export const createWheelGestureFilter = (options?: WheelGestureFilterOptions): WheelGestureFilter =>
  new WheelGestureFilter(options)
