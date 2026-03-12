/**
 * ScrollbackList component-level tests.
 *
 * Verifies that ScrollbackList correctly:
 * - Renders all items when none are frozen
 * - Removes frozen items from the live render area
 * - Writes frozen items to stdout
 * - Preserves footer after freezing
 * - Enforces the contiguous prefix invariant
 * - Handles progressive freezing
 *
 * These tests complement the output-phase tests in inline-bleed.test.tsx
 * by testing at the component level rather than the rendering pipeline level.
 */

import React, { useEffect, useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ScrollbackList } from "../../packages/ui/src/components/ScrollbackList"
import { useScrollbackItem } from "../../packages/react/src/hooks/useScrollbackItem"

// ============================================================================
// Test Helpers
// ============================================================================

interface Task {
  id: string
  title: string
  done: boolean
}

function createMockStdout() {
  const writes: string[] = []
  return {
    write(data: string) {
      writes.push(data)
      return true
    },
    get output() {
      return writes.join("")
    },
    get writes() {
      return writes
    },
    columns: 80,
  }
}

function TaskItem({ task }: { task: Task }) {
  return <Text>{task.title}</Text>
}

// ============================================================================
// Tests
// ============================================================================

describe("ScrollbackList", () => {
  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  test("renders all items when none are frozen", () => {
    const mockStdout = createMockStdout()
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: false },
      { id: "2", title: "Task B", done: false },
      { id: "3", title: "Task C", done: false },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")
    expect(text).toContain("Task C")
    // Nothing should be written to stdout when no items are frozen
    expect(mockStdout.writes).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // isFrozen removes items from live render
  // -------------------------------------------------------------------------

  test("isFrozen prop removes frozen items from live render", () => {
    const mockStdout = createMockStdout()
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: true },
      { id: "3", title: "Task C", done: false },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    const text = stripAnsi(app.text)
    // Frozen items should NOT appear in live render
    expect(text).not.toContain("Task A")
    expect(text).not.toContain("Task B")
    // Non-frozen items should still render
    expect(text).toContain("Task C")
  })

  // -------------------------------------------------------------------------
  // Footer stays visible after freeze
  // -------------------------------------------------------------------------

  test("footer stays visible after freeze", () => {
    const mockStdout = createMockStdout()
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: true },
      { id: "3", title: "Task C", done: false },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
        footer={<Text>Status: 2/3 done</Text>}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    const text = stripAnsi(app.text)
    // Footer should remain visible
    expect(text).toContain("Status: 2/3 done")
    // Live item should be visible
    expect(text).toContain("Task C")
    // Frozen items should not be in live render
    expect(text).not.toContain("Task A")
    expect(text).not.toContain("Task B")
  })

  // -------------------------------------------------------------------------
  // Partial freeze — contiguous prefix invariant
  // -------------------------------------------------------------------------

  test("non-contiguous freeze: gap item stays in live render", () => {
    const mockStdout = createMockStdout()
    // Item 0 is NOT frozen, but item 1 IS frozen
    // The contiguous prefix invariant means item 1 can't freeze
    // because item 0 hasn't frozen yet
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: false },
      { id: "2", title: "Task B", done: true },
      { id: "3", title: "Task C", done: false },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    const text = stripAnsi(app.text)
    // ALL items should still be in live render because item 0 isn't frozen,
    // breaking the contiguous prefix
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")
    expect(text).toContain("Task C")
    // Nothing should be written to stdout since no contiguous prefix is frozen
    expect(mockStdout.writes).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Progressive freeze
  // -------------------------------------------------------------------------

  test("progressive freeze removes items one by one", () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })

    // Phase 1: All items live
    const tasks0: Task[] = [
      { id: "1", title: "Task A", done: false },
      { id: "2", title: "Task B", done: false },
      { id: "3", title: "Task C", done: false },
    ]

    const app = r(
      <ScrollbackList
        items={tasks0}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    let text = stripAnsi(app.text)
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")
    expect(text).toContain("Task C")
    expect(mockStdout.writes).toHaveLength(0)

    // Phase 2: Freeze first item
    const tasks1: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: false },
      { id: "3", title: "Task C", done: false },
    ]

    app.rerender(
      <ScrollbackList
        items={tasks1}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    text = stripAnsi(app.text)
    expect(text).not.toContain("Task A")
    expect(text).toContain("Task B")
    expect(text).toContain("Task C")

    // Phase 3: Freeze first two items
    const tasks2: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: true },
      { id: "3", title: "Task C", done: false },
    ]

    app.rerender(
      <ScrollbackList
        items={tasks2}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    text = stripAnsi(app.text)
    expect(text).not.toContain("Task A")
    expect(text).not.toContain("Task B")
    expect(text).toContain("Task C")
  })

  // -------------------------------------------------------------------------
  // Mock stdout captures frozen content
  // -------------------------------------------------------------------------

  test("frozen items are written to mock stdout", () => {
    const mockStdout = createMockStdout()
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: true },
      { id: "3", title: "Task C", done: false },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    // Frozen items should have been written to stdout
    const output = stripAnsi(mockStdout.output)
    expect(output).toContain("Task A")
    expect(output).toContain("Task B")
    // Non-frozen item should NOT be in stdout
    expect(output).not.toContain("Task C")
  })

  // -------------------------------------------------------------------------
  // Footer with all items frozen
  // -------------------------------------------------------------------------

  test("footer renders when all items are frozen", () => {
    const mockStdout = createMockStdout()
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: true },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
        footer={<Text>All tasks complete</Text>}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    const text = stripAnsi(app.text)
    // Footer should still be visible
    expect(text).toContain("All tasks complete")
    // No live items should be in the render
    expect(text).not.toContain("Task A")
    expect(text).not.toContain("Task B")
  })

  // -------------------------------------------------------------------------
  // Empty items list
  // -------------------------------------------------------------------------

  test("renders footer with empty items list", () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={[] as Task[]}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
        footer={<Text>No tasks</Text>}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    const text = stripAnsi(app.text)
    expect(text).toContain("No tasks")
    expect(mockStdout.writes).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Progressive freeze stdout accumulation
  // -------------------------------------------------------------------------

  test("progressive freeze writes each batch to stdout", () => {
    const mockStdout = createMockStdout()
    const r = createRenderer({ cols: 80, rows: 24 })

    // Phase 1: No items frozen
    const tasks0: Task[] = [
      { id: "1", title: "Task A", done: false },
      { id: "2", title: "Task B", done: false },
    ]

    const app = r(
      <ScrollbackList
        items={tasks0}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    expect(mockStdout.writes).toHaveLength(0)

    // Phase 2: Freeze first item
    const tasks1: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: false },
    ]

    app.rerender(
      <ScrollbackList
        items={tasks1}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    let output = stripAnsi(mockStdout.output)
    expect(output).toContain("Task A")
    expect(output).not.toContain("Task B")

    // Phase 3: Freeze second item
    const tasks2: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: true },
    ]

    app.rerender(
      <ScrollbackList
        items={tasks2}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
      >
        {(task) => <TaskItem task={task} />}
      </ScrollbackList>,
    )

    output = stripAnsi(mockStdout.output)
    expect(output).toContain("Task A")
    expect(output).toContain("Task B")
  })

  // -------------------------------------------------------------------------
  // useScrollbackItem hook integration
  // -------------------------------------------------------------------------

  test("useScrollbackItem freeze() callback removes item from live render", () => {
    const mockStdout = createMockStdout()

    // Component that calls freeze() when task.done becomes true
    function FreezingTaskItem({ task }: { task: Task }) {
      const { freeze } = useScrollbackItem()
      useEffect(() => {
        if (task.done) freeze()
      }, [task.done, freeze])
      return <Text>{task.title}</Text>
    }

    const r = createRenderer({ cols: 80, rows: 24 })

    const tasks0: Task[] = [
      { id: "1", title: "Task A", done: false },
      { id: "2", title: "Task B", done: false },
    ]

    const app = r(
      <ScrollbackList items={tasks0} keyExtractor={(t) => t.id} stdout={mockStdout}>
        {(task) => <FreezingTaskItem task={task} />}
      </ScrollbackList>,
    )

    let text = stripAnsi(app.text)
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")

    // Mark first task done — the freeze() effect should fire
    const tasks1: Task[] = [
      { id: "1", title: "Task A", done: true },
      { id: "2", title: "Task B", done: false },
    ]

    app.rerender(
      <ScrollbackList items={tasks1} keyExtractor={(t) => t.id} stdout={mockStdout}>
        {(task) => <FreezingTaskItem task={task} />}
      </ScrollbackList>,
    )

    text = stripAnsi(app.text)
    expect(text).not.toContain("Task A")
    expect(text).toContain("Task B")
  })

  // -------------------------------------------------------------------------
  // renderItem prop alternative
  // -------------------------------------------------------------------------

  test("renderItem prop works as alternative to children", () => {
    const mockStdout = createMockStdout()
    const tasks: Task[] = [
      { id: "1", title: "Task A", done: false },
      { id: "2", title: "Task B", done: true },
    ]

    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(
      <ScrollbackList
        items={tasks}
        keyExtractor={(t) => t.id}
        isFrozen={(t) => t.done}
        stdout={mockStdout}
        renderItem={(task) => <TaskItem task={task} />}
      />,
    )

    // Only item 0 is not frozen, but contiguous prefix from 0 is not frozen,
    // so item 0 renders live. Item 1 at index 1 is frozen but prefix breaks at 0.
    // Wait — item 0 (Task A, done: false), item 1 (Task B, done: true).
    // Contiguous prefix: item 0 not frozen → frozenCount = 0 → all live.
    const text = stripAnsi(app.text)
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")
  })
})
