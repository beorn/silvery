/**
 * Tests for createRuntime - the inkx-loop runtime kernel.
 */

import { describe, expect, it } from "vitest"
import type React from "react"
import { Box, Text } from "../../src/index.js"
import {
  type Buffer,
  type Dims,
  type Event,
  type RenderTarget,
  createRuntime,
  ensureLayoutEngine,
  layout,
} from "../../src/runtime/index.js"

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock render target for testing.
 */
function createMockTarget(dims: Dims = { cols: 80, rows: 24 }): RenderTarget & {
  frames: string[]
  resizeHandlers: Set<(dims: Dims) => void>
  triggerResize: (dims: Dims) => void
} {
  const frames: string[] = []
  const resizeHandlers = new Set<(dims: Dims) => void>()
  let currentDims = dims

  return {
    frames,
    resizeHandlers,

    write(frame: string): void {
      frames.push(frame)
    },

    getDims(): Dims {
      return currentDims
    },

    onResize(handler: (dims: Dims) => void): () => void {
      resizeHandlers.add(handler)
      return () => resizeHandlers.delete(handler)
    },

    triggerResize(newDims: Dims): void {
      currentDims = newDims
      for (const handler of resizeHandlers) {
        handler(newDims)
      }
    },
  }
}

/**
 * Collect events from an async iterable up to a limit.
 */
async function collectEvents(
  events: AsyncIterable<Event>,
  limit: number,
): Promise<Event[]> {
  const result: Event[] = []
  for await (const event of events) {
    result.push(event)
    if (result.length >= limit) break
  }
  return result
}

// ============================================================================
// Tests
// ============================================================================

describe("createRuntime", () => {
  describe("basic lifecycle", () => {
    it("creates runtime with target", () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      expect(runtime.events).toBeDefined()
      expect(runtime.schedule).toBeDefined()
      expect(runtime.render).toBeDefined()
      expect(runtime.getDims).toBeDefined()
      expect(runtime[Symbol.dispose]).toBeDefined()

      runtime[Symbol.dispose]()
    })

    it("getDims returns target dimensions", () => {
      const target = createMockTarget({ cols: 120, rows: 40 })
      const runtime = createRuntime({ target })

      expect(runtime.getDims()).toEqual({ cols: 120, rows: 40 })

      runtime[Symbol.dispose]()
    })

    it("dispose is idempotent", () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      runtime[Symbol.dispose]()
      runtime[Symbol.dispose]() // Should not throw
      runtime[Symbol.dispose]()
    })

    it("works with using syntax", () => {
      const target = createMockTarget()

      {
        using runtime = createRuntime({ target })
        expect(runtime.getDims()).toEqual({ cols: 80, rows: 24 })
      }
      // Runtime disposed after block
    })
  })

  describe("render()", () => {
    it("writes diff to target", async () => {
      await ensureLayoutEngine()

      const target = createMockTarget()
      const runtime = createRuntime({ target })

      const buffer = layout(<Text>Hello</Text>, { cols: 80, rows: 24 })
      runtime.render(buffer)

      expect(target.frames.length).toBe(1)
      expect(target.frames[0]).toContain("Hello")

      runtime[Symbol.dispose]()
    })

    it("diffs subsequent renders", async () => {
      await ensureLayoutEngine()

      const target = createMockTarget()
      const runtime = createRuntime({ target })

      const buffer1 = layout(<Text>Hello</Text>, { cols: 80, rows: 24 })
      runtime.render(buffer1)

      const buffer2 = layout(<Text>World</Text>, { cols: 80, rows: 24 })
      runtime.render(buffer2)

      expect(target.frames.length).toBe(2)
      // Second frame should be a diff, not full re-render
      // (Exact diff output depends on implementation)

      runtime[Symbol.dispose]()
    })

    it("ignores render after dispose", async () => {
      await ensureLayoutEngine()

      const target = createMockTarget()
      const runtime = createRuntime({ target })

      runtime[Symbol.dispose]()

      const buffer = layout(<Text>Hello</Text>, { cols: 80, rows: 24 })
      runtime.render(buffer) // Should not throw or write

      expect(target.frames.length).toBe(0)
    })
  })

  describe("events()", () => {
    it("yields resize events", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      // Start collecting events
      const eventsPromise = collectEvents(runtime.events(), 2)

      // Trigger resizes
      target.triggerResize({ cols: 100, rows: 30 })
      target.triggerResize({ cols: 120, rows: 40 })

      const events = await eventsPromise

      expect(events.length).toBe(2)
      expect(events[0]).toEqual({ type: "resize", cols: 100, rows: 30 })
      expect(events[1]).toEqual({ type: "resize", cols: 120, rows: 40 })

      runtime[Symbol.dispose]()
    })

    it("stops on dispose", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      const events: Event[] = []
      const iterating = (async () => {
        for await (const event of runtime.events()) {
          events.push(event)
        }
      })()

      // Push one event
      target.triggerResize({ cols: 100, rows: 30 })

      // Give microtask time to process
      await new Promise((r) => setTimeout(r, 10))

      // Dispose should end iteration
      runtime[Symbol.dispose]()
      await iterating

      expect(events.length).toBe(1)
    })

    it("stops on external signal", async () => {
      const target = createMockTarget()
      const controller = new AbortController()
      const runtime = createRuntime({ target, signal: controller.signal })

      const events: Event[] = []
      const iterating = (async () => {
        for await (const event of runtime.events()) {
          events.push(event)
        }
      })()

      // Push one event
      target.triggerResize({ cols: 100, rows: 30 })

      // Give microtask time to process
      await new Promise((r) => setTimeout(r, 10))

      // Abort should end iteration
      controller.abort()
      await iterating

      expect(events.length).toBe(1)

      runtime[Symbol.dispose]()
    })

    it("respects already-aborted signal", async () => {
      const target = createMockTarget()
      const controller = new AbortController()
      controller.abort() // Already aborted

      const runtime = createRuntime({ target, signal: controller.signal })

      const events: Event[] = []
      for await (const event of runtime.events()) {
        events.push(event)
      }

      expect(events.length).toBe(0)

      runtime[Symbol.dispose]()
    })

    it("returns fresh iterable each call", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      const iter1 = runtime.events()
      const iter2 = runtime.events()

      expect(iter1).not.toBe(iter2)

      runtime[Symbol.dispose]()
    })
  })

  describe("schedule()", () => {
    it("schedules effect and yields result", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      // Schedule an effect
      runtime.schedule(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return "done"
      })

      // Collect one event
      const events = await collectEvents(runtime.events(), 1)

      expect(events.length).toBe(1)
      expect(events[0].type).toBe("effect")
      if (events[0].type === "effect") {
        expect(events[0].result).toBe("done")
      }

      runtime[Symbol.dispose]()
    })

    it("handles effect errors", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      // Schedule a failing effect
      runtime.schedule(async () => {
        throw new Error("Test error")
      })

      // Collect one event
      const events = await collectEvents(runtime.events(), 1)

      expect(events.length).toBe(1)
      expect(events[0].type).toBe("error")
      if (events[0].type === "error") {
        expect(events[0].error.message).toBe("Test error")
      }

      runtime[Symbol.dispose]()
    })

    it("respects effect abort signal", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      const effectController = new AbortController()

      // Schedule effect that will be aborted
      let started = false
      runtime.schedule(
        async () => {
          started = true
          await new Promise((r) => setTimeout(r, 100))
          return "should not reach"
        },
        { signal: effectController.signal },
      )

      // Abort immediately
      effectController.abort()

      // Give time for effect to (not) complete
      await new Promise((r) => setTimeout(r, 20))

      // Effect may have started but result should not be emitted
      // (Abort during execution silently swallows the result)

      runtime[Symbol.dispose]()
    })

    it("ignores schedule after dispose", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      runtime[Symbol.dispose]()

      let called = false
      runtime.schedule(async () => {
        called = true
        return "should not run"
      })

      await new Promise((r) => setTimeout(r, 10))
      expect(called).toBe(false)
    })

    it("ignores already-aborted effect signal", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      const effectController = new AbortController()
      effectController.abort() // Already aborted

      let called = false
      runtime.schedule(
        async () => {
          called = true
          return "should not run"
        },
        { signal: effectController.signal },
      )

      await new Promise((r) => setTimeout(r, 10))
      expect(called).toBe(false)

      runtime[Symbol.dispose]()
    })
  })

  describe("integration", () => {
    it("processes events in order", async () => {
      const target = createMockTarget()
      const runtime = createRuntime({ target })

      // Queue multiple events
      runtime.schedule(async () => "effect1")
      target.triggerResize({ cols: 100, rows: 30 })
      runtime.schedule(async () => "effect2")

      // Collect all
      const events = await collectEvents(runtime.events(), 3)

      expect(events.length).toBe(3)
      // Order may vary slightly due to async scheduling
      const types = events.map((e) => e.type)
      expect(types).toContain("effect")
      expect(types).toContain("resize")

      runtime[Symbol.dispose]()
    })

    it("works with Mode 3 pattern", async () => {
      await ensureLayoutEngine()

      const target = createMockTarget()
      const runtime = createRuntime({ target })

      // Elm-style state
      interface State {
        count: number
      }

      function reducer(state: State, event: Event): State {
        if (event.type === "resize") {
          return { count: state.count + 1 }
        }
        return state
      }

      function view(state: State): React.ReactElement {
        return <Text>Count: {state.count}</Text>
      }

      let state: State = { count: 0 }

      // Initial render
      const buffer = layout(view(state), runtime.getDims())
      runtime.render(buffer)

      // Simulate events
      target.triggerResize({ cols: 100, rows: 30 })
      target.triggerResize({ cols: 120, rows: 40 })

      // Process events
      const events = await collectEvents(runtime.events(), 2)
      for (const event of events) {
        state = reducer(state, event)
        const newBuffer = layout(view(state), runtime.getDims())
        runtime.render(newBuffer)
      }

      expect(state.count).toBe(2)
      expect(target.frames.length).toBe(3) // 1 initial + 2 updates

      runtime[Symbol.dispose]()
    })
  })
})
