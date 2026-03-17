import { describe, expect, it } from "vitest"
import { createHistoryBuffer, createHistoryItem } from "@silvery/term/history-buffer"

function item(key: string, lines: string[], width = 80): ReturnType<typeof createHistoryItem> {
  return { key, ansi: lines.join("\n"), rows: lines, plainTextRows: lines, width }
}

describe("HistoryBuffer", () => {
  it("starts empty", () => {
    const buf = createHistoryBuffer()
    expect(buf.totalRows).toBe(0)
    expect(buf.itemCount).toBe(0)
    expect(buf.maxRows).toBe(10_000)
  })

  it("push increases totalRows and itemCount", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["line 1", "line 2"]))
    expect(buf.totalRows).toBe(2)
    expect(buf.itemCount).toBe(1)

    buf.push(item("b", ["line 3"]))
    expect(buf.totalRows).toBe(3)
    expect(buf.itemCount).toBe(2)
  })

  it("getRows returns correct rows in order", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["alpha", "beta"]))
    buf.push(item("b", ["gamma"]))

    expect(buf.getRows(0, 3)).toEqual(["alpha", "beta", "gamma"])
    expect(buf.getRows(1, 2)).toEqual(["beta", "gamma"])
    expect(buf.getRows(2, 1)).toEqual(["gamma"])
  })

  it("getRows returns empty strings for out-of-range", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["hello"]))
    expect(buf.getRows(5, 2)).toEqual(["", ""])
    expect(buf.getRows(-1, 1)).toEqual([""])
  })

  it("getPlainTextRows returns plain text", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["plain one", "plain two"]))
    expect(buf.getPlainTextRows(0, 2)).toEqual(["plain one", "plain two"])
  })

  it("evicts oldest items when exceeding maxRows", () => {
    const buf = createHistoryBuffer(5)
    buf.push(item("a", ["1", "2", "3"])) // 3 rows
    buf.push(item("b", ["4", "5", "6"])) // 6 total → evict "a" → 3 rows
    expect(buf.totalRows).toBe(3)
    expect(buf.itemCount).toBe(1)
    expect(buf.getRows(0, 3)).toEqual(["4", "5", "6"])
  })

  it("evicts multiple items to fit under maxRows", () => {
    const buf = createHistoryBuffer(4)
    buf.push(item("a", ["1"]))
    buf.push(item("b", ["2"]))
    buf.push(item("c", ["3"]))
    buf.push(item("d", ["4"]))
    expect(buf.totalRows).toBe(4)

    buf.push(item("e", ["5", "6", "7"])) // 7 total → evict a,b,c → "d","5","6","7" = 4
    expect(buf.totalRows).toBe(4)
    expect(buf.getRows(0, 4)).toEqual(["4", "5", "6", "7"])
  })

  it("search finds case-insensitive matches and returns row indices", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["Hello World", "foo bar"]))
    buf.push(item("b", ["hello again"]))

    expect(buf.search("hello")).toEqual([0, 2])
    expect(buf.search("FOO")).toEqual([1])
    expect(buf.search("")).toEqual([])
    expect(buf.search("nonexistent")).toEqual([])
  })

  it("getItemAtRow resolves item and localRow", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["r0", "r1"]))
    buf.push(item("b", ["r2"]))

    const hit0 = buf.getItemAtRow(0)
    expect(hit0).not.toBeNull()
    expect(hit0!.item.key).toBe("a")
    expect(hit0!.localRow).toBe(0)

    const hit1 = buf.getItemAtRow(1)
    expect(hit1!.item.key).toBe("a")
    expect(hit1!.localRow).toBe(1)

    const hit2 = buf.getItemAtRow(2)
    expect(hit2!.item.key).toBe("b")
    expect(hit2!.localRow).toBe(0)

    expect(buf.getItemAtRow(3)).toBeNull()
    expect(buf.getItemAtRow(-1)).toBeNull()
  })

  it("clear resets to empty", () => {
    const buf = createHistoryBuffer()
    buf.push(item("a", ["x", "y"]))
    buf.clear()
    expect(buf.totalRows).toBe(0)
    expect(buf.itemCount).toBe(0)
    expect(buf.getRows(0, 1)).toEqual([""])
  })

  it("createHistoryItem splits ANSI and strips", () => {
    const ansi = "\x1b[31mred\x1b[0m\nnormal"
    const hi = createHistoryItem("k", ansi, 80)
    expect(hi.rows).toEqual(["\x1b[31mred\x1b[0m", "normal"])
    expect(hi.plainTextRows).toEqual(["red", "normal"])
    expect(hi.key).toBe("k")
    expect(hi.width).toBe(80)
  })
})
