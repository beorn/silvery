/**
 * @silvery/scope/trace — opt-in leak detector for scopes and disposables.
 *
 * Gated by `SILVERY_SCOPE_TRACE=1`. When enabled, every `createScope()`
 * and `disposable()` call is recorded with its creation stack; dispose
 * unregisters; at process exit any remaining entries are logged.
 *
 * Zero overhead when disabled — the public functions are no-ops behind
 * an early-return guard. The trace registry isn't even allocated.
 *
 * Why: silvery's `Scope` (Phase 0/1/2 of `km-silvery.lifecycle-scope`)
 * makes resource ownership explicit, but adoption is opt-in. This is the
 * runtime backstop for what the ESLint `no-raw-lifecycle` rule can't see
 * (dynamic call sites, third-party paths). Together they make
 * convention-driven leaks structurally impossible.
 *
 * Usage in tests / CI:
 * ```bash
 * SILVERY_SCOPE_TRACE=1 bun run test
 * ```
 *
 * The detector logs to stderr at process exit (or `getTraceSnapshot()`
 * is callable any time for in-test assertions). Production builds — no
 * env var set — skip every code path.
 *
 * @packageDocumentation
 */

const TRACE_ENV = "SILVERY_SCOPE_TRACE"

function envEnabled(): boolean {
  try {
    return !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.[TRACE_ENV]
  } catch {
    return false
  }
}

const traceEnabled = envEnabled()

export interface TraceEntry {
  /** "scope" for Scope instances, "disposable" for disposable()-wrapped values. */
  readonly kind: "scope" | "disposable"
  /** Optional human label (Scope.name, or a tag passed by the caller). */
  readonly name?: string
  /** Creation site — stack trace captured at creation time. */
  readonly createdAt: string
}

// Allocated only when tracing is enabled. WeakMap so disposed handles
// don't pin themselves once the GC reclaims them — but we still untrack
// on explicit dispose to surface real leaks (held references that never
// got disposed).
const live: Map<object, TraceEntry> | null = traceEnabled ? new Map() : null

/** Returns true if `SILVERY_SCOPE_TRACE` is set. Useful for skipping
 *  expensive trace-only diagnostics. */
export function isTraceEnabled(): boolean {
  return traceEnabled
}

/** Internal — register a handle on creation. No-op when tracing is off. */
export function _trackCreate(handle: object, kind: "scope" | "disposable", name?: string): void {
  if (!live) return
  // `new Error().stack` includes this function as the top frame; that's
  // fine for skim-reading. Slice off the first two frames if you want
  // less noise — kept simple for now.
  const stack = new Error("(creation stack)").stack ?? ""
  live.set(handle, { kind, name, createdAt: stack })
}

/** Internal — unregister a handle on dispose. No-op when tracing is off. */
export function _trackDispose(handle: object): void {
  if (!live) return
  live.delete(handle)
}

/** Snapshot of currently-undisposed tracked handles. Empty when tracing
 *  is off. Useful for in-test leak assertions:
 *  ```ts
 *  await app.dispose()
 *  expect(getTraceSnapshot()).toHaveLength(0)
 *  ```
 */
export function getTraceSnapshot(): readonly TraceEntry[] {
  if (!live) return []
  return [...live.values()]
}

/** Force the at-exit report to fire now (for tests / manual diagnostics).
 *  Always logs the count, even if zero. No-op when tracing is off. */
export function reportTraceLeaks(): number {
  if (!live) return 0
  const count = live.size
  if (count === 0) {
    console.error("[silvery:scope:trace] no undisposed handles")
    return 0
  }
  console.error(`[silvery:scope:trace] ${count} undisposed handle(s):`)
  for (const entry of live.values()) {
    const label = entry.kind + (entry.name ? `(${entry.name})` : "")
    console.error(`  - ${label}`)
    console.error(entry.createdAt)
  }
  return count
}

// At-exit hook — fire-and-log. Only when tracing is enabled.
// Note: `process.on("exit", …)` is the one signal handler that escapes
// `term.signals` — at exit time the term-owner is already disposed, so
// we go direct. This file is in `@silvery/scope` (allowlisted by
// check-no-raw-lifecycle.sh).
if (traceEnabled) {
  const proc = (globalThis as { process?: { on?: (e: string, fn: () => void) => void } }).process
  if (proc?.on) {
    proc.on("exit", () => {
      reportTraceLeaks()
    })
  }
}
