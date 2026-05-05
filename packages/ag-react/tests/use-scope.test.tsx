/**
 * @silvery/ag-react — Phase 1 scope hook tests.
 *
 * Covers:
 *
 *   - useScope() context walk
 *   - useAppScope() root lookup
 *   - useScopeEffect() post-commit contract
 *   - StrictMode-style mount → unmount → remount
 *   - reportDisposeError routing for fire-and-forget dispose failures
 *
 * Scope semantics themselves (LIFO, signal propagation, child cascade,
 * idempotent dispose, post-dispose ReferenceError) are covered in
 * packages/scope/tests/scope.test.ts — we only verify the hook plumbing
 * preserves them.
 */

import React, { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createScope,
  reportDisposeError,
  setDisposeErrorSink,
  type DisposeErrorContext,
  type Scope,
} from "@silvery/scope"
import { createRenderer } from "@silvery/test"
import { Text } from "../src/components/Text"
import { ScopeProvider } from "../src/ScopeProvider"
import { useScope } from "../src/hooks/useScope"
import { useAppScope } from "../src/hooks/useAppScope"
import { useScopeEffect } from "../src/hooks/useScopeEffect"

// ---------------------------------------------------------------------------
// Error-sink capture — every test gets a fresh sink; the default
// console.error sink would spam test output and hide real failures.
// ---------------------------------------------------------------------------

type Captured = { error: unknown; context: DisposeErrorContext }

function installCapturingSink(): { captured: Captured[]; restore: () => void } {
  const captured: Captured[] = []
  const defaultSink = (error: unknown, context: DisposeErrorContext) => {
    const name = context.scope?.name ?? "?"
    // eslint-disable-next-line no-console
    console.error(`[scope dispose error] phase=${context.phase} scope=${name}`, error)
  }
  setDisposeErrorSink((error, context) => captured.push({ error, context }))
  return {
    captured,
    restore: () => setDisposeErrorSink(defaultSink),
  }
}

// ---------------------------------------------------------------------------
// useScope — context walk
// ---------------------------------------------------------------------------

describe("useScope", () => {
  it("returns the nearest enclosing ScopeContext value", async () => {
    const root = createScope("root")
    const inner = root.child("inner")
    let seen: Scope | undefined

    function Probe(): React.ReactElement {
      seen = useScope()
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ScopeProvider scope={root}>
        <ScopeProvider scope={inner}>
          <Probe />
        </ScopeProvider>
      </ScopeProvider>,
    )

    expect(seen).toBe(inner)
    await root[Symbol.asyncDispose]()
  })

  it("falls back to useAppScope when no ScopeProvider is above", async () => {
    const app = createScope("app")
    let seen: Scope | undefined

    function Probe(): React.ReactElement {
      seen = useScope()
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ScopeProvider appScope={app}>
        <Probe />
      </ScopeProvider>,
    )

    expect(seen).toBe(app)
    await app[Symbol.asyncDispose]()
  })

  it("throws when neither provider is present", () => {
    function Probe(): React.ReactElement {
      useScope()
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    expect(() => render(<Probe />)).toThrow(/useScope\(\) called without/)
  })
})

// ---------------------------------------------------------------------------
// useAppScope — separate from useScope, never shadowed by nesting
// ---------------------------------------------------------------------------

describe("useAppScope", () => {
  it("returns the root app scope regardless of nested <ScopeProvider>", async () => {
    const app = createScope("app")
    const nested = app.child("nested")
    let seenApp: Scope | undefined
    let seenCurrent: Scope | undefined

    function Probe(): React.ReactElement {
      seenApp = useAppScope()
      seenCurrent = useScope()
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ScopeProvider appScope={app} scope={app}>
        <ScopeProvider scope={nested}>
          <Probe />
        </ScopeProvider>
      </ScopeProvider>,
    )

    expect(seenApp).toBe(app)
    expect(seenCurrent).toBe(nested)
    await app[Symbol.asyncDispose]()
  })

  it("throws when no app scope is provided", () => {
    function Probe(): React.ReactElement {
      useAppScope()
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    expect(() => render(<Probe />)).toThrow(/useAppScope\(\) called without/)
  })
})

// ---------------------------------------------------------------------------
// useScopeEffect — post-commit contract, disposal on unmount/rerun
// ---------------------------------------------------------------------------

describe("useScopeEffect", () => {
  let sink: ReturnType<typeof installCapturingSink>
  beforeEach(() => {
    sink = installCapturingSink()
  })
  afterEach(() => {
    sink.restore()
  })

  it("(a) setup never runs during render — only after commit", async () => {
    const root = createScope("root")
    const events: string[] = []

    function Probe(): React.ReactElement {
      events.push(`render`)
      useScopeEffect(() => {
        events.push("setup")
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe />
      </ScopeProvider>,
    )

    // First render must complete before setup fires.
    expect(events[0]).toBe("render")
    // After commit, setup has run exactly once.
    expect(events.filter((e) => e === "setup")).toHaveLength(1)
    // And setup ran AFTER render completed (index of setup > index of first render).
    const firstRender = events.indexOf("render")
    const firstSetup = events.indexOf("setup")
    expect(firstSetup).toBeGreaterThan(firstRender)

    await root[Symbol.asyncDispose]()
  })

  it("creates a child of the enclosing scope and disposes it on unmount", async () => {
    const root = createScope("root")
    let child: Scope | undefined

    function Probe(): React.ReactElement {
      useScopeEffect((scope) => {
        child = scope
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe />
      </ScopeProvider>,
    )

    expect(child).toBeDefined()
    expect(child!.disposed).toBe(false)
    // Child's signal should be live, and linked to root.
    expect(child!.signal.aborted).toBe(false)

    app.unmount()
    // React's effect cleanup starts the async dispose synchronously; the
    // abort happens inside the dispose flow.
    await Promise.resolve()
    await Promise.resolve()

    expect(child!.disposed).toBe(true)
    // Post-dispose `use` / `defer` / `child` throw (inherited from AsyncDisposableStack).
    expect(() => child!.defer(() => {})).toThrow(ReferenceError)

    await root[Symbol.asyncDispose]()
  })

  it("disposes the child scope when a dep changes, then re-runs setup with a fresh one", async () => {
    const root = createScope("root")
    const scopes: Scope[] = []

    function Probe({ dep }: { dep: number }): React.ReactElement {
      useScopeEffect(
        (scope) => {
          scopes.push(scope)
        },
        [dep],
      )
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe dep={1} />
      </ScopeProvider>,
    )

    expect(scopes).toHaveLength(1)
    const first = scopes[0]!
    expect(first.disposed).toBe(false)

    app.rerender(
      <ScopeProvider appScope={root} scope={root}>
        <Probe dep={2} />
      </ScopeProvider>,
    )

    await Promise.resolve()
    await Promise.resolve()

    expect(scopes).toHaveLength(2)
    const second = scopes[1]!
    expect(first).not.toBe(second)
    expect(first.disposed).toBe(true)
    expect(second.disposed).toBe(false)

    await root[Symbol.asyncDispose]()
  })

  it("runs user cleanup before disposing the child scope", async () => {
    const root = createScope("root")
    const events: string[] = []

    function Probe(): React.ReactElement {
      useScopeEffect((scope) => {
        scope.defer(() => {
          events.push("scope-defer")
        })
        return () => {
          events.push("user-cleanup")
        }
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe />
      </ScopeProvider>,
    )

    app.unmount()
    await Promise.resolve()
    await Promise.resolve()

    expect(events).toEqual(["user-cleanup", "scope-defer"])

    await root[Symbol.asyncDispose]()
  })

  it("(d) early child dispose detaches from parent (no later double-dispose on parent teardown)", async () => {
    const root = createScope("root")
    let child: Scope | undefined
    const deferCalls: string[] = []

    function Probe(): React.ReactElement {
      useScopeEffect((scope) => {
        child = scope
        scope.defer(() => {
          deferCalls.push("child-defer")
        })
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe />
      </ScopeProvider>,
    )

    // Dispose the child early, outside React's effect-cleanup path.
    await child![Symbol.asyncDispose]()
    expect(deferCalls).toEqual(["child-defer"])

    // Parent teardown must NOT invoke the child's defer a second time.
    await root[Symbol.asyncDispose]()
    expect(deferCalls).toEqual(["child-defer"])
  })

  it("(e) routes async dispose failures through reportDisposeError with phase=react-unmount", async () => {
    const root = createScope("root")

    function Probe(): React.ReactElement {
      useScopeEffect((scope) => {
        scope.defer(() => {
          throw new Error("boom")
        })
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe />
      </ScopeProvider>,
    )

    app.unmount()
    // Wait for the async dispose + .catch() to resolve.
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(sink.captured.length).toBeGreaterThanOrEqual(1)
    const [first] = sink.captured
    expect(first!.context.phase).toBe("react-unmount")
    expect(first!.context.scope).toBeDefined()
    expect((first!.error as Error).message).toBe("boom")

    await root[Symbol.asyncDispose]()
  })

  it("routes synchronous user-cleanup errors through reportDisposeError too", async () => {
    const root = createScope("root")

    function Probe(): React.ReactElement {
      useScopeEffect(() => {
        return () => {
          throw new Error("cleanup-boom")
        }
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const app = render(
      <ScopeProvider appScope={root} scope={root}>
        <Probe />
      </ScopeProvider>,
    )

    app.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()

    // Look for the cleanup-boom specifically — scope dispose itself succeeds.
    const cleanupErrors = sink.captured.filter((c) => (c.error as Error).message === "cleanup-boom")
    expect(cleanupErrors.length).toBe(1)
    expect(cleanupErrors[0]!.context.phase).toBe("react-unmount")

    await root[Symbol.asyncDispose]()
  })

  it("(b) remount cycle: first scope disposed before second mount's setup runs", async () => {
    // StrictMode's dev-mode double-invoke contract is "mount → cleanup →
    // remount", and the invariant we need is: the second mount's setup
    // receives a *fresh* scope, and the first scope is fully disposed by
    // the time the second setup observes its own scope.
    //
    // silvery's reconciler builds its fiber root with `isStrictMode:
    // false` (see packages/ag-react/src/reconciler/index.ts), so
    // `<StrictMode>` at React level does not trigger the double-invoke
    // here. We instead simulate the same lifecycle via unmount → remount,
    // which exercises the same useScopeEffect cleanup/setup path that
    // StrictMode would hit.
    const root = createScope("root")
    const events: Array<{ kind: "setup" | "cleanup"; scope: Scope }> = []

    function Probe(): React.ReactElement {
      useScopeEffect((scope) => {
        events.push({ kind: "setup", scope })
        return () => {
          events.push({ kind: "cleanup", scope })
        }
      }, [])
      return <Text>probe</Text>
    }

    const render = createRenderer({ cols: 20, rows: 2 })
    const first = render(
      <StrictMode>
        <ScopeProvider appScope={root} scope={root}>
          <Probe />
        </ScopeProvider>
      </StrictMode>,
    )

    // Mount → first setup fires.
    expect(events.filter((e) => e.kind === "setup")).toHaveLength(1)
    const firstScope = events[0]!.scope
    expect(firstScope.disposed).toBe(false)

    // Unmount → cleanup fires; first scope should be disposed by the time
    // we yield control.
    first.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()

    expect(events.filter((e) => e.kind === "cleanup")).toHaveLength(1)
    expect(events[1]!.scope).toBe(firstScope)
    expect(firstScope.disposed).toBe(true)

    // Remount under the same root scope → fresh setup, fresh child.
    const second = render(
      <StrictMode>
        <ScopeProvider appScope={root} scope={root}>
          <Probe />
        </ScopeProvider>
      </StrictMode>,
    )

    const setups = events.filter((e) => e.kind === "setup")
    expect(setups).toHaveLength(2)
    const secondScope = setups[1]!.scope
    expect(secondScope).not.toBe(firstScope)
    expect(secondScope.disposed).toBe(false)
    // Second scope has a fresh (non-aborted) signal.
    expect(secondScope.signal.aborted).toBe(false)

    second.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()

    await root[Symbol.asyncDispose]()
  })
})

// ---------------------------------------------------------------------------
// Direct-sink smoke test — guards against regression in the @silvery/scope
// wiring (we don't mock the sink, we actually install one and read what
// reportDisposeError does).
// ---------------------------------------------------------------------------

describe("reportDisposeError wiring", () => {
  it("installed sink receives (error, context) on reportDisposeError()", () => {
    const calls: Array<{ err: unknown; ctx: DisposeErrorContext }> = []
    const defaultSink = vi.fn()
    setDisposeErrorSink((err, ctx) => calls.push({ err, ctx }))
    try {
      const s = createScope("x")
      reportDisposeError(new Error("hello"), { phase: "manual", scope: s })
      expect(calls).toHaveLength(1)
      expect((calls[0]!.err as Error).message).toBe("hello")
      expect(calls[0]!.ctx.phase).toBe("manual")
      expect(calls[0]!.ctx.scope).toBe(s)
    } finally {
      setDisposeErrorSink(defaultSink as never)
    }
  })
})
