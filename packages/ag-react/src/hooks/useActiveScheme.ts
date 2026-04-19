/**
 * useActiveScheme — read scheme detection metadata from context.
 *
 * Returns an `ActiveScheme` object describing how the active terminal color
 * scheme was determined: whether it was probed from OSC queries, matched via
 * fingerprinting, a forced override, or a fallback. Includes the matched
 * catalog name and confidence score for fingerprint detections.
 *
 * Returns `null` when no `<ThemeProvider scheme={...}>` is present in the
 * tree — i.e. the scheme was not passed down from `runThemed` or a manually
 * constructed provider.
 *
 * @example
 * ```tsx
 * function DetectionBadge() {
 *   const scheme = useActiveScheme()
 *   if (!scheme) return null
 *   if (scheme.source === "fingerprint") {
 *     return <Text color="$muted">Theme: {scheme.matchedName} ({Math.round((scheme.confidence ?? 0) * 100)}%)</Text>
 *   }
 *   return <Text color="$muted">Theme: {scheme.name} ({scheme.source})</Text>
 * }
 * ```
 */

import { useContext } from "react"
import { ActiveSchemeContext } from "../ThemeContext"
import type { ActiveScheme } from "@silvery/ansi"

/**
 * Hook that returns the active scheme detection metadata, or `null` if no
 * scheme metadata was injected by an ancestor `ThemeProvider`.
 */
export function useActiveScheme(): ActiveScheme | null {
  return useContext(ActiveSchemeContext)
}
