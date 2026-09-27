/**
 * Timer Hooks Tests
 *
 * Tests for useTimeout, useInterval, and useLatest hooks.
 *
 * Note: createRenderer only updates app.text on input events. Timer-driven
 * setState won't refresh the buffer. So we test hook behavior via callback
 * spies, not visual assertions.
 *
 * Every row runs on a virtual clock: `sleep` advances fake timers, so a row
 * asserting "at least three 20 ms ticks in 75 ms" cannot lose a tick to a busy
 * host (silvery CI 36290987239 saw 2 of 3 on real timers).
 */

import { afterEach, beforeEach, describe, test, expect, vi } from "vitest"
import { useState, useEffect, useRef } from "react"
import { createRenderer } from "@silvery/test"
import { Text, useTimeout, useInterval, useLatest } from "silvery"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
})
afterEach(() => {
  vi.useRealTimers()
})

const sleep = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
}

// ============================================================================
// useTimeout
// ============================================================================

describe("useTimeout", () => {
  test("fires callback after delay", async () => {
    const fn = vi.fn()
    function App() {
      useTimeout(fn, 30)
      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    expect(fn).not.toHaveBeenCalled()
    await sleep(60)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("does not fire when disabled", async () => {
    const fn = vi.fn()
    function App() {
      useTimeout(fn, 20, false)
      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    await sleep(80)
    expect(fn).not.toHaveBeenCalled()
  })

  test("fires only once", async () => {
    const fn = vi.fn()
    function App() {
      useTimeout(fn, 20)
      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    await sleep(150)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("uses latest callback (no stale closure)", async () => {
    const results: number[] = []

    function App() {
      const [count, setCount] = useState(0)

      // Force count to increment on mount — this causes a re-render
      useEffect(() => {
        setCount(42)
      }, [])

      // The callback captures count at render time, but useTimeout
      // uses a ref internally so it always sees the latest callback
      useTimeout(() => results.push(count), 50)
      return <Text>count:{count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    // Initial render: count=0, then useEffect → count=42 (re-render)
    // After 50ms: timeout fires with latest callback (count=42)
    await sleep(100)
    expect(results).toHaveLength(1)
    expect(results[0]).toBe(42)
  })

  test("clears timer on unmount", async () => {
    const fn = vi.fn()
    function App() {
      useTimeout(fn, 50)
      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    const app = render(<App />)

    // Unmount before timeout fires
    app.unmount()
    await sleep(100)
    expect(fn).not.toHaveBeenCalled()
  })
})

// ============================================================================
// useLatest
// ============================================================================

describe("useLatest", () => {
  test("ref.current always matches latest value", () => {
    let capturedRef: { readonly current: number } | null = null

    function App({ value }: { value: number }) {
      const ref = useLatest(value)
      capturedRef = ref
      return <Text>{value}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App value={1} />)
    expect(capturedRef!.current).toBe(1)

    render(<App value={42} />)
    expect(capturedRef!.current).toBe(42)
  })

  test("ref identity is stable across renders", () => {
    const refs: Array<{ readonly current: number }> = []

    function App() {
      const [count, setCount] = useState(1)
      const ref = useLatest(count)
      refs.push(ref)

      // Trigger a re-render on mount
      useEffect(() => {
        setCount(2)
      }, [])

      return <Text>{count}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    // Two renders: mount (count=1) + effect (count=2)
    expect(refs.length).toBeGreaterThanOrEqual(2)
    // Same ref object across renders
    expect(refs[0]).toBe(refs[1])
    // Current value is the latest
    expect(refs[1]!.current).toBe(2)
  })
})

// ============================================================================
// useInterval (existing, regression)
// ============================================================================

describe("useInterval", () => {
  test("fires repeatedly", async () => {
    const fn = vi.fn()
    function App() {
      useInterval(fn, 20)
      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    await sleep(75)
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  test("does not fire when disabled", async () => {
    const fn = vi.fn()
    function App() {
      useInterval(fn, 20, false)
      return <Text>ok</Text>
    }

    const render = createRenderer({ cols: 40, rows: 3 })
    render(<App />)

    await sleep(100)
    expect(fn).not.toHaveBeenCalled()
  })

  test("stops firing on unmount", async () => {
    const fn = vi.fn()
    function App() {
      useInterval(fn, 20)
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
