/**
 * withInputChain tests — fallback useInput store semantics.
 */

import { describe, expect, test } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withInputChain, type InputHandler } from "../src/runtime/with-input-chain"
import type { KeyShape } from "../src/runtime/with-terminal-chain"

function mkApp() {
  return withInputChain(createBaseApp())
}

function pressKey(app: ReturnType<typeof mkApp>, input: string, extra: Partial<KeyShape> = {}) {
  app.dispatch({ type: "input:key", input, key: { eventType: "press", ...extra } as KeyShape })
}

describe("withInputChain", () => {
  test("starts with an empty handler registry", () => {
    const app = mkApp()
    expect(app.input.handlers).toHaveLength(0)
  })

  test("register returns an unregister function", () => {
    const app = mkApp()
    const handler: InputHandler = () => {}
    const off = app.input.register(handler)
    expect(app.input.handlers).toHaveLength(1)
    off()
    expect(app.input.handlers).toHaveLength(0)
  })

  test("press event invokes registered handler", () => {
    const app = mkApp()
    const seen: string[] = []
    app.input.register((input) => {
      seen.push(input)
    })
    pressKey(app, "j")
    expect(seen).toEqual(["j"])
  })

  test("handlers fire in registration order", () => {
    const app = mkApp()
    const seen: string[] = []
    app.input.register(() => {
      seen.push("first")
    })
    app.input.register(() => {
      seen.push("second")
    })
    pressKey(app, "x")
    expect(seen).toEqual(["first", "second"])
  })

  test("inactive handler is skipped", () => {
    const app = mkApp()
    const seen: string[] = []
    const handler: InputHandler = () => {
      seen.push("ran")
    }
    app.input.register(handler, false)
    pressKey(app, "j")
    expect(seen).toEqual([])
  })

  test("setActive toggles handler on/off", () => {
    const app = mkApp()
    const seen: string[] = []
    const handler: InputHandler = () => {
      seen.push("hi")
    }
    app.input.register(handler, false)
    pressKey(app, "a")
    expect(seen).toEqual([])
    app.input.setActive(handler, true)
    pressKey(app, "a")
    expect(seen).toEqual(["hi"])
  })

  test("'exit' result short-circuits and emits an exit effect", () => {
    const app = mkApp()
    let secondCalled = false
    app.input.register(() => "exit")
    app.input.register(() => {
      secondCalled = true
    })
    pressKey(app, "q")
    expect(secondCalled).toBe(false)
    expect(app.drainEffects()).toEqual([{ type: "exit" }])
  })

  test("handled state (no exit) emits an empty effect array — render not forced here", () => {
    const app = mkApp()
    app.input.register(() => {})
    pressKey(app, "k")
    // withInputChain doesn't emit render itself — the runner does, after
    // drainEffects. Handled but no side effects means [] → empty drain.
    expect(app.drainEffects()).toEqual([])
  })

  test("no handlers registered → pass-through (returns false)", () => {
    // We can't observe `false` directly from outside, but we can verify
    // that downstream plugins/base see the op unchanged by chaining.
    const base = createBaseApp()
    let innerSaw = false
    // Mimic a downstream plugin with a raw wrap.
    const prev = base.apply
    base.apply = (op) => {
      if (op.type === "input:key") innerSaw = true
      return prev(op)
    }
    const app = withInputChain(base)
    pressKey(app, "z")
    expect(innerSaw).toBe(true)
  })

  test("release event is not delivered to handlers", () => {
    const app = mkApp()
    const seen: string[] = []
    app.input.register((input, key) => {
      seen.push(`${input}:${key.eventType ?? "press"}`)
    })
    app.dispatch({ type: "input:key", input: "j", key: { eventType: "release" } as KeyShape })
    expect(seen).toEqual([])
  })

  test("modifier-only event (empty input + shift) is not delivered", () => {
    const app = mkApp()
    const seen: string[] = []
    app.input.register(() => {
      seen.push("ran")
    })
    app.dispatch({
      type: "input:key",
      input: "",
      key: { shift: true, eventType: "press" } as KeyShape,
    })
    expect(seen).toEqual([])
  })

  test("a throwing handler does not stop subsequent handlers", () => {
    const app = mkApp()
    const seen: string[] = []
    app.input.register(() => {
      throw new Error("boom")
    })
    app.input.register(() => {
      seen.push("after-boom")
    })
    // Suppress expected console.error via monkey-patch during the call.
    const origError = console.error
    console.error = () => {}
    try {
      pressKey(app, "x")
    } finally {
      console.error = origError
    }
    expect(seen).toEqual(["after-boom"])
  })

  test("unregister removes a handler", () => {
    const app = mkApp()
    const seen: string[] = []
    const h: InputHandler = () => {
      seen.push("h")
    }
    app.input.register(h)
    app.input.unregister(h)
    pressKey(app, "a")
    expect(seen).toEqual([])
  })
})
