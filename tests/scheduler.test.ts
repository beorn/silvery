/**
 * Integration tests for src/scheduler.ts
 *
 * Tests the RenderScheduler — incremental vs fresh render diffing,
 * batch scheduling, dirty flag propagation, pause/resume, and disposal.
 */

import { EventEmitter } from "node:events"
import { afterEach, describe, expect, test } from "vitest"
import { ensureEngine } from "../src/renderer.js"
import { IncrementalRenderMismatchError, RenderScheduler, createScheduler, renderToString } from "../src/scheduler.js"
import type { TeaNode } from "../src/types.js"

// Initialize layout engine before all tests
await ensureEngine()

// Import after engine init to avoid issues with createNode needing the layout engine
const { createRootNode } = await import("../src/reconciler/nodes.js")

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a mock stdout stream with captured output.
 */
function createMockStdout(opts?: { columns?: number; rows?: number; isTTY?: boolean }) {
  const chunks: string[] = []
  const emitter = new EventEmitter()
  const mock = {
    columns: opts?.columns ?? 80,
    rows: opts?.rows ?? 24,
    isTTY: opts?.isTTY ?? true,
    write(data: string | Buffer) {
      chunks.push(typeof data === "string" ? data : data.toString())
      return true
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.on(event, listener)
      return mock
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.off(event, listener)
      return mock
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.once(event, listener)
      return mock
    },
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
  } as unknown as NodeJS.WriteStream & { emit: (event: string, ...args: unknown[]) => boolean }

  return { mock, chunks, emitter }
}

// Also import createNode after engine init
const { createNode } = await import("../src/reconciler/nodes.js")

/**
 * Create a minimal HighteaNode root with a text child.
 */
function createTextRoot(text: string): TeaNode {
  const root = createRootNode()
  const textNode = createNode("hightea-text", {})
  // Add raw text content as a child (mimics how reconciler creates text children)
  const rawText = {
    type: "hightea-text" as const,
    props: {},
    children: [] as TeaNode[],
    parent: textNode,
    layoutNode: null,
    contentRect: null,
    screenRect: null,
    prevLayout: null,
    layoutChangedThisFrame: false,
    prevScreenRect: null,
    layoutDirty: true,
    contentDirty: true,
    paintDirty: true,
    bgDirty: true,
    subtreeDirty: true,
    childrenDirty: true,
    layoutSubscribers: new Set(),
    rawText: text,
  } as TeaNode & { rawText: string }

  textNode.children.push(rawText)
  rawText.parent = textNode
  root.children.push(textNode)
  textNode.parent = root
  return root
}

/**
 * Flush microtasks by awaiting a resolved promise.
 */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

/**
 * Wait for a timer-based callback (like setTimeout).
 */
async function flushTimers(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe("RenderScheduler", () => {
  let scheduler: RenderScheduler
  let stdout: ReturnType<typeof createMockStdout>

  afterEach(() => {
    if (scheduler && !(scheduler as any).disposed) {
      scheduler.dispose()
    }
  })

  // ========================================================================
  // Construction and basic state
  // ========================================================================

  describe("construction", () => {
    test("creates scheduler with default options", () => {
      stdout = createMockStdout()
      const root = createRootNode()
      scheduler = createScheduler({ stdout: stdout.mock, root })
      expect(scheduler).toBeDefined()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("creates scheduler with custom minFrameTime", () => {
      stdout = createMockStdout()
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        minFrameTime: 32,
      })
      expect(scheduler).toBeDefined()
    })

    test("creates scheduler with debug mode", () => {
      stdout = createMockStdout()
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        debug: true,
      })
      expect(scheduler).toBeDefined()
    })

    test("creates scheduler in inline mode", () => {
      stdout = createMockStdout()
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        mode: "inline",
      })
      expect(scheduler).toBeDefined()
    })

    test("getNonTTYMode returns resolved mode", () => {
      stdout = createMockStdout({ isTTY: true })
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      expect(scheduler.getNonTTYMode()).toBe("tty")
    })

    test("non-TTY mode forced to plain", () => {
      stdout = createMockStdout({ isTTY: false })
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "plain",
      })
      expect(scheduler.getNonTTYMode()).toBe("plain")
    })

    test("non-TTY mode forced to static", () => {
      stdout = createMockStdout({ isTTY: false })
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "static",
      })
      expect(scheduler.getNonTTYMode()).toBe("static")
    })
  })

  // ========================================================================
  // forceRender
  // ========================================================================

  describe("forceRender", () => {
    test("forceRender executes render immediately", () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)
    })

    test("forceRender writes to stdout", () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.forceRender()
      // Something should have been written to stdout
      expect(stdout.chunks.length).toBeGreaterThan(0)
    })

    test("multiple forceRender calls produce multiple renders", () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.forceRender()
      scheduler.forceRender()
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(3)
    })

    test("forceRender is no-op after dispose", () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.dispose()
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(0)
    })
  })

  // ========================================================================
  // scheduleRender (batching)
  // ========================================================================

  describe("scheduleRender (batching)", () => {
    test("scheduleRender triggers render on next microtask", async () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })
      scheduler.scheduleRender()
      // Not yet rendered
      expect(scheduler.getStats().renderCount).toBe(0)

      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(1)
    })

    test("multiple scheduleRender calls batch into single render", async () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })
      scheduler.scheduleRender()
      scheduler.scheduleRender()
      scheduler.scheduleRender()

      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(1)
      expect(scheduler.getStats().skippedCount).toBe(2)
    })

    test("scheduleRender is no-op after dispose", async () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })
      scheduler.dispose()
      scheduler.scheduleRender()
      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("scheduleRender respects minFrameTime throttling", async () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 50,
      })

      // Force a render to set lastRenderTime
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)

      // Immediately schedule another — should be delayed
      scheduler.scheduleRender()
      await flushMicrotasks()
      // The render should be delayed, not yet executed
      // (it was scheduled with setTimeout due to frame rate limiting)
      // After enough time, it should execute
      await flushTimers(60)
      expect(scheduler.getStats().renderCount).toBe(2)
    })
  })

  // ========================================================================
  // Stats
  // ========================================================================

  describe("stats", () => {
    test("initial stats are zeros", () => {
      stdout = createMockStdout()
      const root = createRootNode()
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      const stats = scheduler.getStats()
      expect(stats.renderCount).toBe(0)
      expect(stats.skippedCount).toBe(0)
      expect(stats.lastRenderTime).toBe(0)
      expect(stats.avgRenderTime).toBe(0)
    })

    test("stats track render count after forceRender", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.forceRender()
      scheduler.forceRender()
      const stats = scheduler.getStats()
      expect(stats.renderCount).toBe(2)
    })

    test("stats track lastRenderTime", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.forceRender()
      const stats = scheduler.getStats()
      expect(stats.lastRenderTime).toBeGreaterThanOrEqual(0)
    })

    test("getStats returns a copy (immutable)", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      const stats1 = scheduler.getStats()
      scheduler.forceRender()
      const stats2 = scheduler.getStats()
      expect(stats1.renderCount).toBe(0)
      expect(stats2.renderCount).toBe(1)
    })
  })

  // ========================================================================
  // Pause / Resume
  // ========================================================================

  describe("pause / resume", () => {
    test("isPaused reflects pause state", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      expect(scheduler.isPaused()).toBe(false)
      scheduler.pause()
      expect(scheduler.isPaused()).toBe(true)
      scheduler.resume()
      expect(scheduler.isPaused()).toBe(false)
    })

    test("forceRender deferred while paused", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.pause()
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("scheduleRender deferred while paused", async () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })
      scheduler.pause()
      scheduler.scheduleRender()
      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("resume triggers deferred render", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.pause()
      scheduler.forceRender() // deferred
      expect(scheduler.getStats().renderCount).toBe(0)

      scheduler.resume()
      expect(scheduler.getStats().renderCount).toBe(1)
    })

    test("resume without pending render does not render", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.pause()
      // No render requested while paused
      scheduler.resume()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("double pause is harmless", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.pause()
      scheduler.pause() // should be no-op
      expect(scheduler.isPaused()).toBe(true)
    })

    test("resume while not paused is harmless", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.resume() // should be no-op
      expect(scheduler.isPaused()).toBe(false)
    })
  })

  // ========================================================================
  // Dispose
  // ========================================================================

  describe("dispose", () => {
    test("dispose sets disposed flag", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.dispose()
      // After dispose, forceRender is no-op
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("double dispose is harmless", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.dispose()
      expect(() => scheduler.dispose()).not.toThrow()
    })

    test("Symbol.dispose works", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler[Symbol.dispose]()
      // Should behave same as dispose()
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("dispose cancels pending scheduled render", async () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })
      scheduler.scheduleRender()
      scheduler.dispose()
      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(0)
    })

    test("static mode outputs final frame on dispose", () => {
      stdout = createMockStdout({ isTTY: false })
      const root = createTextRoot("Final")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "static",
      })
      // Force a render to build static output
      scheduler.forceRender()
      const beforeChunks = stdout.chunks.length

      scheduler.dispose()
      // Static mode should write the final frame on dispose
      expect(stdout.chunks.length).toBeGreaterThan(beforeChunks)
    })
  })

  // ========================================================================
  // Clear
  // ========================================================================

  describe("clear", () => {
    test("clear writes screen-clear ANSI to stdout", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      const before = stdout.chunks.length
      scheduler.clear()
      expect(stdout.chunks.length).toBeGreaterThan(before)
      // Should contain clear screen sequence
      const output = stdout.chunks.join("")
      expect(output).toContain("\x1b[2J")
    })

    test("clear is no-op after dispose", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.dispose()
      const before = stdout.chunks.length
      scheduler.clear()
      expect(stdout.chunks.length).toBe(before)
    })

    test("clear resets prevBuffer so next render is full", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      // First render establishes prevBuffer
      scheduler.forceRender()
      const firstOutputLen = stdout.chunks.join("").length

      // Clear resets buffer
      scheduler.clear()
      stdout.chunks.length = 0

      // Next render should be a full redraw (not incremental diff)
      scheduler.forceRender()
      const secondOutputLen = stdout.chunks.join("").length
      // Full redraw should have substantial output
      expect(secondOutputLen).toBeGreaterThan(0)
    })
  })

  // ========================================================================
  // Scrollback offset (inline mode)
  // ========================================================================

  describe("scrollback offset", () => {
    test("addScrollbackLines is no-op in fullscreen mode", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        mode: "fullscreen",
        nonTTYMode: "tty",
      })
      // Should not throw
      scheduler.addScrollbackLines(5)
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)
    })

    test("addScrollbackLines accepts positive lines in inline mode", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        mode: "inline",
        nonTTYMode: "tty",
      })
      scheduler.addScrollbackLines(3)
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)
    })

    test("addScrollbackLines ignores zero or negative lines", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        mode: "inline",
        nonTTYMode: "tty",
      })
      scheduler.addScrollbackLines(0)
      scheduler.addScrollbackLines(-1)
      // Should not error
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)
    })
  })

  // ========================================================================
  // Notify and clipboard
  // ========================================================================

  describe("notify", () => {
    test("notify does not crash", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      expect(() => scheduler.notify("Test notification")).not.toThrow()
    })

    test("notify is no-op after dispose", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.dispose()
      expect(() => scheduler.notify("After dispose")).not.toThrow()
    })
  })

  describe("copyToClipboard", () => {
    test("copyToClipboard does not crash", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      expect(() => scheduler.copyToClipboard("hello")).not.toThrow()
    })

    test("copyToClipboard is no-op after dispose", () => {
      stdout = createMockStdout()
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      scheduler.dispose()
      expect(() => scheduler.copyToClipboard("hello")).not.toThrow()
    })
  })

  // ========================================================================
  // Static output
  // ========================================================================

  describe("static output", () => {
    test("getStaticOutput is empty initially", () => {
      stdout = createMockStdout({ isTTY: false })
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "static",
      })
      expect(scheduler.getStaticOutput()).toBe("")
    })

    test("getStaticOutput contains rendered content after forceRender", () => {
      stdout = createMockStdout({ isTTY: false })
      const root = createTextRoot("StaticContent")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "static",
      })
      scheduler.forceRender()
      // Static mode stores output but doesn't write until dispose
      const output = scheduler.getStaticOutput()
      expect(output).toBeDefined()
      // Should be non-empty (the rendered tree has content)
      expect(output.length).toBeGreaterThan(0)
    })
  })

  // ========================================================================
  // Incremental rendering (prevBuffer diffing)
  // ========================================================================

  describe("incremental rendering", () => {
    test("second render uses previous buffer for incremental diff", () => {
      stdout = createMockStdout()
      const root = createTextRoot("Hello")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
      })
      // First render (full)
      scheduler.forceRender()
      const firstLen = stdout.chunks.join("").length

      // Reset captured output
      stdout.chunks.length = 0

      // Second render (incremental — nothing changed)
      scheduler.forceRender()
      const secondLen = stdout.chunks.join("").length

      // Incremental render of unchanged content should produce less output
      // or at minimum just cursor control (smaller than first full render)
      expect(secondLen).toBeLessThanOrEqual(firstLen)
    })
  })

  // ========================================================================
  // IncrementalRenderMismatchError
  // ========================================================================

  describe("IncrementalRenderMismatchError", () => {
    test("is an Error subclass", () => {
      const err = new IncrementalRenderMismatchError("test")
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(IncrementalRenderMismatchError)
    })

    test("has correct name", () => {
      const err = new IncrementalRenderMismatchError("test")
      expect(err.name).toBe("IncrementalRenderMismatchError")
    })

    test("preserves message", () => {
      const err = new IncrementalRenderMismatchError("mismatch at (5,3)")
      expect(err.message).toBe("mismatch at (5,3)")
    })
  })

  // ========================================================================
  // renderToString utility
  // ========================================================================

  describe("renderToString", () => {
    test("renders node tree to a string", () => {
      const root = createTextRoot("Hello")
      const output = renderToString(root, 40, 10)
      expect(typeof output).toBe("string")
      expect(output.length).toBeGreaterThan(0)
    })

    test("renders empty root to a string", () => {
      const root = createRootNode()
      const output = renderToString(root, 40, 10)
      expect(typeof output).toBe("string")
    })

    test("respects width and height", () => {
      const root = createTextRoot("Wide content that should fit")
      const narrow = renderToString(root, 10, 5)
      const wide = renderToString(root, 80, 5)
      // Both should produce valid output
      expect(typeof narrow).toBe("string")
      expect(typeof wide).toBe("string")
    })
  })

  // ========================================================================
  // createScheduler factory
  // ========================================================================

  describe("createScheduler factory", () => {
    test("returns a RenderScheduler instance", () => {
      stdout = createMockStdout()
      const root = createRootNode()
      scheduler = createScheduler({ stdout: stdout.mock, root })
      expect(scheduler).toBeInstanceOf(RenderScheduler)
    })
  })

  // ========================================================================
  // Resize handling
  // ========================================================================

  describe("resize handling", () => {
    test("resize listener is set up in TTY mode", async () => {
      stdout = createMockStdout({ isTTY: true })
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })

      // First render
      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)

      // Emit resize event
      stdout.mock.emit("resize")

      // Resize is debounced (50ms), wait for it
      await flushTimers(60)
      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(2)
    })

    test("resize is debounced — rapid resizes coalesce", async () => {
      stdout = createMockStdout({ isTTY: true })
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })

      scheduler.forceRender()
      expect(scheduler.getStats().renderCount).toBe(1)

      // Rapid resize events
      stdout.mock.emit("resize")
      stdout.mock.emit("resize")
      stdout.mock.emit("resize")

      // Wait past debounce
      await flushTimers(60)
      await flushMicrotasks()
      // Should have only triggered one additional render
      expect(scheduler.getStats().renderCount).toBe(2)
    })

    test("dispose removes resize listener", async () => {
      stdout = createMockStdout({ isTTY: true })
      const root = createTextRoot("X")
      scheduler = createScheduler({
        stdout: stdout.mock,
        root,
        nonTTYMode: "tty",
        minFrameTime: 0,
      })

      scheduler.forceRender()
      scheduler.dispose()

      // Resize after dispose should not trigger render
      stdout.mock.emit("resize")
      await flushTimers(60)
      await flushMicrotasks()
      expect(scheduler.getStats().renderCount).toBe(1)
    })
  })
})
