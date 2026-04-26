/**
 * Search overlay state machine for virtual inline mode.
 *
 * Pure TEA: (action, state) -> [state, effects[]]
 * Provides incremental search-as-you-type with match navigation.
 */

export interface SearchMatch {
  row: number
  startCol: number
  endCol: number
}

/**
 * A single contiguous character range within a string that matched a search
 * query. `start` is inclusive, `end` is exclusive — same convention as
 * `String.prototype.slice(start, end)`.
 */
export interface MatchRange {
  start: number
  end: number
}

/**
 * Find all case-insensitive occurrences of `query` inside `text` and return
 * their character offsets. Empty query or empty text returns `[]`.
 *
 * This is the canonical silvery search-match algorithm. The same logic runs
 * inside `ListView`'s registered Searchable (to find matches across items)
 * and is exposed to consumers that render multi-segment items — a LogRow
 * whose searchable text is a concatenation of field values, but whose visual
 * rendering splits those fields across separate Text nodes, needs per-segment
 * ranges to highlight without re-implementing the semantics.
 *
 * Ranges are returned in ascending `start` order; overlapping matches are
 * not produced (`indexOf(..., start = last.start + 1)` advances past each
 * match start, not past its full length, preserving overlapping runs of
 * short queries — e.g. `"aa"` in `"aaaa"` yields `[0..2], [1..3], [2..4]`).
 *
 * Offsets are CHARACTER offsets into the input string. They are not column
 * offsets — multi-column wide glyphs are counted as one character here, the
 * same way the SearchProvider's match-row computation does.
 */
export function computeMatchRanges(text: string, query: string): MatchRange[] {
  if (query === "" || text === "") return []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const ranges: MatchRange[] = []
  let cursor = 0
  while (cursor < lowerText.length) {
    const found = lowerText.indexOf(lowerQuery, cursor)
    if (found === -1) break
    ranges.push({ start: found, end: found + query.length })
    cursor = found + 1
  }
  return ranges
}

export interface SearchState {
  active: boolean
  query: string
  matches: SearchMatch[]
  currentMatch: number // Index into matches, -1 when no matches
  cursorPosition: number // Cursor position within query string
}

export type SearchAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "input"; char: string }
  | { type: "backspace" }
  | { type: "nextMatch" } // Enter
  | { type: "prevMatch" } // Shift+Enter
  | { type: "cursorLeft" }
  | { type: "cursorRight" }
  | { type: "cursorToStart" } // Ctrl+A / Home
  | { type: "cursorToEnd" } // Ctrl+E / End
  | { type: "deleteWordBack" } // Ctrl+W / Alt+Backspace
  | { type: "deleteToStart" } // Ctrl+U

export type SearchEffect = { type: "scrollTo"; row: number } | { type: "render" }

export function createSearchState(): SearchState {
  return {
    active: false,
    query: "",
    matches: [],
    currentMatch: -1,
    cursorPosition: 0,
  }
}

/**
 * Update search state. searchFn is called when query changes to find matches.
 */
export function searchUpdate(
  action: SearchAction,
  state: SearchState,
  searchFn?: (query: string) => SearchMatch[],
): [SearchState, SearchEffect[]] {
  switch (action.type) {
    case "open":
      return [
        { ...state, active: true, query: "", matches: [], currentMatch: -1, cursorPosition: 0 },
        [{ type: "render" }],
      ]

    case "close":
      // Close the bar but KEEP the results. `n` / `N` (next/prev) must
      // still cycle through matches after the bar closes — that's the
      // whole point of 'search then step through' (less / vim idiom).
      // A subsequent `open` starts a fresh query and wipes matches.
      return [{ ...state, active: false, query: "", cursorPosition: 0 }, [{ type: "render" }]]

    case "input": {
      const query =
        state.query.slice(0, state.cursorPosition) +
        action.char +
        state.query.slice(state.cursorPosition)
      const cursorPosition = state.cursorPosition + 1
      const matches = searchFn ? searchFn(query) : []
      const currentMatch = matches.length > 0 ? 0 : -1
      const effects: SearchEffect[] = [{ type: "render" }]
      if (currentMatch >= 0) {
        effects.push({ type: "scrollTo", row: matches[0]!.row })
      }
      return [{ ...state, query, cursorPosition, matches, currentMatch }, effects]
    }

    case "backspace": {
      if (state.cursorPosition === 0) return [state, []]
      const query =
        state.query.slice(0, state.cursorPosition - 1) + state.query.slice(state.cursorPosition)
      const cursorPosition = state.cursorPosition - 1
      const matches = searchFn ? searchFn(query) : []
      const currentMatch = matches.length > 0 ? 0 : -1
      const effects: SearchEffect[] = [{ type: "render" }]
      if (currentMatch >= 0) {
        effects.push({ type: "scrollTo", row: matches[0]!.row })
      }
      return [{ ...state, query, cursorPosition, matches, currentMatch }, effects]
    }

    case "nextMatch": {
      if (state.matches.length === 0) return [state, []]
      const currentMatch = (state.currentMatch + 1) % state.matches.length
      return [
        { ...state, currentMatch },
        [{ type: "scrollTo", row: state.matches[currentMatch]!.row }, { type: "render" }],
      ]
    }

    case "prevMatch": {
      if (state.matches.length === 0) return [state, []]
      const currentMatch = (state.currentMatch - 1 + state.matches.length) % state.matches.length
      return [
        { ...state, currentMatch },
        [{ type: "scrollTo", row: state.matches[currentMatch]!.row }, { type: "render" }],
      ]
    }

    case "cursorLeft":
      if (state.cursorPosition === 0) return [state, []]
      return [{ ...state, cursorPosition: state.cursorPosition - 1 }, []]

    case "cursorRight":
      if (state.cursorPosition >= state.query.length) return [state, []]
      return [{ ...state, cursorPosition: state.cursorPosition + 1 }, []]

    case "cursorToStart":
      if (state.cursorPosition === 0) return [state, []]
      return [{ ...state, cursorPosition: 0 }, []]

    case "cursorToEnd":
      if (state.cursorPosition >= state.query.length) return [state, []]
      return [{ ...state, cursorPosition: state.query.length }, []]

    case "deleteWordBack": {
      if (state.cursorPosition === 0) return [state, []]
      // Find the start of the previous word (skip trailing whitespace, then non-whitespace)
      let pos = state.cursorPosition
      while (pos > 0 && /\s/.test(state.query[pos - 1] ?? "")) pos--
      while (pos > 0 && !/\s/.test(state.query[pos - 1] ?? "")) pos--
      const query = state.query.slice(0, pos) + state.query.slice(state.cursorPosition)
      const cursorPosition = pos
      const matches = searchFn ? searchFn(query) : []
      const currentMatch = matches.length > 0 ? 0 : -1
      const effects: SearchEffect[] = [{ type: "render" }]
      if (currentMatch >= 0) {
        effects.push({ type: "scrollTo", row: matches[0]!.row })
      }
      return [{ ...state, query, cursorPosition, matches, currentMatch }, effects]
    }

    case "deleteToStart": {
      if (state.cursorPosition === 0) return [state, []]
      const query = state.query.slice(state.cursorPosition)
      const cursorPosition = 0
      const matches = searchFn ? searchFn(query) : []
      const currentMatch = matches.length > 0 ? 0 : -1
      const effects: SearchEffect[] = [{ type: "render" }]
      if (currentMatch >= 0) {
        effects.push({ type: "scrollTo", row: matches[0]!.row })
      }
      return [{ ...state, query, cursorPosition, matches, currentMatch }, effects]
    }
  }
}

/**
 * Render the search bar as a plain (no ANSI) string padded to `cols` width.
 * Format: " / query  [2/15]" or " / query  [no matches]" — padded with spaces.
 *
 * Caller decides how to display it — wrap with `\x1b[7m...\x1b[27m` for the
 * legacy overlay path, or stamp into a buffer's cells with the inverse
 * attribute for the compose+apply path
 * (see `applySearchBarToPaintBuffer` in `runtime/renderer.ts`).
 */
export function renderSearchBarPlain(state: SearchState, cols: number): string {
  const prefix = " / "
  const matchInfo =
    state.matches.length > 0
      ? `  [${state.currentMatch + 1}/${state.matches.length}]`
      : state.query
        ? "  [no matches]"
        : ""

  const content = prefix + state.query + matchInfo
  return content.padEnd(cols)
}

/**
 * Render the search bar as an ANSI string with inverse video wrapping.
 * Format: " / query  [2/15]" or " / query  [no matches]"
 *
 * Kept as a self-contained "give me the bar's ANSI representation" helper
 * for tests and ad-hoc callers. The runtime paint path uses
 * `renderSearchBarPlain` + `applySearchBarToPaintBuffer` (see
 * `runtime/renderer.ts`) — buffer cells with the inverse attribute, not
 * raw `\x1b[7m...\x1b[27m` past the buffer. Don't add new runtime callers
 * of this function — they will reintroduce the
 * km-silvery.delete-search-overlay-ansi bug class.
 */
export function renderSearchBar(state: SearchState, cols: number): string {
  // Inverse video: ESC[7m ... ESC[27m
  return `\x1b[7m${renderSearchBarPlain(state, cols)}\x1b[27m`
}
