/**
 * DisplayWidthCache retention — @hab/dutiful-rss-leak.
 *
 * The cache's key IS the entire measured text, but it is sized in ENTRIES
 * (10 000). That is a byte bound only while every key is short: a caller that
 * measures a long line makes each entry cost the line, so the real ceiling is
 * maxSize * keyLength. Measured pre-fix: a watcher pane handing silvery one
 * 2 MB line per tick grew ~15 MB per render, linearly, because the whole line
 * was retained as a key.
 *
 * Deterministic: entry counts, no GC and no heap thresholds.
 */
import { describe, test, expect } from "vitest"
import { createMeasurer, DisplayWidthCache } from "../src/unicode.ts"

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
})
