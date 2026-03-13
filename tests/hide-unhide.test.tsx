/**
 * Hide/Unhide Instance Tests (Suspense Support)
 *
 * Tests for hideInstance/unhideInstance in the reconciler host config:
 * - Hidden subtrees don't render (no pixels on screen)
 * - Unhiding restores correct content
 * - Hidden nodes don't leak stale pixels
 *
 * These are exercised via React.Suspense, which calls hideInstance/unhideInstance
 * when showing/hiding fallback content.
 */

import React, { Suspense, useState, use } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/react"
import { hostConfig } from "@silvery/react/reconciler/host-config"
import { createNode } from "@silvery/react/reconciler/nodes"

/**
 * Create a controllable promise for testing Suspense.
 * Returns [promise, resolve] — the component suspends until resolve() is called.
 */
function createDeferred<T>(): [Promise<T>, (value: T) => void] {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return [promise, resolve]
}

/**
 * Component that suspends until the given promise resolves.
 */
function AsyncContent({ promise, label }: { promise: Promise<string>; label?: string }) {
  const value = use(promise)
  return <Text>{label ? `${label}: ${value}` : value}</Text>
}

describe("hide/unhide instances (Suspense)", () => {
  test("hidden subtree does not render — fallback shows instead", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const [promise] = createDeferred<string>()

    function App() {
      return (
        <Box flexDirection="column">
          <Suspense fallback={<Text>Loading...</Text>}>
            <AsyncContent promise={promise} />
          </Suspense>
        </Box>
      )
    }

    const app = render(<App />)
    // The fallback "Loading..." should be visible
    expect(app.text).toContain("Loading...")
    // The async content should NOT be visible (it's suspended)
    expect(app.text).not.toContain("Resolved")
  })

  test("unhiding restores correct content after Suspense resolves", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const [promise, resolve] = createDeferred<string>()

    function App() {
      return (
        <Box flexDirection="column">
          <Suspense fallback={<Text>Loading...</Text>}>
            <AsyncContent promise={promise} />
          </Suspense>
        </Box>
      )
    }

    const app = render(<App />)
    expect(app.text).toContain("Loading...")

    // Resolve the promise — content should appear, fallback should disappear
    resolve("Hello World")
    // Wait for React to process the resolved promise
    await new Promise((r) => setTimeout(r, 50))
    // Force re-render cycle
    app.rerender(<App />)

    expect(app.text).toContain("Hello World")
    expect(app.text).not.toContain("Loading...")
  })

  test("hidden nodes do not leave stale pixels after unhide", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const [promise, resolve] = createDeferred<string>()

    function App() {
      return (
        <Box width={30} height={3} flexDirection="column">
          <Text>Before</Text>
          <Suspense fallback={<Text>LOADING_TEXT_HERE</Text>}>
            <AsyncContent promise={promise} />
          </Suspense>
        </Box>
      )
    }

    const app = render(<App />)
    // Fallback is visible
    expect(app.text).toContain("LOADING_TEXT_HERE")

    // Check that "LOADING_TEXT_HERE" occupies buffer cells
    const buffer1 = app.lastBuffer()!
    const loadingRow = (() => {
      for (let y = 0; y < 5; y++) {
        let row = ""
        for (let x = 0; x < 30; x++) row += buffer1.getCell(x, y).char
        if (row.includes("LOADING_TEXT_HERE")) return y
      }
      return -1
    })()
    expect(loadingRow).toBeGreaterThanOrEqual(0)

    // Resolve — the shorter resolved text should replace the loading text
    resolve("OK")
    await new Promise((r) => setTimeout(r, 50))
    app.rerender(<App />)

    expect(app.text).toContain("OK")
    // The old "LOADING_TEXT_HERE" should be completely gone
    expect(app.text).not.toContain("LOADING_TEXT_HERE")

    // Verify no stale characters remain in the buffer at the old loading position
    const buffer2 = app.lastBuffer()!
    let residualRow = ""
    for (let x = 0; x < 30; x++) {
      residualRow += buffer2.getCell(x, loadingRow).char
    }
    expect(residualRow).not.toContain("LOADING")
  })

  test("display='none' hides content and does not render pixels", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    function App({ showContent }: { showContent: boolean }) {
      return (
        <Box flexDirection="column">
          <Text>Visible</Text>
          <Box display={showContent ? "flex" : "none"}>
            <Text>Hidden Content</Text>
          </Box>
        </Box>
      )
    }

    // Initially visible
    const app = render(<App showContent={true} />)
    expect(app.text).toContain("Hidden Content")
    expect(app.text).toContain("Visible")

    // Hide it
    app.rerender(<App showContent={false} />)
    expect(app.text).toContain("Visible")
    expect(app.text).not.toContain("Hidden Content")

    // Show it again — content should be restored
    app.rerender(<App showContent={true} />)
    expect(app.text).toContain("Hidden Content")
    expect(app.text).toContain("Visible")
  })

  test("display='none' toggle does not leak stale pixels", () => {
    const render = createRenderer({ cols: 30, rows: 5 })

    function App({ showContent }: { showContent: boolean }) {
      return (
        <Box flexDirection="column" width={25}>
          <Text>Header</Text>
          <Box display={showContent ? "flex" : "none"}>
            <Text>LONG_CONTENT_HERE</Text>
          </Box>
          <Text>Footer</Text>
        </Box>
      )
    }

    const app = render(<App showContent={true} />)
    expect(app.text).toContain("LONG_CONTENT_HERE")

    // Find where the content was rendered
    const buffer1 = app.lastBuffer()!
    const contentRow = (() => {
      for (let y = 0; y < 5; y++) {
        let row = ""
        for (let x = 0; x < 25; x++) row += buffer1.getCell(x, y).char
        if (row.includes("LONG_CONTENT")) return y
      }
      return -1
    })()
    expect(contentRow).toBeGreaterThanOrEqual(0)

    // Hide content
    app.rerender(<App showContent={false} />)
    expect(app.text).not.toContain("LONG_CONTENT_HERE")

    // Check incremental matches fresh — no stale pixels
    const incremental = app.lastBuffer()!
    const fresh = app.freshRender()
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 25; x++) {
        const incCell = incremental.getCell(x, y)
        const freshCell = fresh.getCell(x, y)
        expect(incCell.char).toBe(freshCell.char)
      }
    }
  })

  test("hideInstance sets paintDirty on the instance", () => {
    // Without paintDirty, the content phase fast-path can skip the node on the
    // next render after unhide. The skip condition is:
    //   !contentDirty && !paintDirty && !layoutChanged && !subtreeDirty && !childrenDirty
    // contentDirty alone is consumed by the measure phase (cleared in measure func),
    // so paintDirty is the surviving flag that ensures content phase re-renders the node.
    const node = createNode("silvery-box", {})
    // Clear all flags (simulate post-render state)
    node.contentDirty = false
    node.paintDirty = false
    node.layoutDirty = false
    node.subtreeDirty = false

    hostConfig.hideInstance(node)

    expect(node.hidden).toBe(true)
    expect(node.contentDirty).toBe(true)
    // This is the missing flag — paintDirty must be set
    expect(node.paintDirty).toBe(true)
  })

  test("unhideInstance sets paintDirty on the instance", () => {
    const node = createNode("silvery-box", {})
    node.hidden = true
    node.contentDirty = false
    node.paintDirty = false
    node.layoutDirty = false
    node.subtreeDirty = false

    hostConfig.unhideInstance(node, {})

    expect(node.hidden).toBe(false)
    expect(node.contentDirty).toBe(true)
    expect(node.paintDirty).toBe(true)
  })

  test("hideInstance sets layoutDirty and marks layout node dirty", () => {
    // When a node is hidden, its measured content changes (collectNodeTextContent
    // skips hidden children). The layout engine must recalculate dimensions.
    // Without layoutDirty + layoutNode.markDirty(), layout uses stale cache.
    const node = createNode("silvery-box", {})
    node.contentDirty = false
    node.paintDirty = false
    node.layoutDirty = false
    node.subtreeDirty = false

    hostConfig.hideInstance(node)

    expect(node.layoutDirty).toBe(true)
    // layoutNode.markDirty() should have been called to invalidate the layout cache
  })

  test("unhideInstance sets layoutDirty and marks layout node dirty", () => {
    const node = createNode("silvery-box", {})
    node.hidden = true
    node.contentDirty = false
    node.paintDirty = false
    node.layoutDirty = false
    node.subtreeDirty = false

    hostConfig.unhideInstance(node, {})

    expect(node.layoutDirty).toBe(true)
    // layoutNode.markDirty() should have been called to invalidate the layout cache
  })

  test("hideTextInstance sets paintDirty and propagates layout dirty to ancestor", () => {
    // Text instances don't have layout nodes. markLayoutAncestorDirty must walk
    // up to the nearest layout ancestor and mark it dirty.
    const parent = createNode("silvery-text", {})
    const textNode = hostConfig.createTextInstance("hello", null, { isInsideText: true })
    textNode.parent = parent
    parent.children.push(textNode)
    // Clear flags
    textNode.contentDirty = false
    textNode.paintDirty = false
    parent.contentDirty = false
    parent.paintDirty = false
    parent.layoutDirty = false

    hostConfig.hideTextInstance(textNode)

    expect(textNode.hidden).toBe(true)
    expect(textNode.contentDirty).toBe(true)
    expect(textNode.paintDirty).toBe(true)
    // Parent (nearest layout ancestor) should be marked dirty
    expect(parent.contentDirty).toBe(true)
    expect(parent.layoutDirty).toBe(true)
    // parent's layoutNode.markDirty() should have been called via markLayoutAncestorDirty
  })

  test("unhideTextInstance sets paintDirty and propagates layout dirty to ancestor", () => {
    const parent = createNode("silvery-text", {})
    const textNode = hostConfig.createTextInstance("hello", null, { isInsideText: true })
    textNode.parent = parent
    parent.children.push(textNode)
    textNode.hidden = true
    textNode.contentDirty = false
    textNode.paintDirty = false
    parent.contentDirty = false
    parent.paintDirty = false
    parent.layoutDirty = false

    hostConfig.unhideTextInstance(textNode, "hello")

    expect(textNode.hidden).toBe(false)
    expect(textNode.contentDirty).toBe(true)
    expect(textNode.paintDirty).toBe(true)
    expect(parent.contentDirty).toBe(true)
    expect(parent.layoutDirty).toBe(true)
    // parent's layoutNode.markDirty() should have been called via markLayoutAncestorDirty
  })

  test("hidden node with backgroundColor does not render its bg", () => {
    const render = createRenderer({ cols: 20, rows: 3 })

    function App({ showBox }: { showBox: boolean }) {
      return (
        <Box flexDirection="column">
          <Box display={showBox ? "flex" : "none"} backgroundColor="red" width={10} height={1}>
            <Text>Red Box</Text>
          </Box>
          <Text>Below</Text>
        </Box>
      )
    }

    // Show — red background should be present
    const app = render(<App showBox={true} />)
    const buf1 = app.lastBuffer()!
    const cellR = buf1.getCell(0, 0)
    expect(cellR.char).toBe("R")
    expect(cellR.bg).not.toBeNull()

    // Hide — no red background should remain
    app.rerender(<App showBox={false} />)
    // "Below" should be visible, "Red Box" should not
    expect(app.text).toContain("Below")
    expect(app.text).not.toContain("Red Box")

    // Verify no red bg pixels remain in the buffer
    const buf2 = app.lastBuffer()!
    for (let x = 0; x < 10; x++) {
      const cell = buf2.getCell(x, 0)
      // None of these cells should have a red bg
      if (cell.bg && typeof cell.bg === "object" && "r" in cell.bg) {
        expect(cell.bg).not.toEqual({ r: 255, g: 0, b: 0 })
      }
    }
  })
})
