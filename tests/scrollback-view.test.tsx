/**
 * ScrollbackView Component Tests
 *
 * Tests for the native scrollback view with automatic item lifecycle management.
 */

import React, { useEffect } from "react"
import { describe, expect, test } from "vitest"
import { Text, useScrollbackItem, OSC133 } from "../src/index.js"
import { ScrollbackView } from "../src/components/ScrollbackView.js"
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
// ScrollbackView tests
// ============================================================================

describe("ScrollbackView", () => {
  const render = createRenderer({ cols: 80, rows: 24 })

  test("renders active (non-frozen) items in live area", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", false], ["b", false], ["c", false])

    const app = render(
      <ScrollbackView items={items} keyExtractor={(t) => t.id} stdout={stdout}>
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    expect(app.text).toContain("Item a")
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("frozen items are excluded from live area", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])

    const app = render(
      <ScrollbackView items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    expect(app.text).not.toContain("Item a")
    expect(app.text).not.toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("frozen items are written to stdout with correct content", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true], ["b", false])

    render(
      <ScrollbackView items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    const output = stripAnsi(writes.join(""))
    expect(output).toContain("Item a")
    expect(output).not.toContain("Item b")
  })

  test("footer is always visible", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])

    const app = render(
      <ScrollbackView
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.shouldFreeze}
        footer={<Text>Status: 3 items</Text>}
      >
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    expect(app.text).toContain("Status: 3 items")
  })

  test("maxHistory prop is accepted", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", false])

    // Just verify it doesn't crash with the prop
    const app = render(
      <ScrollbackView items={items} keyExtractor={(t) => t.id} stdout={stdout} maxHistory={5000}>
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    expect(app.text).toContain("Item a")
  })

  test("contiguous prefix: only first N consecutive frozen items are removed", () => {
    const { stdout } = createMockStdout()
    const items = mkItems(["a", true], ["b", false], ["c", true])

    const app = render(
      <ScrollbackView items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    // Only item a is in contiguous frozen prefix
    expect(app.text).not.toContain("Item a")
    // Items b and c should still be in live area
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("markers=true emits OSC 133 markers", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true], ["b", false])

    render(
      <ScrollbackView
        items={items}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        isFrozen={(t) => t.shouldFreeze}
        markers={true}
      >
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    const allOutput = writes.join("")
    expect(allOutput).toContain(OSC133.promptStart)
    expect(allOutput).toContain(OSC133.commandEnd(0))
  })

  test("empty items array renders footer only", () => {
    const { stdout, writes } = createMockStdout()

    const app = render(
      <ScrollbackView
        items={[] as TestItem[]}
        keyExtractor={(t) => t.id}
        stdout={stdout}
        footer={<Text>No items yet</Text>}
      >
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    expect(app.text).toContain("No items yet")
    expect(writes).toHaveLength(0)
  })

  test("incremental freezing: freeze items one by one", () => {
    const { stdout, writes } = createMockStdout()

    function TestApp({ freezeCount }: { freezeCount: number }) {
      const items = mkItems(["a", freezeCount >= 1], ["b", freezeCount >= 2], ["c", freezeCount >= 3])
      return (
        <ScrollbackView items={items} keyExtractor={(t) => t.id} stdout={stdout} isFrozen={(t) => t.shouldFreeze}>
          {(item) => <Item item={item} />}
        </ScrollbackView>
      )
    }

    // Phase 1: nothing frozen
    const app = render(<TestApp freezeCount={0} />)
    expect(writes).toHaveLength(0)
    expect(app.text).toContain("Item a")
    expect(app.text).toContain("Item b")
    expect(app.text).toContain("Item c")

    // Phase 2: freeze item a
    writes.length = 0
    app.rerender(<TestApp freezeCount={1} />)
    const phase2 = stripAnsi(writes.join(""))
    expect(phase2).toContain("Item a")
    expect(phase2).not.toContain("Item b")
    expect(app.text).not.toContain("Item a")
    expect(app.text).toContain("Item b")

    // Phase 3: freeze item b too
    writes.length = 0
    app.rerender(<TestApp freezeCount={2} />)
    const phase3 = stripAnsi(writes.join(""))
    expect(phase3).toContain("Item b")
    expect(phase3).not.toContain("Item a")
    expect(app.text).not.toContain("Item b")
    expect(app.text).toContain("Item c")
  })

  test("frozen items are not re-written on re-render", () => {
    const { stdout, writes } = createMockStdout()
    const items = mkItems(["a", true], ["b", true], ["c", false])
    const isFrozen = (t: TestItem) => t.shouldFreeze

    function TestApp({ extra }: { extra?: string }) {
      return (
        <ScrollbackView
          items={items}
          keyExtractor={(t) => t.id}
          stdout={stdout}
          isFrozen={isFrozen}
          footer={extra ? <Text>{extra}</Text> : undefined}
        >
          {(item) => <Item item={item} />}
        </ScrollbackView>
      )
    }

    const app = render(<TestApp />)
    const initialWriteCount = writes.length
    expect(initialWriteCount).toBeGreaterThan(0)

    app.rerender(<TestApp extra="status update" />)

    // No new writes after re-render
    expect(writes.length).toBe(initialWriteCount)
    expect(app.text).toContain("status update")
    expect(app.text).toContain("Item c")
  })

  test("resize triggers re-render and re-emits frozen items (no width prop)", () => {
    // Mock stdout with event emitter support (needed for resize detection)
    const { EventEmitter } = require("events")
    const emitter = new EventEmitter()
    const writes: string[] = []
    const resizableStdout = {
      write(data: string) { writes.push(data); return true },
      columns: 80,
      rows: 24,
      on(event: string, listener: (...args: unknown[]) => void) {
        emitter.on(event, listener)
        return resizableStdout
      },
      off(event: string, listener: (...args: unknown[]) => void) {
        emitter.off(event, listener)
        return resizableStdout
      },
    }

    const items = mkItems(["a", true], ["b", true], ["c", false])

    // No width prop — ScrollbackView should track via resize listener
    const app = render(
      <ScrollbackView
        items={items}
        keyExtractor={(t) => t.id}
        stdout={resizableStdout}
        isFrozen={(t) => t.shouldFreeze}
      >
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    // Items a and b should be frozen and written
    expect(app.text).not.toContain("Item a")
    expect(app.text).not.toContain("Item b")
    expect(app.text).toContain("Item c")
    const initialWriteCount = writes.length
    expect(initialWriteCount).toBeGreaterThan(0) // frozen items were written

    // Simulate terminal resize: update columns and emit event
    resizableStdout.columns = 40
    emitter.emit("resize")

    // Re-render to pick up the width state change
    app.rerender(
      <ScrollbackView
        items={items}
        keyExtractor={(t) => t.id}
        stdout={resizableStdout}
        isFrozen={(t) => t.shouldFreeze}
      >
        {(item) => <Item item={item} />}
      </ScrollbackView>,
    )

    // Should have re-emitted frozen items after resize
    expect(writes.length).toBeGreaterThan(initialWriteCount)

    // The re-emission should include the clear sequence
    const allOutput = writes.join("")
    expect(allOutput).toContain("\x1b[9999A") // cursor up max
    expect(allOutput).toContain("\x1b[J") // erase below
  })
})
