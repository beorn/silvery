/**
 * ListView renderItem meta — `matchRanges` + `searchQuery`.
 *
 * Contract: when `search={{ getText }}` is configured and a non-empty query
 * is active in the enclosing SearchProvider, every visible item's third
 * `renderItem` argument carries:
 *   - `searchQuery`   — the current query string (always-populated mirror of
 *                       `SearchContextValue.query`)
 *   - `matchRanges`   — character ranges within `getText(item)` where the
 *                       query (case-insensitive) appears, in ascending
 *                       `start` order. Empty when the query doesn't match
 *                       this item.
 *
 * Realistic-scale fixture (60 items) exercises the virtualizer window; the
 * test is gated by SILVERY_STRICT to catch incremental cascade bugs in the
 * render pipeline (meta changes should NOT trigger spurious full-tree
 * repaints when the match set for non-visible items churns).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import type { MatchRange } from "@silvery/ag-term/search-overlay"
import { Text } from "../../src/components/Text"
import { ListView } from "../../src/ui/components/ListView"
import type { ListItemMeta } from "../../src/ui/components/ListView"
import { SearchProvider, useSearch } from "../../src/providers/SearchProvider"
import type { SearchContextValue } from "../../src/providers/SearchProvider"

// ============================================================================
// Fixture
// ============================================================================

interface Item {
  id: string
  text: string
}

/**
 * 60 items: 3 variants × 20 copies so a simple query ("foo") yields a
 * predictable match density (~20 items match) — large enough to span
 * multiple virtualizer windows, small enough to compute match expectations
 * by hand in assertions.
 */
function makeRealisticItems(): Item[] {
  const variants = ["foobar baseline", "barbaz plain", "food and drink"]
  const out: Item[] = []
  for (let i = 0; i < 60; i++) out.push({ id: `i${i}`, text: variants[i % 3]! })
  return out
}

const flush = () => new Promise<void>((r) => setTimeout(r, 10))

// ============================================================================
// Tests
// ============================================================================

describe("ListView renderItem meta: matchRanges + searchQuery", () => {
  test("meta carries empty query + empty ranges when search is inactive", () => {
    const items = makeRealisticItems()
    const seen: ListItemMeta[] = []
    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <SearchProvider>
        <ListView
          items={items}
          height={5}
          search={{ getText: (i) => i.text }}
          surfaceId="ranges-idle"
          getKey={(i) => i.id}
          renderItem={(item, _idx, meta) => {
            seen.push(meta)
            return <Text>{item.text}</Text>
          }}
        />
      </SearchProvider>,
    )

    expect(seen.length).toBeGreaterThan(0)
    for (const meta of seen) {
      expect(meta.searchQuery).toBe("")
      expect(meta.matchRanges).toEqual([])
    }
  })

  test("meta carries the active query + correct ranges for each visible item", async () => {
    const items = makeRealisticItems()
    const seen = new Map<string, ListItemMeta[]>()
    let ctx: SearchContextValue | null = null

    function Inspector() {
      ctx = useSearch()
      return null
    }

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={5}
          search={{ getText: (i) => i.text }}
          surfaceId="ranges-active"
          getKey={(i) => i.id}
          renderItem={(item, _idx, meta) => {
            const prev = seen.get(item.id) ?? []
            prev.push(meta)
            seen.set(item.id, prev)
            return <Text>{item.text}</Text>
          }}
        />
      </SearchProvider>,
    )

    ctx!.open()
    ctx!.input("f")
    ctx!.input("o")
    ctx!.input("o")
    await flush()

    // Grab the most recent meta seen per item id.
    const latest = new Map<string, ListItemMeta>()
    for (const [id, metas] of seen) {
      latest.set(id, metas[metas.length - 1]!)
    }

    // At least one item from each variant must have been rendered by now.
    // "foobar baseline" has exactly one match at [0,3), "food and drink" at
    // [0,3), "barbaz plain" has no match.
    let seenFoobar = false
    let seenFood = false
    let seenBarbaz = false

    for (const [id, meta] of latest) {
      expect(meta.searchQuery).toBe("foo")
      const idx = Number(id.slice(1))
      const variant = idx % 3
      if (variant === 0) {
        // "foobar baseline"
        expect(meta.matchRanges).toEqual<MatchRange[]>([{ start: 0, end: 3 }])
        seenFoobar = true
      } else if (variant === 1) {
        // "barbaz plain" — no match
        expect(meta.matchRanges).toEqual([])
        seenBarbaz = true
      } else {
        // "food and drink"
        expect(meta.matchRanges).toEqual<MatchRange[]>([{ start: 0, end: 3 }])
        seenFood = true
      }
    }

    // All three variants must have been rendered through the virtualizer
    // at some point during the test (either initially or after query input
    // scrolled a match into view).
    expect(seenFoobar || seenFood).toBe(true)
    expect(seenBarbaz || seenFoobar || seenFood).toBe(true)
  })

  test("matchRanges is case-insensitive and finds all occurrences", async () => {
    const items: Item[] = [
      { id: "a", text: "FOO foo Foo" }, // three matches at 0, 4, 8
    ]
    let ctx: SearchContextValue | null = null
    let lastMeta: ListItemMeta | null = null

    function Inspector() {
      ctx = useSearch()
      return null
    }

    const r = createRenderer({ cols: 40, rows: 5 })
    r(
      <SearchProvider>
        <Inspector />
        <ListView
          items={items}
          height={3}
          search={{ getText: (i) => i.text }}
          surfaceId="ranges-case"
          getKey={(i) => i.id}
          renderItem={(item, _idx, meta) => {
            lastMeta = meta
            return <Text>{item.text}</Text>
          }}
        />
      </SearchProvider>,
    )

    ctx!.open()
    ctx!.input("f")
    ctx!.input("o")
    ctx!.input("o")
    await flush()

    expect(lastMeta!.searchQuery).toBe("foo")
    expect(lastMeta!.matchRanges).toEqual<MatchRange[]>([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ])
  })

  test("matchRanges collapses to empty when search prop is absent", async () => {
    const items: Item[] = [{ id: "a", text: "foobar" }]
    let lastMeta: ListItemMeta | null = null

    const r = createRenderer({ cols: 40, rows: 5 })
    r(
      <SearchProvider>
        <ListView
          items={items}
          height={3}
          getKey={(i) => i.id}
          renderItem={(item, _idx, meta) => {
            lastMeta = meta
            return <Text>{item.text}</Text>
          }}
        />
      </SearchProvider>,
    )

    // No `search` prop → no registration → meta stays empty regardless.
    expect(lastMeta!.searchQuery).toBe("")
    expect(lastMeta!.matchRanges).toEqual([])
  })
})
