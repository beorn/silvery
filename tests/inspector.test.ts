import { describe, test, expect, afterEach } from "vitest"
import {
  enableInspector,
  disableInspector,
  isInspectorEnabled,
  inspectFrame,
  inspectTree,
  autoEnableInspector,
} from "../src/inspector.js"
import type { RenderStats } from "../src/scheduler.js"
import type { InkxNode } from "../src/types.js"
import { Writable } from "node:stream"

afterEach(() => {
  disableInspector()
  // Clean up env vars
  delete process.env.INKX_DEV
  delete process.env.INKX_DEV_LOG
})

describe("inspector", () => {
  test("disabled by default", () => {
    expect(isInspectorEnabled()).toBe(false)
  })

  test("can be enabled and disabled", () => {
    enableInspector()
    expect(isInspectorEnabled()).toBe(true)
    disableInspector()
    expect(isInspectorEnabled()).toBe(false)
  })

  test("inspectFrame is a no-op when disabled", () => {
    const stats: RenderStats = {
      renderCount: 1,
      skippedCount: 0,
      lastRenderTime: 5,
      avgRenderTime: 5,
    }
    // Should not throw
    inspectFrame(stats)
  })

  test("inspectFrame writes to output when enabled", () => {
    const chunks: string[] = []
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })

    enableInspector({ output })

    const stats: RenderStats = {
      renderCount: 3,
      skippedCount: 1,
      lastRenderTime: 12.5,
      avgRenderTime: 8.3,
    }
    inspectFrame(stats)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain("frame #3")
    expect(chunks[0]).toContain("12.5ms")
    expect(chunks[0]).toContain("avg=8.3ms")
    expect(chunks[0]).toContain("skipped=1")
  })

  test("inspectTree dumps component tree", () => {
    const child: InkxNode = {
      type: "inkx-text",
      props: { testID: "greeting" },
      children: [],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: { x: 1, y: 2, width: 20, height: 1 },
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: true,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
      textContent: "Hello world",
    }

    const root: InkxNode = {
      type: "inkx-root",
      props: {},
      children: [child],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: { x: 0, y: 0, width: 80, height: 24 },
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: true,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }
    child.parent = root

    const output = inspectTree(root)

    expect(output).toContain("inkx-root")
    expect(output).toContain("[0,0 80x24]")
    expect(output).toContain("dirty=[subtree]")
    expect(output).toContain("inkx-text #greeting")
    expect(output).toContain("[1,2 20x1]")
    expect(output).toContain('dirty=[content]')
    expect(output).toContain('"Hello world"')
  })

  test("inspectTree respects depth limit", () => {
    const deep: InkxNode = {
      type: "inkx-text",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: null,
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
      textContent: "deep",
    }

    const mid: InkxNode = {
      type: "inkx-box",
      props: {},
      children: [deep],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: null,
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }
    deep.parent = mid

    const root: InkxNode = {
      type: "inkx-root",
      props: {},
      children: [mid],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: null,
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }
    mid.parent = root

    // Depth 1 should show root + mid, but not deep
    const output = inspectTree(root, { depth: 1 })
    expect(output).toContain("inkx-root")
    expect(output).toContain("inkx-box")
    expect(output).not.toContain("inkx-text")
  })

  test("inspectTree hides layout when showLayout is false", () => {
    const root: InkxNode = {
      type: "inkx-root",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: { x: 0, y: 0, width: 80, height: 24 },
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
    }

    const output = inspectTree(root, { showLayout: false })
    expect(output).toBe("inkx-root")
    expect(output).not.toContain("[")
  })

  test("autoEnableInspector enables when INKX_DEV=1", () => {
    process.env.INKX_DEV = "1"
    autoEnableInspector()
    expect(isInspectorEnabled()).toBe(true)
  })

  test("autoEnableInspector does nothing when INKX_DEV is unset", () => {
    delete process.env.INKX_DEV
    autoEnableInspector()
    expect(isInspectorEnabled()).toBe(false)
  })

  test("inspectTree truncates long text content", () => {
    const node: InkxNode = {
      type: "inkx-text",
      props: {},
      children: [],
      parent: null,
      layoutNode: null,
      prevLayout: null,
      contentRect: null,
      screenRect: null,
      prevScreenRect: null,
      layoutDirty: false,
      contentDirty: false,
      paintDirty: false,
      bgDirty: false,
      subtreeDirty: false,
      childrenDirty: false,
      layoutSubscribers: new Set(),
      textContent: "This is a very long text that should be truncated in the tree dump output",
    }

    const output = inspectTree(node)
    expect(output).toContain("This is a very long text that ...")
    expect(output).not.toContain("truncated in the tree dump output")
  })
})
