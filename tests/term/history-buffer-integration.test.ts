/**
 * HistoryBuffer + ListDocument integration tests.
 *
 * Tests the full pipeline: items freeze into HistoryBuffer, ListDocument
 * unifies frozen + live rows, search spans both regions, and content
 * updates correctly when items move between regions.
 *
 * These are higher-layer integration tests that verify the contracts between
 * HistoryBuffer, ListDocument, and TextSurface work together correctly.
 */

import { describe, test, expect } from "vitest"
import { createHistoryBuffer, createHistoryItem } from "@silvery/term/history-buffer"
import { createListDocument } from "@silvery/term/list-document"
import { createTextSurface } from "@silvery/term/text-surface"
import type { LiveItemBlock } from "@silvery/term/list-document"

// ============================================================================
// Helpers
// ============================================================================

function makeItem(key: string, content: string, width = 80) {
  return createHistoryItem(key, content, width)
}

function liveBlock(key: string, rows: string[], itemIndex = 0): LiveItemBlock {
  return { key, itemIndex, rows, plainTextRows: rows }
}

// ============================================================================
// HistoryBuffer + ListDocument integration
// ============================================================================

describe("HistoryBuffer + ListDocument: freeze lifecycle", () => {
  test("items transition from live to frozen correctly", () => {
    const history = createHistoryBuffer(1000)
    let liveItems: LiveItemBlock[] = [
      liveBlock("a", ["Line A"], 0),
      liveBlock("b", ["Line B"], 1),
      liveBlock("c", ["Line C"], 2),
      liveBlock("d", ["Line D"], 3),
    ]

    const doc = createListDocument(history, () => liveItems)

    // Initially: 0 frozen, 4 live
    expect(doc.frozenRows).toBe(0)
    expect(doc.liveRows).toBe(4)
    expect(doc.totalRows).toBe(4)

    // Freeze first two items
    history.push(makeItem("a", "Line A"))
    history.push(makeItem("b", "Line B"))
    liveItems = [liveBlock("c", ["Line C"], 0), liveBlock("d", ["Line D"], 1)]

    // Now: 2 frozen, 2 live
    expect(doc.frozenRows).toBe(2)
    expect(doc.liveRows).toBe(2)
    expect(doc.totalRows).toBe(4)

    // Content should be continuous
    const allRows = doc.getRows(0, 4)
    expect(allRows).toEqual(["Line A", "Line B", "Line C", "Line D"])
  })

  test("getSource correctly identifies frozen vs live origin", () => {
    const history = createHistoryBuffer(1000)
    history.push(makeItem("msg-1", "Frozen content"))

    const liveItems: LiveItemBlock[] = [liveBlock("msg-2", ["Live content"], 0)]
    const doc = createListDocument(history, () => liveItems)

    const frozenSource = doc.getSource(0)
    expect(frozenSource).toEqual({
      type: "frozen",
      itemKey: "msg-1",
      localRow: 0,
    })

    const liveSource = doc.getSource(1)
    expect(liveSource).toEqual({
      type: "live",
      itemIndex: 0,
      localRow: 0,
    })
  })

  test("multi-line frozen items map rows correctly", () => {
    const history = createHistoryBuffer(1000)
    history.push(makeItem("multi", "Line 1\nLine 2\nLine 3"))

    const liveItems: LiveItemBlock[] = [liveBlock("live-1", ["Live line"], 0)]
    const doc = createListDocument(history, () => liveItems)

    expect(doc.frozenRows).toBe(3)
    expect(doc.liveRows).toBe(1)
    expect(doc.totalRows).toBe(4)

    // Each frozen row should resolve to the same item with different localRow
    expect(doc.getSource(0)).toEqual({ type: "frozen", itemKey: "multi", localRow: 0 })
    expect(doc.getSource(1)).toEqual({ type: "frozen", itemKey: "multi", localRow: 1 })
    expect(doc.getSource(2)).toEqual({ type: "frozen", itemKey: "multi", localRow: 2 })
    expect(doc.getSource(3)).toEqual({ type: "live", itemIndex: 0, localRow: 0 })
  })

  test("search finds matches across frozen/live boundary", () => {
    const history = createHistoryBuffer(1000)
    history.push(makeItem("old", "The fox jumped"))

    const liveItems: LiveItemBlock[] = [liveBlock("new", ["The fox sleeps"], 0)]
    const doc = createListDocument(history, () => liveItems)

    const matches = doc.search("fox")
    expect(matches.length).toBe(2)

    // First match in frozen region (row 0)
    expect(matches[0]!.row).toBe(0)
    expect(matches[0]!.startCol).toBe(4)

    // Second match in live region (row 1)
    expect(matches[1]!.row).toBe(1)
    expect(matches[1]!.startCol).toBe(4)
  })

  test("incremental freezing preserves search results", () => {
    const history = createHistoryBuffer(1000)
    let liveItems: LiveItemBlock[] = [
      liveBlock("0", ["apple pie"], 0),
      liveBlock("1", ["banana split"], 1),
      liveBlock("2", ["apple sauce"], 2),
    ]

    const doc = createListDocument(history, () => liveItems)

    // Search before freeze
    let matches = doc.search("apple")
    expect(matches.length).toBe(2)
    expect(matches[0]!.row).toBe(0) // live row 0
    expect(matches[1]!.row).toBe(2) // live row 2

    // Freeze first item
    history.push(makeItem("0", "apple pie"))
    liveItems = [liveBlock("1", ["banana split"], 0), liveBlock("2", ["apple sauce"], 1)]

    // Search after freeze — same matches, different row indices
    matches = doc.search("apple")
    expect(matches.length).toBe(2)
    expect(matches[0]!.row).toBe(0) // now frozen row 0
    expect(matches[1]!.row).toBe(2) // now live row 1 → doc row 2
  })
})

// ============================================================================
// HistoryBuffer eviction
// ============================================================================

describe("HistoryBuffer: eviction under load", () => {
  test("old items evicted when maxRows exceeded", () => {
    const history = createHistoryBuffer(5)

    // Push items that total more than 5 rows
    history.push(makeItem("a", "Line A"))
    history.push(makeItem("b", "Line B"))
    history.push(makeItem("c", "Line C"))
    history.push(makeItem("d", "Line D"))
    history.push(makeItem("e", "Line E"))
    expect(history.totalRows).toBe(5)
    expect(history.itemCount).toBe(5)

    // Push one more — should evict oldest
    history.push(makeItem("f", "Line F"))
    expect(history.totalRows).toBeLessThanOrEqual(5)
    // Item "a" should be gone
    const firstRow = history.getPlainTextRows(0, 1)
    expect(firstRow[0]).not.toBe("Line A")
  })

  test("search excludes evicted items", () => {
    const history = createHistoryBuffer(3)

    history.push(makeItem("old", "SearchMe old"))
    history.push(makeItem("new1", "Keep this"))
    history.push(makeItem("new2", "Keep that"))
    // "SearchMe old" should be evicted
    history.push(makeItem("new3", "SearchMe new"))

    const matches = history.search("SearchMe")
    // Only the non-evicted "SearchMe new" should match
    expect(matches.length).toBe(1)
  })

  test("getItemAtRow returns null for evicted rows", () => {
    const history = createHistoryBuffer(2)

    history.push(makeItem("first", "First"))
    history.push(makeItem("second", "Second"))
    history.push(makeItem("third", "Third"))

    // Row 0 should now be "second" or "third", not "first"
    const item = history.getItemAtRow(0)
    expect(item).not.toBeNull()
    expect(item!.item.key).not.toBe("first")
  })
})

// ============================================================================
// TextSurface + ListDocument: full pipeline
// ============================================================================

describe("TextSurface: full pipeline integration", () => {
  test("getText extracts text across frozen/live boundary", () => {
    const history = createHistoryBuffer(1000)
    history.push(makeItem("frozen", "Frozen text here"))

    const liveItems: LiveItemBlock[] = [liveBlock("live", ["Live text here"], 0)]
    const doc = createListDocument(history, () => liveItems)

    const surface = createTextSurface({
      id: "test",
      document: doc,
      viewportToDocument: (row) => row,
      onReveal: () => {},
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    // Extract text spanning frozen and live
    const text = surface.getText(0, 0, 1, 14)
    expect(text).toContain("Frozen text here")
    expect(text).toContain("Live text here")
  })

  test("search through surface delegates to document", () => {
    const history = createHistoryBuffer(1000)
    history.push(makeItem("old", "error: something failed"))

    const liveItems: LiveItemBlock[] = [
      liveBlock("new1", ["error: another failure"], 0),
      liveBlock("new2", ["success: all good"], 1),
    ]
    const doc = createListDocument(history, () => liveItems)

    const surface = createTextSurface({
      id: "test",
      document: doc,
      viewportToDocument: (row) => row,
      onReveal: () => {},
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    const matches = surface.search("error")
    expect(matches.length).toBe(2)
    expect(matches[0]!.row).toBe(0) // frozen
    expect(matches[1]!.row).toBe(1) // live
  })

  test("hitTest maps viewport coordinates to document rows", () => {
    const history = createHistoryBuffer(1000)
    history.push(makeItem("h1", "History 1"))
    history.push(makeItem("h2", "History 2"))

    const doc = createListDocument(history, () => [liveBlock("l1", ["Live 1"], 0)])

    // Viewport offset: user has scrolled up 1 row, so viewport row 0 = doc row 1
    const surface = createTextSurface({
      id: "test",
      document: doc,
      viewportToDocument: (viewportRow) => viewportRow + 1,
      onReveal: () => {},
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    const hit = surface.hitTest(0, 5)
    expect(hit).toEqual({ row: 1, col: 5 })

    // Out of bounds
    const miss = surface.hitTest(10, 0)
    expect(miss).toBeNull()
  })

  test("reveal notifies subscribers", () => {
    const history = createHistoryBuffer(1000)
    const doc = createListDocument(history, () => [liveBlock("live", ["Live"], 0)])

    let revealedRow = -1
    let notified = false

    const surface = createTextSurface({
      id: "test",
      document: doc,
      viewportToDocument: (row) => row,
      onReveal: (row) => {
        revealedRow = row
      },
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    const unsub = surface.subscribe(() => {
      notified = true
    })

    surface.reveal(42)
    expect(revealedRow).toBe(42)
    expect(notified).toBe(true)

    unsub()
  })

  test("notifyContentChange notifies subscribers without reveal", () => {
    const history = createHistoryBuffer(1000)
    const doc = createListDocument(history, () => [liveBlock("live", ["Live"], 0)])

    let revealCalled = false
    let notifyCount = 0

    const surface = createTextSurface({
      id: "test",
      document: doc,
      viewportToDocument: (row) => row,
      onReveal: () => {
        revealCalled = true
      },
      capabilities: {
        paneSafe: true,
        searchableHistory: true,
        selectableHistory: true,
        overlayHistory: true,
      },
    })

    surface.subscribe(() => {
      notifyCount++
    })

    surface.notifyContentChange()
    expect(notifyCount).toBe(1)
    expect(revealCalled).toBe(false) // onReveal should NOT be called
  })
})
