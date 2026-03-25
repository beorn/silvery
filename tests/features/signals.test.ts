/**
 * Tests for @silvery/signals — reactive signals wrapper.
 */
import { describe, test, expect, vi } from "vitest"
import { signal, computed, effect, batch, isSignal, isComputed, isEffect } from "@silvery/signals"

describe("signal", () => {
  test("creates reactive value with initial value", () => {
    const count = signal(0)
    expect(count()).toBe(0)
  })

  test("updates value when called with argument", () => {
    const count = signal(0)
    count(5)
    expect(count()).toBe(5)
  })

  test("works with string values", () => {
    const name = signal("hello")
    expect(name()).toBe("hello")
    name("world")
    expect(name()).toBe("world")
  })

  test("works without initial value", () => {
    const value = signal<number>()
    expect(value()).toBeUndefined()
    value(42)
    expect(value()).toBe(42)
  })

  test("isSignal returns true for signals", () => {
    const s = signal(0)
    expect(isSignal(s)).toBe(true)
  })
})

describe("computed", () => {
  test("derives value from signal", () => {
    const count = signal(3)
    const doubled = computed(() => count() * 2)
    expect(doubled()).toBe(6)
  })

  test("updates when dependency changes", () => {
    const count = signal(1)
    const doubled = computed(() => count() * 2)
    expect(doubled()).toBe(2)
    count(5)
    expect(doubled()).toBe(10)
  })

  test("derives from multiple signals", () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a() + b())
    expect(sum()).toBe(5)
    a(10)
    expect(sum()).toBe(13)
    b(20)
    expect(sum()).toBe(30)
  })

  test("chains computed values", () => {
    const base = signal(2)
    const doubled = computed(() => base() * 2)
    const quadrupled = computed(() => doubled() * 2)
    expect(quadrupled()).toBe(8)
    base(5)
    expect(quadrupled()).toBe(20)
  })

  test("isComputed returns true for computed", () => {
    const c = computed(() => 42)
    expect(isComputed(c)).toBe(true)
  })
})

describe("effect", () => {
  test("runs immediately on creation", () => {
    const fn = vi.fn()
    const dispose = effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("re-runs when dependency changes", () => {
    const count = signal(0)
    const values: number[] = []
    const dispose = effect(() => {
      values.push(count())
    })
    expect(values).toEqual([0])
    count(1)
    expect(values).toEqual([0, 1])
    count(2)
    expect(values).toEqual([0, 1, 2])
    dispose()
  })

  test("stops tracking after disposal", () => {
    const count = signal(0)
    const values: number[] = []
    const dispose = effect(() => {
      values.push(count())
    })
    expect(values).toEqual([0])
    dispose()
    count(1)
    expect(values).toEqual([0]) // no new entry after disposal
  })

  test("isEffect returns true for effects", () => {
    const e = effect(() => {})
    expect(isEffect(e)).toBe(true)
    e() // dispose
  })
})

describe("batch", () => {
  test("groups multiple updates into one notification", () => {
    const a = signal(1)
    const b = signal(2)
    const values: number[] = []
    const dispose = effect(() => {
      values.push(a() + b())
    })
    expect(values).toEqual([3])

    batch(() => {
      a(10)
      b(20)
    })
    // After batch, effect should have run once with the final values
    expect(values).toEqual([3, 30])
    dispose()
  })

  test("handles nested batches", () => {
    const count = signal(0)
    const values: number[] = []
    const dispose = effect(() => {
      values.push(count())
    })
    expect(values).toEqual([0])

    batch(() => {
      count(1)
      batch(() => {
        count(2)
      })
      count(3)
    })
    // Only the final value should trigger after outermost batch
    expect(values.at(-1)).toBe(3)
    dispose()
  })

  test("notifies even if fn throws", () => {
    const count = signal(0)
    const values: number[] = []
    const dispose = effect(() => {
      values.push(count())
    })

    expect(() => {
      batch(() => {
        count(99)
        throw new Error("boom")
      })
    }).toThrow("boom")

    // endBatch still ran (finally block), so effect should see the update
    expect(values).toContain(99)
    dispose()
  })
})
