/**
 * Tests for viewport compositor - merges frozen history + live viewport.
 *
 * scrollOffset uses bottom-origin semantics: scrollOffset=N means
 * "show rows starting at totalHistory - N from the tail".
 */

import { describe, test, expect } from "vitest"
import { createHistoryBuffer, createHistoryItem } from "../../packages/term/src/history-buffer"
import { composeViewport } from "../../packages/term/src/viewport-compositor"

function pushRow(history: ReturnType<typeof createHistoryBuffer>, key: string, text: string) {
  history.push(createHistoryItem(key, text, 80))
}

describe("composeViewport", () => {
  test("at tail (scrollOffset=0) returns no overlay rows", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")

    const result = composeViewport({
      history,
      viewportHeight: 10,
      scrollOffset: 0,
    })

    expect(result.isScrolledUp).toBe(false)
    expect(result.overlayRows).toEqual([])
    expect(result.overlayRowCount).toBe(0)
    expect(result.liveRowsVisible).toBe(10)
    expect(result.totalHeight).toBe(12) // 2 history + 10 viewport
  })

  test("scrolled up shows history rows from bottom-origin offset", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")
    pushRow(history, "c", "row-3")

    // scrollOffset=3 from tail of 3 items, viewport=2:
    // startRow = 3-3 = 0, rowsToShow = min(2, 3) = 2
    // shows rows 0..1 = ["row-1", "row-2"]
    const result = composeViewport({
      history,
      viewportHeight: 2,
      scrollOffset: 3,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.overlayRowCount).toBe(2)
    expect(result.overlayRows).toEqual(["row-1", "row-2"])
    expect(result.liveRowsVisible).toBe(0)
  })

  test("scrollOffset clamped to available history", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")

    const result = composeViewport({
      history,
      viewportHeight: 5,
      scrollOffset: 100,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.overlayRowCount).toBe(1)
    expect(result.overlayRows).toEqual(["row-1"])
    expect(result.liveRowsVisible).toBe(4)
  })

  test("empty history returns no rows", () => {
    const history = createHistoryBuffer()

    const result = composeViewport({
      history,
      viewportHeight: 10,
      scrollOffset: 5,
    })

    expect(result.isScrolledUp).toBe(false)
    expect(result.overlayRows).toEqual([])
    expect(result.overlayRowCount).toBe(0)
    expect(result.liveRowsVisible).toBe(10)
  })

  test("totalHeight is history rows + viewport", () => {
    const history = createHistoryBuffer()
    history.push(createHistoryItem("a", "r1\nr2\nr3", 80))

    const result = composeViewport({
      history,
      viewportHeight: 20,
      scrollOffset: 0,
    })

    expect(result.totalHeight).toBe(23) // 3 history + 20 viewport
  })

  test("partial viewport fill when scrolled up near tail", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")

    // scrollOffset=1, viewport=5:
    // startRow = 2-1 = 1, rowsToShow = min(5, 2-1) = 1
    // shows row at index 1 = ["row-2"]
    const result = composeViewport({
      history,
      viewportHeight: 5,
      scrollOffset: 1,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.overlayRowCount).toBe(1)
    expect(result.overlayRows).toEqual(["row-2"])
    expect(result.liveRowsVisible).toBe(4)
  })

  test("scrollOffset=2 with 3 items and viewport=2 shows middle rows", () => {
    const history = createHistoryBuffer()
    pushRow(history, "a", "row-1")
    pushRow(history, "b", "row-2")
    pushRow(history, "c", "row-3")

    // scrollOffset=2: startRow = 3-2 = 1, rowsToShow = min(2, 2) = 2
    // shows rows 1..2 = ["row-2", "row-3"]
    const result = composeViewport({
      history,
      viewportHeight: 2,
      scrollOffset: 2,
    })

    expect(result.isScrolledUp).toBe(true)
    expect(result.overlayRowCount).toBe(2)
    expect(result.overlayRows).toEqual(["row-2", "row-3"])
    expect(result.liveRowsVisible).toBe(0)
  })
})
