/**
 * withTerminalChain tests — observer lane + lifecycle ops.
 */

import { describe, expect, test } from "vitest"
import { createBaseApp } from "../src/runtime/base-app"
import { withTerminalChain, type KeyShape } from "../src/runtime/with-terminal-chain"

function mkApp(opts?: { cols?: number; rows?: number }) {
  return withTerminalChain(opts)(createBaseApp())
}

describe("withTerminalChain", () => {
  test("exposes terminal store with defaults", () => {
    const app = mkApp()
    expect(app.terminal.cols).toBe(80)
    expect(app.terminal.rows).toBe(24)
    expect(app.terminal.focused).toBe(true)
    expect(app.terminal.modifiers).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      super: false,
      hyper: false,
    })
  })

  test("respects initial cols/rows", () => {
    const app = mkApp({ cols: 120, rows: 40 })
    expect(app.terminal.cols).toBe(120)
    expect(app.terminal.rows).toBe(40)
  })

  test("observer lane: updates modifiers on input:key, never consumes", () => {
    const app = mkApp()
    const key: KeyShape = { ctrl: true, shift: false, eventType: "press" }
    app.dispatch({ type: "input:key", input: "c", key })
    expect(app.terminal.modifiers.ctrl).toBe(true)
    expect(app.terminal.modifiers.shift).toBe(false)
    // Not consumed — drainEffects should be empty (no one else handled).
    expect(app.drainEffects()).toEqual([])
  })

  test("term:resize updates dims and emits a render effect", () => {
    const app = mkApp()
    app.dispatch({ type: "term:resize", cols: 100, rows: 30 })
    expect(app.terminal.cols).toBe(100)
    expect(app.terminal.rows).toBe(30)
    expect(app.drainEffects()).toEqual([{ type: "render" }])
  })

  test("term:focus true updates focused, leaves modifiers alone", () => {
    const app = mkApp()
    // Set some modifier state first.
    app.dispatch({
      type: "input:key",
      input: "",
      key: { shift: true, eventType: "press" } as KeyShape,
    })
    expect(app.terminal.modifiers.shift).toBe(true)
    app.dispatch({ type: "term:focus", focused: true })
    expect(app.terminal.focused).toBe(true)
    expect(app.terminal.modifiers.shift).toBe(true) // still held
  })

  test("term:focus false clears sticky modifiers (the classic Alt-Tab bug)", () => {
    const app = mkApp()
    app.dispatch({
      type: "input:key",
      input: "",
      key: { ctrl: true, eventType: "press" } as KeyShape,
    })
    expect(app.terminal.modifiers.ctrl).toBe(true)
    app.dispatch({ type: "term:focus", focused: false })
    expect(app.terminal.focused).toBe(false)
    expect(app.terminal.modifiers.ctrl).toBe(false)
    expect(app.terminal.modifiers.shift).toBe(false)
  })

  test("meta flag maps to alt for Mac compatibility", () => {
    const app = mkApp()
    app.dispatch({
      type: "input:key",
      input: "x",
      key: { meta: true, eventType: "press" } as KeyShape,
    })
    expect(app.terminal.modifiers.alt).toBe(true)
    expect(app.terminal.modifiers.meta).toBe(true)
  })

  test("unrelated ops pass through untouched", () => {
    const app = mkApp()
    app.dispatch({ type: "mystery", payload: 42 })
    expect(app.terminal.cols).toBe(80) // unchanged
    expect(app.drainEffects()).toEqual([])
  })
})
