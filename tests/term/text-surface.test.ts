import { describe, expect, it, vi } from "vitest"
import { createHistoryBuffer } from "@silvery/ag-term/history-buffer"
import { createListDocument } from "@silvery/ag-term/list-document"
import { createTextSurface } from "@silvery/ag-term/text-surface"
import type { HistoryItem } from "@silvery/ag-term/history-buffer"
import type { LiveItemBlock } from "@silvery/ag-term/list-document"

function item(key: string, lines: string[]): HistoryItem {
  return { key, ansi: lines.join("\n"), rows: lines, plainTextRows: lines, width: 80 }
}

function liveBlock(key: string, rows: string[], itemIndex = 0): LiveItemBlock {
  return { key, itemIndex, rows, plainTextRows: rows }
}

function setup(frozenLines: string[] = [], liveLines: string[] = []) {
  const history = createHistoryBuffer()
  if (frozenLines.length > 0) {
    history.push(item("frozen", frozenLines))
  }
  const liveItems = liveLines.length > 0 ? [liveBlock("live", liveLines, 0)] : []
  const doc = createListDocument(history, () => liveItems)
  const revealedRows: number[] = []
  const surface = createTextSurface({
    id: "test-surface",
    document: doc,
    viewportToDocument: (vr) => vr, // 1:1 mapping
    onReveal: (row) => revealedRows.push(row),
    capabilities: {
      paneSafe: true,
      searchableHistory: true,
      selectableHistory: true,
      overlayHistory: false,
    },
  })
  return { surface, revealedRows }
}

describe("TextSurface", () => {
  it("exposes id and capabilities", () => {
    const { surface } = setup()
    expect(surface.id).toBe("test-surface")
    expect(surface.capabilities.paneSafe).toBe(true)
    expect(surface.capabilities.searchableHistory).toBe(true)
    expect(surface.capabilities.overlayHistory).toBe(false)
  })

  it("getText extracts plain text for a single row", () => {
    const { surface } = setup([], ["hello world"])
    expect(surface.getText(0, 0, 0, 5)).toBe("hello")
    expect(surface.getText(0, 6, 0, 11)).toBe("world")
  })

  it("getText extracts across multiple rows", () => {
    const { surface } = setup([], ["first line", "second line", "third line"])
    const text = surface.getText(0, 6, 2, 5)
    expect(text).toBe("line\nsecond line\nthird")
  })

  it("getText strips ANSI codes", () => {
    const history = createHistoryBuffer()
    history.push(item("a", ["\x1b[31mred text\x1b[0m"]))
    const doc = createListDocument(history, () => [])
    const surface = createTextSurface({
      id: "ansi-test",
      document: doc,
      viewportToDocument: (vr) => vr,
      onReveal: () => {},
      capabilities: {
        paneSafe: false,
        searchableHistory: false,
        selectableHistory: false,
        overlayHistory: false,
      },
    })
    expect(surface.getText(0, 0, 0, 8)).toBe("red text")
  })

  it("search delegates to document", () => {
    const { surface } = setup(["hello world"], ["hello again"])
    const matches = surface.search("hello")
    expect(matches).toHaveLength(2)
    expect(matches[0]!.row).toBe(0)
    expect(matches[1]!.row).toBe(1)
  })

  it("hitTest maps viewport to document coordinates", () => {
    const { surface } = setup([], ["a", "b", "c"])
    expect(surface.hitTest(1, 5)).toEqual({ row: 1, col: 5 })
  })

  it("hitTest returns null for out-of-range", () => {
    const { surface } = setup([], ["a"])
    expect(surface.hitTest(99, 0)).toBeNull()
  })

  it("hitTest with offset viewport mapping", () => {
    const history = createHistoryBuffer()
    const doc = createListDocument(history, () => [liveBlock("a", ["a", "b", "c"], 0)])
    const surface = createTextSurface({
      id: "offset",
      document: doc,
      viewportToDocument: (vr) => vr + 10, // viewport offset
      onReveal: () => {},
      capabilities: {
        paneSafe: false,
        searchableHistory: false,
        selectableHistory: false,
        overlayHistory: false,
      },
    })
    // row 10 is out of range for 3-row doc
    expect(surface.hitTest(0, 0)).toBeNull()
  })

  it("reveal calls onReveal and notifies subscribers", () => {
    const { surface, revealedRows } = setup(["a", "b", "c"], [])
    const listener = vi.fn()
    surface.subscribe(listener)

    surface.reveal(2)
    expect(revealedRows).toEqual([2])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("subscribe returns unsubscribe function", () => {
    const { surface } = setup()
    const listener = vi.fn()
    const unsub = surface.subscribe(listener)

    surface.reveal(0)
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    surface.reveal(1)
    expect(listener).toHaveBeenCalledTimes(1) // not called again
  })

  it("notifyContentChange notifies subscribers", () => {
    const { surface } = setup([], ["some content"])
    const listener = vi.fn()
    surface.subscribe(listener)

    surface.notifyContentChange()
    expect(listener).toHaveBeenCalledTimes(1)

    surface.notifyContentChange()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("notifyContentChange does not call unsubscribed listeners", () => {
    const { surface } = setup()
    const listener = vi.fn()
    const unsub = surface.subscribe(listener)

    surface.notifyContentChange()
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    surface.notifyContentChange()
    expect(listener).toHaveBeenCalledTimes(1) // not called again
  })
})
