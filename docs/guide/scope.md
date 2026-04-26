# Lifecycle Scopes

_One primitive that owns lifetime for every disposable in your app_

A silvery app acquires resources: child processes, file watchers, signal handlers, timers, network sockets, terminal-protocol subscriptions. Every one of them needs to be released — when its component unmounts, when the user hits Ctrl+C, when the app exits, or when an `AbortSignal` fires upstream.

Without a single primitive, every component invents its own teardown: `useEffect` returns a cleanup, `process.on("SIGINT", …)` is wired by hand, an `AbortController` is plumbed three layers down. Each path is correct in isolation; together they leak.

`Scope` is silvery's answer. It's a tree of resources tied to lifetimes — a thin `AsyncDisposableStack` subclass with an `AbortSignal` and a child cascade. Mount a component, get a scope. Register a resource on the scope. The scope disposes when the component unmounts, when its signal aborts, or when the app exits — whichever comes first.

This guide is the migration path. If you have `useDispose`, `process.on("SIGINT", …)`, hand-rolled `AbortController`s, or `setTimeout` without cleanup, this is how to convert.

## What is `Scope`?

`Scope` extends `AsyncDisposableStack` from TC39's [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) proposal. It adds two things on top:

1. An `AbortSignal` that aborts on disposal — and links to a parent's signal so child scopes cascade.
2. A `child(name?)` method that creates child scopes which the parent disposes before its own user disposers.

Everything else — LIFO ordering, `await using`, `SuppressedError` aggregation on multi-throw, idempotent dispose, post-dispose `ReferenceError` — comes from `AsyncDisposableStack` directly.

```ts
import { createScope, disposable } from "@silvery/scope"

await using scope = createScope("app")

// Register a child process. `disposable` wraps it with a Symbol.dispose
// hook so scope.use() can claim ownership.
const proc = scope.use(disposable(child_process.spawn("claude"), (p) => p.kill("SIGTERM")))

// Register a cleanup callback directly.
scope.defer(() => console.log("scope disposing"))

// Pass scope.signal anywhere AbortSignal is expected.
await fetch(url, { signal: scope.signal })
```

When the `await using` block exits, `scope[Symbol.asyncDispose]()` runs:

1. children are disposed first, most-recent first;
2. then the user disposer stack runs LIFO (so `scope.defer` and `scope.use` registrations unwind in reverse);
3. the scope's `signal` aborts (via a final deferred call), so any in-flight `fetch`, listener, or `signal.addEventListener("abort", …)` consumer wakes up;
4. errors thrown during disposal are collected; one error rethrows directly, multiple errors aggregate into a `SuppressedError` chain.

A `Scope` is disposed in three situations:

- **Component unmount** — `useScopeEffect` owns a child scope; React's effect cleanup disposes it.
- **Signal cascade** — the parent scope's signal aborts, child signals inherit, in-flight work stops.
- **App exit** — the `withScope()` plugin disposes the root scope from the app's exit handler (and from SIGINT/SIGTERM when composed after `withTerminal`).

That's the whole model. Three patterns build everything else on top.

## The three patterns

There are three places resources get acquired in a silvery app. Each has a canonical pattern.

### 1. `using` / `await using` — block-scoped lifetimes

Inside a function or method, when a resource lives only for the duration of a block, use `using` (sync dispose) or `await using` (async dispose). This is the standard TC39 form — no silvery API required.

```ts
import { createScope } from "@silvery/scope"

async function importVault(path: string): Promise<Manifest> {
  await using scope = createScope("import")
  const watcher = scope.use(disposable(fs.watch(path), (w) => w.close()))
  // ... do work, watcher is alive
  return manifest
  // scope disposes here — watcher.close() runs automatically
}
```

Use this form when the resource's lifetime is the function body. There is no React component, no app exit hook, no signal handler — just a block scope. The compiler enforces disposal: forgetting `using` is a syntax error if the value is typed as `Disposable`.

### 2. `useScopeEffect` — component-scoped lifetimes

Inside a React component, when a resource lives as long as the component is mounted, use `useScopeEffect`. The hook lazily allocates a child scope after commit and disposes it on dep change or unmount.

```tsx
import { useScopeEffect } from "@silvery/ag-react"

function FileWatcher({ path }: { path: string }) {
  useScopeEffect(
    (scope) => {
      const watcher = scope.use(disposable(fs.watch(path), (w) => w.close()))

      watcher.on("change", () => console.log("file changed"))
    },
    [path],
  )

  return <Text>watching {path}</Text>
}
```

`useScopeEffect((scope) => …, deps)` runs the setup function after commit, passing in a fresh child scope. When `deps` change or the component unmounts, the scope is disposed (fire-and-forget via `reportDisposeError` for any rejection).

If you need a synchronous cleanup before the scope tears down — e.g. to act on still-live handles — return a function from setup:

```tsx
useScopeEffect((scope) => {
  const sub = scope.use(eventBus.subscribe(handle))
  return () => {
    sub.notifyShuttingDown() // sync hook before scope disposes the sub
  }
}, [])
```

The returned cleanup runs **before** the scope disposes — same ordering React's `useEffect` already uses.

### 3. `scope.use(disposable(value, cleanup))` — explicit registration

When you have a value that isn't already `Disposable` and you want to register it on a scope, wrap it with `disposable(value, cleanup)`. This is the gate: every resource shape — sync or async, native or custom — passes through `scope.use()` after being wrapped.

```ts
import { disposable } from "@silvery/scope"

// Sync cleanup
const proc = scope.use(disposable(child_process.spawn("claude"), (p) => p.kill("SIGTERM")))

// Async cleanup — TS picks the async overload from the return type
const conn = scope.use(disposable(await db.connect(), async (c) => await c.close()))
```

`disposable` attaches both `Symbol.dispose` and `Symbol.asyncDispose` so the value can be claimed by `using`, `await using`, or `scope.use(...)` interchangeably. The static type narrows based on the cleanup signature: a `(v) => void` cleanup yields `T & Disposable`; a `(v) => Promise<void>` cleanup yields `T & AsyncDisposable`.

If a value already implements `Symbol.dispose` / `Symbol.asyncDispose` — many silvery APIs do, including `term.signals.on(...)` — pass it directly:

```ts
// term.signals.on returns Disposable & AsyncDisposable already
const sub = scope.use(term.signals.on("SIGINT", onSigint))
```

## Migration recipes

This section is the porting table. Each row shows a pre-Scope pattern (Tarnished) and the Scope-native equivalent (Shiny).

### `useDispose` → `useScopeEffect`

::: danger 🩶 Tarnished

```tsx
import { useDispose } from "@silvery/ag-react"

function Search() {
  const controller = useMemo(() => new SearchController(), [])

  useDispose(() => controller.killAll())

  return <Input value={query} onChange={controller.search} />
}
```

`useDispose` runs a single cleanup at unmount. It can't compose — if you need three resources, you stack three `useDispose` calls and hope the order is right. There's no signal to plumb, no child cascade, no way to unwind a partially-constructed init.
:::

::: tip ✨ Shiny

```tsx
import { useScopeEffect } from "@silvery/ag-react"

function Search() {
  const [controller, setController] = useState<SearchController>()

  useScopeEffect((scope) => {
    const c = new SearchController()
    scope.defer(() => c.killAll())
    setController(c)
  }, [])

  return <Input value={query} onChange={controller?.search} />
}
```

`scope.defer(() => c.killAll())` registers cleanup at the same point you construct the resource. Add a second resource, register a second cleanup — they unwind in reverse order automatically. Errors during teardown aggregate via `SuppressedError`. The component's scope cascades into the controller's `AbortController` if you hand it `scope.signal`.
:::

### `process.on("SIGINT", …)` → `withScope()` plugin

::: danger 🩶 Tarnished

```ts
const cleanup = async () => {
  await db.close()
  await server.stop()
  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)
process.on("exit", cleanup)
```

Three handlers, three exit paths, no guarantee teardown completes before `process.exit(0)` cuts it off. Adding a fourth resource means editing three places. Tests can't intercept any of it.
:::

::: tip ✨ Shiny

```ts
import { pipe, createApp } from "@silvery/create"
import { withScope } from "@silvery/scope"
import { withTerminal } from "@silvery/create"

const app = pipe(
  createApp(store),
  withTerminal(process), // provides term.signals
  withScope("app"), // wires SIGINT/SIGTERM → root-scope dispose
  // ...
)

await app.run()
```

`withScope()` adds a root `Scope` to the app. Because it's composed after `withTerminal`, it auto-wires SIGINT and SIGTERM through `term.signals` so the signal flows into root-scope disposal. The root scope also disposes on the app's normal exit hook. Disposal failures from any of these paths flow through `reportDisposeError` with the originating phase (`"signal"`, `"app-exit"`).

Resources you registered anywhere in the tree — `useScopeEffect` children, terminal sub-owners, the `db` and `server` from above (registered on `app.scope`) — all dispose in the right order from a single trigger.
:::

The plugin also works without a terminal. Compose it without `withTerminal` and you get the root-scope-on-exit behavior; SIGINT/SIGTERM wiring is silently skipped because there's no `term.signals` to bind to. Web-host cancellation (`pagehide`, `beforeunload`) lives in the web runtime, not in `withScope`.

### `term.signals.on(...)` + manual `off()` → `using` or `scope.use`

::: danger 🩶 Tarnished

```ts
function startWatch() {
  const off = term.signals.on("SIGINT", onSigint)
  // ... later
  off()
}
```

The `off()` callback is correct in isolation but easy to forget on an early return, a thrown error, or a re-entrant call. Tests have to mock `term.signals` and assert `off()` was called.
:::

::: tip ✨ Shiny

```ts
// Block-scoped: using
function startWatch() {
  using sub = term.signals.on("SIGINT", onSigint)
  // ... sub disposed at function exit, even on throw
}

// Component-scoped: scope.use
function App() {
  useScopeEffect((scope) => {
    scope.use(term.signals.on("SIGINT", onSigint))
  }, [])
  // ...
}
```

`term.signals.on(...)` returns a `Disposable & AsyncDisposable`. Both forms claim it: `using` ties it to the function body; `scope.use` ties it to the component instance. There is no `off()` to call.
:::

### `setTimeout` / `setInterval` → `scope.defer(() => clearTimeout(id))`

::: danger 🩶 Tarnished

```tsx
function Toast({ message }: { message: string }) {
  useEffect(() => {
    const id = setTimeout(() => dismiss(), 3000)
    return () => clearTimeout(id)
  }, [])

  return <Text>{message}</Text>
}
```

This is correct, but the cleanup is its own callback — you have to remember to write it, and there's no signal to plumb if the timer should be cancelled by an upstream abort.
:::

::: tip ✨ Shiny

```tsx
function Toast({ message }: { message: string }) {
  useScopeEffect((scope) => {
    const id = setTimeout(() => dismiss(), 3000)
    scope.defer(() => clearTimeout(id))
  }, [])

  return <Text>{message}</Text>
}
```

The cleanup sits next to the construction. If the parent scope's signal aborts (Ctrl+C, app exit, ancestor unmount), the timer is cleared. For `setInterval`, the same shape — `scope.defer(() => clearInterval(id))`.

For modern code that takes an `AbortSignal`, just hand it `scope.signal`:

```ts
const reply = await fetch(url, { signal: scope.signal })
```

No `defer` needed — the fetch self-cancels when the scope disposes.
:::

### `child_process.spawn` + manual kill → `scope.use(disposable(spawn(...), …))`

::: danger 🩶 Tarnished

```ts
const proc = child_process.spawn("claude", args)
proc.on("exit", () => {
  /* ... */
})

process.on("SIGINT", () => proc.kill("SIGTERM"))
process.on("exit", () => proc.kill("SIGKILL"))
```

The kill is wired in two places, the parent-process abort path is hand-built, and there's no guarantee SIGTERM completes before SIGKILL fires.
:::

::: tip ✨ Shiny

```ts
const proc = scope.use(disposable(child_process.spawn("claude", args), (p) => p.kill("SIGTERM")))
```

The disposer fires when the scope disposes — from unmount, from signal, from app exit. If the scope is the root app scope (via `withScope`), SIGINT and SIGTERM both flow into this same disposer. If the scope is a `useScopeEffect` child, unmounting the component kills the process.

For escalation (SIGTERM → SIGKILL after a timeout), build it inside the disposer:

```ts
const proc = scope.use(
  disposable(child_process.spawn("claude", args), async (p) => {
    p.kill("SIGTERM")
    await new Promise((resolve) => setTimeout(resolve, 5000))
    if (!p.killed) p.kill("SIGKILL")
  }),
)
```

The async overload of `disposable` accepts a `Promise<void>` cleanup; `scope[Symbol.asyncDispose]()` awaits it.
:::

### `fs.watch` + manual close → `scope.use(disposable(watcher, w => w.close()))`

::: danger 🩶 Tarnished

```ts
const watcher = fs.watch(path)
watcher.on("change", onChange)

// Somewhere else, eventually:
watcher.close()
```

The `close()` call is far from the `watch()` call, hard to find on review, and easy to skip on an error path.
:::

::: tip ✨ Shiny

```ts
const watcher = scope.use(disposable(fs.watch(path), (w) => w.close()))
watcher.on("change", onChange)
```

Construction and cleanup are adjacent. The `disposable` wrapper is invisible at the use site — `watcher.on(...)` works exactly as before because `Object.assign` attached `Symbol.dispose` without changing the value's shape.
:::

### Raw `new AbortController()` → `scope.signal`

::: danger 🩶 Tarnished

```tsx
function Search({ query }: { query: string }) {
  useEffect(() => {
    const controller = new AbortController()

    fetch(`/search?q=${query}`, { signal: controller.signal }).then(handleResults)

    return () => controller.abort()
  }, [query])
}
```

You're hand-managing a controller that exists exclusively to abort on cleanup. Every component that fetches anything has the same five lines.
:::

::: tip ✨ Shiny

```tsx
function Search({ query }: { query: string }) {
  useScopeEffect(
    (scope) => {
      fetch(`/search?q=${query}`, { signal: scope.signal }).then(handleResults)
    },
    [query],
  )
}
```

`scope.signal` is the scope's own `AbortSignal`. It aborts when the scope disposes — which is exactly when you'd have called `controller.abort()`. The five lines collapse to two and you stop having to remember the cleanup.

`scope.signal` cascades: a component-level scope's signal aborts when the parent app scope's signal aborts (Ctrl+C, exit), so an in-flight `fetch` cancels even if the component is still mounted.
:::

## The `withScope()` plugin

`withScope(name?)` is the host-level wiring that puts a root `Scope` on the app object. Compose it via `pipe()`:

```ts
import { pipe, createApp, withTerminal, withReact } from "@silvery/create"
import { withScope } from "@silvery/scope"

const app = pipe(
  createApp(store),
  withTerminal(process),
  withReact(<App />),
  withScope("app"),
)
```

What it does:

1. **Creates a root scope** named `"app"` (or whatever you pass).
2. **Disposes on app exit** — registers an `app.defer(...)` callback that calls `scope[Symbol.asyncDispose]()`. Disposal errors flow through `reportDisposeError({ phase: "app-exit", scope })`.
3. **Wires SIGINT and SIGTERM** if the app already has a `term.signals` source (i.e. it's composed _after_ `withTerminal`). Both signals trigger root-scope dispose; failures flow through `reportDisposeError({ phase: "signal", scope })`.
4. **Adds `app.scope`** — the root scope is now available on the app object as `app.scope`. `<ScopeProvider>` (rendered automatically by the React-bridge runtime) makes it available to descendants via `useScope()` and `useAppScope()`.

Compose order matters. `withScope()` looks for `app.term?.signals` at compose time — if `withTerminal` hasn't run yet, signal wiring is silently skipped (the scope still disposes on normal exit). Put `withTerminal` before `withScope` if you want signal teardown.

Web-host cancellation (`pagehide` / `beforeunload`) lives in the web runtime package, not in `withScope`. `@silvery/scope` is platform-neutral — it knows about `AbortSignal` and `AsyncDisposableStack`, nothing else.

### Reading the scope from React

Inside React, three hooks read the scope from context:

- **`useScope()`** — the nearest enclosing scope. Walks the React fiber chain via `useContext(ScopeContext)`; falls back to the app-root scope if there's no nested provider; throws if neither is present.
- **`useAppScope()`** — always the root scope, regardless of nested providers. Use this only for whole-app shutdown paths (hot-swap a global, route a custom signal into the root).
- **`useScopeEffect((scope) => …, deps)`** — allocates a child of `useScope()`'s scope after commit, disposes on dep change or unmount.

```tsx
import { useScope, useAppScope, useScopeEffect } from "@silvery/ag-react"

function Component() {
  const scope = useScope() // nearest — child of app, or of an enclosing provider
  const app = useAppScope() // root — always app.scope from withScope()

  useScopeEffect((own) => {
    // `own` is a child of `scope`, owned by this effect.
    own.use(disposable(somethingExpensive(), (x) => x.dispose()))
  }, [])

  return <Text>...</Text>
}
```

### Nesting scopes manually

If you need to expose a different enclosing scope to a subtree — typically for tests or for a feature that owns a sub-lifetime — wrap with `<ScopeProvider>`:

```tsx
import { ScopeProvider } from "@silvery/ag-react"

function Feature() {
  const featureScope = useMemo(() => createScope("feature"), [])
  // ... arrange disposal via useScopeEffect or app teardown

  return (
    <ScopeProvider scope={featureScope}>
      <Subtree />
    </ScopeProvider>
  )
}
```

Inside `<Subtree />`, `useScope()` returns `featureScope`. `useAppScope()` is unchanged.

## Debugging leaks

`@silvery/scope` ships an opt-in leak detector behind the `SILVERY_SCOPE_TRACE` environment variable. It records every `createScope()` and `disposable()` call with its creation stack, removes entries on dispose, and prints a report at process exit listing anything that wasn't disposed.

Zero overhead when the env var isn't set — every trace function early-returns.

```bash
SILVERY_SCOPE_TRACE=1 bun run test
```

Sample output at exit when something leaked:

```
[silvery:scope:trace] 2 undisposed handle(s):
  - scope(feature)
Error: (creation stack)
    at _trackCreate (packages/scope/src/trace.ts:69:18)
    at new Scope (packages/scope/src/index.ts:42:5)
    at createScope (packages/scope/src/index.ts:124:10)
    at Feature (src/feature.tsx:18:24)
    ...
  - disposable
Error: (creation stack)
    at _trackCreate (packages/scope/src/trace.ts:69:18)
    at disposable (packages/scope/src/index.ts:151:3)
    at startWatcher (src/watcher.ts:34:9)
    ...
```

The stack trace in `createdAt` points to the construction site, so you can see which `createScope("feature")` call leaked without sprinkling logging by hand.

### In-test assertions

For tighter feedback than at-exit logging, call `getTraceSnapshot()` after the unit-under-test should have torn down:

```ts
import { getTraceSnapshot } from "@silvery/scope"

test("dispose cascades", async () => {
  const app = await createTestApp()
  await app.dispose()
  expect(getTraceSnapshot()).toHaveLength(0)
})
```

`getTraceSnapshot()` returns a readonly array of `TraceEntry` (`{ kind, name?, createdAt }`). Empty when tracing is off, so the assertion is a no-op without `SILVERY_SCOPE_TRACE=1` — write tests that pass either way and run them in trace mode in CI.

To force the at-exit report manually (useful for one-off diagnostics):

```ts
import { reportTraceLeaks } from "@silvery/scope"

reportTraceLeaks() // logs and returns the count
```

### Routing dispose errors

Disposal in fire-and-forget paths — React unmount, signal handlers, app-exit hooks — can't propagate errors to a caller. `@silvery/scope` routes them through a sink:

```ts
import { setDisposeErrorSink } from "@silvery/scope"

setDisposeErrorSink((error, ctx) => {
  // ctx.phase: "react-unmount" | "signal" | "app-exit" | "manual"
  // ctx.scope: the Scope being disposed (if known)
  logger.error("dispose failed", { phase: ctx.phase, scope: ctx.scope?.name, error })
})
```

The default sink prints to `console.error`. Override it in tests to fail fast on any disposal error:

```ts
setDisposeErrorSink((error) => {
  throw error
})
```

The sink is global. It's safe to call from anywhere; `reportDisposeError` swallows sink errors so a buggy sink can't take down the teardown path.

## Common pitfalls

### No scope ops during render

Calling `scope.use(...)`, `scope.defer(...)`, `scope.child(...)`, or `scope[Symbol.asyncDispose]()` from a component body is forbidden. React renders are pure — they can re-run, abort, and replay; doing scope work during render means a re-render registers the same resource twice, and an aborted render leaks the resource it half-acquired.

::: danger 🩶 Tarnished

```tsx
function App() {
  const scope = useScope()
  const proc = scope.use(disposable(spawn("claude"), (p) => p.kill())) // ← during render
  return <Text>pid {proc.pid}</Text>
}
```

Every render allocates a new `proc` and registers it on the scope. None of them ever dispose until the app exits.
:::

::: tip ✨ Shiny

```tsx
function App() {
  const [proc, setProc] = useState<ChildProcess>()

  useScopeEffect((scope) => {
    const p = scope.use(disposable(spawn("claude"), (p) => p.kill()))
    setProc(p)
  }, [])

  return <Text>pid {proc?.pid}</Text>
}
```

The acquisition runs after commit. The scope is owned by the effect, so re-running the effect (deps change, unmount) disposes the previous `proc` first.
:::

`useScope()` itself is fine during render — it's a pure context read. `scope.signal` is fine to read and pass to APIs (it's just a property access). What's forbidden is _acquiring_ into the scope during render.

### `Scope.move()` throws

`AsyncDisposableStack.move()` returns a fresh stack containing all the inherited disposers, leaving the original empty. On a plain stack that's a useful "transfer ownership" primitive. On `Scope` it would silently lose the `signal`, `name`, and child registry — the new stack is _not_ a `Scope`. Rather than corrupt invariants, `Scope.move()` throws.

```ts
scope.move() // TypeError: Scope.move() is not supported — create a new scope and re-register resources explicitly
```

If you need to relocate ownership, create a new scope and register resources on it explicitly. The use case is rare — you almost always want a child scope instead.

### Child cascade is automatic — don't dispose children manually

`Scope[Symbol.asyncDispose]()` disposes children before the user disposer stack. You don't need to track them or call dispose on them by hand — and doing so risks double-dispose, which is a no-op semantically but a hint that the ownership tree is unclear.

::: danger 🩶 Tarnished

```ts
const child = parent.child("worker")
parent.defer(async () => {
  await child[Symbol.asyncDispose]() // ← parent already disposes children first
  await someOtherCleanup()
})
```

Two disposes happen — the manual one and the cascade. The second is a no-op (idempotent), but the code reads as if there's something special about this child. There isn't.
:::

::: tip ✨ Shiny

```ts
const child = parent.child("worker")
parent.defer(async () => {
  await someOtherCleanup()
})
// `child` will be disposed first by the cascade, before `someOtherCleanup` runs.
```

If you need a specific ordering — e.g. flush a buffer to the child before the child closes — register the flush on the _child_, not the parent:

```ts
const child = parent.child("worker")
child.defer(async () => await flushBuffer())
// flushBuffer runs as part of child disposal, before parent's user disposers.
```

Disposing a child _early_ (before its parent disposes) is fine — the child detaches itself from the parent's child set on completion. That's the use case for nested `await using` inside a longer-lived parent scope.

### `SuppressedError` aggregates multi-throw

When multiple disposers throw during a single `[Symbol.asyncDispose]()` call, the errors aggregate via `SuppressedError` — a TC39 standard error type with `.error` (the most recent) and `.suppressed` (the previous, possibly itself a `SuppressedError`). One thrown error rethrows directly; many chain.

```ts
try {
  await scope[Symbol.asyncDispose]()
} catch (err) {
  if (err instanceof SuppressedError) {
    // err.error: the latest dispose error
    // err.suppressed: the previous error (or another SuppressedError)
    walkSuppressed(err)
  } else {
    // single error
    handle(err)
  }
}
```

For app-level paths (`react-unmount`, `signal`, `app-exit`), errors flow through `reportDisposeError` — your sink sees each `SuppressedError` whole. Walking the chain is the sink's job if you need per-error diagnostics.

## Putting it together

A complete pattern, end to end:

```tsx
import { pipe, createApp, withTerminal, withReact } from "@silvery/create"
import { withScope, disposable } from "@silvery/scope"
import { useScope, useScopeEffect } from "@silvery/ag-react"

// --- App composition ---

const app = pipe(
  createApp(store),
  withTerminal(process),
  withReact(<App />),
  withScope("app"), // root scope; SIGINT/SIGTERM/exit → root.dispose()
)

await app.run()

// --- Component: spawn a process, watch a file, time out a fetch ---

function Workspace({ path }: { path: string }) {
  const [data, setData] = useState<Data>()

  useScopeEffect(
    (scope) => {
      // 1. Spawn a worker; killed on dispose.
      const proc = scope.use(
        disposable(child_process.spawn("worker", [path]), (p) => p.kill("SIGTERM")),
      )

      // 2. Watch the file; closed on dispose.
      const watcher = scope.use(disposable(fs.watch(path), (w) => w.close()))
      watcher.on("change", () => proc.send({ type: "reload" }))

      // 3. Cancel the fetch if the scope aborts (Ctrl+C, unmount, signal).
      fetch(`/data?path=${path}`, { signal: scope.signal })
        .then((r) => r.json())
        .then(setData)
        .catch((e) => {
          if (e.name !== "AbortError") throw e
        })

      // 4. Clear the timeout via defer.
      const timeoutId = setTimeout(() => setData({ kind: "timeout" }), 30_000)
      scope.defer(() => clearTimeout(timeoutId))
    },
    [path],
  )

  return (
    <Text>
      workspace {path} — {data?.summary ?? "loading"}
    </Text>
  )
}
```

What happens at teardown:

- **User unmounts `Workspace`** — the scope disposes. Children (none here) first, then user disposers LIFO: `clearTimeout` runs, the `AbortController` behind `scope.signal` aborts (canceling the in-flight fetch), `watcher.close()` runs, `proc.kill("SIGTERM")` runs.
- **User hits Ctrl+C** — `term.signals` fires SIGINT. `withScope` disposes the root scope. The cascade flows down to every `useScopeEffect` child including this `Workspace`'s scope. Same teardown order as above. Errors flow through `reportDisposeError({ phase: "signal" })`.
- **Path prop changes** — the effect re-runs. Old scope disposes (cleanup of previous resources), new scope created with new `path`, fresh resources acquired.
- **Some disposer throws** — `SuppressedError` aggregates. Other disposers still run. The error surfaces via `reportDisposeError` with the originating phase.

One primitive. Three patterns. Every disposable in the app has a clear owner.

## See also

- `@silvery/scope` — `packages/scope/src/index.ts` (`Scope`, `createScope`, `disposable`, `withScope`, `reportDisposeError`, `setDisposeErrorSink`)
- `@silvery/scope/trace` — `packages/scope/src/trace.ts` (`getTraceSnapshot`, `reportTraceLeaks`, `isTraceEnabled`)
- `@silvery/ag-react` — `packages/ag-react/src/hooks/{useScope,useAppScope,useScopeEffect}.ts` and `packages/ag-react/src/ScopeProvider.tsx`
- [TC39 explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) — the underlying `using` / `await using` proposal
- [The Silvery Way](./the-silvery-way.md) — the broader principles `Scope` falls out of
- [Term I/O umbrella](./term.md) — `term.signals`, `term.input`, and the rest of the terminal sub-owners that `Scope` composes with
