/**
 * Tests for ScrollbackList component and useScrollbackItem hook.
 */

import React, { useEffect } from "react"
import { describe, expect, test } from "vitest"
import { Text, ScrollbackList, useScrollbackItem, OSC133 } from "../src/index.js"
import { createRenderer, stripAnsi } from "inkx/testing"

// ============================================================================
// Types & Helpers
// ============================================================================

interface TestItem {
  id: string
  shouldFreeze: boolean
  snapshotText?: string
}

/** Item component that freezes when told via props. */
function Item({ item }: { item: TestItem }) {
  const { freeze, isFrozen } = useScrollbackItem()

  useEffect(() => {
    if (item.shouldFreeze && !isFrozen) {
      if (item.snapshotText) {
        freeze(<Text>{item.snapshotText}</Text>)
      } else {
        freeze()
      }
    }
  }, [item.shouldFreeze, item.snapshotText, isFrozen, freeze])

  return <Text>Item {item.id}</Text>
}

function createMockStdout() {
  const writes: string[] = []
  return {
    stdout: {
      write(data: string) {
        writes.push(data)
        return true
      },
      columns: 80,
      rows: 24,
    },
    writes,
  }
}

function mkItems(...specs: Array<[string, boolean]>): TestItem[] {
  return specs.map(([id, shouldFreeze]) => ({ id, shouldFreeze }))
}

// ============================================================================
// ScrollbackList tests
// ============================================================================

describe("ScrollbackList", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  test("renders active (non-frozen) items in live area", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", false], ["b", false], ["c", false])

    const app = render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).toContain("Item a")
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("frozen items are excluded from live area", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])

    const app = render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).not.toContain("Item a")
    expect(app.text).not.toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("frozen items are written to stdout with correct content", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true], ["b", false])

    render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    const output = stripAnsi(writes.join(""))
    expect(output).toContain("Item a")
    expect(output).not.toContain("Item b")
  })

  test("isFrozen prop freezes items without needing freeze() call", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])

    // Use isFrozen prop without Item component calling freeze()
    const app = render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Text>Plain {item.id}</Text>}
      </ScrollbackList>,
    )

    // Items a and b should be frozen (excluded from live area)
    expect(app.text).not.toContain("Plain a")
    expect(app.text).not.toContain("Plain b")
    expect(app.text).toContain("Plain c")
  })

  // Footer -----------------------------------------------------------------

  test("footer is always visible regardless of item count", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.shouldFreeze}
        footer={<Text>Status: 3 items</Text>}
      >
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).toContain("Status: 3 items")
  })

  test("footer visible when all items are frozen", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", true])

    const app = render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.shouldFreeze}
        footer={<Text>All done</Text>}
      >
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).toContain("All done")
  })

  // Contiguous prefix ------------------------------------------------------

  test("freezing item 2 without item 0 does not freeze anything", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", false], ["b", false], ["c", true])

    const app = render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    // No contiguous frozen prefix from start, so no writes
    expect(writes).toHaveLength(0)
    // All items should still be in live area
    expect(app.text).toContain("Item a")
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("only first N consecutive frozen items are removed from live area", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", false], ["c", true])

    const app = render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    // Only item a is in contiguous frozen prefix
    expect(app.text).not.toContain("Item a")
    // Items b and c should still be in live area
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  // OSC 133 markers --------------------------------------------------------

  test("markers=true emits OSC 133 markers in stdout writes", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true], ["b", false])

    render(
      <ScrollbackList
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.shouldFreeze}
        markers={true}
      >
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    const allOutput = writes.join("")
    expect(allOutput).toContain(OSC133.promptStart)
    expect(allOutput).toContain(OSC133.commandEnd(0))
  })

  test("markers not set does not emit OSC 133 sequences", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true])

    render(
      <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    const allOutput = writes.join("")
    expect(allOutput).not.toContain("\x1b]133;")
  })

  // Empty items ------------------------------------------------------------

  test("empty items array renders footer only", () => {
    const { stdout, writes } = createMockStdout()

    const app = render(
      <ScrollbackList
        items={[] as TestItem[]}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        footer={<Text>No items yet</Text>}
      >
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).toContain("No items yet")
    expect(writes).toHaveLength(0)
  })

  test("empty items array without footer renders without error", () => {
    const { stdout } = createMockStdout()

    const app = render(
      <ScrollbackList items={[] as TestItem[]} keyExtractor={(t) => t.id} stdout={stdout}>
        {(item) => <Item item={item} />}
      </ScrollbackList>,
    )

    expect(app.text).toBeDefined()
  })

  // Re-render stability ----------------------------------------------------

  test("frozen items are not re-written on footer change", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])
    const isFrozen = (t: TestItem) => t.shouldFreeze

    function TestApp({ extra }: { extra?: string }) {
      return (
        <ScrollbackList
          items={items}
          keyExtractor={(t) => t.id}
          stdout={stdout}
          isFrozen={isFrozen}
          footer={extra ? <Text>{extra}</Text> : undefined}
        >
          {(item) => <Item item={item} />}
        </ScrollbackList>
      )
    }

    const app = render(<TestApp />)
    const initialWriteCount = writes.length
    expect(initialWriteCount).toBeGreaterThan(0)

    app.rerender(<TestApp extra="status update" />)

    // No new writes after re-render (frozen items already written)
    expect(writes.length).toBe(initialWriteCount)
    expect(app.text).toContain("status update")
    expect(app.text).toContain("Item c")
  })

  test("adding new items does not re-write already frozen items", () => {
    const { stdout, writes } = createMockStdout()
    const items1 = mkItems(["a", true], ["b", true], ["c", false])
    const items2 = [...items1, { id: "d", shouldFreeze: false }]
    const isFrozen = (t: TestItem) => t.shouldFreeze

    function TestApp({ items }: { items: TestItem[] }) {
      return (
        <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={isFrozen}>
          {(item) => <Item item={item} />}
        </ScrollbackList>
      )
    }

    const app = render(<TestApp items={items1} />)
    const initialOutput = stripAnsi(writes.join(""))
    expect(initialOutput).toContain("Item a")
    expect(initialOutput).toContain("Item b")

    writes.length = 0
    app.rerender(<TestApp items={items2} />)

    // No new writes (frozen items a,b already written)
    expect(writes).toHaveLength(0)
    expect(app.text).toContain("Item c")
    expect(app.text).toContain("Item d")
  })

  // Incremental freezing ---------------------------------------------------

  test("incremental freezing: freeze items one by one", () => {
    const { stdout, writes } = createMockStdout()

    function TestApp({ freezeCount }: { freezeCount: number }) {
      const items = mkItems(["a", freezeCount >= 1], ["b", freezeCount >= 2], ["c", freezeCount >= 3])
      return (
        <ScrollbackList items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
          {(item) => <Item item={item} />}
        </ScrollbackList>
      )
    }

    // Phase 1: nothing frozen
    const app = render(<TestApp freezeCount={0} />)
    expect(writes).toHaveLength(0)
    expect(app.text).toContain("Item a")
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")

    // Phase 2: freeze item a — removed from live area, written to stdout
    writes.length = 0
    app.rerender(<TestApp freezeCount={1} />)
    const phase2 = stripAnsi(writes.join(""))
    expect(phase2).toContain("Item a")
    expect(phase2).not.toContain("Item b")
    expect(app.text).not.toContain("Item a")
    expect(app.text).toContain("Item b")

    // Phase 3: freeze item b too — only b is newly written
    writes.length = 0
    app.rerender(<TestApp freezeCount={2} />)
    const phase3 = stripAnsi(writes.join(""))
    expect(phase3).toContain("Item b")
    expect(phase3).not.toContain("Item a")
    expect(app.text).not.toContain("Item b")
    expect(app.text).toContain("Item c")
  })
})

// ============================================================================
// useScrollbackItem hook
// ============================================================================

describe("useScrollbackItem", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  test("isFrozen is false before freeze() is called", () => {
    const { stdout } = createMockStdout()
    let capturedIsFrozen: boolean | undefined

    function Inspector() {
      const { isFrozen } = useScrollbackItem()
      capturedIsFrozen = isFrozen
      return <Text>Inspector</Text>
    }

    render(
      <ScrollbackList items={[{ id: "x" }]} keyExtractor={(t: { id: string }) => t.id} stdout={stdout}>
        {() => <Inspector />}
      </ScrollbackList>,
    )

    expect(capturedIsFrozen).toBe(false)
  })

  test("freeze() is idempotent", () => {
    const { stdout, writes } = createMockStdout()
    let freezeFn: (() => void) | undefined

    function ManualFreeze() {
      const { freeze } = useScrollbackItem()
      useEffect(() => {
        freezeFn = () => freeze()
      }, [freeze])
      return <Text>Manual</Text>
    }

    const items = [{ id: "m" }, { id: "b" }]

    render(
      <ScrollbackList items={items} keyExtractor={(t: { id: string }) => t.id} stdout={stdout}>
        {(item) => (item.id === "m" ? <ManualFreeze /> : <Text>Item {item.id}</Text>)}
      </ScrollbackList>,
    )

    freezeFn!()
    const writesAfterFirst = writes.length

    freezeFn!()
    expect(writes.length).toBe(writesAfterFirst)
  })
})
