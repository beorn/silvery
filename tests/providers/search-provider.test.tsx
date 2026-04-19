/**
 * SearchProvider tests.
 *
 * Tests the search state machine integration with Searchable registration.
 * Since searchUpdate is a pure TEA function already tested in search-overlay.test.ts,
 * these tests verify the React provider wiring: context availability, delegation
 * to focused searchable, and reveal() calls.
 */

import React, { useRef } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "../../src/index.js"
import { SearchProvider, useSearch } from "../../packages/ag-react/src/providers/SearchProvider"
import type {
  Searchable,
  SearchContextValue,
} from "../../packages/ag-react/src/providers/SearchProvider"
import type { SearchMatch } from "../../packages/ag-term/src/search-overlay"

// ============================================================================
// Helpers
// ============================================================================

function createMockSearchable(opts?: {
  searchResults?: SearchMatch[]
  reveal?: (match: SearchMatch) => void
}): Searchable {
  const matches = opts?.searchResults ?? []
  return {
    search: () => matches,
    reveal: opts?.reveal ?? vi.fn(),
  }
}

/** Flush React batched state updates */
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

// ============================================================================
// Tests
// ============================================================================

describe("SearchProvider", () => {
  test("provides default inactive state", () => {
    function Inspector() {
      const search = useSearch()
      return (
        <Text>{`active:${search.isActive} query:${search.query || "(empty)"} matches:${search.matches.length} current:${search.currentMatch}`}</Text>
      )
    }

    const r = createRenderer({ cols: 80, rows: 3 })
    const app = r(
      <SearchProvider>
        <Inspector />
      </SearchProvider>,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("active:false")
    expect(text).toContain("query:(empty)")
    expect(text).toContain("matches:0")
    expect(text).toContain("current:-1")
  })

  test("exposes all required methods", () => {
    const methods: string[] = []

    function Inspector() {
      const search = useSearch()
      if (typeof search.open === "function") methods.push("open")
      if (typeof search.close === "function") methods.push("close")
      if (typeof search.next === "function") methods.push("next")
      if (typeof search.prev === "function") methods.push("prev")
      if (typeof search.input === "function") methods.push("input")
      if (typeof search.backspace === "function") methods.push("backspace")
      if (typeof search.cursorLeft === "function") methods.push("cursorLeft")
      if (typeof search.cursorRight === "function") methods.push("cursorRight")
      if (typeof search.registerSearchable === "function") methods.push("registerSearchable")
      if (typeof search.setFocused === "function") methods.push("setFocused")
      return <Text>{`methods:${methods.join(",")}`}</Text>
    }

    const r = createRenderer({ cols: 120, rows: 3 })
    const app = r(
      <SearchProvider>
        <Inspector />
      </SearchProvider>,
    )

    const text = stripAnsi(app.text)
    for (const m of [
      "open",
      "close",
      "next",
      "prev",
      "input",
      "backspace",
      "cursorLeft",
      "cursorRight",
      "registerSearchable",
      "setFocused",
    ]) {
      expect(text).toContain(m)
    }
  })

  test("search delegates to registered searchable — reveal() called", async () => {
    const matches: SearchMatch[] = [
      { row: 5, startCol: 0, endCol: 2 },
      { row: 10, startCol: 3, endCol: 5 },
    ]
    const reveal = vi.fn()
    const searchable = createMockSearchable({ searchResults: matches, reveal })
    let ctx: SearchContextValue | null = null

    function Registrar() {
      const search = useSearch()
      ctx = search
      const unregRef = useRef<(() => void) | null>(null)
      if (!unregRef.current) {
        unregRef.current = search.registerSearchable("main", searchable)
      }
      return <Text>registered</Text>
    }

    const r = createRenderer({ cols: 60, rows: 3 })
    r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    ctx!.open()
    ctx!.input("f")
    await flush()

    expect(reveal).toHaveBeenCalledWith({ row: 5, startCol: 0, endCol: 2 })
  })

  test("next() calls reveal() with next match", async () => {
    const matches: SearchMatch[] = [
      { row: 5, startCol: 0, endCol: 2 },
      { row: 10, startCol: 0, endCol: 2 },
    ]
    const reveal = vi.fn()
    const searchable = createMockSearchable({ searchResults: matches, reveal })
    let ctx: SearchContextValue | null = null

    function Registrar() {
      const search = useSearch()
      ctx = search
      const unregRef = useRef<(() => void) | null>(null)
      if (!unregRef.current) {
        unregRef.current = search.registerSearchable("main", searchable)
      }
      return <Text>registered</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    ctx!.open()
    ctx!.input("q")
    await flush()
    expect(reveal).toHaveBeenCalledWith({ row: 5, startCol: 0, endCol: 2 })

    ctx!.next()
    await flush()
    expect(reveal).toHaveBeenCalledWith({ row: 10, startCol: 0, endCol: 2 })
  })

  test("setFocused routes to correct searchable", async () => {
    const revealA = vi.fn()
    const revealB = vi.fn()
    const matchesA: SearchMatch[] = [{ row: 1, startCol: 0, endCol: 1 }]
    const matchesB: SearchMatch[] = [{ row: 2, startCol: 0, endCol: 1 }]
    const searchableA = createMockSearchable({ searchResults: matchesA, reveal: revealA })
    const searchableB = createMockSearchable({ searchResults: matchesB, reveal: revealB })
    let ctx: SearchContextValue | null = null

    function Registrar() {
      const search = useSearch()
      // Always capture the latest context value across re-renders
      ctx = search
      const regRef = useRef(false)
      if (!regRef.current) {
        search.registerSearchable("pane-a", searchableA)
        search.registerSearchable("pane-b", searchableB)
        regRef.current = true
      }
      return <Text>dual</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    // setFocused triggers a state update. After flush, SearchProvider re-renders
    // and ctx is re-captured with new callbacks that capture focusedId="pane-b".
    ctx!.setFocused("pane-b")
    await flush()

    // ctx now has the re-rendered callbacks with focusedId="pane-b"
    ctx!.open()
    ctx!.input("x")
    await flush()

    // Only pane B's searchable should have been used
    expect(revealB).toHaveBeenCalledWith({ row: 2, startCol: 0, endCol: 1 })
    expect(revealA).not.toHaveBeenCalled()
  })

  test("single searchable is auto-selected without setFocused", async () => {
    const matches: SearchMatch[] = [{ row: 3, startCol: 0, endCol: 2 }]
    const reveal = vi.fn()
    const searchable = createMockSearchable({ searchResults: matches, reveal })
    let ctx: SearchContextValue | null = null

    function Registrar() {
      const search = useSearch()
      ctx = search
      const unregRef = useRef<(() => void) | null>(null)
      if (!unregRef.current) {
        unregRef.current = search.registerSearchable("only-one", searchable)
      }
      return <Text>solo</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    ctx!.open()
    ctx!.input("a")
    await flush()
    expect(reveal).toHaveBeenCalledWith({ row: 3, startCol: 0, endCol: 2 })
  })

  test("no reveal when no searchable is registered", async () => {
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return <Text>{`matches:${search.matches.length}`}</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    r(
      <SearchProvider>
        <Inspector />
      </SearchProvider>,
    )

    // Should not throw — just produces no matches
    ctx!.open()
    ctx!.input("x")
    await flush()
  })

  test("unregister removes searchable", async () => {
    const matches: SearchMatch[] = [{ row: 1, startCol: 0, endCol: 1 }]
    const reveal = vi.fn()
    const searchable = createMockSearchable({ searchResults: matches, reveal })
    let ctx: SearchContextValue | null = null
    let unregister: (() => void) | null = null

    function Registrar() {
      const search = useSearch()
      ctx = search
      const unregRef = useRef<(() => void) | null>(null)
      if (!unregRef.current) {
        unregRef.current = search.registerSearchable("temp", searchable)
        unregister = unregRef.current
      }
      return <Text>ok</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    // Unregister the searchable
    unregister!()

    // Now search should find no searchable — no reveal
    ctx!.open()
    ctx!.input("x")
    await flush()
    expect(reveal).not.toHaveBeenCalled()
  })
})
