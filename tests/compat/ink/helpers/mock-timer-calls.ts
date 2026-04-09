/**
 * Copy of ink/test/helpers/mock-timer-calls.ts.
 * Used by use-animation tests to spy on setTimeout/clearTimeout call counts.
 */
export default function mockTimerCalls() {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let setTimeoutCallCount = 0
  let clearTimeoutCallCount = 0
  const timeoutDelays: number[] = []

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
    setTimeoutCallCount++
    timeoutDelays.push(timeout ?? 0)
    return originalSetTimeout(handler, timeout)
  }) as typeof setTimeout

  globalThis.clearTimeout = ((timer: Parameters<typeof globalThis.clearTimeout>[0]) => {
    clearTimeoutCallCount++
    originalClearTimeout(timer as never)
  }) as typeof globalThis.clearTimeout

  return {
    get setTimeoutCallCount() {
      return setTimeoutCallCount
    },
    get clearTimeoutCallCount() {
      return clearTimeoutCallCount
    },
    get timeoutDelays() {
      return timeoutDelays
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    },
  }
}
