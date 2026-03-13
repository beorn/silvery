/**
 * clearContainer Dirty Flag Tests
 *
 * clearContainer() removes all children from the root but was missing
 * dirty flag invalidation. Without setting childrenDirty, contentDirty,
 * layoutDirty, subtreeDirty, and calling layoutNode.markDirty(), the
 * pipeline can skip re-rendering after a root clear, leaving stale
 * buffer content.
 *
 * Compare with removeChildFromContainer() which correctly sets all flags.
 */

import React, { useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/react"
import { hostConfig, type Container } from "@silvery/react/reconciler/host-config"
import { createNode } from "@silvery/react/reconciler/nodes"

describe("clearContainer dirty invalidation", () => {
  test("clearContainer sets childrenDirty on root", () => {
    const root = createNode("silvery-box", {})
    const child = createNode("silvery-box", {})
    // Simulate appended child
    root.children.push(child)
    child.parent = root
    if (root.layoutNode && child.layoutNode) {
      root.layoutNode.insertChild(child.layoutNode, 0)
    }
    // Clear all flags (simulate post-render state)
    root.childrenDirty = false
    root.contentDirty = false
    root.layoutDirty = false
    root.subtreeDirty = false

    const container: Container = { root, onRender: () => {} }
    hostConfig.clearContainer(container)

    expect(root.children).toHaveLength(0)
    expect(root.childrenDirty).toBe(true)
  })

  test("clearContainer sets contentDirty on root", () => {
    const root = createNode("silvery-box", {})
    const child = createNode("silvery-text", { children: "hello" })
    root.children.push(child)
    child.parent = root
    if (root.layoutNode && child.layoutNode) {
      root.layoutNode.insertChild(child.layoutNode, 0)
    }
    root.childrenDirty = false
    root.contentDirty = false
    root.layoutDirty = false
    root.subtreeDirty = false

    const container: Container = { root, onRender: () => {} }
    hostConfig.clearContainer(container)

    expect(root.contentDirty).toBe(true)
  })

  test("clearContainer sets layoutDirty on root and marks layout node dirty", () => {
    const root = createNode("silvery-box", {})
    const child = createNode("silvery-box", {})
    root.children.push(child)
    child.parent = root
    if (root.layoutNode && child.layoutNode) {
      root.layoutNode.insertChild(child.layoutNode, 0)
    }
    root.childrenDirty = false
    root.contentDirty = false
    root.layoutDirty = false
    root.subtreeDirty = false

    // Spy on layoutNode.markDirty
    const markDirtySpy = vi.spyOn(root.layoutNode!, "markDirty")

    const container: Container = { root, onRender: () => {} }
    hostConfig.clearContainer(container)

    expect(root.layoutDirty).toBe(true)
    expect(markDirtySpy).toHaveBeenCalled()
  })

  test("clearContainer sets subtreeDirty via markSubtreeDirty", () => {
    const root = createNode("silvery-box", {})
    const child = createNode("silvery-box", {})
    root.children.push(child)
    child.parent = root
    if (root.layoutNode && child.layoutNode) {
      root.layoutNode.insertChild(child.layoutNode, 0)
    }
    root.childrenDirty = false
    root.contentDirty = false
    root.layoutDirty = false
    root.subtreeDirty = false

    const container: Container = { root, onRender: () => {} }
    hostConfig.clearContainer(container)

    expect(root.subtreeDirty).toBe(true)
  })

  test("clearContainer with no children still sets dirty flags", () => {
    // Even clearing an empty container should mark dirty — the reconciler
    // calls clearContainer unconditionally, and the root may have stale
    // flag state from a prior render cycle.
    const root = createNode("silvery-box", {})
    root.childrenDirty = false
    root.contentDirty = false
    root.layoutDirty = false
    root.subtreeDirty = false

    const container: Container = { root, onRender: () => {} }
    hostConfig.clearContainer(container)

    expect(root.childrenDirty).toBe(true)
    expect(root.contentDirty).toBe(true)
    expect(root.layoutDirty).toBe(true)
    expect(root.subtreeDirty).toBe(true)
  })

  test("content replaced after conditional unmount renders correctly", () => {
    // Integration test: render content, conditionally unmount everything
    // (triggers clearContainer), then mount new content. Without dirty
    // flags, the new content may not render (stale tree/buffer mismatch).
    const render = createRenderer({ cols: 30, rows: 5 })

    function App({ phase }: { phase: "a" | "b" | "empty" }) {
      if (phase === "empty") return null
      return (
        <Box flexDirection="column">
          {phase === "a" && <Text>Content A</Text>}
          {phase === "b" && <Text>Content B</Text>}
        </Box>
      )
    }

    // Phase A: render initial content
    const app = render(<App phase="a" />)
    expect(app.text).toContain("Content A")

    // Phase empty: unmount everything (triggers clearContainer)
    app.rerender(<App phase="empty" />)
    expect(app.text).not.toContain("Content A")

    // Phase B: mount new content — must render correctly
    app.rerender(<App phase="b" />)
    expect(app.text).toContain("Content B")
    expect(app.text).not.toContain("Content A")

    // Verify incremental matches fresh render (no stale pixels)
    const incremental = app.lastBuffer()!
    const fresh = app.freshRender()
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 30; x++) {
        expect(incremental.getCell(x, y).char).toBe(fresh.getCell(x, y).char)
      }
    }
  })
})
