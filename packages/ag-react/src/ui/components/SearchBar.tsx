/**
 * SearchBar — renders the search bar UI when search is active.
 *
 * Displays the query, match count, and navigation hints at the bottom
 * of the screen. Uses the SearchProvider context for state.
 *
 * Usage:
 * ```tsx
 * <SearchProvider>
 *   <App />
 *   <SearchBar />
 * </SearchProvider>
 * ```
 */

import React from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useSearch } from "../../providers/SearchProvider"
import type { ReactElement } from "react"

export function SearchBar(): ReactElement | null {
  const { isActive, query, matches, currentMatch } = useSearch()

  if (!isActive) return null

  const matchInfo =
    matches.length > 0 ? `[${currentMatch + 1}/${matches.length}]` : query ? "[no matches]" : ""

  return React.createElement(
    Box,
    { flexDirection: "row" },
    React.createElement(Text, { inverse: true }, ` / ${query} ${matchInfo} `),
  )
}
