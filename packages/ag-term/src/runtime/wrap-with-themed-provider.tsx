/**
 * wrapWithThemedProvider — shared internal for theme boot helpers.
 *
 * Detects the terminal's color scheme (or accepts an explicit theme),
 * builds `ActiveScheme` metadata, and wraps a React element in
 * `<ThemeProvider theme={theme} scheme={scheme}>`. Returns the wrapped
 * element plus the detection result for callers that want provenance.
 *
 * Both `runThemed` (simple run() form) and any future pipe-chain themed
 * boot helpers delegate to this function for the wrap step, keeping the
 * detection + wrapping logic in one place.
 *
 * @example
 * ```tsx
 * // Run-form (what runThemed does):
 * const { element } = await wrapWithThemedProvider(<App />, { catalog })
 * return run(element, runOpts)
 *
 * // Pipe-chain form (future createThemedApp would do):
 * const { element, result } = await wrapWithThemedProvider(<App />, opts)
 * console.log(`${result.source} — ${result.matchedName ?? "no match"}`)
 * return pipe(createApp(store), withReact(element), ...)
 * ```
 */

import React, { type ReactElement } from "react"
import {
  detectScheme,
  type ColorScheme,
  type DetectSchemeOptions,
  type DetectSchemeResult,
} from "@silvery/ansi"
import { ThemeProvider, type ThemeTokens } from "@silvery/ag-react"
import type { ActiveScheme } from "@silvery/ansi"

// Re-export for callers that want to compose without re-importing.
export type { DetectSchemeResult }

export interface ThemedProviderOptions extends DetectSchemeOptions {
  /**
   * Additional token overrides applied after detection — merged over the
   * detected theme via an inner `<ThemeProvider tokens={...}>`. Use for
   * app brand colors (`{ brand: "#5B8DEF" }`) or app-specific custom tokens
   * (`{ "priority-p0": "#FF5555" }`).
   */
  tokens?: ThemeTokens
}

export interface WrapWithThemedProviderResult {
  /** The element wrapped in ThemeProvider (pass to run() or withReact()). */
  element: ReactElement
  /** Full detection provenance — scheme, theme, source, confidence, slotSources. */
  result: DetectSchemeResult
}

/**
 * Detect the terminal's color scheme, derive a theme, and wrap `element`
 * in `<ThemeProvider>`.
 *
 * Builds an `ActiveScheme` metadata object so `useActiveScheme()` returns
 * detection provenance to all descendants. Token overrides are applied as
 * an inner `<ThemeProvider tokens={...}>` so they merge over the detected
 * theme rather than replacing it.
 *
 * Detection cascade (full — see `detectScheme`):
 *   1. `opts.override` — explicit ColorScheme
 *   2. `SILVERY_COLOR` env var
 *   3. OSC probe (OSC 10/11/4/12/17/19)
 *   4. Fingerprint match against `opts.catalog`
 *   5. Fallback to defaultDarkScheme / defaultLightScheme
 *
 * @param element - Your root React element (the app)
 * @param opts - Detection + token override options
 * @returns Wrapped element + full detection result
 */
export async function wrapWithThemedProvider(
  element: ReactElement,
  opts: ThemedProviderOptions = {},
): Promise<WrapWithThemedProviderResult> {
  const detectedResult = await detectScheme({
    override: opts.override,
    catalog: opts.catalog,
    timeoutMs: opts.timeoutMs,
    darkFallback: opts.darkFallback,
    enforce: opts.enforce,
    wcag: opts.wcag,
  })

  const { theme, scheme: detectedScheme, source, confidence, matchedName } = detectedResult

  // Build ActiveScheme metadata for useActiveScheme() hook.
  // Maps DetectSchemeResult.source ("probed" | "bg-mode" → "probe") to
  // ActiveScheme.source ("probe" | "fingerprint" | "fallback" | "override").
  const activeScheme: ActiveScheme = {
    name: detectedScheme.name ?? theme.name ?? "unknown",
    source: mapDetectSource(source),
    ...(source === "fingerprint" && {
      confidence,
      matchedName,
    }),
  }

  // Inner tokens layer: merged over the detected theme.
  const inner = opts.tokens ? (
    <ThemeProvider tokens={opts.tokens}>{element}</ThemeProvider>
  ) : (
    element
  )

  const wrapped = (
    <ThemeProvider theme={theme} scheme={activeScheme}>
      {inner}
    </ThemeProvider>
  )

  return { element: wrapped, result: detectedResult }
}

/**
 * Map `DetectSchemeResult.source` to `ActiveScheme.source`.
 *
 * `detectScheme` uses fine-grained values ("probed", "bg-mode") that
 * aren't part of the `ActiveScheme` consumer-facing vocabulary. Both
 * collapse to "probe" — they represent a successful or partial terminal
 * query rather than a catalog fingerprint or explicit override.
 */
function mapDetectSource(source: DetectSchemeResult["source"]): ActiveScheme["source"] {
  switch (source) {
    case "fingerprint":
      return "fingerprint"
    case "override":
      return "override"
    case "fallback":
      return "fallback"
    case "probed":
    case "bg-mode":
      return "probe"
  }
}

/** Re-export types so consumers have everything they need. */
export type { ColorScheme, ThemedProviderOptions as ThemedProviderOpts }
