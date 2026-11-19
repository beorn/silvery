/**
 * @reach fs-walk <fixture-only: the startup-rollback case lists its own temporary SILVERY_DUMP_DIR>
 * Runtime integration — `@silvery/scope` wired into createApp/run.
 *
 * Bead: km-silvery.lifecycle-scope (Phase 1).
 *
 * The scope hooks themselves are unit-tested against a synthetic parent in
 * `packages/ag-react/tests/use-scope.test.tsx`. This file exercises the
 * runtime wiring: `createApp()`/`run()` constructs a root scope, wraps the
 * React tree with a `<ScopeProvider>` carrying both `ScopeContext` and
 * `AppScopeContext`, exposes it as `handle.scope`, and disposes it after
 * React unmount during `cleanup()`.
 *
 * Coverage:
 *
 *   1. `handle.scope` is the same value `useScope()` / `useAppScope()`
 *      observe inside the React tree.
 *   2. The root scope is *not* disposed while the app is running.
 *   3. Unmount disposes the root scope (LIFO over `defer` registrations).
 *   4. `useScopeEffect` inside a component disposes its child scope on
 *      app unmount — proving fiber-attached scopes cascade through the
 *      handle's root.
 *   5. Component-mid-flight unmount (the doomed-subtree case) disposes
 *      the child scope without affecting the handle's root.
 */

import React, { useEffect, useState } from "react"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { createApp } from "../../packages/ag-term/src/runtime/create-app"
import { run } from "../../packages/ag-term/src/runtime/run"
import { type Scope, setDisposeErrorSink, type DisposeErrorContext } from "@silvery/scope"
import { useScope, useAppScope, useScopeEffect } from "@silvery/ag-react/hooks"

const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms))
const silveryRoot = resolve(import.meta.dirname, "../..")

// ----------------------------------------------------------------------------
// Test 1 — `handle.scope` is the React tree's scope
// ----------------------------------------------------------------------------

describe("createApp/run wires @silvery/scope as the app root scope", () => {
  test("handle.scope === useScope() === useAppScope() inside the tree", async () => {
    let observedCurrent: Scope | undefined
    let observedRoot: Scope | undefined

    function Probe(): React.ReactElement {
      observedCurrent = useScope()
      observedRoot = useAppScope()
      return <Text>probe</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<Probe />, term)
    await settle()

    expect(observedCurrent).toBeDefined()
    expect(observedRoot).toBeDefined()
    // Three identities collapse to one: the root scope.
    expect(observedCurrent).toBe(handle.scope)
    expect(observedRoot).toBe(handle.scope)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()
  })

  // --------------------------------------------------------------------------
  // Test 2 — root is alive while the app is running
  // --------------------------------------------------------------------------

  test("root scope stays alive across renders (not disposed until unmount)", async () => {
    function App({ tick }: { tick: number }): React.ReactElement {
      return <Text>tick {tick}</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<App tick={0} />, term)
    await settle()

    expect(handle.scope.disposed).toBe(false)

    // A few re-renders shouldn't touch the root.
    await handle.press("space")
    await settle()
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()
  })

  // --------------------------------------------------------------------------
  // Test 3 — unmount disposes the root scope, runs deferred cleanup LIFO
  // --------------------------------------------------------------------------

  test("unmount disposes the root scope and fires `defer` callbacks LIFO", async () => {
    const order: string[] = []
    let captured: Scope | undefined

    function App(): React.ReactElement {
      const root = useAppScope()
      captured = root
      // Render-phase rule: do NOT register from the body. Use an effect
      // (StrictMode-safe). We use a one-shot ref-style guard via state to
      // ensure registration runs once for the test, since createTermless
      // runs without StrictMode anyway. useScopeEffect is the canonical
      // form for this — we use the lower-level useEffect-into-root pattern
      // here because the test wants registrations on the *root* scope, not
      // a fresh child. See the lifecycle-scope.md design doc for guidance.
      const [registered] = useState(() => {
        // Defer until next microtask to keep the body pure — this still
        // runs before the next render commit since useState's initializer
        // fires once and we resolve the queue before the test reads.
        // (Inside React, this is fine because the effect of registering on
        // a *root scope* is observed only by the test, not by render.)
        queueMicrotask(() => {
          root.defer(() => {
            order.push("first-registered")
          })
          root.defer(() => {
            order.push("second-registered")
          })
        })
        return true
      })
      void registered
      return <Text>app</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<App />, term)
    await settle()

    expect(captured).toBe(handle.scope)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()

    expect(handle.scope.disposed).toBe(true)
    // LIFO: second-registered ran first.
    expect(order).toEqual(["second-registered", "first-registered"])
  })

  test("waitUntilExit joins root-scope async disposal after unmount", async () => {
    let registered = false
    let disposalStarted!: () => void
    let releaseDisposal!: () => void
    const started = new Promise<void>((resolve) => {
      disposalStarted = resolve
    })
    const heldDisposal = new Promise<void>((resolve) => {
      releaseDisposal = resolve
    })

    function AsyncOwner(): React.ReactElement {
      const scope = useAppScope()
      if (!registered) {
        registered = true
        scope.use({
          async [Symbol.asyncDispose]() {
            disposalStarted()
            await heldDisposal
          },
        })
      }
      return <Text>owned</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<AsyncOwner />, term)
    await settle()

    handle.unmount()
    await started

    const joined = handle.waitUntilExit().then(() => "joined" as const)
    const earlyOutcome = await Promise.race([
      joined,
      settle(25).then(() => "still-disposing" as const),
    ])
    try {
      expect(earlyOutcome).toBe("still-disposing")
    } finally {
      releaseDisposal()
      await joined
    }
  })

  test("waitUntilExit flushes ordinary React effect cleanup", async () => {
    let effectCleaned = false

    function EffectOwner(): React.ReactElement {
      useEffect(
        () => () => {
          effectCleaned = true
        },
        [],
      )
      return <Text>effect-owned</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<EffectOwner />, term)
    await settle()

    handle.unmount()
    await handle.waitUntilExit()
    expect(effectCleaned).toBe(true)
  })

  test("waitUntilExit joins a child scope already disposing from React unmount", async () => {
    let disposalStarted!: () => void
    let releaseDisposal!: () => void
    const started = new Promise<void>((resolve) => {
      disposalStarted = resolve
    })
    const heldDisposal = new Promise<void>((resolve) => {
      releaseDisposal = resolve
    })

    function ChildOwner(): React.ReactElement {
      useScopeEffect((scope) => {
        scope.use({
          async [Symbol.asyncDispose]() {
            disposalStarted()
            await heldDisposal
          },
        })
      }, [])
      return <Text>child-owned</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<ChildOwner />, term)
    await settle()

    handle.unmount()
    await started
    const joined = handle.waitUntilExit().then(() => "joined" as const)
    const earlyOutcome = await Promise.race([
      joined,
      settle(25).then(() => "child-still-disposing" as const),
    ])
    try {
      expect(earlyOutcome).toBe("child-still-disposing")
    } finally {
      releaseDisposal()
      await joined
    }
  })

  test("waitUntilExit joins the provider event pump after unmount", async () => {
    let pumpStarted!: () => void
    let providerDisposed!: () => void
    let releasePump!: () => void
    const started = new Promise<void>((resolve) => {
      pumpStarted = resolve
    })
    const disposed = new Promise<void>((resolve) => {
      providerDisposed = resolve
    })
    const heldPump = new Promise<void>((resolve) => {
      releasePump = resolve
    })
    const provider = {
      getState: () => ({}),
      subscribe: () => () => {},
      // oxlint-disable-next-line eslint/require-yield -- provider contract requires an async iterator; this probe intentionally holds next() in flight until disposal.
      async *events() {
        pumpStarted()
        try {
          await disposed
        } finally {
          await heldPump
        }
      },
      [Symbol.dispose]() {
        providerDisposed()
      },
    }

    function ProviderOwner(): React.ReactElement {
      const appScope = useAppScope()
      useEffect(() => {
        // The injected provider is borrowed by createApp, so its app-lifetime owner adopts it explicitly.
        appScope.use(provider)
      }, [appScope])
      return <Text>pump</Text>
    }

    const handle = await createApp(() => () => ({})).run(<ProviderOwner />, {
      cols: 20,
      rows: 2,
      writable: { write() {} },
      provider,
    })
    await started

    handle.unmount()
    const joined = handle.waitUntilExit().then(() => "joined" as const)
    await disposed
    // Root-scope disposal releases the provider's outstanding `next()`. Its
    // gated `finally` still keeps the runtime pump in flight.
    const earlyOutcome = await Promise.race([
      joined,
      settle(25).then(() => "pump-still-stopping" as const),
    ])
    try {
      expect(earlyOutcome).toBe("pump-still-stopping")
    } finally {
      releasePump()
      await joined
    }
  })

  // --------------------------------------------------------------------------
  // Test 4 — useScopeEffect child scope cascades through handle.scope
  // --------------------------------------------------------------------------

  test("useScopeEffect-owned child scope is disposed when the app unmounts", async () => {
    let child: Scope | undefined
    const events: string[] = []

    function Owner(): React.ReactElement {
      useScopeEffect((scope) => {
        child = scope
        scope.defer(() => {
          events.push("child-defer")
        })
      }, [])
      return <Text>owner</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(
      <Box>
        <Owner />
      </Box>,
      term,
    )
    await settle()

    expect(child).toBeDefined()
    expect(child!.disposed).toBe(false)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()

    expect(child!.disposed).toBe(true)
    expect(handle.scope.disposed).toBe(true)
    expect(events).toEqual(["child-defer"])
  })

  // --------------------------------------------------------------------------
  // Test 5 — disposing handle.scope directly does not break cleanup()
  // --------------------------------------------------------------------------
  //
  // The runtime treats `appScope[Symbol.asyncDispose]()` as idempotent
  // (inherited from `AsyncDisposableStack`). If a caller disposes the
  // handle's scope explicitly (e.g. in a test), a follow-up `unmount()`
  // must still run cleanup() without throwing.

  test("manual scope dispose is idempotent — unmount stays clean", async () => {
    const captured: { error: unknown; ctx: DisposeErrorContext }[] = []
    setDisposeErrorSink((error, ctx) => captured.push({ error, ctx }))
    try {
      using term = createTermless({ cols: 20, rows: 2 })
      const handle = await run(<Text>hello</Text>, term)
      await settle()

      await handle.scope[Symbol.asyncDispose]()
      expect(handle.scope.disposed).toBe(true)

      // Unmount after manual dispose: should NOT throw, and SHOULD NOT
      // re-fire any disposers (already drained). The only possible report
      // is from the `app-exit` re-dispose path, which is a no-op.
      expect(() => handle.unmount()).not.toThrow()
      await settle()

      // No error reports — idempotent dispose plus a clean unmount path.
      expect(captured).toEqual([])
    } finally {
      setDisposeErrorSink(() => {})
    }
  })

  test("pre-handle failures roll back the crash-record registration and the root scope", () => {
    const dumpDir = mkdtempSync(join(tmpdir(), "silvery-rollback-test-"))
    const source = String.raw`
      import React from "react"
      import { readdirSync } from "node:fs"
      import { createApp, recordAppCrash } from "./packages/ag-term/src/runtime/create-app.tsx"
      import { getTraceSnapshot } from "./packages/scope/src/index.ts"

      const before = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
      }
      let message = ""
      try {
        await createApp(() => () => {
          throw new Error("factory-boom-live")
        }).run(React.createElement(React.Fragment), {
          stdout: process.stdout,
          stdin: process.stdin,
        })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      const after = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
      }

      // Startup fails after the app joined recordAppCrash's live set: the cursor-hide write at alternate-screen
      // entry throws. The rollback must take the app out of that set, so a later crash records nothing for it.
      const handoffBefore = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
        uncaught: process.listenerCount("uncaughtException"),
        unhandled: process.listenerCount("unhandledRejection"),
      }
      const originalWrite = process.stdout.write
      let handoffError: unknown
      process.stdout.write = function (chunk, ...rest) {
        if (String(chunk).includes("\x1b[?25l")) throw new Error("cursor-hide-boom")
        return originalWrite.call(this, chunk, ...rest)
      }
      try {
        await createApp(() => () => ({})).run(React.createElement(React.Fragment), {
          stdout: process.stdout,
          stdin: process.stdin,
        })
      } catch (error) {
        handoffError = error
      } finally {
        process.stdout.write = originalWrite
      }
      const handoffAfter = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
        uncaught: process.listenerCount("uncaughtException"),
        unhandled: process.listenerCount("unhandledRejection"),
      }
      const stderrSeen = []
      const originalStderrWrite = process.stderr.write
      process.stderr.write = function (chunk, ...rest) {
        stderrSeen.push(String(chunk))
        return originalStderrWrite.call(this, chunk, ...rest)
      }
      recordAppCrash(new Error("post-rollback-probe"))
      process.stderr.write = originalStderrWrite
      const postRollback = {
        reported: stderrSeen.some((line) => line.includes("post-rollback-probe")),
        dumps: readdirSync(process.env.SILVERY_DUMP_DIR).length,
      }
      // The rollback restored the terminal on this same stdout, without a trailing newline: start the record on its own line.
      console.log("\n" + JSON.stringify({
        factory: { message, before, after },
        handoff: {
          name: handoffError?.constructor?.name,
          message: handoffError instanceof Error ? handoffError.message : String(handoffError),
          before: handoffBefore,
          after: handoffAfter,
        },
        postRollback,
        scopes: getTraceSnapshot().map(({ kind, name }) => ({ kind, name })),
      }))
    `
    const result = spawnSync("bun", ["-e", source], {
      cwd: silveryRoot,
      encoding: "utf8",
      env: { ...process.env, SILVERY_SCOPE_TRACE: "1", SILVERY_DUMP_DIR: dumpDir },
    })
    rmSync(dumpDir, { recursive: true, force: true }) // raw-delete-allow: the SILVERY_DUMP_DIR this test made with mkdtempSync

    expect(result.status, result.stderr).toBe(0)
    const record = JSON.parse(
      result.stdout
        .trim()
        .split("\n")
        .findLast((line) => line.startsWith("{")) ?? "{}",
    ) as {
      factory?: {
        message?: string
        before?: Record<string, number>
        after?: Record<string, number>
      }
      handoff?: {
        name?: string
        message?: string
        before?: Record<string, number>
        after?: Record<string, number>
      }
      postRollback?: { reported: boolean; dumps: number }
      scopes?: Array<{ kind: string; name?: string }>
    }
    expect(record.factory?.message).toBe("factory-boom-live")
    expect(record.factory?.after).toEqual(record.factory?.before)
    expect(record.handoff?.name).toBe("Error")
    expect(record.handoff?.message).toBe("cursor-hide-boom")
    expect(record.handoff?.after).toEqual(record.handoff?.before)
    expect(record.postRollback).toEqual({ reported: false, dumps: 0 })
    expect(record.scopes).toEqual([])
  })

  test("startup rejection waits for root-scope async disposal", async () => {
    let registered = false
    let disposalStarted = false
    let disposalFinished = false

    function AsyncOwner(): React.ReactElement {
      const scope = useAppScope()
      if (!registered) {
        registered = true
        scope.use({
          async [Symbol.asyncDispose]() {
            disposalStarted = true
            await settle(25)
            disposalFinished = true
          },
        })
      }
      return <Text>owned</Text>
    }

    let caught: unknown
    try {
      await createApp(() => () => ({})).run(<AsyncOwner />, {
        cols: 10,
        rows: 4,
        writable: {
          write() {
            throw new Error("paint-boom")
          },
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe("paint-boom")
    expect(disposalStarted).toBe(true)
    expect(disposalFinished).toBe(true)
  })

  test("startup rejection bounds a stuck root-scope async disposer", async () => {
    let registered = false
    let disposalStarted = false
    let releaseDisposal!: () => void
    const heldDisposal = new Promise<void>((resolve) => {
      releaseDisposal = resolve
    })
    const disposeErrors: unknown[] = []

    function StuckOwner(): React.ReactElement {
      const scope = useAppScope()
      if (!registered) {
        registered = true
        scope.use({
          async [Symbol.asyncDispose]() {
            disposalStarted = true
            await heldDisposal
          },
        })
      }
      return <Text>stuck</Text>
    }

    setDisposeErrorSink((error) => disposeErrors.push(error))
    const runPromise = Promise.resolve(
      createApp(() => () => ({})).run(<StuckOwner />, {
        cols: 10,
        rows: 4,
        writable: {
          write() {
            throw new Error("bounded-paint-boom")
          },
        },
      }),
    )
    const settled = runPromise.then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    )
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined

    try {
      const deadline = new Promise<{ kind: "timeout" }>((resolve) => {
        deadlineTimer = setTimeout(() => resolve({ kind: "timeout" }), 3_000)
      })
      const outcome = await Promise.race([settled, deadline])

      expect(disposalStarted).toBe(true)
      expect(outcome.kind).toBe("rejected")
      if (outcome.kind === "rejected") {
        expect(outcome.error).toBeInstanceOf(Error)
        expect((outcome.error as Error).message).toBe("bounded-paint-boom")
      }
      expect(disposeErrors).toHaveLength(1)
      expect(disposeErrors[0]).toBeInstanceOf(Error)
      expect((disposeErrors[0] as Error).message).toContain("did not settle within 1000ms")
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer)
      releaseDisposal()
      await settled
      setDisposeErrorSink(() => {})
    }
  })
})
