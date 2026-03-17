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
      return [createSearchState(), [{ type: "render" }]]

    case "input": {
      const query = state.query.slice(0, state.cursorPosition) + action.char + state.query.slice(state.cursorPosition)
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
      const query = state.query.slice(0, state.cursorPosition - 1) + state.query.slice(state.cursorPosition)
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
  }
}

/**
 * Render the search bar as an ANSI string.
 * Format: " / query  [2/15]" or " / query  [no matches]"
 */
export function renderSearchBar(state: SearchState, cols: number): string {
  const prefix = " / "
  const matchInfo =
    state.matches.length > 0
      ? `  [${state.currentMatch + 1}/${state.matches.length}]`
      : state.query
        ? "  [no matches]"
        : ""

  const content = prefix + state.query + matchInfo
  const padded = content.padEnd(cols)

  // Inverse video: ESC[7m ... ESC[27m
  return `\x1b[7m${padded}\x1b[27m`
}
