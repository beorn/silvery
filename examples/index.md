# Inkx Examples

Interactive examples demonstrating Inkx features.

## Running Examples

All examples can be run directly with bun:

```bash
bun run examples/<name>/index.tsx
```

## Available Examples

### Dashboard

A multi-pane dashboard with keyboard navigation.

```bash
bun run examples/dashboard/index.tsx
```

**Demonstrates:**

- 3-column layout using `flexGrow`
- Keyboard navigation between panes
- Styled borders and conditional highlighting
- Progress bars with visual indicators

### Task List

A scrollable task list with 60+ items.

```bash
bun run examples/task-list/index.tsx
```

**Demonstrates:**

- Virtual scrolling (only visible items rendered)
- Variable height items with expandable subtasks
- `overflow="hidden"` for content clipping
- Priority badges with color coding
- Selection highlighting with `backgroundColor`

### Kanban Board

A 3-column kanban board with card management.

```bash
bun run examples/kanban/index.tsx
```

**Demonstrates:**

- Multiple columns with independent scrolling
- Move cards between columns with keyboard
- Nested `Box` layouts with `flexGrow`
- Color-coded tags
- Dynamic state management across columns

### Search Filter (React Concurrent Features)

Interactive search with responsive typing using React concurrent features.

```bash
bun run examples/search-filter/index.tsx
```

**Demonstrates:**

- `useDeferredValue` for deferred query filtering
- `useTransition` for low-priority state updates
- Typing remains responsive during heavy filtering
- Pending state indicator

### Async Data (Suspense)

Async data loading with independent Suspense boundaries.

```bash
bun run examples/async-data/index.tsx
```

**Demonstrates:**

- React `use()` hook for data fetching
- Multiple independent Suspense boundaries
- Staggered loading with fallback UI
- ErrorBoundary integration

### Layout Ref (forwardRef + onLayout)

Imperative access to layout information via refs and callbacks.

```bash
bun run examples/layout-ref/index.tsx
```

**Demonstrates:**

- `forwardRef` on Box components
- `BoxHandle` with `getContentRect()`, `getScreenRect()`, `getNode()`
- `onLayout` callback for size change notifications
- Declarative vs imperative layout access

## Common Patterns

### Keyboard Handling

All examples use `useInput()` for keyboard interaction:

```tsx
import { useInput, useApp, type Key } from "inkx"

function MyComponent() {
  const { exit } = useApp()

  useInput((input: string, key: Key) => {
    if (key.upArrow) {
      /* move up */
    }
    if (input === "q") {
      exit()
    }
  })

  return <Text>Press q to quit</Text>
}
```

### Scrolling

For lists that exceed available height:

```tsx
const visibleCount = 15 // Fixed or calculated from terminal height
const scrollOffset = calculateScrollOffset(cursor, visibleCount, totalItems)
const visibleItems = items.slice(scrollOffset, scrollOffset + visibleCount)

return (
  <Box overflow="hidden" height={visibleCount}>
    {visibleItems.map((item) => (
      <Item key={item.id} item={item} />
    ))}
  </Box>
)
```

### Flexbox Layouts

Equal-width columns:

```tsx
<Box flexDirection="row" gap={1}>
  <Box flexGrow={1}>
    <Text>Column 1</Text>
  </Box>
  <Box flexGrow={1}>
    <Text>Column 2</Text>
  </Box>
  <Box flexGrow={1}>
    <Text>Column 3</Text>
  </Box>
</Box>
```

### Selection Highlighting

```tsx
{
  isSelected ? (
    <Text backgroundColor="cyan" color="black">
      Selected item
    </Text>
  ) : (
    <Text>Normal item</Text>
  )
}
```

## Creating New Examples

1. Create a directory under `examples/`
2. Add `index.tsx` with your example code
3. Add `README.md` with description and controls
4. Update this index to list your example
