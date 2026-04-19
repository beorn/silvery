/**
 * runThemed — one-call scheme detection + ThemeProvider + run.
 *
 * The "just render this React TUI with a detected theme" shortcut. Composes
 * `detectScheme` (OSC probe + fingerprint + fallback) with `ThemeProvider`
 * (React context) and `run` (silvery-loop runtime). Apps that need custom
 * composition (store, pipe, withFocus) keep using `createApp + pipe`.
 *
 * Delegates the wrap step to `wrapWithThemedProvider` — the shared internal
 * used by any themed boot helper that wants detection + ThemeProvider without
 * coupling to the `run()` call shape.
 *
 * @example
 * ```tsx
 * import { runThemed } from "silvery/runtime"
 * import { builtinPalettes } from "@silvery/theme/schemes"
 *
 * const handle = await runThemed(<App />, {
 *   catalog: Object.values(builtinPalettes),
 * })
 * await handle.waitUntilExit()
 * ```
 *
 * Pass `tokens` to override specific theme values:
 *
 * ```tsx
 * await runThemed(<App />, {
 *   tokens: { brand: "#5B8DEF", "priority-p0": "#FF5555" },
 * })
 * ```
 */

import type { ReactElement } from "react"
import type { ColorScheme } from "@silvery/ansi"
import { run, type RunHandle, type RunOptions } from "./run"
import { wrapWithThemedProvider, type ThemedProviderOptions } from "./wrap-with-themed-provider"

export interface RunThemedOptions extends ThemedProviderOptions {
  /** Forwarded to `run()` — terminal + rendering options. */
  run?: RunOptions
}

/**
 * Detect the terminal's color scheme, wrap the element in a ThemeProvider,
 * and run the silvery-loop runtime. Returns the standard `RunHandle`.
 *
 * Detection cascade (full — see `detectScheme`):
 *   1. `opts.override` — explicit ColorScheme
 *   2. `SILVERY_COLOR` env var
 *   3. OSC probe (OSC 10/11/4/12/17/19)
 *   4. Fingerprint match against `opts.catalog`
 *   5. Fallback to defaultDarkScheme / defaultLightScheme
 *
 * @param element - Your root React element (the app)
 * @param opts - Detection + token overrides + run options
 * @returns RunHandle — same shape as `run()`
 */
export async function runThemed(
  element: ReactElement,
  opts: RunThemedOptions = {},
): Promise<RunHandle> {
  const { element: wrapped } = await wrapWithThemedProvider(element, opts)
  return run(wrapped, opts.run)
}

/** Re-export types so consumers of `runThemed` have everything they need. */
export type { ColorScheme }
