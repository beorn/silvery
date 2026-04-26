# term.console

Single-owner `console.*` capture + replay for a Silvery session. Buffers stray `console.log/info/warn/error/debug` during alt-screen rendering so they don't corrupt the TUI, and replays them to the real streams on exit.

`term.console` replaces the standalone `patchConsole()` helper — same implementation, Term-owned lifecycle.

## Shape

```ts
import type { ReadSignal } from "@silvery/signals"

interface ConsoleEntry {
  method: "log" | "info" | "warn" | "error" | "debug"
  args: unknown[]
  stream: "stdout" | "stderr"
}

interface ConsoleStats {
  total: number
  errors: number
  warnings: number
}

interface Console extends Disposable {
  capture(options?: ConsoleCaptureOptions): void
  restore(): void
  readonly capturing: ReadSignal<boolean>
  readonly entries: ReadSignal<readonly ConsoleEntry[]>
  getStats(): ConsoleStats
  replay(stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream): void
}

interface ConsoleCaptureOptions {
  suppress?: boolean // default false — forward to original console after capture
  capture?: boolean // default true — buffer entries in memory (set false for count-only)
}
```

`capturing` and `entries` are read-only alien-signals. Call them to read; subscribe with `effect(() => …)` or React's `useSignal(sig)`. Only the owner writes — `capture()` / `restore()` drive `capturing`, and each captured call advances `entries` with a new frozen array reference.

```ts
import { effect } from "@silvery/signals"

effect(() => {
  if (!term.console) return
  if (term.console.capturing()) {
    // tap is live — entries() grows as logs arrive
  }
})

effect(() => {
  const latest = term.console?.entries()
  // re-runs on every new log line
})
```

## Access

```ts
using term = createTerm()

if (!term.console) {
  // headless / emulator-backed — no real console to own
  return
}
```

`term.console` is `undefined` on Terms that don't own the global console (headless test Terms, emulator-backed termless Terms). On Node-backed Terms it is constructed at Term creation — **inert**, no patching — and you opt in by calling `capture()`.

## Lifecycle

1. `term.console.capture({ suppress: true })` — patch `console.*`, buffer entries, suppress forwarding to the originals (so alt-screen renders stay clean).
2. Render loop. Any `console.log("…")` anywhere in the app gets recorded.
3. On exit, `term.console.replay(process.stdout, process.stderr)` emits the buffered entries to the real streams.
4. `dispose()` (via `using`) restores the originals.

`capture()` is idempotent. To change options mid-session, call `restore()` then `capture(newOpts)`.

## `capture(options?)`

Starts patching. The patch records each call into the entry buffer (when `capture: true`, the default), updates `stats`, and — unless `suppress: true` — forwards to the original `console.*` method.

```ts
term.console.capture({ suppress: true }) // buffer + suppress (TUI use)
term.console.capture({ suppress: false }) // buffer + forward (debug)
term.console.capture({ capture: false }) // count-only, no memory growth
```

`suppress: true` is the canonical TUI use — no entries escape to the alt screen, but you still have the buffer for post-exit replay. `capture: false` is for long-running sessions where you only care about warning / error badges; `getStats()` still reports counts but `entries()` returns an empty frozen array.

## `restore()`

Undoes the patch, restoring the original `console.*` methods. Use `dispose()` for the terminal variant.

## `entries`

Reactive list of captured entries. Each new log line advances the signal with a fresh frozen array reference, so alien-signals / React identity checks fire and dependents re-run.

```ts
import { effect } from "@silvery/signals"

effect(() => {
  const all = term.console!.entries()
  renderLogFeed(all)
})
```

Or in React with `useSignal`:

```tsx
import { useSignal } from "@silvery/ag-react"

function ConsoleFeed() {
  const entries = useSignal(term.console!.entries)
  return entries.map((e, i) => <LogLine key={i} entry={e} />)
}
```

Silvery's `<Console>` component is a thin wrapper on top of this.

## `getStats()`

```ts
const { total, errors, warnings } = term.console.getStats()
```

Totals are tracked even when `capture: false` was passed — handy for showing a badge like "3 warnings" without holding onto every entry.

## `replay(stdout, stderr)`

Re-emits captured entries to explicit streams. Entries whose `stream` is `"stderr"` go to the stderr stream; the rest go to stdout. Each entry is formatted as

```
args.join(" ") + "\n"
```

…with `Error` values stringified as `${name}: ${message}` and objects JSON-encoded (with a `String(value)` fallback for unstringifiable values).

Does not clear entries. Typical usage at TUI exit:

```ts
term.console?.replay(process.stdout, process.stderr)
```

Call this **after** `term.modes.altScreen(false)` so the replay lands in the primary screen the user actually reads.

## Relation to `term.output`

`term.output` patches `process.stdout.write` / `process.stderr.write` / `console.*` as a **sink** — writes are dropped or funnelled to `DEBUG_LOG`.

`term.console` patches `console.*` as a **tap** — calls are recorded for later replay (and optionally forwarded).

**Call order: Output first, then Console.** Last patch wins, so whichever owner wraps `console.log` last is the one `console.log("x")` hits first. With Output first and Console second, the user's call reaches Console's tap, Console records the entry, and (unless `suppress: true`) forwards to its captured "original" — which is Output's redirect wrapper. Tap fires for every call.

1. `term.output.activate()` — Output installs its redirect-to-DEBUG_LOG wrapper on `console.log`.
2. `term.console.capture({ suppress: true })` — Console captures Output's wrapper as its "original" and installs its tap wrapper on every console method.

Restore in reverse: `term.console.restore()` first, then `term.output.deactivate()`.

## See also

- [term.output](/api/term-output) — the foreign-write sink
- `<Console>` component — UI wrapper around `entries`
- [Term — the I/O umbrella](/guide/term)
