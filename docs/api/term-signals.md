# term.signals

Single `SignalScope` per Term. Mediates every `process.on(signal, …)` registration and runs handlers in **priority + dependency order** on signal delivery or on dispose. Each handler is isolated in `try/catch` so a single failing handler can't block the rest.

`term.signals` replaces ad-hoc `process.on("SIGINT", …)` / `process.on("exit", …)` registrations scattered across an app. With dozens of handlers and no documented order, an earlier handler that crashes or the process exiting early can skip later cleanup. The owner gives you one place to add a handler with explicit ordering — and one teardown path that runs everything in the right order.

## Shape

```ts
type SignalName =
  | NodeJS.Signals
  | "exit"
  | "beforeExit"
  | "uncaughtException"
  | "unhandledRejection"

interface SignalOnOptions {
  priority?: number // lower runs first; default 0
  name?: string // required if you want before/after to reference this
  before?: string[] // handler names that must run AFTER this one
  after?: string[] // handler names that must run BEFORE this one
  onDispose?: boolean // also run on dispose() (default: true)
  onSignal?: boolean // run when the signal is delivered (default: true)
}

interface Signals extends Disposable {
  on(signal: SignalName, handler: () => void | Promise<void>, opts?: SignalOnOptions): () => void
  dispose(): void
  readonly isDisposed: boolean
  readonly size: number
}
```

## Access

```ts
using term = createTerm()

const unregister = term.signals.on("SIGINT", async () => {
  await flushPendingWrites()
})
```

`term.signals` is always present. Construction is free — no process listeners are installed until the first `on()` call. Each unique signal name installs exactly one shared `process.on(signal, …)` listener that fans out to the registered handlers in order.

## Ordering

Two complementary mechanisms:

### Priority (numeric sort)

Lower runs first. Default `0`. Rule of thumb:

| Priority  | Use for                                            |
| --------- | -------------------------------------------------- |
| `0`–`9`   | App-level cleanup (close DB, cancel pending work)  |
| `10`–`19` | Runtime cleanup (stop schedulers, drain queues)    |
| `20`–`29` | Terminal cleanup (restore modes, leave alt screen) |
| `30+`     | Emergency / last-ditch                             |

```ts
term.signals.on("SIGINT", () => closeDb(), { priority: 5, name: "close-db" })
term.signals.on("SIGINT", () => stopScheduler(), { priority: 10, name: "stop-sched" })
term.signals.on("SIGINT", () => term.modes.dispose(), { priority: 20, name: "modes-off" })
```

On `SIGINT`, handlers run in the order `close-db → stop-sched → modes-off`.

### `before` / `after` (explicit dependencies)

Reference handler `name`s. Take precedence over `priority`.

```ts
term.signals.on("SIGTERM", saveState, { name: "save-state" })
term.signals.on("SIGTERM", flushLogs, { name: "flush-logs", after: ["save-state"] })
term.signals.on("SIGTERM", closeServer, { name: "close-server", before: ["save-state"] })
```

Resolves to `close-server → save-state → flush-logs`. Cycles fall back to priority order — the owner prefers a best-effort teardown over throwing during a crash.

## Handler isolation

Every handler runs inside its own `try/catch`. A throw stops only that handler — the next one still runs. Pass an `onError` hook at construction to observe failures in tests.

```ts
import { createSignals } from "@silvery/ag-term/runtime"

const onError = vi.fn()
using signals = createSignals({ onError })

signals.on(
  "SIGINT",
  () => {
    throw new Error("boom")
  },
  { name: "broken" },
)
signals.on("SIGINT", () => recordOk(), { name: "ok" })

process.emit("SIGINT")
// onError called once with { name: "broken", signal: "SIGINT" }
// recordOk also ran
```

## Async handlers

Sync `dispose()` runs handlers synchronously and awaits any returned Promise **best-effort** via a microtask. The owner cannot block dispose on a slow Promise — on signal delivery, the process may exit before the await resolves.

```ts
term.signals.on("SIGINT", async () => {
  await Promise.race([flushDb(), wait(2000)]) // bound your own latency
})
```

For real cleanup that must complete, install your own `process.exit` deferral pattern (Node ≥ 20: `process.exitCode = 1; await ...; process.exit()`).

## `onDispose` / `onSignal`

Each registration can opt out of either path:

```ts
// Only on real signal delivery, not on graceful term.dispose()
term.signals.on("SIGTERM", oomLogger, { onDispose: false })

// Only on dispose, never as a process signal handler
term.signals.on("exit", flushTelemetry, { onSignal: false })
```

By default both are `true` — dispose is the primary teardown path and signals also fire it.

## `dispose()`

Synchronous. Runs every registration with `onDispose: true` in topological + priority order, then removes every shared `process.on(…)` listener. Idempotent — calling twice is a no-op.

```ts
using term = createTerm()
term.signals.on("SIGINT", flush)
// `using` triggers term.signals.dispose() at scope exit:
// - flush runs once
// - process.off("SIGINT", …) is called
```

## Not in scope

**Emergency last-ditch crash handlers** stay outside `term.signals`. They register on `uncaughtException` and must run even if the Term (and its Signals) has already been disposed — typically only to attempt a synchronous `stdin.setRawMode(false)` so the user's terminal isn't left wedged. The owner is for the structured cleanup path; the emergency handler is the safety net for cases where the structured path can't run.

## Composing with `Scope`

The return value of `term.signals.on(...)` is a `Disposable & AsyncDisposable`, which means it composes directly with the [scope tree](/guide/scope):

```ts
useScopeEffect((scope) => {
  scope.use(term.signals.on("SIGINT", () => flush()))
}, [])
```

When the component unmounts (or the scope otherwise disposes), the SIGINT handler is removed without firing. The same shape works at the app root via `withScope()`, which auto-wires SIGINT/SIGTERM to root-scope dispose when composed after `withTerminal`.

## See also

- [Scope — structured concurrency for resources](/guide/scope) — how `term.signals.on(...)` composes with `useScopeEffect` and `withScope()`
- [term.modes](/api/term-modes) — most cleanup handlers ultimately tear down a mode (alt screen, raw mode)
- [Term — the I/O umbrella](/guide/term)
