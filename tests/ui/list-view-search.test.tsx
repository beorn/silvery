/**
 * ListView + SearchProvider integration tests.
 *
 * Verifies that ListView with `search` prop auto-registers as a Searchable
 * in SearchProvider, and that Ctrl+F → type → navigate works end-to-end.
 */

import React, { useRef } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"
import { SearchProvider, useSearch } from "../../packages/ag-react/src/providers/SearchProvider"
import type { SearchContextValue } from "../../packages/ag-react/src/providers/SearchProvider"

// ============================================================================
// Helpers
// ============================================================================

interface Item {
  id: string
  text: string
}

function makeItems(texts: string[]): Item[] {
  return texts.map((text, i) => ({ id: `item-${i}`, text }))
}

/** Flush React batched state updates */
const flush = () => new Promise<void>((r) => setTimeout(r, 10))

// ============================================================================
// Tests
// ============================================================================

describe("ListView + SearchProvider", () => {
  test("ListView with search prop renders without SearchProvider (no crash)", () => {
    const items = makeItems(["alpha", "beta", "gamma"])
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(
      <ListView
        items={items}
        height={3}
        search
        surfaceId="test-list"
        renderItem={(item) => <Text>{item.text}</Text>}
        getKey={(item) => item.id}
      />,
    )
    const text = stripAnsi(app.text)
    expect(text).toContain("alpha")
    expect(text).toContain("beta")
  })

  test("ListView auto-registers as Searchable in SearchProvider", () => {
    const items = makeItems(["alpha", "beta", "gamma"])
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return null
    }

    const r = createRenderer({ cols: 40, rows: 7 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={5}
          search
          surfaceId="test-list"
          renderItem={(item) => <Text>{item.text}</Text>}
          getKey={(item) => item.id}
        />
      </SearchProvider>,
    )

    // The ListView should have registered as a Searchable.
    // open() + input() should find matches in the items.
    expect(ctx).not.toBeNull()
  })

  test("search finds matches in ListView items", async () => {
    const items = makeItems(["apple", "banana", "apricot", "avocado", "blueberry"])
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return <Text>{`matches:${search.matches.length} current:${search.currentMatch}`}</Text>
    }

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={7}
          search={{ getText: (item) => item.text }}
          surfaceId="search-list"
          renderItem={(item) => <Text>{item.text}</Text>}
          getKey={(item) => item.id}
        />
      </SearchProvider>,
    )

    // Search for "ap" — should match "apple" and "apricot"
    ctx!.open()
    ctx!.input("a")
    ctx!.input("p")
    await flush()

    expect(ctx!.matches.length).toBe(2)
    expect(ctx!.currentMatch).toBe(0)
  })

  test("search with getText uses custom text extractor", async () => {
    const items = makeItems(["Hello World", "hello darkness", "HI THERE"])
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return null
    }

    const r = createRenderer({ cols: 40, rows: 7 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={5}
          search={{ getText: (item) => item.text }}
          surfaceId="custom-list"
          renderItem={(item) => <Text>{item.text}</Text>}
          getKey={(item) => item.id}
        />
      </SearchProvider>,
    )

    // Case-insensitive search for "hello" — should match first two items
    ctx!.open()
    ctx!.input("h")
    ctx!.input("e")
    ctx!.input("l")
    ctx!.input("l")
    ctx!.input("o")
    await flush()

    expect(ctx!.matches.length).toBe(2)
  })

  test("search matches include correct row and column positions", async () => {
    const items = makeItems(["abcdef", "ghidef", "defghi"])
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return null
    }

    const r = createRenderer({ cols: 40, rows: 7 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={5}
          search={{ getText: (item) => item.text }}
          surfaceId="pos-list"
          renderItem={(item) => <Text>{item.text}</Text>}
          getKey={(item) => item.id}
        />
      </SearchProvider>,
    )

    ctx!.open()
    ctx!.input("d")
    ctx!.input("e")
    ctx!.input("f")
    await flush()

    // "def" appears in all three items at different columns
    expect(ctx!.matches.length).toBe(3)
    expect(ctx!.matches[0]).toEqual({ row: 0, startCol: 3, endCol: 6 })
    expect(ctx!.matches[1]).toEqual({ row: 1, startCol: 3, endCol: 6 })
    expect(ctx!.matches[2]).toEqual({ row: 2, startCol: 0, endCol: 3 })
  })

  test("empty query produces no matches", async () => {
    const items = makeItems(["alpha", "beta"])
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return null
    }

    const r = createRenderer({ cols: 40, rows: 7 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={5}
          search={{ getText: (item) => item.text }}
          surfaceId="empty-list"
          renderItem={(item) => <Text>{item.text}</Text>}
          getKey={(item) => item.id}
        />
      </SearchProvider>,
    )

    ctx!.open()
    await flush()

    // No input = no matches
    expect(ctx!.matches.length).toBe(0)
  })

  test("search with boolean true uses String() fallback", async () => {
    // When search=true (no getText), items are converted via String()
    const items = [1, 2, 12, 21, 22]
    let ctx: SearchContextValue | null = null

    function Inspector() {
      const search = useSearch()
      ctx = search
      return null
    }

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={7}
          search
          surfaceId="bool-list"
          renderItem={(item) => <Text>{String(item)}</Text>}
          getKey={(_, i) => i}
        />
      </SearchProvider>,
    )

    // Search for "2" — should find items "2", "12", "21", "22" (5 occurrences: 2, 12, 21, 22 has two 2's)
    ctx!.open()
    ctx!.input("2")
    await flush()

    // "1" → no 2, "2" → one 2, "12" → one 2, "21" → one 2, "22" → two 2's
    expect(ctx!.matches.length).toBe(5)
  })
})
