# Search Filter Example

Demonstrates React concurrent features for responsive typing.

## Run

```bash
bun run examples/search-filter/index.tsx
```

## Controls

- **Type**: Filter items by name, category, or tags
- **Backspace**: Delete last character
- **Esc**: Quit

## Features Demonstrated

### useDeferredValue

```tsx
const deferredQuery = useDeferredValue(query)
;<FilteredList query={deferredQuery} />
```

The filtered list uses a deferred version of the query. When you type quickly, React prioritizes updating the input display over re-filtering the list. The list catches up during idle time.

### useTransition

```tsx
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setQuery(newValue)
})
```

State updates wrapped in `startTransition` are marked as low-priority. The `isPending` flag shows "filtering..." while the transition is in progress.

## Why This Matters

Without these features, typing in a search box with expensive filtering can feel sluggish. Each keystroke would block until the filter completes. With `useDeferredValue` and `useTransition`:

1. Keystrokes update the input immediately
2. Filtering happens asynchronously
3. UI remains responsive
