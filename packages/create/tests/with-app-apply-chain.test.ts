/**
 * withApp() must preserve the app reference so BaseApp.dispatch's closure
 * stays correct as plugins compose on top.
 *
 * Bug history: `withApp()` returned `{...app, ...appExt}` — a fresh object
 * spread. Plugins composed AFTER withApp() captured `app.apply` and
 * reassigned it on the post-spread object. `BaseApp.dispatch` was closed
 * over the ORIGINAL `app` reference, so its `app.apply` lookup found
 * the pre-withApp apply, and the post-withApp plugin's apply wrapper
 * never fired.
 *
 * Fix: `Object.assign(app, appExt)` mutates in place, preserving the
 * reference. Bead: km-silvery.with-app-spread-bug.
 */

import { describe, expect, test } from "vitest"
import { createBaseApp } from "../src/runtime/base-app.ts"
import { withApp } from "../src/with-app.ts"

describe("withApp() preserves app reference for dispatch closure", () => {
  test("Object.assign keeps the reference identical", () => {
    const base = createBaseApp()
    const baseRef = base
    const enhanced = withApp()(base)
    // Fresh-spread would have produced a NEW object — `enhanced !== base`.
    // The fix makes them identical so dispatch's closure stays valid.
    expect(enhanced).toBe(baseRef)
  })

  test("post-withApp plugin's apply wrapper IS invoked by dispatch", () => {
    const base = createBaseApp()
    const enhanced = withApp()(base)

    // Mimic a downstream plugin: capture current apply, replace with a
    // wrapper that records the op and delegates.
    const calls: unknown[] = []
    const origApply = enhanced.apply
    enhanced.apply = (op: unknown, ...rest: unknown[]) => {
      calls.push(op)
      return origApply.call(enhanced, op as never, ...(rest as []))
    }

    // Dispatch through the enhanced app. If withApp() had spread to a fresh
    // object, BaseApp.dispatch's closure would point to the pre-spread app
    // and skip our wrapper.
    enhanced.dispatch({ kind: "test.op", payload: 42 })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ kind: "test.op", payload: 42 })
  })
})
