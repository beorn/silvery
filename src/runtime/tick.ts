/**
 * Time/tick source for inkx-loop.
 *
 * Creates an AsyncIterable that yields at regular intervals.
 * Used for animations, spinners, progress bars, etc.
 */

/**
 * Create a tick source that yields at regular intervals.
 *
 * The tick source respects AbortSignal for cleanup and stops
 * when the signal is aborted.
 *
 * @param intervalMs Interval between ticks in milliseconds
 * @param signal Optional AbortSignal to stop the tick source
 * @returns AsyncIterable that yields tick numbers (0, 1, 2, ...)
 *
 * @example
 * ```typescript
 * const controller = new AbortController()
 * const ticks = createTick(100, controller.signal)
 *
 * for await (const tick of ticks) {
 *   console.log(`Tick ${tick}`)
 *   if (tick >= 10) controller.abort()
 * }
 * ```
 */
export function createTick(
  intervalMs: number,
  signal?: AbortSignal,
): AsyncIterable<number> {
  return {
    [Symbol.asyncIterator]: () => createTickIterator(intervalMs, signal),
  }
}

/**
 * Create the actual tick iterator.
 */
function createTickIterator(
  intervalMs: number,
  signal?: AbortSignal,
): AsyncIterator<number> {
  let count = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingResolve: ((result: IteratorResult<number>) => void) | undefined
  let pendingReject: ((error: Error) => void) | undefined
  let done = false

  // Handle abort signal
  const onAbort = () => {
    done = true
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pendingResolve) {
      pendingResolve({ done: true, value: undefined })
      pendingResolve = undefined
      pendingReject = undefined
    }
  }

  if (signal) {
    if (signal.aborted) {
      done = true
    } else {
      signal.addEventListener("abort", onAbort, { once: true })
    }
  }

  return {
    async next(): Promise<IteratorResult<number>> {
      if (done) {
        return { done: true, value: undefined }
      }

      return new Promise<IteratorResult<number>>((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject

        timer = setTimeout(() => {
          if (!done) {
            const value = count++
            pendingResolve = undefined
            pendingReject = undefined
            resolve({ done: false, value })
          }
        }, intervalMs)
      })
    },

    async return(): Promise<IteratorResult<number>> {
      done = true
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort)
      }
      if (pendingResolve) {
        pendingResolve({ done: true, value: undefined })
        pendingResolve = undefined
        pendingReject = undefined
      }
      return { done: true, value: undefined }
    },
  }
}

/**
 * Create a tick source that yields at approximately 60fps (~16ms).
 *
 * @param signal Optional AbortSignal to stop the tick source
 * @returns AsyncIterable that yields frame numbers
 */
export function createFrameTick(signal?: AbortSignal): AsyncIterable<number> {
  return createTick(16, signal)
}

/**
 * Create a tick source that yields once per second.
 *
 * @param signal Optional AbortSignal to stop the tick source
 * @returns AsyncIterable that yields second counts
 */
export function createSecondTick(signal?: AbortSignal): AsyncIterable<number> {
  return createTick(1000, signal)
}

/**
 * Create a tick source with adaptive timing based on render performance.
 *
 * This is useful for maintaining a target frame rate while allowing
 * for slower frames when needed.
 *
 * @param targetFps Target frames per second (default: 60)
 * @param signal Optional AbortSignal to stop the tick source
 * @returns AsyncIterable with timing information
 */
export function createAdaptiveTick(
  targetFps = 60,
  signal?: AbortSignal,
): AsyncIterable<{ tick: number; elapsed: number; delta: number }> {
  const targetMs = 1000 / targetFps
  let lastTime = Date.now()
  let tick = 0

  return {
    [Symbol.asyncIterator]: () => {
      let done = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let pendingResolve:
        | ((
            result: IteratorResult<{
              tick: number
              elapsed: number
              delta: number
            }>,
          ) => void)
        | undefined

      const onAbort = () => {
        done = true
        if (timer) {
          clearTimeout(timer)
          timer = undefined
        }
        if (pendingResolve) {
          pendingResolve({ done: true, value: undefined })
          pendingResolve = undefined
        }
      }

      if (signal) {
        if (signal.aborted) {
          done = true
        } else {
          signal.addEventListener("abort", onAbort, { once: true })
        }
      }

      return {
        async next(): Promise<
          IteratorResult<{ tick: number; elapsed: number; delta: number }>
        > {
          if (done) {
            return { done: true, value: undefined }
          }

          return new Promise((resolve) => {
            pendingResolve = resolve
            const now = Date.now()
            const elapsed = now - lastTime
            const delay = Math.max(0, targetMs - elapsed)

            timer = setTimeout(() => {
              if (!done) {
                const currentTime = Date.now()
                const delta = currentTime - lastTime
                lastTime = currentTime
                pendingResolve = undefined
                resolve({
                  done: false,
                  value: { tick: tick++, elapsed: currentTime, delta },
                })
              }
            }, delay)
          })
        },

        async return(): Promise<
          IteratorResult<{ tick: number; elapsed: number; delta: number }>
        > {
          done = true
          if (timer) {
            clearTimeout(timer)
            timer = undefined
          }
          if (signal) {
            signal.removeEventListener("abort", onAbort)
          }
          if (pendingResolve) {
            pendingResolve({ done: true, value: undefined })
            pendingResolve = undefined
          }
          return { done: true, value: undefined }
        },
      }
    },
  }
}
