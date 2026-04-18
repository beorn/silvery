/**
 * Lifecycle effect detection + interception tests.
 */

import { describe, expect, test, vi } from "vitest"
import {
  exitEffect,
  interceptLifecycleKey,
  isCtrlC,
  isCtrlZ,
  renderBarrierEffect,
  renderEffect,
  suspendEffect,
} from "../src/runtime/lifecycle-effects"
import type { KeyShape } from "../src/runtime/with-terminal-chain"

describe("effect constructors", () => {
  test("exitEffect defaults", () => {
    expect(exitEffect()).toEqual({ type: "exit", reason: "app-handler" })
  })
  test("exitEffect with reason + code", () => {
    expect(exitEffect("ctrl-c", 130)).toEqual({ type: "exit", reason: "ctrl-c", code: 130 })
  })
  test("suspendEffect defaults", () => {
    expect(suspendEffect()).toEqual({ type: "suspend", reason: "ctrl-z" })
  })
  test("renderBarrierEffect", () => {
    expect(renderBarrierEffect()).toEqual({ type: "render-barrier" })
  })
  test("renderEffect", () => {
    expect(renderEffect()).toEqual({ type: "render" })
  })
})

describe("isCtrlC / isCtrlZ", () => {
  test("isCtrlC accepts plain ctrl+c", () => {
    expect(isCtrlC("c", { ctrl: true } as KeyShape)).toBe(true)
  })
  test("isCtrlC rejects shift+ctrl+c and meta+c", () => {
    expect(isCtrlC("c", { ctrl: true, shift: true } as KeyShape)).toBe(false)
    expect(isCtrlC("c", { ctrl: true, meta: true } as KeyShape)).toBe(false)
  })
  test("isCtrlC rejects plain 'c'", () => {
    expect(isCtrlC("c", {} as KeyShape)).toBe(false)
  })
  test("isCtrlZ accepts plain ctrl+z only", () => {
    expect(isCtrlZ("z", { ctrl: true } as KeyShape)).toBe(true)
    expect(isCtrlZ("z", {} as KeyShape)).toBe(false)
    expect(isCtrlZ("z", { ctrl: true, shift: true } as KeyShape)).toBe(false)
  })
})

describe("interceptLifecycleKey", () => {
  test("Ctrl+C returns an exit effect with reason='ctrl-c'", () => {
    expect(interceptLifecycleKey("c", { ctrl: true } as KeyShape, {})).toEqual({
      type: "exit",
      reason: "ctrl-c",
    })
  })

  test("Ctrl+Z returns a suspend effect with reason='ctrl-z'", () => {
    expect(interceptLifecycleKey("z", { ctrl: true } as KeyShape, {})).toEqual({
      type: "suspend",
      reason: "ctrl-z",
    })
  })

  test("exitOnCtrlC=false leaves Ctrl+C untouched", () => {
    expect(
      interceptLifecycleKey("c", { ctrl: true } as KeyShape, { exitOnCtrlC: false }),
    ).toBeNull()
  })

  test("suspendOnCtrlZ=false leaves Ctrl+Z untouched", () => {
    expect(
      interceptLifecycleKey("z", { ctrl: true } as KeyShape, { suspendOnCtrlZ: false }),
    ).toBeNull()
  })

  test("onInterrupt returning false prevents the exit effect", () => {
    const onInterrupt = vi.fn(() => false)
    expect(interceptLifecycleKey("c", { ctrl: true } as KeyShape, { onInterrupt })).toBeNull()
    expect(onInterrupt).toHaveBeenCalledTimes(1)
  })

  test("onInterrupt returning undefined does NOT prevent exit (only === false does)", () => {
    const onInterrupt = vi.fn(() => undefined)
    expect(interceptLifecycleKey("c", { ctrl: true } as KeyShape, { onInterrupt })).toEqual({
      type: "exit",
      reason: "ctrl-c",
    })
  })

  test("onSuspend returning false prevents suspend", () => {
    const onSuspend = vi.fn(() => false)
    expect(interceptLifecycleKey("z", { ctrl: true } as KeyShape, { onSuspend })).toBeNull()
  })

  test("non-lifecycle keys return null", () => {
    expect(interceptLifecycleKey("j", { ctrl: true } as KeyShape, {})).toBeNull()
    expect(interceptLifecycleKey("c", {} as KeyShape, {})).toBeNull()
  })
})
