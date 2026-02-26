/**
 * VirtualList virtualized prop & useScrollback hook tests
 *
 * Tests for scrollback/virtualize mode where completed items are excluded
 * from VirtualList rendering via a contiguous virtualized prefix.
 */

import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { Box, Text, VirtualList } from "../src/index.js"
import { initYogaEngine, setLayoutEngine } from "../src/render.js"
import { createRenderer } from "inkx/testing"
import { useScrollback } from "../src/hooks/useScrollback.js"

// Initialize layout engine before tests
beforeAll(async () => {
  const engine = await initYogaEngine()
  setLayoutEngine(engine)
})

const render = createRenderer({ cols: 40, rows: 10 })

interface TestItem {
  id: number
  name: string
  complete: boolean
}

describe("VirtualList virtualized prop", () => {
  test("renders non-virtualized items only", () => {
    const items: TestItem[] = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "done-2", complete: true },
      { id: 3, name: "active-3", complete: false },
      { id: 4, name: "active-4", complete: false },
    ]

    const app = render(
      <VirtualList
        items={items}
        virtualized={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    // Virtualized items should NOT be in the rendered output
    expect(app.text).not.toContain("done-1")
    expect(app.text).not.toContain("done-2")
    // Active items should be rendered
    expect(app.text).toContain("active-3")
    expect(app.text).toContain("active-4")
  })

  test("handles all items virtualized", () => {
    const items: TestItem[] = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "done-2", complete: true },
    ]

    const app = render(
      <VirtualList
        items={items}
        virtualized={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).not.toContain("done-1")
    expect(app.text).not.toContain("done-2")
  })

  test("only freezes contiguous prefix", () => {
    const items: TestItem[] = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "active-2", complete: false },
      { id: 3, name: "done-3", complete: true }, // NOT virtualized — not contiguous
    ]

    const app = render(
      <VirtualList
        items={items}
        virtualized={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).not.toContain("done-1") // virtualized (prefix)
    expect(app.text).toContain("active-2") // not virtualized
    expect(app.text).toContain("done-3") // not virtualized (not contiguous)
  })

  test("without virtualized prop, renders all items", () => {
    const items: TestItem[] = [
      { id: 1, name: "item-1", complete: true },
      { id: 2, name: "item-2", complete: false },
    ]

    const app = render(
      <VirtualList
        items={items}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).toContain("item-1")
    expect(app.text).toContain("item-2")
  })

  test("preserves original indices in renderItem", () => {
    const indices: number[] = []
    const items: TestItem[] = [
      { id: 1, name: "done", complete: true },
      { id: 2, name: "active", complete: false },
    ]

    render(
      <VirtualList
        items={items}
        virtualized={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item, index) => {
          indices.push(index)
          return <Text key={item.id}>{item.name}</Text>
        }}
      />,
    )

    // Index 1 (active item) should still get its original index
    expect(indices).toContain(1)
    expect(indices).not.toContain(0)
  })

  test("virtualized with no matching items renders all", () => {
    const items: TestItem[] = [
      { id: 1, name: "active-1", complete: false },
      { id: 2, name: "active-2", complete: false },
      { id: 3, name: "active-3", complete: false },
    ]

    const app = render(
      <VirtualList
        items={items}
        virtualized={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    expect(app.text).toContain("active-1")
    expect(app.text).toContain("active-2")
    expect(app.text).toContain("active-3")
  })

  test("virtualized with empty items array", () => {
    const items: TestItem[] = []

    const app = render(
      <VirtualList
        items={items}
        virtualized={(item) => item.complete}
        height={10}
        itemHeight={1}
        scrollTo={0}
        renderItem={(item) => <Text key={item.id}>{item.name}</Text>}
      />,
    )

    // Should render empty without errors
    expect(app.text).toBe("")
  })
})

describe("useScrollback", () => {
  test("writes newly frozen items to stdout", () => {
    const items = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "done-2", complete: true },
      { id: 3, name: "active", complete: false },
    ]

    const writtenChunks: string[] = []
    const mockStdout = {
      write(data: string) {
        writtenChunks.push(data)
        return true
      },
    }

    function TestComponent() {
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.complete,
        render: (item) => `[${item.complete ? "x" : " "}] ${item.name}`,
        stdout: mockStdout,
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestComponent />)

    // useScrollback should have written frozen items
    expect(writtenChunks.join("")).toContain("[x] done-1")
    expect(writtenChunks.join("")).toContain("[x] done-2")
    expect(writtenChunks.join("")).not.toContain("active")
    expect(app.text).toContain("frozen=2")
  })

  test("returns 0 when no items are frozen", () => {
    const items = [
      { id: 1, name: "active-1", complete: false },
      { id: 2, name: "active-2", complete: false },
    ]

    function TestComponent() {
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.complete,
        render: (item) => item.name,
        stdout: { write: () => true },
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestComponent />)
    expect(app.text).toContain("frozen=0")
  })

  test("only counts contiguous prefix", () => {
    const items = [
      { id: 1, name: "done-1", complete: true },
      { id: 2, name: "active", complete: false },
      { id: 3, name: "done-3", complete: true },
    ]

    function TestComponent() {
      const frozenCount = useScrollback(items, {
        frozen: (item) => item.complete,
        render: (item) => item.name,
        stdout: { write: () => true },
      })
      return <Text>frozen={frozenCount}</Text>
    }

    const app = render(<TestComponent />)
    expect(app.text).toContain("frozen=1")
  })
})

// ---------------------------------------------------------------------------
// Chat agent pattern: useScrollback + dynamic render area
// ---------------------------------------------------------------------------

interface Exchange {
  id: number
  content: string
  frozen: boolean
}

function makeExchanges(count: number, frozen = false): Exchange[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    content: `exchange-${i + 1}`,
    frozen,
  }))
}

function ChatAgent({
  exchanges,
  mockStdout,
  extra,
}: {
  exchanges: Exchange[]
  mockStdout: { write(s: string): boolean }
  extra?: string
}) {
  const frozenCount = useScrollback(exchanges, {
    frozen: (e) => e.frozen,
    render: (e) => `[${e.id}] ${e.content}`,
    stdout: mockStdout,
  })

  const active = exchanges.filter((e) => !e.frozen)

  return (
    <Box flexDirection="column">
      {active.map((e) => (
        <Text key={e.id}>{e.content}</Text>
      ))}
      {extra && <Text>{extra}</Text>}
      <Text>
        active={active.length} frozen={frozenCount}
      </Text>
    </Box>
  )
}

describe("scrollback: chat agent pattern", () => {
  test("incremental freezing: freeze one at a time", () => {
    const chunks: string[] = []
    const mockStdout = {
      write(data: string) {
        chunks.push(data)
        return true
      },
    }

    // Start with 5 unfrozen exchanges
    const exchanges = makeExchanges(5, false)

    const app = render(<ChatAgent exchanges={[...exchanges]} mockStdout={mockStdout} />)
    expect(app.text).toContain("active=5 frozen=0")
    expect(chunks).toHaveLength(0)

    // Freeze them one at a time
    for (let i = 0; i < 5; i++) {
      exchanges[i]!.frozen = true
      chunks.length = 0

      app.rerender(<ChatAgent exchanges={[...exchanges]} mockStdout={mockStdout} />)

      // Newly frozen exchange should be written to stdout
      const output = chunks.join("")
      expect(output).toContain(`[${i + 1}] exchange-${i + 1}`)

      // Dynamic area should show correct counts
      expect(app.text).toContain(`active=${5 - (i + 1)} frozen=${i + 1}`)

      // Already-frozen items should NOT appear in the rendered area
      for (let j = 0; j <= i; j++) {
        expect(app.text).not.toContain(`exchange-${j + 1}`)
      }
    }
  })

  test("dynamic area stays small after freezing many exchanges", () => {
    const chunks: string[] = []
    const mockStdout = {
      write(data: string) {
        chunks.push(data)
        return true
      },
    }

    // Create 10 frozen exchanges + 1 active
    const exchanges: Exchange[] = [...makeExchanges(10, true), { id: 11, content: "current-work", frozen: false }]

    const app = render(<ChatAgent exchanges={exchanges} mockStdout={mockStdout} />)

    // Only the active exchange should be in the dynamic render area
    expect(app.text).toContain("current-work")
    expect(app.text).toContain("active=1 frozen=10")

    // None of the frozen exchanges should be in the dynamic area
    for (let i = 1; i <= 10; i++) {
      expect(app.text).not.toContain(`exchange-${i}`)
    }

    // All 10 frozen exchanges should have been written to stdout
    const stdoutOutput = chunks.join("")
    for (let i = 1; i <= 10; i++) {
      expect(stdoutOutput).toContain(`[${i}] exchange-${i}`)
    }
  })

  test("compaction simulation: freeze all then replace dynamic content", () => {
    const chunks: string[] = []
    const mockStdout = {
      write(data: string) {
        chunks.push(data)
        return true
      },
    }

    // Start with 5 unfrozen exchanges
    const exchanges = makeExchanges(5, false)
    const app = render(<ChatAgent exchanges={[...exchanges]} mockStdout={mockStdout} />)
    expect(app.text).toContain("active=5 frozen=0")

    // Freeze all at once
    for (const e of exchanges) e.frozen = true
    app.rerender(<ChatAgent exchanges={[...exchanges]} mockStdout={mockStdout} />)

    // All should be in stdout
    const stdoutOutput = chunks.join("")
    for (let i = 1; i <= 5; i++) {
      expect(stdoutOutput).toContain(`[${i}] exchange-${i}`)
    }

    // Dynamic area should show 0 active
    expect(app.text).toContain("active=0 frozen=5")

    // Now replace dynamic content with recovery message
    app.rerender(<ChatAgent exchanges={[...exchanges]} mockStdout={mockStdout} extra="Context recovered" />)

    expect(app.text).toContain("Context recovered")
    expect(app.text).toContain("active=0 frozen=5")
  })

  test("unicode content in scrollback: emoji, CJK, combining chars", () => {
    const chunks: string[] = []
    const mockStdout = {
      write(data: string) {
        chunks.push(data)
        return true
      },
    }

    const exchanges: Exchange[] = [
      { id: 1, content: "Fix bug 🔧🐛✅", frozen: true },
      { id: 2, content: "日本語テスト", frozen: true },
      { id: 3, content: "café résumé naïve", frozen: true },
      { id: 4, content: "active task", frozen: false },
    ]

    const app = render(<ChatAgent exchanges={exchanges} mockStdout={mockStdout} />)

    const stdoutOutput = chunks.join("")
    expect(stdoutOutput).toContain("[1] Fix bug 🔧🐛✅")
    expect(stdoutOutput).toContain("[2] 日本語テスト")
    expect(stdoutOutput).toContain("[3] café résumé naïve")
    expect(stdoutOutput).not.toContain("active task")

    // Dynamic area should only show the active exchange
    expect(app.text).toContain("active task")
    expect(app.text).toContain("active=1 frozen=3")
  })

  test("many items performance: freeze 200 items in a single batch", () => {
    const chunks: string[] = []
    const mockStdout = {
      write(data: string) {
        chunks.push(data)
        return true
      },
    }

    const exchanges = makeExchanges(200, true)
    const app = render(<ChatAgent exchanges={exchanges} mockStdout={mockStdout} />)

    // All 200 should be written to stdout
    const stdoutOutput = chunks.join("")
    for (let i = 1; i <= 200; i++) {
      expect(stdoutOutput).toContain(`[${i}] exchange-${i}`)
    }

    // Component should render without error, showing 0 active
    expect(app.text).toContain("active=0 frozen=200")
  })

  test("re-render stability: frozen items are not re-written to stdout", () => {
    const chunks: string[] = []
    const mockStdout = {
      write(data: string) {
        chunks.push(data)
        return true
      },
    }

    // Start with 3 frozen + 1 active
    const exchanges: Exchange[] = [...makeExchanges(3, true), { id: 4, content: "active-work", frozen: false }]

    const app = render(<ChatAgent exchanges={exchanges} mockStdout={mockStdout} />)

    // Initial render writes 3 frozen items
    expect(chunks).toHaveLength(3)
    const initialOutput = chunks.join("")
    for (let i = 1; i <= 3; i++) {
      expect(initialOutput).toContain(`[${i}] exchange-${i}`)
    }

    // Clear chunks and trigger a re-render with same frozen state but different extra text
    chunks.length = 0
    app.rerender(<ChatAgent exchanges={exchanges} mockStdout={mockStdout} extra="status update" />)

    // No new writes should occur — frozen count hasn't changed
    expect(chunks).toHaveLength(0)

    // Content should still be correct
    expect(app.text).toContain("active-work")
    expect(app.text).toContain("status update")
    expect(app.text).toContain("active=1 frozen=3")
  })
})
