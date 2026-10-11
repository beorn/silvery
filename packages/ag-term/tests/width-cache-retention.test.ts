/**
 * DisplayWidthCache retention — @hab/dutiful-rss-leak / @si/render/28274.
 *
 * The cache's key IS the entire measured text. An entry-count cap is a byte
 * bound only while every key is short: a caller that measures a long line
 * makes each entry cost the line, so the real ceiling is maxSize * keyLength.
 * Measured pre-fix: a watcher pane handing silvery one 2 MB line per tick
 * grew ~15 MB per render, linearly, because the whole line was retained as a
 * key. MAX_KEY_LENGTH 4096 stopped caching the whole line; this file also
 * pins the remaining bound: bytes (2 bytes/char + 48) and isolated keys so a
 * slice of a multi-MB line cannot keep the parent rope alive.
 *
 * @failure A long-lived measurer cache grows with key characters, not entries:
 *          N measurers fed slices of multi-MB lines retain ~N × 82 MB, and a
 *          JSC substring of a 2 MB parent keeps the whole parent alive.
 * @level l2
 * @consumer @si/render/28274-displaywidthcache-bounded-by-key-characters
 * @testonly none
 */
import { describe, test, expect, vi } from "vitest"
import { createBoundedStringCache } from "../src/bounded-cache.ts"
import { createMeasurer, DisplayWidthCache } from "../src/unicode.ts"

/** Matches @cto e84ed6d7: 2 bytes per key char + 48, 2 MiB per cache. */
const BYTES_PER_CHAR = 2
const ENTRY_OVERHEAD = 48
const MAX_CACHE_BYTES = 2 * 1024 * 1024

function forceGC(): void {
  const bunGc = (globalThis as { Bun?: { gc?: (force?: boolean) => void } }).Bun?.gc
  if (typeof bunGc === "function") bunGc(true)
  const nodeGc = (globalThis as { gc?: () => void }).gc
  if (typeof nodeGc === "function") nodeGc()
}

describe("DisplayWidthCache: entry count is not a byte bound", () => {
  // Proves: a key over the cap is measured but never retained, so one long
  // line cannot spend the cache's budget. Fails pre-fix (size 1, not 0).
  test("a key over the cap is not retained", () => {
    const cache = new DisplayWidthCache(100)
    const huge = "x".repeat(5000)
    cache.set(huge, 5000)
    expect(cache.size).toBe(0)
    expect(cache.get(huge)).toBeUndefined()
  })

  // Proves: many DISTINCT over-cap keys stay flat — the leak's own shape
  // (distinct long strings, one retained copy each pre-fix).
  test("distinct over-cap keys cannot accumulate", () => {
    const cache = new DisplayWidthCache(100)
    for (let i = 0; i < 200; i++) cache.set("y".repeat(5000) + `#${i}`, 5000)
    expect(cache.size).toBe(0)
  })

  // Proves: skipping the cache does not change the measured width, on every
  // call, for plain and ANSI-carrying text. Short keys are still cached.
  test("an over-cap string measures the same with and without the cache", () => {
    const measurer = createMeasurer()
    const plain = "x".repeat(5000)
    const styled = `\u001b[32m${plain}\u001b[0m`
    expect(measurer.displayWidthAnsi(plain)).toBe(5000)
    expect(measurer.displayWidthAnsi(plain)).toBe(5000)
    expect(measurer.displayWidthAnsi(styled)).toBe(5000)
    expect(measurer.displayWidthAnsi(styled)).toBe(5000)

    const cache = new DisplayWidthCache(100)
    cache.set("hello", 5)
    expect(cache.size).toBe(1)
    expect(cache.get("hello")).toBe(5)
  })

  // Proves: the pre-existing entry-count bound still evicts its short keys.
  test("eviction still bounds short keys at maxSize", () => {
    const cache = new DisplayWidthCache(3)
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, i)
    expect(cache.size).toBe(3)
    expect(cache.get("k0")).toBeUndefined()
    expect(cache.get("k9")).toBe(9)
  })

  // Proves: a cache whose keys are ~3000 chars cannot keep 10 000 of them.
  // Entry-count 10 000 would retain all of these; a 2 MiB byte budget cannot.
  test("long keys evict by byte budget before the entry cap", () => {
    const keyLen = 3000
    const perEntry = BYTES_PER_CHAR * keyLen + ENTRY_OVERHEAD
    const maxByBytes = Math.floor(MAX_CACHE_BYTES / perEntry)
    const cache = new DisplayWidthCache(10_000)
    const extra = 50
    for (let i = 0; i < maxByBytes + extra; i++) {
      const key = i.toString().padStart(8, "0") + "x".repeat(keyLen - 8)
      cache.set(key, keyLen)
    }
    expect(cache.size).toBeGreaterThan(0)
    expect(cache.size).toBeLessThanOrEqual(maxByBytes)
  })

  // @cto 5f7e1b17: a pure memo needs no idle age. Entries 10k + 2 MiB already
  // cap memory. Other caches keep TTL (clock read on hit, no timer);
  // DisplayWidthCache drops TTL so a per-cell hit does not call
  // performance.now(). The sibling timer contract only counts setTimeout.
  test("a hit calls performance.now zero times", () => {
    const ttlCache = createBoundedStringCache<number>({ max: 10 })
    ttlCache.set("hello", 5)
    const ttlSpy = vi.spyOn(performance, "now")
    expect(ttlCache.get("hello")).toBe(5)
    const ttlReads = ttlSpy.mock.calls.length
    ttlSpy.mockRestore()
    expect(ttlReads).toBeGreaterThan(0)

    const cache = new DisplayWidthCache(100)
    cache.set("hello", 5)
    const spy = vi.spyOn(performance, "now")
    expect(cache.get("hello")).toBe(5)
    expect(spy).toHaveBeenCalledTimes(0)
    spy.mockRestore()
  })
})

describe("DisplayWidthCache: heap after GC stays under N × byte budget", () => {
  // Proves AC2: N measurers fed keys sliced from a multi-MB line, parent
  // dropped, forced GC. Each parent is distinct so the cache cannot collapse
  // to one key. Without isolating the key, JSC keeps each parent rope alive
  // behind the 2 kB slice (~600 kB UTF-16 × 8 slices × N).
  test(
    "N measurers caching slices of dropped multi-MB lines stay under N × 2 MiB",
    { timeout: 30_000 },
    () => {
      const N = 3
      const parentChars = 300_000
      const sliceLen = 2000
      const slices = 8
      const budget = N * MAX_CACHE_BYTES

      forceGC()
      forceGC()
      const before = process.memoryUsage().heapUsed

      const measurers = Array.from({ length: N }, () => createMeasurer())
      for (let m = 0; m < N; m++) {
        const measurer = measurers[m]!
        for (let i = 0; i < slices; i++) {
          let parent: string | undefined = `${m}:${i}:` + "p".repeat(parentChars)
          measurer.displayWidth(parent.slice(0, sliceLen))
          parent = undefined
        }
      }

      forceGC()
      forceGC()
      const growth = process.memoryUsage().heapUsed - before
      expect(growth).toBeLessThan(budget)
    },
  )
})
