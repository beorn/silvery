import { describe, expect, it } from "vitest"
import { createHistoryBuffer } from "@silvery/term/history-buffer"
import { createListDocument } from "@silvery/term/list-document"
import type { HistoryItem } from "@silvery/term/history-buffer"
import type { LiveItemBlock } from "@silvery/term/list-document"

function item(key: string, lines: string[]): HistoryItem {
  return { key, ansi: lines.join("\n"), rows: lines, plainTextRows: lines, width: 80 }
}

function liveBlock(key: string, rows: string[], itemIndex = 0): LiveItemBlock {
  return { key, itemIndex, rows, plainTextRows: rows }
}

describe("ListDocument", () => {
  it("empty history + empty live = 0 rows", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [])
    expect(doc.totalRows).toBe(0)
    expect(doc.frozenRows).toBe(0)
    expect(doc.liveRows).toBe(0)
  })

  it("frozen rows come before live rows", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["frozen-0", "frozen-1"]))

    const liveItems: LiveItemBlock[] = [liveBlock("b", ["live-0", "live-1", "live-2"], 0)]
    const doc = createListDocument(history, () => liveItems)

    expect(doc.frozenRows).toBe(2)
    expect(doc.liveRows).toBe(3)
    expect(doc.totalRows).toBe(5)

    expect(doc.getRows(0, 5)).toEqual(["frozen-0", "frozen-1", "live-0", "live-1", "live-2"])
  })

  it("getRows handles cross-boundary reads", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["f0"]))

    const doc = createListDocument(history, () => [liveBlock("b", ["l0"], 0)])
    expect(doc.getRows(0, 2)).toEqual(["f0", "l0"])
  })

  it("getRows returns empty strings for out-of-range", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [liveBlock("a", ["x"], 0)])
    expect(doc.getRows(5, 2)).toEqual(["", ""])
  })

  it("getPlainTextRows returns plain text from both regions", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["frozen"]))

    const doc = createListDocument(history, () => [
      { key: "b", itemIndex: 0, rows: ["live"], plainTextRows: ["live-plain"] },
    ])
    expect(doc.getPlainTextRows(0, 2)).toEqual(["frozen", "live-plain"])
  })

  it("getSource identifies frozen vs live", () => {
    const history = createHistoryBuffer()
    history.push(item("card-1", ["r0", "r1"]))

    const doc = createListDocument(history, () => [liveBlock("card-2", ["live"], 0)])

    const s0 = doc.getSource(0)
    expect(s0).toEqual({ type: "frozen", itemKey: "card-1", localRow: 0 })

    const s1 = doc.getSource(1)
    expect(s1).toEqual({ type: "frozen", itemKey: "card-1", localRow: 1 })

    const s2 = doc.getSource(2)
    expect(s2).toEqual({ type: "live", itemIndex: 0, localRow: 0 })

    expect(doc.getSource(-1)).toBeNull()
    expect(doc.getSource(99)).toBeNull()
  })

  it("getSource handles multi-line live items correctly", () => {
    const history = createHistoryBuffer()
    history.push(item("frozen-1", ["f0"]))

    const doc = createListDocument(history, () => [
      liveBlock("live-1", ["l0", "l1"], 0),
      liveBlock("live-2", ["l2"], 1),
    ])

    expect(doc.getSource(1)).toEqual({ type: "live", itemIndex: 0, localRow: 0 })
    expect(doc.getSource(2)).toEqual({ type: "live", itemIndex: 0, localRow: 1 })
    expect(doc.getSource(3)).toEqual({ type: "live", itemIndex: 1, localRow: 0 })
  })

  it("search finds matches across frozen and live", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["hello world", "nothing"]))

    const doc = createListDocument(history, () => [liveBlock("b", ["world hello"], 0)])

    const matches = doc.search("hello")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ row: 0, startCol: 0, endCol: 5 })
    expect(matches[1]).toEqual({ row: 2, startCol: 6, endCol: 11 })
  })

  it("search finds multiple matches on same line", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [liveBlock("a", ["aa bb aa"], 0)])

    const matches = doc.search("aa")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ row: 0, startCol: 0, endCol: 2 })
    expect(matches[1]).toEqual({ row: 0, startCol: 6, endCol: 8 })
  })

  it("search is case insensitive", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["Hello"]))

    const doc = createListDocument(history, () => [])
    const matches = doc.search("hello")
    expect(matches).toHaveLength(1)
    expect(matches[0]!.row).toBe(0)
  })

  it("search returns empty for empty query", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [liveBlock("a", ["x"], 0)])
    expect(doc.search("")).toEqual([])
  })

  it("reflects live content changes dynamically", () => {
    const history = createHistoryBuffer()
    let live: LiveItemBlock[] = [liveBlock("a", ["a"], 0)]
    const doc = createListDocument(history, () => live)

    expect(doc.totalRows).toBe(1)
    live = [liveBlock("a", ["a", "b", "c"], 0)]
    expect(doc.totalRows).toBe(3)
    expect(doc.getRows(0, 3)).toEqual(["a", "b", "c"])
  })

  it("handles multiple live item blocks", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [
      liveBlock("item-1", ["row-a", "row-b"], 0),
      liveBlock("item-2", ["row-c"], 1),
      liveBlock("item-3", ["row-d", "row-e"], 2),
    ])

    expect(doc.totalRows).toBe(5)
    expect(doc.liveRows).toBe(5)
    expect(doc.getRows(0, 5)).toEqual(["row-a", "row-b", "row-c", "row-d", "row-e"])
  })

  it("search across multiple live item blocks", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [
      liveBlock("item-1", ["hello first"], 0),
      liveBlock("item-2", ["nothing"], 1),
      liveBlock("item-3", ["hello third"], 2),
    ])

    const matches = doc.search("hello")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ row: 0, startCol: 0, endCol: 5 })
    expect(matches[1]).toEqual({ row: 2, startCol: 0, endCol: 5 })
  })
})
