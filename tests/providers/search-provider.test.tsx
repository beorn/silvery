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
import { Box, DocumentView, ScrollArea, Text, useScrollController } from "../../src/index.js"
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
  test("DocumentView expands a collapsed code match before revealing it", async () => {
    let search: SearchContextValue | null = null
    function Document() {
      search = useSearch()
      const controller = useScrollController()
      return (
        <Box width={40} height={8} flexDirection="column">
          <ScrollArea controller={controller}>
            <DocumentView
              blocks={[{ id: "source", kind: "code", content: "unique needle\nsecond line" }]}
              search={{
                id: "code",
                getText: (block) => ("content" in block ? String(block.content) : ""),
                scrollController: controller,
              }}
            />
          </ScrollArea>
        </Box>
      )
    }
    const app = createRenderer({ cols: 40, rows: 8, autoRender: true })(
      <SearchProvider>
        <Document />
      </SearchProvider>,
    )
    const row = app.lines.findIndex((line) => line.includes("unique needle"))
    const column = app.lines[row]!.indexOf("unique needle")
    await app.click(column, row)
    expect(app.text).not.toContain("unique needle")
    search!.open()
    for (const char of "needle") search!.input(char)
    await vi.waitFor(() => {
      expect(search!.matches).toHaveLength(1)
      expect(app.text).toContain("unique needle")
      expect(app.text).toContain("second line")
    })
  })

  test("DocumentView registers semantic text and reveals the measured matching block", async () => {
    const blocks = Array.from({ length: 18 }, (_, index) => ({
      id: `block-${index}`,
      kind: "paragraph" as const,
      content: index === 15 ? "the unique needle" : `ordinary row ${index}`,
    }))
    let ctx: SearchContextValue | null = null
    let observedOffset = 0

    function Inspector() {
      ctx = useSearch()
      return null
    }

    function SearchableDocument() {
      const controller = useScrollController()
      observedOffset = controller.scrollOffset
      return (
        <Box width={40} height={6} flexDirection="column">
          <ScrollArea controller={controller}>
            <DocumentView
              blocks={blocks}
              search={{
                id: "document",
                getText: (block) => String("content" in block ? block.content : ""),
                scrollController: controller,
              }}
            />
          </ScrollArea>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 6, autoRender: true })
    const app = render(
      <SearchProvider>
        <Inspector />
        <SearchableDocument />
      </SearchProvider>,
    )

    ctx!.open()
    for (const char of "needle") ctx!.input(char)

    await vi.waitFor(() => {
      expect(ctx!.matches).toHaveLength(1)
      expect(observedOffset).toBeGreaterThan(0)
      const props = app.getByTestId("block-15").first().resolve()?.props as
        | Record<string, unknown>
        | undefined
      expect(props?.["data-cursor"]).toBe(true)
    })
  })

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
    // Poll instead of a fixed flush: the input → setState → effect →
    // search → reveal chain is React-scheduled, and a fixed 10ms sleep
    // flakes under CI worker contention (2026-07-02 ubuntu red).
    await vi.waitFor(
      () => expect(reveal).toHaveBeenCalledWith({ row: 5, startCol: 0, endCol: 2 }),
      { timeout: 5000 },
    )
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
    await vi.waitFor(
      () => expect(reveal).toHaveBeenCalledWith({ row: 5, startCol: 0, endCol: 2 }),
      { timeout: 5000 },
    )

    ctx!.next()
    await vi.waitFor(
      () => expect(reveal).toHaveBeenCalledWith({ row: 10, startCol: 0, endCol: 2 }),
      { timeout: 5000 },
    )
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
    // Poll rather than sleep — see the fixed-flush note above; the same
    // React-scheduled chain flakes under worker contention.
    await vi.waitFor(
      () => expect(revealB).toHaveBeenCalledWith({ row: 2, startCol: 0, endCol: 1 }),
      { timeout: 5000 },
    )
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
    // Poll rather than sleep — see the fixed-flush note above.
    await vi.waitFor(
      () => expect(reveal).toHaveBeenCalledWith({ row: 3, startCol: 0, endCol: 2 }),
      {
        timeout: 5000,
      },
    )
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

  test("shift+; inserts ':' into query (legacy-terminal text insertion)", async () => {
    // Regression: SearchBindings used `input` for ctx.input() — but legacy-terminal
    // parseKey() normalizes shifted punctuation (':' → ';' + key.shift=true) so that
    // keybinding resolution matches "shift+;". For text insertion we must read the
    // pre-normalization character from `key.text` instead. See keys.ts line 1120-1127.
    const searchable = createMockSearchable({ searchResults: [] })
    let ctx: SearchContextValue | null = null

    function Registrar() {
      const search = useSearch()
      ctx = search
      const unregRef = useRef<(() => void) | null>(null)
      if (!unregRef.current) {
        unregRef.current = search.registerSearchable("main", searchable)
      }
      return <Text>shift-test</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    const app = r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    // Open the search bar, then press ':' (shift+; on US QWERTY).
    ctx!.open()
    await flush()
    await app.press(":")
    await flush()

    expect(ctx!.query).toBe(":")
  })

  test("shift+3 inserts '#' into query (legacy-terminal text insertion)", async () => {
    // Same root cause as shift+; — verify across multiple shifted punctuation marks.
    const searchable = createMockSearchable({ searchResults: [] })
    let ctx: SearchContextValue | null = null

    function Registrar() {
      const search = useSearch()
      ctx = search
      const unregRef = useRef<(() => void) | null>(null)
      if (!unregRef.current) {
        unregRef.current = search.registerSearchable("main", searchable)
      }
      return <Text>shift-test</Text>
    }

    const r = createRenderer({ cols: 40, rows: 3 })
    const app = r(
      <SearchProvider>
        <Registrar />
      </SearchProvider>,
    )

    ctx!.open()
    await flush()
    await app.press("#")
    await flush()

    expect(ctx!.query).toBe("#")
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
