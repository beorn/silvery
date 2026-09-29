/**
 * ESM-graph-coherent loader for the OPTIONAL @termless/* emulator backends used
 * by SILVERY_STRICT_TERMINAL (output-verify.ts) and cursor verification
 * (cursor-diagnostics.ts).
 *
 * ── Why this module exists ────────────────────────────────────────────────
 *
 * NOT `createRequire`: `createRequire(import.meta.url)("@termless/ghostty")`
 * re-introduces the CommonJS loader inside ESM. Under vitest's module runner the
 * loaded module ESCAPES the ESM graph and gets its OWN instance. @termless/ghostty
 * holds a module-level `sharedGhostty` WASM singleton (set by `initGhostty()`); a
 * second instance splits it, so the verifier's `createGhosttyBackend()` observes
 * `sharedGhostty = null` even after the ESM instance was initialized — it then
 * diverges from (or errors against) the ghostty terminal every other consumer
 * shares. That is the 2026-07-02 Ghostty-WASM incident: the contract-test culprit
 * was fixed in silvery 4641f71b; output-verify.ts + cursor-diagnostics.ts were the
 * remaining production-side createRequire instances. Routing every load through
 * this module puts the verifier on the SAME instance as createTermless /
 * createGhosttyBackend / the tests' own `import … from "@termless/ghostty"`.
 *
 * NOT a static `import`: @termless/* are OPTIONAL peers of the published silvery
 * umbrella. A static import evaluates them at module load for every consumer and
 * breaks installs that don't have the peers. `await import()` inside a preload
 * only resolves when strict verification is actually requested.
 *
 * ── The sync/async bridge ─────────────────────────────────────────────────
 *
 * The load is async (`await import()`); the consumers (the output phase, cursor
 * diagnostics) run in the SYNCHRONOUS render pipeline and cannot await a dynamic
 * import mid-frame. We bridge with an async PRELOAD into a module cache plus a
 * sync GET that throws LOUD on a cache miss (no silent fallback — a missing
 * backend must be diagnosable, not swallowed). Preload is awaited at the two
 * async boundaries that precede any strict frame:
 *   - `@silvery/test`'s top-level await (test path — the backends are already
 *     statically imported there, so the preload is a free re-resolve).
 *   - the live `run()` setup (the SILVERY_STRICT_TERMINAL / cursor debugging path).
 *
 * Bead: createrequire-ban (wave 3 — the incident siblings).
 */

import type { TermEmulatorBackend } from "./ansi/types"

interface BackendCache {
  core: typeof import("@termless/core") | null
  /** The io vocabulary (`Emulator`, `Event`, `micros`) — unterm A2's consumer surface. */
  io: typeof import("@termless/core/io") | null
  xterm: typeof import("@termless/xtermjs") | null
  ghostty: typeof import("@termless/ghostty") | null
}

// The cache lives on globalThis under a Symbol.for key, NOT in a module-level
// `let`. Under vitest's module runner this file can be instantiated more than
// once — @silvery/test imports it by package specifier
// (`@silvery/ag-term/strict-terminal-backends`) while output-verify.ts /
// cursor-diagnostics.ts import it by relative path (`../strict-terminal-backends`),
// and those two specifiers resolve to DISTINCT module instances. A module-level
// cache would then split: @silvery/test's top-level preload populates one
// instance, the synchronous verifier reads the other (empty) instance and
// fail-louds. `Symbol.for` is a cross-instance/cross-realm global registry, so
// every instance shares ONE cache object — the same singleton-coherence property
// this module exists to guarantee for @termless itself.
const CACHE_KEY = Symbol.for("@silvery/ag-term:strict-terminal-backends")

function backendCache(): BackendCache {
  const store = globalThis as typeof globalThis & { [CACHE_KEY]?: BackendCache }
  return (store[CACHE_KEY] ??= { core: null, io: null, xterm: null, ghostty: null })
}

export interface StrictTerminalPreloadOptions {
  /**
   * Also load the `@termless/ghostty` module (required before any
   * SILVERY_STRICT_TERMINAL=ghostty frame). Defaults to false so callers that
   * only need the xterm/core verifier don't pull the ghostty module.
   */
  ghostty?: boolean
  /**
   * Also `await initGhostty()` so the WASM singleton is ready for the
   * SYNCHRONOUS `createGhosttyBackend()` the verifier calls mid-frame. The
   * `@silvery/test` top-level preload passes `false` — the ghostty MODULE is
   * loaded (so the sync accessor resolves) but WASM init stays deferred to the
   * ghostty test's own `await initGhostty()` (or the live run() path), which
   * keeps non-ghostty test suites from paying the WASM load. Defaults to
   * whatever `ghostty` is.
   */
  initGhosttyWasm?: boolean
}

/**
 * Load the requested @termless backends into the module cache via the ESM
 * graph. Idempotent — safe to call from every async setup path. Awaiting this
 * is what makes the subsequent synchronous `getTermless*()` reads succeed.
 */
export async function preloadStrictTerminalBackends(
  opts: StrictTerminalPreloadOptions = {},
): Promise<void> {
  const wantGhostty = opts.ghostty ?? false
  const wantWasm = opts.initGhosttyWasm ?? wantGhostty
  const cache = backendCache()

  // core + xtermjs are always needed by both verifiers (the fresh-render
  // comparison terminal is xterm even in ghostty mode).
  cache.core ??= await import("@termless/core")
  cache.io ??= await import("@termless/core/io")
  cache.xterm ??= await import("@termless/xtermjs")

  if (wantGhostty) {
    cache.ghostty ??= await import("@termless/ghostty")
    if (wantWasm) await cache.ghostty.initGhostty()
  }
}

function missing(specifier: string, extra = ""): never {
  throw new Error(
    `[silvery] @termless backend "${specifier}" was consumed before it was preloaded. ` +
      `The SILVERY_STRICT terminal/cursor verifier runs in the synchronous output phase ` +
      `and cannot await a dynamic import mid-frame, so the backend must be loaded first via ` +
      `\`await preloadStrictTerminalBackends()\`. Tests get this for free through @silvery/test's ` +
      `top-level preload; a live \`run()\` under SILVERY_STRICT_TERMINAL/cursor awaits it during ` +
      `setup. This is loaded via the ESM graph (never the CommonJS require shim) so the verifier ` +
      `shares the single @termless module instance — the 2026-07-02 Ghostty-WASM singleton-split fix.${extra}`,
  )
}

/** Sync accessor for `@termless/core`. Throws loud if not preloaded. */
export function getTermlessCore(): typeof import("@termless/core") {
  return backendCache().core ?? missing("@termless/core")
}

/** Sync accessor for `@termless/core/io`. Throws loud if not preloaded. */
export function getTermlessIo(): typeof import("@termless/core/io") {
  return backendCache().io ?? missing("@termless/core/io")
}

/** Sync accessor for `@termless/xtermjs`. Throws loud if not preloaded. */
export function getTermlessXterm(): typeof import("@termless/xtermjs") {
  return backendCache().xterm ?? missing("@termless/xtermjs")
}

/** Sync accessor for `@termless/ghostty`. Throws loud if not preloaded. */
export function getTermlessGhostty(): typeof import("@termless/ghostty") {
  return (
    backendCache().ghostty ??
    missing(
      "@termless/ghostty",
      " Pass `{ ghostty: true }` to preloadStrictTerminalBackends() (SILVERY_STRICT_TERMINAL=ghostty).",
    )
  )
}

// ── The verifier's emulator (unterm A2) ──────────────────────────────────────
//
// The strict verifiers speak the io vocabulary: an `Emulator` eats `output`
// Events and shows the picture (`getText`, `getCell`, `cursor`). The legacy
// `TerminalBackend` is adapted at THIS one seam through termless's own
// `emulatorFromBackend` until backends implement `Emulator` directly (A4b);
// no other silvery file names `createTerminal` or a backend factory.

/** Which bundled backend drives a strict emulator. */
export type StrictEmulatorKind = "xterm" | "ghostty"

/**
 * A fresh, uninitialized bundled backend from the cache — the one place in
 * silvery that names a termless backend factory. The caller owns its
 * lifecycle: `createTerm(backend, dims)` inits it and destroys it on close,
 * `createStrictEmulator` does the same for the verifiers. Ghostty requires
 * the WASM preload first (`preloadStrictTerminalBackends({ ghostty: true,
 * initGhosttyWasm: true })` or the test's own `initGhostty()`).
 */
export function createTermlessBackend(kind: StrictEmulatorKind): TermEmulatorBackend {
  return kind === "xterm"
    ? getTermlessXterm().createXtermBackend()
    : getTermlessGhostty().createGhosttyBackend()
}

/**
 * A verifier-owned emulator: the io `Emulator` the verifiers feed and read,
 * plus the lifecycle the io contract deliberately leaves to whoever created
 * the backend.
 */
export interface StrictEmulator {
  /** The io Emulator — `getText()`, `getCell(row, col)`, `cursor`, `modes`, `size`. */
  readonly emulator: import("@termless/core/io").Emulator
  /**
   * Feed program output. An `output` Event carries bytes, so the text is
   * UTF-8 encoded here; the verifier has no timeline, so `at` is zero.
   */
  feed(text: string): void
  /** Release the backend (WASM instance, buffers). Idempotent. */
  close(): void
}

/**
 * Create a strict emulator over a freshly initialized bundled backend.
 * Synchronous by contract: the verifiers run in the render pipeline's output
 * phase and read the picture right after feeding, so an `Emulator` whose
 * `apply` returns a Promise is refused loudly rather than read stale.
 * Ghostty requires the WASM preload (`initGhosttyWasm`) — a PRELOAD
 * precondition, never a fire-and-forget init here (that was the null-WASM
 * race window).
 */
export function createStrictEmulator(
  kind: StrictEmulatorKind,
  size: { cols: number; rows: number },
): StrictEmulator {
  const core = getTermlessCore()
  const io = getTermlessIo()
  const backend = createTermlessBackend(kind)
  backend.init({ cols: size.cols, rows: size.rows })
  const emulator = core.emulatorFromBackend(
    backend as Parameters<typeof core.emulatorFromBackend>[0],
    { cols: size.cols, rows: size.rows },
  )
  const encoder = new TextEncoder()
  let closed = false
  return {
    emulator,
    feed(text: string): void {
      if (closed) {
        throw new Error(`[silvery] strict ${kind} emulator: feed() after close()`)
      }
      const pending = emulator.apply({
        at: io.micros(0),
        type: "output",
        data: encoder.encode(text),
      })
      if (pending !== undefined) {
        throw new Error(
          `[silvery] strict ${kind} emulator: Emulator.apply returned a Promise; the strict ` +
            `verifiers read the picture synchronously in the output phase and cannot await it.`,
        )
      }
    },
    close(): void {
      if (closed) return
      closed = true
      backend.destroy()
    },
  }
}
