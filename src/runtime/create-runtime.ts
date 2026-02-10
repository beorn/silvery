/**
 * Create the inkx-loop runtime kernel.
 *
 * The runtime owns the event loop, diffing, and output. Users interact via:
 * - events() - AsyncIterable of all events (keys, resize, effects)
 * - schedule() - Queue effects for async execution
 * - render() - Output a buffer (diffing handled internally)
 *
 * NOTE: This runtime is designed for single-consumer use. Calling events()
 * multiple times concurrently will cause events to be split between consumers.
 * Each call returns a fresh AsyncIterable, but they share the underlying queue.
 *
 * @example
 * ```typescript
 * using runtime = createRuntime({ target: termTarget })
 *
 * for await (const event of runtime.events()) {
 *   state = reducer(state, event)
 *   runtime.render(layout(view(state), runtime.getDims()))
 * }
 * ```
 */

import { takeUntil } from "../streams/index.js"
import { diff } from "./diff.js"
import type { Buffer, Dims, Event, Runtime, RuntimeOptions } from "./types.js"

// =============================================================================
// Event Channel - unified async iterable for all internal events
// =============================================================================

interface EventChannel {
  push(event: Event): void
  events(): AsyncIterable<Event>
  dispose(): void
}

/**
 * Create an event channel that bridges callbacks to AsyncIterable.
 *
 * This is the single point where callbacks (resize, effect completion)
 * are converted to the async iterable pattern. External sources like
 * keyboard events are already AsyncIterable and merged at a higher level.
 */
function createEventChannel(signal: AbortSignal): EventChannel {
  const queue: Event[] = []
  let pendingResolve: ((event: Event | null) => void) | undefined
  let disposed = false

  // Resolve pending waiter on abort
  const onAbort = () => {
    if (pendingResolve) {
      pendingResolve(null)
      pendingResolve = undefined
    }
  }
  signal.addEventListener("abort", onAbort, { once: true })

  return {
    push(event: Event): void {
      if (disposed || signal.aborted) return

      if (pendingResolve) {
        const r = pendingResolve
        pendingResolve = undefined
        r(event)
      } else {
        queue.push(event)
      }
    },

    events(): AsyncIterable<Event> {
      return {
        [Symbol.asyncIterator](): AsyncIterator<Event> {
          return {
            async next(): Promise<IteratorResult<Event>> {
              if (disposed || signal.aborted) {
                return { done: true, value: undefined }
              }

              // Return queued event if available
              if (queue.length > 0) {
                return { done: false, value: queue.shift()! }
              }

              // Wait for next event or abort
              const event = await new Promise<Event | null>((resolve) => {
                pendingResolve = resolve
              })

              if (event === null || disposed || signal.aborted) {
                return { done: true, value: undefined }
              }

              return { done: false, value: event }
            },
          }
        },
      }
    },

    dispose(): void {
      disposed = true
      signal.removeEventListener("abort", onAbort)
      if (pendingResolve) {
        pendingResolve(null)
        pendingResolve = undefined
      }
    },
  }
}

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Create a runtime kernel.
 *
 * @param options Runtime configuration
 * @returns Runtime instance implementing Symbol.dispose
 */
export function createRuntime(options: RuntimeOptions): Runtime {
  const { target, signal: externalSignal } = options

  // Internal abort controller for cleanup
  const controller = new AbortController()
  const signal = controller.signal

  // Wire external signal if provided - track for cleanup
  let externalAbortHandler: (() => void) | undefined
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalAbortHandler = () => controller.abort()
      externalSignal.addEventListener("abort", externalAbortHandler, {
        once: true,
      })
    }
  }

  // Track previous buffer for diffing
  let prevBuffer: Buffer | null = null

  // Track if disposed
  let disposed = false

  // Unified event channel for resize and effect events
  const eventChannel = createEventChannel(signal)

  // Subscribe to resize events if supported
  let unsubscribeResize: (() => void) | undefined
  if (target.onResize) {
    unsubscribeResize = target.onResize((dims) => {
      eventChannel.push({ type: "resize", cols: dims.cols, rows: dims.rows })
    })
  }

  // Effect ID counter
  let effectId = 0

  return {
    events(): AsyncIterable<Event> {
      // Return channel events wrapped with takeUntil for cleanup
      return takeUntil(eventChannel.events(), signal)
    },

    schedule<T>(
      effect: () => Promise<T>,
      opts?: { signal?: AbortSignal },
    ): void {
      if (disposed) return

      const id = `effect-${effectId++}`
      const effectSignal = opts?.signal

      // Check if already aborted
      if (effectSignal?.aborted) return

      // Execute effect asynchronously
      const execute = async () => {
        // Track abort handler for cleanup
        let abortHandler: (() => void) | undefined

        try {
          if (effectSignal) {
            // Create abort race with cleanup
            const aborted = new Promise<never>((_resolve, reject) => {
              abortHandler = () => reject(new Error("Effect aborted"))
              effectSignal.addEventListener("abort", abortHandler, {
                once: true,
              })
            })

            const result = await Promise.race([effect(), aborted])

            // Clean up abort listener after success
            if (abortHandler) {
              effectSignal.removeEventListener("abort", abortHandler)
            }

            eventChannel.push({ type: "effect", id, result })
          } else {
            const result = await effect()
            eventChannel.push({ type: "effect", id, result })
          }
        } catch (error) {
          // Clean up abort listener on error too
          if (abortHandler && effectSignal) {
            effectSignal.removeEventListener("abort", abortHandler)
          }

          // Check for abort by name (handles DOMException, AbortError, etc.)
          if (
            error instanceof Error &&
            (error.message === "Effect aborted" || error.name === "AbortError")
          ) {
            // Silently ignore aborted effects
            return
          }
          eventChannel.push({
            type: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      }

      // Start immediately (microtask)
      queueMicrotask(() => {
        void execute()
      })
    },

    render(buffer: Buffer): void {
      if (disposed) return

      // Compute diff internally
      const patch = diff(prevBuffer, buffer)
      prevBuffer = buffer

      // Write to target
      target.write(patch)
    },

    invalidate(): void {
      prevBuffer = null
    },

    getDims(): Dims {
      return target.getDims()
    },

    [Symbol.dispose](): void {
      if (disposed) return
      disposed = true

      // Abort all pending operations
      controller.abort()

      // Remove external signal listener if still attached
      if (externalAbortHandler && externalSignal) {
        externalSignal.removeEventListener("abort", externalAbortHandler)
      }

      // Unsubscribe from resize
      if (unsubscribeResize) {
        unsubscribeResize()
      }

      // Dispose event channel
      eventChannel.dispose()
    },
  }
}
