/**
 * withReact tests — cover the three accepted call forms:
 *
 *   1. Legacy positional:   withReact(<El />)
 *   2. Object form, element: withReact({ view: <El /> })
 *   3. Object form, factory: withReact({ view: (app) => <El /> })
 *
 * The tests drive withReact with a minimal stub `app.run()` — the goal is
 * to verify element binding and factory resolution, not React mounting.
 * Full reconciler integration is covered by ag-term and app-level tests.
 */

import React from "react"
import type { ReactElement } from "react"
import { describe, expect, expectTypeOf, test } from "vitest"
import { withReact } from "../src/with-react"
import { createApp, type AppHandle, type AppRunner } from "../src/create-app"
import { pipe } from "../src/pipe"
import { withTerminal } from "../src/with-terminal"
import { withDomEvents } from "../src/with-dom-events"

// A minimal app stub that records what run() was called with.
function mkRunnable() {
  const calls: { element: ReactElement | undefined; rest: unknown[] }[] = []
  const app: {
    run(element: ReactElement, ...args: unknown[]): string
  } = {
    run(element: ReactElement, ...rest: unknown[]) {
      calls.push({ element, rest })
      return "ok"
    },
  }
  return { app, calls }
}

// Uses React.createElement so the file can stay .ts (not .tsx) — tests
// directory mixes both and this keeps the module concern narrow.
function makeElement(label = "legacy"): ReactElement {
  return React.createElement("div", { "data-label": label }, label)
}

describe("withReact", () => {
  test("preserves the runner and handle types of a real app definition", () => {
    const definition = createApp(() => () => ({ count: 0 }))
    const app = pipe(
      definition,
      withReact(makeElement()),
      withTerminal({ stdin: process.stdin, stdout: process.stdout }),
      withDomEvents(),
    )
    type State = { count: number } & Record<string, unknown>
    expectTypeOf(app.run).returns.toEqualTypeOf<AppRunner<State>>()
    expectTypeOf<Awaited<ReturnType<typeof app.run>>>().toEqualTypeOf<AppHandle<State>>()
    expectTypeOf(app).not.toHaveProperty("getContainer")
    expectTypeOf(app).not.toHaveProperty("click")
  })

  test("composed no-argument run forwards its result, registry and terminal options", () => {
    const { app: definition, calls } = mkRunnable()
    const element = makeElement()
    const app = pipe(
      definition,
      withReact(element),
      withTerminal({ stdin: process.stdin, stdout: process.stdout }, { mouse: true, kitty: false }),
      withDomEvents(),
    )
    const result = app.run()
    expectTypeOf(result).toEqualTypeOf<string>()
    expect(result).toBe("ok")
    expect(calls).toHaveLength(1)
    expect(calls[0]!.element).toBe(element)
    expect(calls[0]!.rest[0]).toMatchObject({
      capabilityRegistry: app.capabilityRegistry,
      stdin: process.stdin,
      stdout: process.stdout,
      mouse: true,
      kitty: false,
    })
  })

  describe("legacy positional form: withReact(element)", () => {
    test("stores the element on app.element", () => {
      const { app } = mkRunnable()
      const el = makeElement("legacy")
      const wrapped = withReact(el)(app)
      expect(wrapped.element).toBe(el)
    })

    test("app.run() with no args injects the bound element", () => {
      const { app, calls } = mkRunnable()
      const el = makeElement("legacy")
      const wrapped = withReact(el)(app)
      wrapped.run()
      expect(calls).toHaveLength(1)
      expect(calls[0]!.element).toBe(el)
    })
  })

  describe("object form with element: withReact({ view: element })", () => {
    test("stores the element on app.element", () => {
      const { app } = mkRunnable()
      const el = makeElement("object-element")
      const wrapped = withReact({ view: el })(app)
      expect(wrapped.element).toBe(el)
    })

    test("app.run() with no args injects the bound element", () => {
      const { app, calls } = mkRunnable()
      const el = makeElement("object-element")
      const wrapped = withReact({ view: el })(app)
      wrapped.run()
      expect(calls).toHaveLength(1)
      expect(calls[0]!.element).toBe(el)
    })
  })

  describe("object form with factory: withReact({ view: (app) => element })", () => {
    test("factory receives the app and returns an element", () => {
      const { app } = mkRunnable()
      // Extend the app with a domain property that the factory reads.
      const appWithDomain = Object.assign(app, { chat: { id: 42 } })
      const el = makeElement("factory")
      let seenApp: unknown = null
      const wrapped = withReact<typeof appWithDomain>({
        view: (a) => {
          seenApp = a
          return el
        },
      })(appWithDomain)
      expect(seenApp).toBe(appWithDomain)
      expect(wrapped.element).toBe(el)
    })

    test("factory runs once at plugin-install time, not per run()", () => {
      const { app, calls } = mkRunnable()
      let factoryCalls = 0
      const el = makeElement("factory-once")
      const wrapped = withReact({
        view: (_a) => {
          factoryCalls++
          return el
        },
      })(app)
      expect(factoryCalls).toBe(1)
      wrapped.run()
      wrapped.run()
      expect(factoryCalls).toBe(1)
      expect(calls).toHaveLength(2)
      expect(calls[0]!.element).toBe(el)
      expect(calls[1]!.element).toBe(el)
    })

    test("factory can read app state added by earlier plugins", () => {
      // Simulate the aichat-v2 pattern: an earlier plugin installs
      // app.chat, and the withReact factory closes over it.
      const { app } = mkRunnable()
      const chat = { messages: ["hello"] }
      const appWithChat = Object.assign(app, { chat })

      const wrapped = withReact<typeof appWithChat>({
        view: (a) => React.createElement("section", { "data-chat": a.chat.messages[0] }),
      })(appWithChat)

      // The rendered element should carry the prop from app.chat.
      const props = (wrapped.element.props as Record<string, unknown>) ?? {}
      expect(props["data-chat"]).toBe("hello")
    })
  })

  describe("pass-through when run() is called with an explicit element", () => {
    test("does not override when args[0] is a ReactElement", () => {
      const { app, calls } = mkRunnable()
      const bound = makeElement("bound")
      const explicit = makeElement("explicit")
      const wrapped = withReact(bound)(app)
      ;(wrapped.run as (el?: ReactElement) => Promise<void>)(explicit)
      expect(calls[0]!.element).toBe(explicit)
    })

    test("forwards options when args[0] is a non-element object", () => {
      const { app, calls } = mkRunnable()
      const bound = makeElement("bound")
      const wrapped = withReact(bound)(app)
      wrapped.run({ mode: "inline" } as unknown as ReactElement)
      // options object has no `type` field → treated as options, element is
      // injected and the options object is passed as the second arg.
      expect(calls[0]!.element).toBe(bound)
      expect(calls[0]!.rest[0]).toEqual({ mode: "inline" })
    })
  })
})
