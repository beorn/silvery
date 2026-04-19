/**
 * ListView virtual cache mode tests.
 *
 * Verifies:
 * - Items freeze when isCacheable returns true (contiguous prefix)
 * - Frozen items leave the React tree
 * - HistoryBuffer accumulates frozen items
 * - Scroll anchor: stays at tail by default, preserves position when scrolled up
 * - getText provides semantic search text
 * - Basic rendering without cache (mode="none")
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "../../src/index.js"
import {
  ListView,
  type ListViewHandle,
  type ListItemMeta,
} from "../../packages/ag-react/src/ui/components/ListView"

// ============================================================================
// Test Helpers
// ============================================================================

interface Message {
  id: string
  body: string
  delivered: boolean
}

function MessageItem({ msg, isCursor }: { msg: Message; isCursor?: boolean }) {
  return <Text inverse={isCursor}>{msg.body}</Text>
}

// ============================================================================
// Tests
// ============================================================================

describe("ListView", () => {
  // ── Basic rendering (no cache) ────────────────────────────────

  test("renders all items with no cache mode", () => {
    const items: Message[] = [
      { id: "1", body: "Hello", delivered: false },
      { id: "2", body: "World", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("Hello")
    expect(text).toContain("World")
  })

  // ── Virtual cache: isCacheable ─────────────────────────────────

  test("isCacheable removes frozen items from live render", () => {
    const items: Message[] = [
      { id: "1", body: "Delivered msg", delivered: true },
      { id: "2", body: "Also delivered", delivered: true },
      { id: "3", body: "Still pending", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{
          mode: "virtual",
          isCacheable: (m) => (m as Message).delivered,
        }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    // Frozen items should NOT appear in live render
    expect(text).not.toContain("Delivered msg")
    expect(text).not.toContain("Also delivered")
    // Non-frozen items should still render
    expect(text).toContain("Still pending")
  })

  test("only freezes contiguous prefix", () => {
    const items: Message[] = [
      { id: "1", body: "Done 1", delivered: true },
      { id: "2", body: "Not done", delivered: false },
      { id: "3", body: "Done 2", delivered: true }, // NOT frozen (gap in prefix)
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(
      <ListView
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{
          mode: "virtual",
          isCacheable: (m) => (m as Message).delivered,
        }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const text = stripAnsi(app.text)
    expect(text).not.toContain("Done 1") // frozen (contiguous prefix)
    expect(text).toContain("Not done") // not frozen
    expect(text).toContain("Done 2") // not frozen (gap breaks prefix)
  })

  // ── Cache buffer accumulation ─────────────────────────────────

  test("frozen items accumulate in history buffer", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items: Message[] = [
      { id: "1", body: "First message", delivered: true },
      { id: "2", body: "Second message", delivered: true },
      { id: "3", body: "Third message", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <ListView
        ref={listRef}
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{
          mode: "virtual",
          isCacheable: (m) => (m as Message).delivered,
        }}
        search={{
          getText: (m) => (m as Message).body,
        }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    expect(buf!.itemCount).toBe(2)
    expect(buf!.totalRows).toBe(2)
  })

  // ── getItemText for search ──────────────────────────────────────

  test("getItemText provides searchable text in history", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items: Message[] = [
      { id: "1", body: "important note", delivered: true },
      { id: "2", body: "another note", delivered: true },
      { id: "3", body: "pending", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <ListView
        ref={listRef}
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{
          mode: "virtual",
          isCacheable: (m) => (m as Message).delivered,
        }}
        search={{
          getText: (m) => (m as Message).body,
        }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    const matches = buf!.search("important")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toBe(0)
  })

  // ── Viewport composition ────────────────────────────────────────

  test("composed viewport at tail shows no history rows", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items: Message[] = [
      { id: "1", body: "Old msg", delivered: true },
      { id: "2", body: "New msg", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <ListView
        ref={listRef}
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{
          mode: "virtual",
          isCacheable: (m) => (m as Message).delivered,
        }}
        search={{
          getText: (m) => (m as Message).body,
        }}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    const viewport = listRef.current?.getComposedViewport()
    expect(viewport).not.toBeNull()
    expect(viewport!.isScrolledUp).toBe(false)
    expect(viewport!.overlayRows).toEqual([])
  })

  // ── ANSI capture in cache buffer ─────────────────────────────────

  test("cached items contain rendered ANSI, not just plain text", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items: Message[] = [
      { id: "1", body: "Styled msg", delivered: true },
      { id: "2", body: "Also styled", delivered: true },
      { id: "3", body: "Still pending", delivered: false },
    ]

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <ListView
        ref={listRef}
        items={items}
        getKey={(m) => m.id}
        height={10}
        cache={{
          mode: "virtual",
          isCacheable: (m) => (m as Message).delivered,
        }}
        renderItem={(msg) => <Text bold>{msg.body}</Text>}
      />,
    )

    const buf = listRef.current?.getHistoryBuffer()
    expect(buf).not.toBeNull()
    expect(buf!.itemCount).toBe(2)

    // The cached ANSI rows should contain actual ANSI escape codes (bold)
    const rows = buf!.getRows(0, 2)
    expect(rows[0]).toContain("\x1b[") // has ANSI codes
    expect(rows[0]).toContain("Styled msg")

    // Plain text rows should have the text without ANSI
    const plainRows = buf!.getPlainTextRows(0, 2)
    expect(plainRows[0]).toContain("Styled msg")
    expect(plainRows[0]).not.toContain("\x1b[")
  })

  // ── No history buffer when mode="none" ──────────────────────────

  test("no history buffer created when mode is none", () => {
    const listRef = React.createRef<ListViewHandle>()
    const items: Message[] = [{ id: "1", body: "msg", delivered: false }]

    const r = createRenderer({ cols: 40, rows: 10 })
    r(
      <ListView
        ref={listRef}
        items={items}
        getKey={(m) => m.id}
        height={10}
        renderItem={(msg) => <Text>{msg.body}</Text>}
      />,
    )

    expect(listRef.current?.getHistoryBuffer()).toBeNull()
    expect(listRef.current?.getComposedViewport()).toBeNull()
  })
})
