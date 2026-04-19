/**
 * BaseApp contract tests — lock in the apply-chain semantics.
 *
 * These tests mirror the v1r prototype's invariants:
 *   - base apply returns false (nothing handled)
 *   - reentrant dispatch throws
 *   - Effect[] = handled channel
 *   - dispatch-effects re-enter via the queue, not via nested dispatch()
 *   - non-dispatch effects bubble up to the runner via drainEffects()
 *
 * Plugins use the capture-and-override idiom directly:
 *   const prev = app.apply
 *   app.apply = (op) => { ...; return prev(op) }
 */

import { describe, expect, test } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import type { ApplyResult, Effect, Op } from "../src/types"

describe("createBaseApp", () => {
  test("base apply returns false (nothing handled)", () => {
    const app = createBaseApp()
    expect(app.apply({ type: "whatever" })).toBe(false)
  })

  test("dispatch on unhandled op leaves drainEffects empty", () => {
    const app = createBaseApp()
    app.dispatch({ type: "noop" })
    expect(app.drainEffects()).toEqual([])
  })

  test("plugin can handle an op and emit runner effects", () => {
    const app = createBaseApp()
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "ping") return [{ type: "render" }]
      return prev(op)
    }
    app.dispatch({ type: "ping" })
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("drainEffects clears the pending queue", () => {
    const app = createBaseApp()
    app.apply = () => [{ type: "render" }]
    app.dispatch({ type: "x" })
    expect(app.drainEffects()).toHaveLength(1)
    expect(app.drainEffects()).toEqual([])
  })

  test("reentrant dispatch throws", () => {
    const app = createBaseApp()
    app.apply = (op) => {
      if (op.type === "outer") {
        // Direct re-entry is forbidden — must use a dispatch effect instead.
        app.dispatch({ type: "inner" })
        return []
      }
      return false
    }
    expect(() => app.dispatch({ type: "outer" })).toThrow(/Reentrant dispatch/)
  })

  test("dispatch effect re-enters the chain via the drain queue", () => {
    const app = createBaseApp()
    const seen: string[] = []
    const prev = app.apply
    app.apply = (op) => {
      seen.push(op.type)
      if (op.type === "a") {
        return [{ type: "dispatch", op: { type: "b" } } as Effect]
      }
      return prev(op)
    }
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b"])
  })

  test("plugin ordering — last plugin wraps outermost (runs first)", () => {
    const app = createBaseApp()
    const order: string[] = []
    const innerPrev = app.apply
    app.apply = (op) => {
      order.push("inner")
      return innerPrev(op)
    }
    const outerPrev = app.apply
    app.apply = (op) => {
      order.push("outer")
      return outerPrev(op)
    }
    app.dispatch({ type: "x" })
    expect(order).toEqual(["outer", "inner"])
  })

  test("handled (empty effects) short-circuits downstream plugins", () => {
    const app = createBaseApp()
    let innerRan = false
    const innerPrev = app.apply
    app.apply = (op) => {
      innerRan = true
      return innerPrev(op)
    }
    const outerPrev = app.apply
    app.apply = (op): ApplyResult => {
      // outer handles everything with empty effects — inner should never run
      void outerPrev
      void op
      return []
    }
    app.dispatch({ type: "consumed" })
    expect(innerRan).toBe(false)
  })

  test("unhandled pass-through — inner plugin runs when outer returns false", () => {
    const app = createBaseApp()
    let innerRan = false
    const innerPrev = app.apply
    app.apply = (op) => {
      if (op.type === "inner-only") {
        innerRan = true
        return []
      }
      return innerPrev(op)
    }
    const outerPrev = app.apply
    app.apply = (op) => outerPrev(op) // pure pass-through
    app.dispatch({ type: "inner-only" })
    expect(innerRan).toBe(true)
  })

  test("runner effects accumulate across multiple dispatches", () => {
    const app = createBaseApp()
    app.apply = (op) => {
      if (op.type === "paint") return [{ type: "render" }]
      return false
    }
    app.dispatch({ type: "paint" })
    app.dispatch({ type: "paint" })
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "render" }])
  })

  test("dispatch-effect chain A→B→C via queue, runner effects bubble up", () => {
    const app = createBaseApp()
    const seen: string[] = []
    app.apply = (op) => {
      seen.push(op.type)
      if (op.type === "a") return [{ type: "dispatch", op: { type: "b" } } as Effect]
      if (op.type === "b")
        return [{ type: "dispatch", op: { type: "c" } } as Effect, { type: "render" }]
      if (op.type === "c") return [{ type: "exit" }]
      return false
    }
    app.dispatch({ type: "a" })
    expect(seen).toEqual(["a", "b", "c"])
    // Non-dispatch effects (render, exit) bubble up to the runner:
    expect(app.drainEffects()).toEqual([{ type: "render" }, { type: "exit" }])
  })

  test("malformed dispatch-effect (no `op`) is silently dropped", () => {
    const app = createBaseApp()
    app.apply = (op) => {
      if (op.type === "a") return [{ type: "dispatch" } as Effect]
      return false
    }
    expect(() => app.dispatch({ type: "a" })).not.toThrow()
    expect(app.drainEffects()).toEqual([])
  })
})

describe("plugin idiom", () => {
  test("captured prev is the base apply, not the wrapper (no infinite recursion)", () => {
    // Regression check: if a plugin accidentally writes `app.apply(op)` instead
    // of the captured `prev(op)`, it infinite-loops. Capturing into a local
    // const prevents that; this test verifies the captured reference is the
    // pre-wrap apply.
    const app = createBaseApp()
    let capturedPrev: ((op: Op) => ApplyResult) | null = null
    const prev = app.apply
    app.apply = (op) => {
      capturedPrev = prev
      return prev(op)
    }
    app.dispatch({ type: "any" })
    expect(capturedPrev).not.toBeNull()
    // The captured prev should refer to the base apply (returns false).
    expect(capturedPrev!({ type: "any" })).toBe(false)
  })
})
