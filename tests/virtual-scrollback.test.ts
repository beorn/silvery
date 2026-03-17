/**
 * Tests for virtual scrollback buffer.
 */
import { describe, test, expect } from "vitest"
import { createVirtualScrollback } from "@silvery/term/virtual-scrollback"

describe("createVirtualScrollback", () => {
  test("starts empty", () => {
    const sb = createVirtualScrollback()
    expect(sb.totalLines).toBe(0)
  })

  test("push lines increases totalLines", () => {
    const sb = createVirtualScrollback()
    sb.push(["line 1", "line 2", "line 3"])
    expect(sb.totalLines).toBe(3)
  })

  test("getVisibleRows at offset=0 returns most recent lines", () => {
    const sb = createVirtualScrollback()
    sb.push(["A", "B", "C", "D", "E"])
    const rows = sb.getVisibleRows(0, 3)
    expect(rows).toEqual(["C", "D", "E"])
  })

  test("getVisibleRows at offset>0 returns older lines", () => {
    const sb = createVirtualScrollback()
    sb.push(["A", "B", "C", "D", "E"])
    const rows = sb.getVisibleRows(2, 3)
    expect(rows).toEqual(["A", "B", "C"])
  })

  test("getVisibleRows pads with empty strings when offset exceeds content", () => {
    const sb = createVirtualScrollback()
    sb.push(["A", "B"])
    const rows = sb.getVisibleRows(0, 4)
    expect(rows).toEqual(["", "", "A", "B"])
  })

  test("circular buffer wraps at maxLines", () => {
    const sb = createVirtualScrollback({ maxLines: 5 })
    sb.push(["A", "B", "C", "D", "E"])
    expect(sb.totalLines).toBe(5)

    // Push more — oldest lines should be evicted
    sb.push(["F", "G"])
    expect(sb.totalLines).toBe(5)

    // Most recent 5 should be C, D, E, F, G
    const rows = sb.getVisibleRows(0, 5)
    expect(rows).toEqual(["C", "D", "E", "F", "G"])
  })

  test("search finds matching lines", () => {
    const sb = createVirtualScrollback()
    sb.push(["Hello world", "Foo bar", "Hello again", "Baz"])
    const matches = sb.search("Hello")
    // Returns logical indices (0=oldest)
    expect(matches).toEqual([0, 2])
  })

  test("search is case-insensitive", () => {
    const sb = createVirtualScrollback()
    sb.push(["Hello World", "hello world", "HELLO WORLD"])
    const matches = sb.search("hello")
    expect(matches).toEqual([0, 1, 2])
  })

  test("search returns empty for no matches", () => {
    const sb = createVirtualScrollback()
    sb.push(["Hello", "World"])
    const matches = sb.search("xyz")
    expect(matches).toEqual([])
  })

  test("search with empty query returns empty", () => {
    const sb = createVirtualScrollback()
    sb.push(["Hello"])
    const matches = sb.search("")
    expect(matches).toEqual([])
  })

  test("clear resets everything", () => {
    const sb = createVirtualScrollback()
    sb.push(["A", "B", "C"])
    expect(sb.totalLines).toBe(3)

    sb.clear()
    expect(sb.totalLines).toBe(0)
    const rows = sb.getVisibleRows(0, 3)
    expect(rows).toEqual(["", "", ""])
  })
})
