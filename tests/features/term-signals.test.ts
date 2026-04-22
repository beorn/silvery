/**
 * Unit tests for term.signals — the single-owner process signal mediator.
 *
 * Covers:
 * - registration / unregister / installs shared process listener once
 * - handler runs on signal delivery
 * - dispose runs every onDispose handler, in topological order
 * - errors in one handler don't block the rest
 * - before/after dep ordering
 * - priority tiebreaker
 * - idempotent dispose
 * - post-dispose registrations are no-ops
 */

import { EventEmitter } from "node:events"
import { describe, it, expect, vi } from "vitest"
import { createSignals } from "@silvery/ag-term/runtime"
import { createTerm } from "@silvery/ag-term/ansi"

// =============================================================================
// Fake process — EventEmitter with process.on / off shape, no real signals.
// =============================================================================

function createFakeProcess(): NodeJS.Process & { emitSignal: (signal: string) => void } {
  const ee = new EventEmitter()
  // EventEmitter already exposes on / off / emit — cast to Process shape.
  const proc = ee as unknown as NodeJS.Process & { emitSignal: (signal: string) => void }
  proc.emitSignal = (signal: string) => ee.emit(signal)
  return proc
}

// =============================================================================
// Tests
// =============================================================================

describe("createSignals — registration", () => {
  it("returns a working owner with size 0 and no installed listeners", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })
    expect(signals.size).toBe(0)
    expect(signals.isDisposed).toBe(false)
    // No listener installed until on() is called
    expect(proc.listenerCount("SIGINT")).toBe(0)
  })

  it("installs a single shared process listener per signal on first registration", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    signals.on("SIGINT", () => {})
    signals.on("SIGINT", () => {})
    signals.on("SIGTERM", () => {})

    expect(proc.listenerCount("SIGINT")).toBe(1)
    expect(proc.listenerCount("SIGTERM")).toBe(1)
    expect(signals.size).toBe(3)
  })

  it("unregister removes the entry and drops the shared listener when last goes", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const off1 = signals.on("SIGINT", () => {})
    const off2 = signals.on("SIGINT", () => {})
    expect(proc.listenerCount("SIGINT")).toBe(1)

    off1()
    expect(signals.size).toBe(1)
    expect(proc.listenerCount("SIGINT")).toBe(1) // still one remaining

    off2()
    expect(signals.size).toBe(0)
    expect(proc.listenerCount("SIGINT")).toBe(0)
  })
})

describe("createSignals — signal delivery", () => {
  it("runs every registered handler on the named signal", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const calls: string[] = []
    signals.on("SIGINT", () => { calls.push("a") })
    signals.on("SIGINT", () => { calls.push("b") })
    signals.on("SIGTERM", () => { calls.push("t") })

    proc.emitSignal("SIGINT")
    expect(calls).toEqual(["a", "b"])

    proc.emitSignal("SIGTERM")
    expect(calls).toEqual(["a", "b", "t"])
  })

  it("only fires handlers for the emitted signal", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const intSpy = vi.fn()
    const termSpy = vi.fn()
    signals.on("SIGINT", intSpy)
    signals.on("SIGTERM", termSpy)

    proc.emitSignal("SIGINT")
    expect(intSpy).toHaveBeenCalledTimes(1)
    expect(termSpy).not.toHaveBeenCalled()
  })

  it("onSignal=false skips delivery on signal but still runs on dispose", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const spy = vi.fn()
    signals.on("SIGINT", spy, { onSignal: false })

    // No process listener installed since no onSignal entries exist
    expect(proc.listenerCount("SIGINT")).toBe(0)

    proc.emitSignal("SIGINT")
    expect(spy).not.toHaveBeenCalled()

    signals.dispose()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe("createSignals — dispose order", () => {
  it("runs onDispose handlers in priority order (lower first)", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const calls: string[] = []
    signals.on("SIGINT", () => { calls.push("mid") }, { priority: 10 })
    signals.on("SIGINT", () => { calls.push("late") }, { priority: 20 })
    signals.on("SIGINT", () => { calls.push("early") }, { priority: 0 })

    signals.dispose()
    expect(calls).toEqual(["early", "mid", "late"])
  })

  it("respects before/after dependency graph across signals", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const calls: string[] = []
    signals.on("SIGINT", () => { calls.push("flush-logs") }, {
      name: "flush-logs",
      after: ["close-db"], // must run AFTER close-db
    })
    signals.on("SIGTERM", () => { calls.push("close-db") }, { name: "close-db" })
    signals.on("exit", () => { calls.push("restore-terminal") }, {
      name: "restore-terminal",
      after: ["flush-logs"], // must run AFTER flush-logs
    })

    signals.dispose()
    expect(calls).toEqual(["close-db", "flush-logs", "restore-terminal"])
  })

  it("before/after is symmetric — before: [X] same as X's after: [self]", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const calls: string[] = []
    // A before B
    signals.on("SIGINT", () => { calls.push("A") }, { name: "A", before: ["B"] })
    signals.on("SIGINT", () => { calls.push("B") }, { name: "B" })
    signals.on("SIGINT", () => { calls.push("C") }, { name: "C", after: ["B"] })

    signals.dispose()
    expect(calls).toEqual(["A", "B", "C"])
  })

  it("falls back to priority if dependency graph has cycles (no throw)", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const calls: string[] = []
    signals.on("SIGINT", () => { calls.push("X") }, {
      name: "X",
      before: ["Y"],
      priority: 5,
    })
    signals.on("SIGINT", () => { calls.push("Y") }, {
      name: "Y",
      before: ["X"], // cycle
      priority: 10,
    })

    // Must not throw — dispose in the face of a dev bug still tears down.
    expect(() => signals.dispose()).not.toThrow()
    expect(calls).toHaveLength(2)
  })
})

describe("createSignals — error isolation", () => {
  it("one handler throwing does NOT block the others", () => {
    const proc = createFakeProcess()
    const errors: unknown[] = []
    const signals = createSignals({
      process: proc,
      onError: (err) => errors.push(err),
    })

    const calls: string[] = []
    signals.on("SIGINT", () => { calls.push("a") })
    signals.on("SIGINT", () => {
      throw new Error("boom")
    })
    signals.on("SIGINT", () => { calls.push("c") })

    signals.dispose()
    expect(calls).toEqual(["a", "c"])
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe("boom")
  })

  it("async handlers that reject don't block the rest", async () => {
    const proc = createFakeProcess()
    const errors: unknown[] = []
    const signals = createSignals({
      process: proc,
      onError: (err) => errors.push(err),
    })

    const calls: string[] = []
    signals.on("SIGINT", async () => {
      calls.push("a")
    })
    signals.on("SIGINT", async () => {
      calls.push("b-start")
      throw new Error("async-boom")
    })
    signals.on("SIGINT", async () => {
      calls.push("c")
    })

    signals.dispose()
    expect(calls).toEqual(["a", "b-start", "c"])

    // Async rejections flush on microtask queue
    await new Promise((r) => setTimeout(r, 0))
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe("async-boom")
  })
})

describe("createSignals — dispose idempotency", () => {
  it("second dispose is a no-op", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const spy = vi.fn()
    signals.on("SIGINT", spy)
    signals.dispose()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(signals.isDisposed).toBe(true)

    signals.dispose()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("removes shared process listeners on dispose", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    signals.on("SIGINT", () => {})
    signals.on("SIGTERM", () => {})
    expect(proc.listenerCount("SIGINT")).toBe(1)
    expect(proc.listenerCount("SIGTERM")).toBe(1)

    signals.dispose()
    expect(proc.listenerCount("SIGINT")).toBe(0)
    expect(proc.listenerCount("SIGTERM")).toBe(0)
  })

  it("registrations after dispose are no-ops", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    signals.dispose()
    const off = signals.on("SIGINT", () => {})
    expect(signals.size).toBe(0)
    expect(proc.listenerCount("SIGINT")).toBe(0)
    expect(() => off()).not.toThrow()
  })

  it("signal delivery after dispose does nothing (listener removed)", () => {
    const proc = createFakeProcess()
    const signals = createSignals({ process: proc })

    const spy = vi.fn()
    signals.on("SIGINT", spy)
    signals.dispose()
    expect(spy).toHaveBeenCalledTimes(1) // ran via dispose

    proc.emitSignal("SIGINT")
    expect(spy).toHaveBeenCalledTimes(1) // not called again
  })
})

describe("createSignals — Symbol.dispose", () => {
  it("using semantics trigger dispose()", () => {
    const proc = createFakeProcess()

    const calls: string[] = []
    {
      using signals = createSignals({ process: proc })
      signals.on("SIGINT", () => { calls.push("cleanup") })
      expect(calls).toEqual([])
    } // <- Symbol.dispose fires here

    expect(calls).toEqual(["cleanup"])
    expect(proc.listenerCount("SIGINT")).toBe(0)
  })
})

describe("createTerm exposes signals on the Term interface", () => {
  it("headless Term: term.signals is a working Signals instance", () => {
    const term = createTerm({ cols: 80, rows: 24 })
    expect(term.signals).toBeDefined()
    expect(term.signals.size).toBe(0)
    expect(term.signals.isDisposed).toBe(false)

    const calls: string[] = []
    term.signals.on("SIGINT", () => { calls.push("hit") })
    expect(term.signals.size).toBe(1)

    term[Symbol.dispose]()
    expect(calls).toEqual(["hit"])
    expect(term.signals.isDisposed).toBe(true)
  })
})
