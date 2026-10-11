import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createBoundedStringCache as termCache } from "../../packages/ag-term/src/bounded-cache"
import { createBoundedStringCache as syntaxCache } from "../../packages/syntax/src/bounded-cache"

// The bounded caches check age on read, never by a timer: a timer behind each read showed up as a stray timer in
// every fake-timer contract that counts them (Pulse synchronization, silvery CI Tests #855 / Verify #1057).
// Expiry itself is lru-cache's: it reads the performance clock it captured at import, which fake timers cannot move.
describe("contract: bounded caches arm no timer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test.each([
    ["ag-term", termCache],
    ["syntax", syntaxCache],
  ] as const)("%s: set, get and has leave no timer", (_name, create) => {
    const cache = create<number>({ ttl: 1000 })
    cache.set("key", 1)
    expect(cache.get("key")).toBe(1)
    expect(cache.has("key")).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
