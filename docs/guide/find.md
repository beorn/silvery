# Find

Silvery provides text search at two levels: buffer-level search for visible content, and FindProvider for virtual lists where off-screen items need model-level search.

## How It's Activated

Find is a **runtime feature** (`FindFeature`) that activates automatically when you use `withFocus()`:

```typescript
const app = pipe(
  createApp(store),
  withReact(<App />),
  withTerminal(process),
  withFocus(),        // ← Ctrl+F find is included
  withDomEvents(),
)
```

Press `Ctrl+F` to open the find bar, type a query, use `n`/`N` to navigate matches, `Enter` to select the current match, and `Esc` to close.

Find works automatically via `withFocus()` — no explicit hook setup is needed for basic find functionality. The `useFind` hook is still available for custom find UIs (see below).

## Buffer-Level Find

Search the rendered terminal buffer for text matches. Matches are highlighted in the output using style composition — the same pipeline as selection highlights.

### Legacy useFind Hook

The `useFind` hook provides programmatic access to find state for custom find UIs:

```tsx
import { useFind } from "silvery"

function App() {
  const { findState, search, next, prev, close, selectCurrent } = useFind({
    onScrollTo(row) {
      // Scroll to make the match visible
    },
    onSetSelection(match) {
      // Set selection to the matched range
    },
  })

  // Open find with a query
  search("hello", buffer)

  // Navigate matches
  next() // go to next match
  prev() // go to previous match

  // Select current match (for copying)
  selectCurrent()

  // Close find mode
  close()
}
```

### FindState

```typescript
interface FindState {
  query: string | null // current search query
  matches: FindMatch[] // all matches in the buffer
  currentIndex: number // index of the focused match
  active: boolean // whether find mode is open
}

interface FindMatch {
  row: number
  startCol: number
  endCol: number
}
```

### Workflow

```
Ctrl+F → open find bar
       → type query → matches highlighted in buffer
       → n/N navigate between matches (auto-scroll)
       → Enter → set selection to current match
       → Esc → clear find, close bar
```

### Style Precedence

When both selection and find are active on the same cell:

- **Selection wins** — it's the user's explicit action
- Find matches outside the selection use the find highlight style
- Find matches inside the selection use the selection style

## Buffer Search Function

For programmatic buffer search without the hook:

```typescript
import { searchBuffer } from "@silvery/ag-term"

const matches = searchBuffer(buffer, "hello")
// Returns FindMatch[] — row, startCol, endCol for each match
```

This searches the visible terminal buffer cells for text matches. It handles wide characters and grapheme clusters correctly.

## FindProvider for Virtual Lists

Virtual lists only render visible items — off-screen content is not in the buffer. For full-content search, register a `FindProvider` that searches your data model.

### FindProvider Interface

```typescript
interface FindProvider {
  /** Search the full model for matches */
  search(query: string): FindResult[] | Promise<FindResult[]>

  /** Scroll to make a result visible on screen */
  reveal(result: FindResult): void | Promise<void>

  /** Optional: return total count for "N of M" display */
  totalCount?(query: string): number | Promise<number>
}

interface FindResult {
  itemId: string // virtual list item identifier
  offset: number // character offset within item text
  length: number // match length
}
```

### Integration

```tsx
import { SearchProvider } from "silvery"

function VirtualListApp({ items }) {
  const findProvider: FindProvider = {
    search(query) {
      // Search all items, not just visible ones
      return items.flatMap((item, i) => {
        const idx = item.text.indexOf(query)
        if (idx === -1) return []
        return [{ itemId: item.id, offset: idx, length: query.length }]
      })
    },

    reveal(result) {
      // Scroll the list to show this item
      scrollToItem(result.itemId)
    },

    totalCount(query) {
      return items.filter((i) => i.text.includes(query)).length
    },
  }

  return (
    <SearchProvider value={findProvider}>
      <ListView
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.text}</Text>}
      />
    </SearchProvider>
  )
}
```

### How It Works

1. User types a query in the find bar
2. Silvery calls `provider.search(query)` to get all matches
3. User presses `n` — Silvery calls `provider.reveal(nextResult)`
4. Provider scrolls the list to make the item visible
5. Once the item is on screen, Silvery highlights the match in the buffer

This two-phase approach (model search → reveal → buffer highlight) means the framework handles the visual layer while the app handles the data layer.

### Find Scope

- **Global**: Default — searches all visible buffer content
- **Within contain boundary**: A find bar inside a `userSelect="contain"` scope searches only that scope
- **Virtual list**: FindProvider searches the full data model, not just visible items

## Selection Integration

Find and selection work together:

- **Enter** on a find match sets the selection to that match
- The selected match can then be copied with `y` or your app's copy command
- Selection and find highlights compose via the same style composition pipeline

## See Also

- [Text Selection](/guide/text-selection) — userSelect prop, mouse selection, copy-mode
- [Clipboard](/guide/clipboard) — clipboard backends, semantic copy, paste handling
- [Scrolling](/guide/scrolling) — scroll containers, virtual lists
