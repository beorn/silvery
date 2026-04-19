/**
 * Tests for FindProvider interface, provider-aware find state machine,
 * and virtual list find integration.
 */
import { describe, test, expect, vi } from "vitest"
import {
  createFindState,
  findUpdate,
  searchBuffer,
  type FindProvider,
  type FindResult,
  type FindState,
} from "@silvery/headless/find"
import { TerminalBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Helpers
// ============================================================================

function createBufferWithText(lines: string[], width = 40): TerminalBuffer {
  const height = lines.length
  const buf = new TerminalBuffer(width, height)
  for (let y = 0; y < height; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < width; x++) {
      buf.setCell(x, y, { char: line[x]!, fg: null, bg: null })
    }
  }
  return buf
}

function createMockProvider(items: { id: string; text: string }[]): FindProvider {
  return {
    search(query: string): FindResult[] {
      const results: FindResult[] = []
      for (const item of items) {
        const lowerText = item.text.toLowerCase()
        const lowerQuery = query.toLowerCase()
        let idx = 0
        while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
          results.push({
            itemId: item.id,
            offset: idx,
            length: query.length,
          })
          idx++
        }
      }
      return results
    },
    reveal: vi.fn(),
  }
}

// ============================================================================
// FindProvider interface
// ============================================================================

describe("FindProvider interface", () => {
  test("mock provider searches items correctly", () => {
    const provider = createMockProvider([
      { id: "1", text: "Hello World" },
      { id: "2", text: "Hello Again" },
      { id: "3", text: "Goodbye" },
    ])

    const results = provider.search("hello") as FindResult[]
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ itemId: "1", offset: 0, length: 5 })
    expect(results[1]).toEqual({ itemId: "2", offset: 0, length: 5 })
  })

  test("provider returns empty for no matches", () => {
    const provider = createMockProvider([{ id: "1", text: "Hello World" }])

    const results = provider.search("xyz") as FindResult[]
    expect(results).toHaveLength(0)
  })

  test("provider finds multiple matches in same item", () => {
    const provider = createMockProvider([{ id: "1", text: "foo bar foo baz foo" }])

    const results = provider.search("foo") as FindResult[]
    expect(results).toHaveLength(3)
    expect(results[0]!.offset).toBe(0)
    expect(results[1]!.offset).toBe(8)
    expect(results[2]!.offset).toBe(16)
  })

  test("reveal is callable", () => {
    const provider = createMockProvider([{ id: "1", text: "Hello World" }])

    const results = provider.search("hello") as FindResult[]
    provider.reveal(results[0]!)
    expect(provider.reveal).toHaveBeenCalledWith(results[0])
  })

  test("provider with totalCount", () => {
    const provider: FindProvider = {
      search(query: string) {
        return [{ itemId: "1", offset: 0, length: query.length }]
      },
      reveal: vi.fn(),
      totalCount(query: string) {
        return 42
      },
    }

    expect(provider.totalCount!("test")).toBe(42)
  })

  test("async provider search", async () => {
    const provider: FindProvider = {
      async search(query: string) {
        return [{ itemId: "1", offset: 0, length: query.length }]
      },
      reveal: vi.fn(),
    }

    const results = await provider.search("test")
    expect(results).toHaveLength(1)
  })

  test("async reveal", async () => {
    const revealFn = vi.fn(async () => {})
    const provider: FindProvider = {
      search(query: string) {
        return []
      },
      reveal: revealFn,
    }

    await provider.reveal({ itemId: "1", offset: 0, length: 3 })
    expect(revealFn).toHaveBeenCalled()
  })
})

// ============================================================================
// Provider-aware state machine actions
// ============================================================================

describe("findUpdate — providerSearchStarted", () => {
  test("sets providerSearching flag and activates find", () => {
    const state = createFindState()
    const [next, effects] = findUpdate({ type: "providerSearchStarted", query: "hello" }, state)

    expect(next.active).toBe(true)
    expect(next.query).toBe("hello")
    expect(next.providerSearching).toBe(true)
    expect(next.providerResults).toEqual([])
    expect(next.currentIndex).toBe(-1)
    expect(effects).toEqual([{ type: "render" }])
  })
})

describe("findUpdate — setProviderResults", () => {
  test("sets provider results and focuses first result", () => {
    const [searching] = findUpdate(
      { type: "providerSearchStarted", query: "hello" },
      createFindState(),
    )

    const results: FindResult[] = [
      { itemId: "1", offset: 0, length: 5 },
      { itemId: "2", offset: 3, length: 5 },
    ]

    const [next, effects] = findUpdate(
      { type: "setProviderResults", results, query: "hello" },
      searching,
    )

    expect(next.providerResults).toEqual(results)
    expect(next.providerSearching).toBe(false)
    expect(next.currentIndex).toBe(0)
    expect(effects).toContainEqual({ type: "render" })
    expect(effects).toContainEqual({ type: "providerReveal", result: results[0] })
  })

  test("ignores results for stale query", () => {
    const [searching] = findUpdate(
      { type: "providerSearchStarted", query: "hello" },
      createFindState(),
    )

    const results: FindResult[] = [{ itemId: "1", offset: 0, length: 5 }]

    // Send results for a different query
    const [next, effects] = findUpdate(
      { type: "setProviderResults", results, query: "world" },
      searching,
    )

    // Should be ignored — state unchanged
    expect(next).toBe(searching)
    expect(effects).toEqual([])
  })

  test("handles empty results", () => {
    const [searching] = findUpdate(
      { type: "providerSearchStarted", query: "xyz" },
      createFindState(),
    )

    const [next, effects] = findUpdate(
      { type: "setProviderResults", results: [], query: "xyz" },
      searching,
    )

    expect(next.providerResults).toEqual([])
    expect(next.currentIndex).toBe(-1)
    expect(next.providerSearching).toBe(false)
    // Only render, no providerReveal for empty results
    expect(effects).toEqual([{ type: "render" }])
  })
})

describe("findUpdate — revealComplete", () => {
  test("updates provider result with screen coords and adds buffer match", () => {
    // Set up state with provider results
    const [searching] = findUpdate(
      { type: "providerSearchStarted", query: "hello" },
      createFindState(),
    )
    const results: FindResult[] = [{ itemId: "item-1", offset: 5, length: 5 }]
    const [withResults] = findUpdate(
      { type: "setProviderResults", results, query: "hello" },
      searching,
    )

    const [next, effects] = findUpdate(
      {
        type: "revealComplete",
        result: results[0]!,
        row: 3,
        startCol: 5,
        endCol: 9,
      },
      withResults,
    )

    // Provider result should be updated with screen position
    expect(next.providerResults[0]!.row).toBe(3)
    expect(next.providerResults[0]!.startCol).toBe(5)

    // Buffer matches should contain the revealed match for highlighting
    expect(next.matches).toEqual([{ row: 3, startCol: 5, endCol: 9 }])

    expect(effects).toContainEqual({ type: "render" })
    expect(effects).toContainEqual({ type: "scrollTo", row: 3 })
  })
})

// ============================================================================
// Provider-aware next/prev navigation
// ============================================================================

describe("findUpdate — next/prev with provider results", () => {
  function stateWithProviderResults(count: number): FindState {
    const results: FindResult[] = Array.from({ length: count }, (_, i) => ({
      itemId: `item-${i}`,
      offset: 0,
      length: 5,
    }))

    const [searching] = findUpdate(
      { type: "providerSearchStarted", query: "test" },
      createFindState(),
    )
    const [withResults] = findUpdate(
      { type: "setProviderResults", results, query: "test" },
      searching,
    )
    return withResults
  }

  test("next navigates through provider results", () => {
    let state = stateWithProviderResults(3)
    expect(state.currentIndex).toBe(0)

    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(1)

    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(2)

    // Wraps around
    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(0)
  })

  test("prev navigates backwards through provider results", () => {
    let state = stateWithProviderResults(3)
    expect(state.currentIndex).toBe(0)

    // Wraps to last
    ;[state] = findUpdate({ type: "prev" }, state)
    expect(state.currentIndex).toBe(2)

    ;[state] = findUpdate({ type: "prev" }, state)
    expect(state.currentIndex).toBe(1)
  })

  test("next emits providerReveal for current result", () => {
    const state = stateWithProviderResults(3)
    const [, effects] = findUpdate({ type: "next" }, state)

    expect(effects).toContainEqual({
      type: "providerReveal",
      result: { itemId: "item-1", offset: 0, length: 5 },
    })
  })

  test("prev emits providerReveal for current result", () => {
    const state = stateWithProviderResults(3)
    const [, effects] = findUpdate({ type: "prev" }, state)

    expect(effects).toContainEqual({
      type: "providerReveal",
      result: { itemId: "item-2", offset: 0, length: 5 },
    })
  })
})

// ============================================================================
// close resets everything including provider state
// ============================================================================

describe("findUpdate — close with provider state", () => {
  test("close resets all provider state", () => {
    const [searching] = findUpdate(
      { type: "providerSearchStarted", query: "hello" },
      createFindState(),
    )
    const results: FindResult[] = [{ itemId: "1", offset: 0, length: 5 }]
    const [withResults] = findUpdate(
      { type: "setProviderResults", results, query: "hello" },
      searching,
    )

    const [next, effects] = findUpdate({ type: "close" }, withResults)

    expect(next.active).toBe(false)
    expect(next.query).toBeNull()
    expect(next.providerResults).toEqual([])
    expect(next.providerSearching).toBe(false)
    expect(next.matches).toHaveLength(0)
    expect(effects).toEqual([{ type: "render" }])
  })
})

// ============================================================================
// Buffer search still works (backward compat)
// ============================================================================

describe("findUpdate — buffer search backward compat", () => {
  test("search action still uses buffer search", () => {
    const buf = createBufferWithText(["hello world hello"])
    const state = createFindState()
    const [next] = findUpdate({ type: "search", query: "hello", buffer: buf }, state)

    expect(next.active).toBe(true)
    expect(next.matches).toHaveLength(2)
    expect(next.providerResults).toEqual([])
  })

  test("next/prev without provider results uses buffer matches", () => {
    const buf = createBufferWithText(["a b a c a"])
    let [state] = findUpdate({ type: "search", query: "a", buffer: buf }, createFindState())

    expect(state.currentIndex).toBe(0)

    ;[state] = findUpdate({ type: "next" }, state)
    expect(state.currentIndex).toBe(1)

    ;[state] = findUpdate({ type: "prev" }, state)
    expect(state.currentIndex).toBe(0)
  })
})
