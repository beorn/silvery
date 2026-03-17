/**
 * Smoke tests for the code agent demo app.
 */
import { describe, test, expect } from "vitest"
import { createVirtualScrollback } from "@silvery/term/virtual-scrollback"
import { createSearchState, renderSearchBar, type SearchMatch } from "@silvery/term/search-overlay"
import { extractText } from "@silvery/term/selection"
import { renderSelectionOverlay } from "@silvery/term/selection-renderer"

describe("code agent demo features", () => {
  test("virtual scrollback stores and retrieves conversation history", () => {
    const sb = createVirtualScrollback()
    sb.push([
      "You: How do I sort an array?",
      "Assistant: Use .sort() with a comparator:",
      "  numbers.sort((a, b) => a - b)",
    ])
    expect(sb.totalLines).toBe(3)

    const rows = sb.getVisibleRows(0, 3)
    expect(rows[0]).toContain("sort")
    expect(rows[2]).toContain("a - b")
  })

  test("search finds text in scrollback", () => {
    const sb = createVirtualScrollback()
    sb.push([
      "You: How do I sort?",
      "Assistant: Use .sort()",
      "You: What about objects?",
      "Assistant: Use a comparator",
    ])
    const matches = sb.search("sort")
    expect(matches.length).toBe(2) // Lines 0 and 1
  })

  test("selection works on buffer content", () => {
    const { TerminalBuffer } = require("@silvery/term/buffer")
    const buf = new TerminalBuffer(30, 3)
    const lines = ["const arr = [3, 1, 4]", "arr.sort((a, b) => a - b)", "console.log(arr)"]
    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y]!.length; x++) {
        buf.setCell(x, y, { char: lines[y]![x]!, fg: null, bg: null })
      }
    }

    const text = extractText(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 8, row: 0 },
    })
    expect(text).toBe("const arr")
  })

  test("search bar renders with match info", () => {
    const matches: SearchMatch[] = [
      { row: 5, startCol: 0, endCol: 3 },
      { row: 12, startCol: 0, endCol: 3 },
    ]
    const state = { ...createSearchState(), active: true, query: "sort", matches, currentMatch: 0 }
    const bar = renderSearchBar(state, 60)
    expect(bar).toContain("sort")
    expect(bar).toContain("[1/2]")
  })

  test("selection overlay produces ANSI output", () => {
    const { TerminalBuffer } = require("@silvery/term/buffer")
    const buf = new TerminalBuffer(20, 1)
    for (let x = 0; x < 5; x++) buf.setCell(x, 0, { char: "Hello"[x]!, fg: null, bg: null })

    const output = renderSelectionOverlay({ anchor: { col: 0, row: 0 }, head: { col: 4, row: 0 } }, buf)
    expect(output).toContain("\x1b[7m")
    expect(output).toContain("Hello")
  })
})
