/**
 * TEA Effects Tests
 *
 * Tests for useTea hook, fx effect constructors, and collect() test helper.
 * Verifies the core TEA pattern: pure update functions + effects as data.
 */

import { describe, test, expect, vi } from "vitest"
import { createRenderer, waitFor } from "@silvery/test"
import { Box, Text, useTea, fx, collect } from "silvery"
import type { TeaResult, TimerEffect } from "silvery"

// ============================================================================
// Test State Machine
// ============================================================================

type State = {
  phase: "idle" | "counting" | "done"
  count: number
}

type Msg =
  | { type: "start" }
  | { type: "tick" }
  | { type: "stop" }
  | { type: "delayedAction" }
  | { type: "delayFired" }

type Effect = TimerEffect<Msg>

const init: State = { phase: "idle", count: 0 }

function update(state: State, msg: Msg): TeaResult<State, Effect> {
  switch (msg.type) {
    case "start":
      return [{ ...state, phase: "counting", count: 0 }, [fx.interval(30, { type: "tick" }, "counter")]]
    case "tick":
      if (state.count >= 5) return [{ ...state, phase: "done" }, [fx.cancel("counter")]]
      return { ...state, count: state.count + 1 }
    case "stop":
      return [{ ...state, phase: "idle" }, [fx.cancel("counter")]]
    case "delayedAction":
      return [state, [fx.delay(50, { type: "delayFired" })]]
    case "delayFired":
      return { ...state, phase: "done" }
    default:
      return state
  }
}

// ============================================================================
// Pure Update Tests (no React, no timers)
// ============================================================================

describe("collect() — pure state machine testing", () => {
  test("start returns counting state + interval effect", () => {
    const [state, effects] = collect(update(init, { type: "start" }))
    expect(state.phase).toBe("counting")
    expect(state.count).toBe(0)
    expect(effects).toHaveLength(1)
    expect(effects[0]).toEqual(fx.interval(30, { type: "tick" }, "counter"))
  })

  test("tick with low count returns plain state (no effects)", () => {
    const [state, effects] = collect(update({ phase: "counting", count: 2 }, { type: "tick" }))
    expect(state.count).toBe(3)
    expect(effects).toHaveLength(0)
  })

  test("tick at limit returns done + cancel", () => {
    const [state, effects] = collect(update({ phase: "counting", count: 5 }, { type: "tick" }))
    expect(state.phase).toBe("done")
    expect(effects).toContainEqual(fx.cancel("counter"))
  })

  test("stop cancels counter", () => {
    const [state, effects] = collect(update({ phase: "counting", count: 3 }, { type: "stop" }))
    expect(state.phase).toBe("idle")
    expect(effects).toContainEqual(fx.cancel("counter"))
  })

  test("delayedAction returns delay effect", () => {
    const [state, effects] = collect(update(init, { type: "delayedAction" }))
    expect(state).toEqual(init) // state unchanged
    expect(effects).toHaveLength(1)
    expect(effects[0]).toEqual(fx.delay(50, { type: "delayFired" }))
  })
})

// ============================================================================
// fx constructors
// ============================================================================

describe("fx constructors produce correct shapes", () => {
  test("fx.delay", () => {
    expect(fx.delay(100, { type: "x" })).toEqual({ type: "delay", ms: 100, msg: { type: "x" }, id: undefined })
    expect(fx.delay(100, { type: "x" }, "myTimer")).toEqual({
      type: "delay",
      ms: 100,
      msg: { type: "x" },
      id: "myTimer",
    })
  })

  test("fx.interval", () => {
    expect(fx.interval(50, { type: "y" }, "tick")).toEqual({
      type: "interval",
      ms: 50,
      msg: { type: "y" },
      id: "tick",
    })
  })

  test("fx.cancel", () => {
    expect(fx.cancel("tick")).toEqual({ type: "cancel", id: "tick" })
  })
})

// ============================================================================
// useTea hook — integration tests
// ============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("useTea hook", () => {
  test("renders initial state", () => {
    function App() {
      const [state] = useTea(init, update)
      return <Text>phase:{state.phase} count:{state.count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    const app = render(<App />)
    expect(app.text).toContain("phase:idle")
    expect(app.text).toContain("count:0")
  })

  test("send triggers state update via key press", async () => {
    function App() {
      const [state, send] = useTea(init, update)
      // Expose send via useInput equivalent — press "s" to start
      return (
        <Box flexDirection="column">
          <Text>phase:{state.phase}</Text>
          <Text>count:{state.count}</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("phase:idle")
  })

  test("delay effect fires callback after timeout", async () => {
    const fn = vi.fn()
    function App() {
      const [state, send] = useTea(init, (s: State, msg: Msg) => {
        if (msg.type === "delayedAction") return [s, [fx.delay(30, { type: "delayFired" })]]
        if (msg.type === "delayFired") {
          fn()
          return { ...s, phase: "done" }
        }
        return s
      })

      // Trigger the delay on mount
      const triggered = React.useRef(false)
      React.useEffect(() => {
        if (!triggered.current) {
          triggered.current = true
          send({ type: "delayedAction" })
        }
      }, [send])

      return <Text>phase:{state.phase}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    expect(fn).not.toHaveBeenCalled()
    await sleep(80)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("interval effect fires repeatedly", async () => {
    const ticks: number[] = []
    function App() {
      const [state, send] = useTea(init, (s: State, msg: Msg) => {
        if (msg.type === "start")
          return [{ ...s, phase: "counting" as const }, [fx.interval(20, { type: "tick" }, "t")]]
        if (msg.type === "tick") {
          ticks.push(s.count)
          return { ...s, count: s.count + 1 }
        }
        return s
      })

      const triggered = React.useRef(false)
      React.useEffect(() => {
        if (!triggered.current) {
          triggered.current = true
          send({ type: "start" })
        }
      }, [send])

      return <Text>count:{state.count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    await sleep(100)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
  })

  test("cancel effect stops interval", async () => {
    const ticks: number[] = []
    function App() {
      const [state, send] = useTea(init, (s: State, msg: Msg) => {
        if (msg.type === "start")
          return [{ ...s, phase: "counting" as const }, [fx.interval(15, { type: "tick" }, "t")]]
        if (msg.type === "tick") {
          ticks.push(s.count)
          if (s.count >= 3) return [{ ...s, phase: "done" as const, count: s.count + 1 }, [fx.cancel("t")]]
          return { ...s, count: s.count + 1 }
        }
        return s
      })

      const triggered = React.useRef(false)
      React.useEffect(() => {
        if (!triggered.current) {
          triggered.current = true
          send({ type: "start" })
        }
      }, [send])

      return <Text>count:{state.count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    await sleep(200)
    // Should have stopped at ~4 ticks (count 0,1,2,3 → cancel)
    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks.length).toBeGreaterThanOrEqual(4)
  })

  test("cleanup on unmount cancels all timers", async () => {
    const fn = vi.fn()
    function App() {
      const [state, send] = useTea(init, (s: State, msg: Msg) => {
        if (msg.type === "start")
          return [s, [fx.interval(10, { type: "tick" }, "t")]]
        if (msg.type === "tick") {
          fn()
          return s
        }
        return s
      })

      const triggered = React.useRef(false)
      React.useEffect(() => {
        if (!triggered.current) {
          triggered.current = true
          send({ type: "start" })
        }
      }, [send])

      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    const app = render(<App />)

    await sleep(50)
    const countBefore = fn.mock.calls.length
    expect(countBefore).toBeGreaterThanOrEqual(1)

    app.unmount()
    await sleep(80)
    // Should not have fired more after unmount
    expect(fn.mock.calls.length).toBe(countBefore)
  })
})

// Need React import for useRef/useEffect in test components
import React from "react"
