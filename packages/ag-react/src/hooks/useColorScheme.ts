/**
 * useColorScheme — reactive terminal color scheme (dark/light/unknown).
 *
 * Reads from the BgModeDetector registered on the CapabilityRegistry
 * by withTerminal(). Updates when Mode 2031 reports a scheme change.
 *
 * Returns "unknown" when:
 * - No CapabilityRegistry is present (e.g., simple run() without pipe())
 * - No BgModeDetector was registered
 * - The terminal hasn't responded to Mode 2031 yet
 *
 * @example
 * ```tsx
 * function ThemeAwareApp() {
 *   const scheme = useColorScheme()
 *   const theme = scheme === "light" ? lightTheme : darkTheme
 *   return (
 *     <ThemeProvider theme={theme}>
 *       <App />
 *     </ThemeProvider>
 *   )
 * }
 * ```
 */

import { useCallback, useContext, useSyncExternalStore } from "react"
import { CapabilityRegistryContext } from "../context"

// =============================================================================
// Types — duck-typed to avoid dependency on @silvery/ansi or @silvery/ag-term
// =============================================================================

/** Terminal color scheme: dark, light, or unknown (not yet detected). */
export type ColorScheme = "dark" | "light" | "unknown"

/**
 * Minimal interface for the color scheme detector capability.
 * Matches the shape of BgModeDetector from @silvery/ansi without importing it.
 */
interface ColorSchemeDetectorLike {
  readonly scheme: ColorScheme
  subscribe(listener: (scheme: "dark" | "light") => void): () => void
}

/** Well-known symbol for the color scheme capability. */
const COLOR_SCHEME_CAPABILITY = Symbol.for("silvery.color-scheme")

/**
 * Hook that returns the current terminal color scheme reactively.
 *
 * Subscribes to the BgModeDetector via the capability registry.
 * Re-renders the component when the scheme changes (dark <-> light).
 */
export function useColorScheme(): ColorScheme {
  const registry = useContext(CapabilityRegistryContext)
  const detector = registry?.get<ColorSchemeDetectorLike>(COLOR_SCHEME_CAPABILITY) ?? null

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!detector) return () => {}
      return detector.subscribe(onStoreChange)
    },
    [detector],
  )

  const getSnapshot = useCallback((): ColorScheme => {
    if (!detector) return "unknown"
    return detector.scheme
  }, [detector])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
