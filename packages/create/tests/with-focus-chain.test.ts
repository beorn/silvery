/**
 * withFocusChain tests — focused-element dispatch, precedence vs useInput.
 */

import { describe, expect, test, vi } from "vitest"
import { pipe } from "../src/pipe"
import { createBaseApp } from "../src/runtime/base-app"
import { withFocusChain } from "../src/runtime/with-focus-chain"
import { withInputChain } from "../src/runtime/with-input-chain"
import type { KeyShape } from "../src/runtime/with-terminal-chain"

function pressKey(
  app: { dispatch: (op: { type: string; input: string; key: KeyShape }) => void },
  input: string,
  extra: Partial<KeyShape> = {},
) {
  app.dispatch({ type: "input:key", input, key: { eventType: "press", ...extra } as KeyShape })
}

describe("withFocusChain", () => {
  test("no active focus → dispatchKey is never called, passes through", () => {
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => false })(createBaseApp())
    pressKey(app, "j")
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("active focus + handler returns true → consumed, render effect, no pass-through", () => {
    const dispatchKey = vi.fn(() => true)
    const innerPrev = createBaseApp()
    let innerSaw = false
    const basePrev = innerPrev.apply
    innerPrev.apply = (op) => {
      innerSaw = true
      return basePrev(op)
    }
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(innerPrev)
    pressKey(app, "a")
    expect(dispatchKey).toHaveBeenCalledWith("a", expect.objectContaining({ eventType: "press" }))
    expect(app.focusChain.lastConsumed).toBe(true)
    expect(innerSaw).toBe(false) // short-circuited
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("active focus + handler returns false → falls through to next plugin", () => {
    const dispatchKey = vi.fn(() => false)
    const app = pipe(
      createBaseApp(),
      withInputChain,
      withFocusChain({ dispatchKey, hasActiveFocus: () => true }),
    )
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    pressKey(app, "k")
    expect(dispatchKey).toHaveBeenCalled()
    expect(seen).toEqual(["k"]) // useInput fallback saw it
    expect(app.focusChain.lastConsumed).toBe(false)
  })

  test("precedence: focused consumes first, useInput never sees it", () => {
    const dispatchKey = vi.fn(() => true)
    const app = pipe(
      createBaseApp(),
      withInputChain,
      withFocusChain({ dispatchKey, hasActiveFocus: () => true }),
    )
    const seen: string[] = []
    app.input.register(() => {
      seen.push("useInput ran")
    })
    pressKey(app, "a")
    expect(seen).toEqual([]) // critical: the whole point of the precedence
    expect(dispatchKey).toHaveBeenCalledTimes(1)
  })

  test("release events skip focus dispatch by default", () => {
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({ type: "input:key", input: "j", key: { eventType: "release" } as KeyShape })
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("modifier-only events skip focus dispatch by default", () => {
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({
      type: "input:key",
      input: "",
      key: { shift: true, eventType: "press" } as KeyShape,
    })
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("dispatchReleaseAndModifierOnly=true forwards release events", () => {
    const dispatchKey = vi.fn(() => true)
    const app = withFocusChain({
      dispatchKey,
      hasActiveFocus: () => true,
      dispatchReleaseAndModifierOnly: true,
    })(createBaseApp())
    app.dispatch({ type: "input:key", input: "j", key: { eventType: "release" } as KeyShape })
    expect(dispatchKey).toHaveBeenCalled()
  })

  test("non input:key ops pass through untouched", () => {
    const dispatchKey = vi.fn()
    const app = withFocusChain({ dispatchKey, hasActiveFocus: () => true })(createBaseApp())
    app.dispatch({ type: "term:resize", cols: 80, rows: 24 })
    expect(dispatchKey).not.toHaveBeenCalled()
  })

  test("throwing dispatchKey surfaces to console but does not crash", () => {
    const dispatchKey = vi.fn(() => {
      throw new Error("focus boom")
    })
    const app = pipe(
      createBaseApp(),
      withInputChain,
      withFocusChain({ dispatchKey, hasActiveFocus: () => true }),
    )
    const origError = console.error
    console.error = () => {}
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    try {
      pressKey(app, "x")
    } finally {
      console.error = origError
    }
    // dispatchKey threw → lastConsumed stays false → useInput fallback sees it.
    expect(seen).toEqual(["x"])
  })
})
