# SearchBar

Renders the search bar UI when search is active. Displays the query, match count, and navigation hints. Uses the `SearchProvider` context for state.

## Import

```tsx
import { SearchBar } from "silvery"
```

## Props

None. All state comes from `SearchProvider` context.

## Usage

```tsx
<SearchProvider>
  <App />
  <SearchBar />
</SearchProvider>
```

## Rendering

When search is active, renders a single line with inverse styling showing:

- The search query prefixed with `/`
- Match count `[N/M]` or `[no matches]`

Returns `null` when search is not active.

## See Also

- [TextInput](./TextInput.md) -- standalone text input
