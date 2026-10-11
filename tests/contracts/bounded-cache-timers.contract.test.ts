import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import * as agTermCache from "../../packages/ag-term/src/bounded-cache"
import * as syntaxCache from "../../packages/syntax/src/bounded-cache"

// The bounded caches check age on read, never by a timer: a timer behind each read showed up as a stray timer in
// every fake-timer contract that counts them (Pulse synchronization, silvery CI Tests #855 / Verify #1057).
// Expiry itself is lru-cache's: it reads the performance clock it captured at import, which fake timers cannot move.
//
// 28632: there is ONE implementation (packages/syntax/src/bounded-cache.ts); ag-term re-exports it. The identity
// assertion below is the regression guard whose absence let the two hand-kept copies drift.
describe("contract: bounded caches arm no timer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("ag-term and syntax export one shared module identity", () => {
    expect(agTermCache.createBoundedStringCache).toBe(syntaxCache.createBoundedStringCache)
    expect(agTermCache.contentKeySize).toBe(syntaxCache.contentKeySize)
  })

  test("set, get and has leave no timer", () => {
    const cache = syntaxCache.createBoundedStringCache<number>({ ttl: 1000 })
    cache.set("key", 1)
    expect(cache.get("key")).toBe(1)
    expect(cache.has("key")).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
