/**
 * withCustomEvents tests — app-defined view ↔ runtime event bus.
 */

import { describe, expect, test, vi } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withCustomEvents } from "../src/runtime/with-custom-events"

function mkApp() {
  return withCustomEvents(createBaseApp())
}

describe("withCustomEvents", () => {
  test("emit with no subscribers is a no-op", () => {
    const app = mkApp()
    expect(() => app.events.emit("nobody", "hi")).not.toThrow()
  })

  test("on → emit invokes the handler with payload", () => {
    const app = mkApp()
    const seen: unknown[][] = []
    app.events.on("link:open", (...args) => {
      seen.push(args)
    })
    app.events.emit("link:open", "https://example.com")
    expect(seen).toEqual([["https://example.com"]])
  })

  test("multiple handlers fire in registration order", () => {
    const app = mkApp()
    const seen: string[] = []
    app.events.on("chan", () => seen.push("a"))
    app.events.on("chan", () => seen.push("b"))
    app.events.on("chan", () => seen.push("c"))
    app.events.emit("chan")
    expect(seen).toEqual(["a", "b", "c"])
  })

  test("returned cleanup function unsubscribes", () => {
    const app = mkApp()
    const handler = vi.fn()
    const off = app.events.on("x", handler)
    app.events.emit("x", 1)
    off()
    app.events.emit("x", 2)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(1)
  })

  test("off() removes a handler", () => {
    const app = mkApp()
    const handler = vi.fn()
    app.events.on("x", handler)
    app.events.off("x", handler)
    app.events.emit("x")
    expect(handler).not.toHaveBeenCalled()
  })

  test("channels are isolated", () => {
    const app = mkApp()
    const aHandler = vi.fn()
    const bHandler = vi.fn()
    app.events.on("a", aHandler)
    app.events.on("b", bHandler)
    app.events.emit("a", 1)
    expect(aHandler).toHaveBeenCalledWith(1)
    expect(bHandler).not.toHaveBeenCalled()
  })

  test("thrown handler does not short-circuit siblings", () => {
    const app = mkApp()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const seen: string[] = []
    app.events.on("x", () => {
      throw new Error("boom")
    })
    app.events.on("x", () => seen.push("second"))
    app.events.emit("x")
    expect(seen).toEqual(["second"])
    spy.mockRestore()
  })

  test("handler unsubscribing during emit does not skip siblings", () => {
    const app = mkApp()
    const seen: string[] = []
    const off1 = app.events.on("x", () => {
      seen.push("first")
      off1()
    })
    app.events.on("x", () => seen.push("second"))
    app.events.emit("x")
    expect(seen).toEqual(["first", "second"])
  })

  test("plugin does not intercept ops", () => {
    const app = mkApp()
    // No downstream plugin installed — every op should pass through to
    // the base (which returns false).
    const result = app.apply({ type: "input:key", input: "a" } as never)
    expect(result).toBe(false)
  })
})
