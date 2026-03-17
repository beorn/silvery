import { describe, expect, it } from "vitest"
import { createHistoryBuffer } from "@silvery/term/history-buffer"
import { createListDocument } from "@silvery/term/list-document"
import type { HistoryItem } from "@silvery/term/history-buffer"

function item(key: string, lines: string[]): HistoryItem {
  return { key, ansi: lines.join("\n"), rows: lines, plainTextRows: lines, width: 80 }
}

describe("ListDocument", () => {
  it("empty history + empty live = 0 rows", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(
      history,
      () => [],
      () => [],
    )
    expect(doc.totalRows).toBe(0)
    expect(doc.frozenRows).toBe(0)
    expect(doc.liveRows).toBe(0)
  })

  it("frozen rows come before live rows", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["frozen-0", "frozen-1"]))

    const liveRows = ["live-0", "live-1", "live-2"]
    const doc = createListDocument(
      history,
      () => liveRows,
      () => liveRows,
    )

    expect(doc.frozenRows).toBe(2)
    expect(doc.liveRows).toBe(3)
    expect(doc.totalRows).toBe(5)

    expect(doc.getRows(0, 5)).toEqual(["frozen-0", "frozen-1", "live-0", "live-1", "live-2"])
  })

  it("getRows handles cross-boundary reads", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["f0"]))

    const doc = createListDocument(
      history,
      () => ["l0"],
      () => ["l0"],
    )
    expect(doc.getRows(0, 2)).toEqual(["f0", "l0"])
  })

  it("getRows returns empty strings for out-of-range", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(
      history,
      () => ["x"],
      () => ["x"],
    )
    expect(doc.getRows(5, 2)).toEqual(["", ""])
  })

  it("getPlainTextRows returns plain text from both regions", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["frozen"]))

    const doc = createListDocument(
      history,
      () => ["live"],
      () => ["live-plain"],
    )
    expect(doc.getPlainTextRows(0, 2)).toEqual(["frozen", "live-plain"])
  })

  it("getSource identifies frozen vs live", () => {
    const history = createHistoryBuffer()
    history.push(item("card-1", ["r0", "r1"]))

    const doc = createListDocument(
      history,
      () => ["live"],
      () => ["live"],
    )

    const s0 = doc.getSource(0)
    expect(s0).toEqual({ type: "frozen", itemKey: "card-1", localRow: 0 })

    const s1 = doc.getSource(1)
    expect(s1).toEqual({ type: "frozen", itemKey: "card-1", localRow: 1 })

    const s2 = doc.getSource(2)
    expect(s2).toEqual({ type: "live", itemIndex: 0, localRow: 0 })

    expect(doc.getSource(-1)).toBeNull()
    expect(doc.getSource(99)).toBeNull()
  })

  it("search finds matches across frozen and live", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["hello world", "nothing"]))

    const doc = createListDocument(
      history,
      () => ["world hello"],
      () => ["world hello"],
    )

    const matches = doc.search("hello")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ row: 0, startCol: 0, endCol: 5 })
    expect(matches[1]).toEqual({ row: 2, startCol: 6, endCol: 11 })
  })

  it("search finds multiple matches on same line", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(
      history,
      () => ["aa bb aa"],
      () => ["aa bb aa"],
    )

    const matches = doc.search("aa")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ row: 0, startCol: 0, endCol: 2 })
    expect(matches[1]).toEqual({ row: 0, startCol: 6, endCol: 8 })
  })

  it("search is case insensitive", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["Hello"]))

    const doc = createListDocument(
      history,
      () => [],
      () => [],
    )
    const matches = doc.search("hello")
    expect(matches).toHaveLength(1)
    expect(matches[0]!.row).toBe(0)
  })

  it("search returns empty for empty query", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(
      history,
      () => ["x"],
      () => ["x"],
    )
    expect(doc.search("")).toEqual([])
  })

  it("reflects live content changes dynamically", () => {
    const history = createHistoryBuffer()
    let live = ["a"]
    const doc = createListDocument(
      history,
      () => live,
      () => live,
    )

    expect(doc.totalRows).toBe(1)
    live = ["a", "b", "c"]
    expect(doc.totalRows).toBe(3)
    expect(doc.getRows(0, 3)).toEqual(["a", "b", "c"])
  })
})
