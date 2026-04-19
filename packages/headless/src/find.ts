/**
 * Find state machine — pure TEA `(action, state) → [state, effects[]]`.
 *
 * Visible-buffer find with match navigation.
 * Searches the rendered terminal buffer for text matches.
 *
 * Supports an optional FindProvider for virtual lists where off-screen
 * items aren't in the buffer. When a provider is present, search delegates
 * to the provider's model-level search; otherwise falls back to buffer search.
 */

import type { TerminalBuffer } from "@silvery/ag-term/buffer"

// ============================================================================
// Types
// ============================================================================

export interface FindMatch {
  row: number
  startCol: number
  endCol: number
}

/**
 * Result from a FindProvider's model-level search.
 * Represents a match within a virtual list item that may not be on screen.
 */
export interface FindResult {
  /** Virtual list item identifier */
  itemId: string
  /** Character offset within item text */
  offset: number
  /** Match length */
  length: number
  /** Screen row — set after reveal() makes the item visible */
  row?: number
  /** Screen start column — set after reveal() */
  startCol?: number
}

/**
 * Provider interface for virtual list find.
 *
 * When off-screen items aren't in the terminal buffer, the app provides
 * a search callback that searches the full data model. The provider's
 * reveal() scrolls to make a result visible, after which the framework
 * highlights it on the buffer.
 */
export interface FindProvider {
  /** Search the full model for matches */
  search(query: string): FindResult[] | Promise<FindResult[]>
  /** Scroll to make a result visible on screen */
  reveal(result: FindResult): void | Promise<void>
  /** Optional: return total count without full results (for "N of M" display) */
  totalCount?(query: string): number | Promise<number>
}

export interface FindState {
  /** Current search query, or null if find is not active */
  query: string | null
  /** All matches in the visible buffer */
  matches: FindMatch[]
  /** Index of the currently focused match (-1 if no matches) */
  currentIndex: number
  /** Whether find mode is active */
  active: boolean
  /** Provider-level results (when FindProvider is present) */
  providerResults: FindResult[]
  /** Whether provider search is in progress */
  providerSearching: boolean
}

export type FindAction =
  | { type: "search"; query: string; buffer: TerminalBuffer }
  | { type: "next" }
  | { type: "prev" }
  | { type: "close" }
  | { type: "selectCurrent" }
  | { type: "setProviderResults"; results: FindResult[]; query: string }
  | { type: "providerSearchStarted"; query: string }
  | { type: "revealComplete"; result: FindResult; row: number; startCol: number; endCol: number }

export type FindEffect =
  | { type: "render" }
  | { type: "setSelection"; match: FindMatch }
  | { type: "scrollTo"; row: number }
  | { type: "providerSearch"; query: string }
  | { type: "providerReveal"; result: FindResult }

// ============================================================================
// State
// ============================================================================

export function createFindState(): FindState {
  return {
    query: null,
    matches: [],
    currentIndex: -1,
    active: false,
    providerResults: [],
    providerSearching: false,
  }
}

// ============================================================================
// Buffer Search
// ============================================================================

/**
 * Search a terminal buffer for all occurrences of a query string.
 * Case-insensitive. Searches row by row, does not span rows.
 *
 * Returns matches sorted by position (row ascending, col ascending).
 */
export function searchBuffer(buffer: TerminalBuffer, query: string): FindMatch[] {
  if (!query || query.length === 0) return []

  const lowerQuery = query.toLowerCase()
  const matches: FindMatch[] = []

  for (let row = 0; row < buffer.height; row++) {
    // Build the row string from buffer cells
    let rowText = ""
    for (let col = 0; col < buffer.width; col++) {
      rowText += buffer.getCell(col, row).char
    }

    // Search case-insensitively
    const lowerRow = rowText.toLowerCase()
    let searchFrom = 0

    while (searchFrom <= lowerRow.length - lowerQuery.length) {
      const idx = lowerRow.indexOf(lowerQuery, searchFrom)
      if (idx === -1) break

      matches.push({
        row,
        startCol: idx,
        endCol: idx + lowerQuery.length - 1,
      })

      // Move past this match to find overlapping matches
      searchFrom = idx + 1
    }
  }

  return matches
}

// ============================================================================
// Update
// ============================================================================

export function findUpdate(action: FindAction, state: FindState): [FindState, FindEffect[]] {
  switch (action.type) {
    case "search": {
      const matches = searchBuffer(action.buffer, action.query)
      const currentIndex = matches.length > 0 ? 0 : -1
      const effects: FindEffect[] = [{ type: "render" }]
      if (currentIndex >= 0) {
        effects.push({ type: "scrollTo", row: matches[0]!.row })
      }
      return [
        {
          query: action.query,
          matches,
          currentIndex,
          active: true,
          providerResults: state.providerResults,
          providerSearching: state.providerSearching,
        },
        effects,
      ]
    }

    case "next": {
      // Provider mode: navigate provider results
      if (state.active && state.providerResults.length > 0) {
        const total = state.providerResults.length
        const currentIndex = (state.currentIndex + 1) % total
        const result = state.providerResults[currentIndex]!
        return [
          { ...state, currentIndex },
          [{ type: "render" }, { type: "providerReveal", result }],
        ]
      }
      // Buffer mode
      if (!state.active || state.matches.length === 0) return [state, []]
      const currentIndex = (state.currentIndex + 1) % state.matches.length
      const match = state.matches[currentIndex]!
      return [
        { ...state, currentIndex },
        [{ type: "render" }, { type: "scrollTo", row: match.row }],
      ]
    }

    case "prev": {
      // Provider mode: navigate provider results
      if (state.active && state.providerResults.length > 0) {
        const total = state.providerResults.length
        const currentIndex = (state.currentIndex - 1 + total) % total
        const result = state.providerResults[currentIndex]!
        return [
          { ...state, currentIndex },
          [{ type: "render" }, { type: "providerReveal", result }],
        ]
      }
      // Buffer mode
      if (!state.active || state.matches.length === 0) return [state, []]
      const currentIndex = (state.currentIndex - 1 + state.matches.length) % state.matches.length
      const match = state.matches[currentIndex]!
      return [
        { ...state, currentIndex },
        [{ type: "render" }, { type: "scrollTo", row: match.row }],
      ]
    }

    case "close": {
      return [createFindState(), [{ type: "render" }]]
    }

    case "selectCurrent": {
      if (!state.active || state.currentIndex < 0 || state.currentIndex >= state.matches.length) {
        return [state, []]
      }
      const match = state.matches[state.currentIndex]!
      return [state, [{ type: "setSelection", match }]]
    }

    case "providerSearchStarted": {
      return [
        {
          ...state,
          active: true,
          query: action.query,
          providerSearching: true,
          providerResults: [],
          currentIndex: -1,
        },
        [{ type: "render" }],
      ]
    }

    case "setProviderResults": {
      // Only accept results if query matches current search
      if (action.query !== state.query) return [state, []]
      const currentIndex = action.results.length > 0 ? 0 : -1
      const effects: FindEffect[] = [{ type: "render" }]
      if (currentIndex >= 0) {
        effects.push({ type: "providerReveal", result: action.results[0]! })
      }
      return [
        {
          ...state,
          providerResults: action.results,
          providerSearching: false,
          currentIndex,
        },
        effects,
      ]
    }

    case "revealComplete": {
      // After reveal, update the provider result with screen coordinates
      // and add a corresponding buffer-level match for highlighting
      const match: FindMatch = {
        row: action.row,
        startCol: action.startCol,
        endCol: action.endCol,
      }
      // Update the provider result with screen position
      const updatedResults = state.providerResults.map((r) =>
        r.itemId === action.result.itemId && r.offset === action.result.offset
          ? { ...r, row: action.row, startCol: action.startCol }
          : r,
      )
      return [
        {
          ...state,
          providerResults: updatedResults,
          // Add the revealed match to buffer matches for highlighting
          matches: [match],
        },
        [{ type: "render" }, { type: "scrollTo", row: action.row }],
      ]
    }
  }
}
