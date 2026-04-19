/**
 * ListView cache backend selection tests.
 *
 * Verifies mode-agnostic cache backend selection:
 * - Default (no CacheBackendContext) → "virtual" mode uses HistoryBuffer
 * - CacheBackendContext="virtual" → HistoryBuffer (fullscreen)
 * - CacheBackendContext="terminal" → promoteScrollback (inline mode)
 * - cache=true resolves to "auto" which reads context
 * - Explicit mode overrides context (mode="virtual" ignores context)
 */

import React, { useContext } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "../../src/index.js"
import { ListView, type ListViewHandle } from "../../packages/ag-react/src/ui/components/ListView"
import {
  CacheBackendContext,
  StdoutContext,
  type StdoutContextValue,
} from "../../packages/ag-react/src/context"

// ============================================================================
// Test Helpers
// ============================================================================

interface Item {
  id: string
  text: string
  done: boolean
}

function makeItems(count: number, allDone = false): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    text: `Item ${i + 1}`,
    done: allDone || i < 2, // first 2 done by default
  }))
}

function createMockStdoutCtx(): { ctx: StdoutContextValue; promoted: string[] } {
  const promoted: string[] = []
  const ctx: StdoutContextValue = {
    stdout: process.stdout,
    write: () => {},
    promoteScrollback: (content: string, _lines: number) => {
      promoted.push(content)
    },
  }
  return { ctx, promoted }
}

// ============================================================================
// Tests
// ============================================================================

describe("ListView cache backend", () => {
  // ── Default behavior (no context) ─────────────────────────────────

  test("cache=true defaults to virtual mode (no context provider)", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <ListView
        ref={listRef}
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{ mode: "auto", isCacheable: (m) => m.done }}
        renderItem={(msg) => <Text>{msg.text}</Text>}
      />,
    )

    // Without context provider, CacheBackendContext defaults to "virtual"
    // so auto resolves to virtual → HistoryBuffer should be populated
    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    expect(buf!.itemCount).toBe(2) // first 2 items are done
  })

  // ── CacheBackendContext="virtual" ─────────────────────────────────

  test("CacheBackendContext=virtual uses HistoryBuffer", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <CacheBackendContext.Provider value="virtual">
        <ListView
          ref={listRef}
          items={items}
          getKey={(m) => m.id}
          height={10}
          cache={true}
          renderItem={(msg) => <Text>{msg.text}</Text>}
        />
      </CacheBackendContext.Provider>,
    )

    // cache=true + context="virtual" → auto resolves to virtual
    // But without isCacheable, cachedCount=0, so buffer has no items
    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    expect(buf!.itemCount).toBe(0) // no isCacheable = nothing cached
  })

  test("CacheBackendContext=virtual with isCacheable populates buffer", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <CacheBackendContext.Provider value="virtual">
        <ListView
          ref={listRef}
          items={items}
          getKey={(m) => m.id}
          height={10}
          cache={{ mode: "auto", isCacheable: (m) => m.done }}
          renderItem={(msg) => <Text>{msg.text}</Text>}
        />
      </CacheBackendContext.Provider>,
    )

    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    expect(buf!.itemCount).toBe(2)
  })

  // ── CacheBackendContext="terminal" ─────────────────────────────────

  test("CacheBackendContext=terminal uses promoteScrollback", () => {
    const { ctx, promoted } = createMockStdoutCtx()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <CacheBackendContext.Provider value="terminal">
        <StdoutContext.Provider value={ctx}>
          <ListView
            items={items}
            getKey={(m) => m.id}
            height={10}
            cache={{ mode: "auto", isCacheable: (m) => m.done }}
            renderItem={(msg) => <Text>{msg.text}</Text>}
          />
        </StdoutContext.Provider>
      </CacheBackendContext.Provider>,
    )

    // Terminal mode: items promoted to scrollback, not HistoryBuffer
    expect(promoted.length).toBe(2) // 2 done items promoted
    expect(promoted[0]).toContain("Item 1")
    expect(promoted[1]).toContain("Item 2")

    // Live items still render normally
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 3")
    expect(text).toContain("Item 4")
    // Promoted items should NOT appear in live render
    expect(text).not.toContain("Item 1")
    expect(text).not.toContain("Item 2")
  })

  test("CacheBackendContext=terminal does not create HistoryBuffer", () => {
    const { ctx } = createMockStdoutCtx()
    const listRef = React.createRef<ListViewHandle>()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <CacheBackendContext.Provider value="terminal">
        <StdoutContext.Provider value={ctx}>
          <ListView
            ref={listRef}
            items={items}
            getKey={(m) => m.id}
            height={10}
            cache={{ mode: "auto", isCacheable: (m) => m.done }}
            renderItem={(msg) => <Text>{msg.text}</Text>}
          />
        </StdoutContext.Provider>
      </CacheBackendContext.Provider>,
    )

    // Terminal mode should NOT have a HistoryBuffer
    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).toBeNull()
  })

  // ── Explicit mode overrides context ────────────────────────────────

  test("explicit mode=virtual ignores terminal context", () => {
    const { ctx, promoted } = createMockStdoutCtx()
    const listRef = React.createRef<ListViewHandle>()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <CacheBackendContext.Provider value="terminal">
        <StdoutContext.Provider value={ctx}>
          <ListView
            ref={listRef}
            items={items}
            getKey={(m) => m.id}
            height={10}
            cache={{ mode: "virtual", isCacheable: (m) => m.done }}
            renderItem={(msg) => <Text>{msg.text}</Text>}
          />
        </StdoutContext.Provider>
      </CacheBackendContext.Provider>,
    )

    // Explicit mode="virtual" should use HistoryBuffer even with terminal context
    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    expect(buf!.itemCount).toBe(2)
    // Nothing should be promoted to scrollback
    expect(promoted.length).toBe(0)
  })

  test("explicit mode=terminal ignores virtual context", () => {
    const { ctx, promoted } = createMockStdoutCtx()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <CacheBackendContext.Provider value="virtual">
        <StdoutContext.Provider value={ctx}>
          <ListView
            items={items}
            getKey={(m) => m.id}
            height={10}
            cache={{ mode: "terminal", isCacheable: (m) => m.done }}
            renderItem={(msg) => <Text>{msg.text}</Text>}
          />
        </StdoutContext.Provider>
      </CacheBackendContext.Provider>,
    )

    // Explicit mode="terminal" should promote to scrollback even with virtual context
    expect(promoted.length).toBe(2)
  })

  // ── mode="none" ───────────────────────────────────────────────────

  test("mode=none disables caching regardless of context", () => {
    const { ctx, promoted } = createMockStdoutCtx()
    const items = makeItems(4)

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <CacheBackendContext.Provider value="terminal">
        <StdoutContext.Provider value={ctx}>
          <ListView
            items={items}
            getKey={(m) => m.id}
            height={10}
            cache={{ mode: "none", isCacheable: (m) => m.done }}
            renderItem={(msg) => <Text>{msg.text}</Text>}
          />
        </StdoutContext.Provider>
      </CacheBackendContext.Provider>,
    )

    // mode="none" — no caching at all
    expect(promoted.length).toBe(0)
    const text = stripAnsi(app.text)
    expect(text).toContain("Item 1") // all items render live
    expect(text).toContain("Item 2")
  })
})
