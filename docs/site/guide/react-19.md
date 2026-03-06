# React 19 Compatibility

hightea is fully compatible with React 19. This guide covers React 19 specific features and how they work with hightea.

## Version Requirements

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  },
  "dependencies": {
    "react-reconciler": "^0.33.0"
  }
}
```

hightea supports both React 18 and React 19 as peer dependencies. The `react-reconciler` version 0.33+ includes the necessary APIs for React 19 compatibility.

## Reconciler Configuration

hightea uses `react-reconciler` to integrate with React's rendering system. For React 19 (reconciler 0.33+), the following host config methods are required:

```typescript
// Update priority management (required for 0.33+)
setCurrentUpdatePriority(priority: number): void
getCurrentUpdatePriority(): number
resolveUpdatePriority(): number

// Suspense support
maySuspendCommit(): boolean
startSuspendingCommit(): void
suspendInstance(): void
waitForCommitToBeReady(): null

// Transition support
NotPendingTransition: null
HostTransitionContext: Context<null>
shouldAttemptEagerTransition(): boolean
```

These are all implemented in hightea's reconciler, ensuring compatibility with React 19's concurrent features.

## Supported React 19 Features

### Hooks

All standard React hooks work correctly:

```tsx
import { useState, useEffect, useTransition, useDeferredValue } from "react"
import { Box, Text, useInput, useContentRect } from "@hightea/term"

function App() {
  const [count, setCount] = useState(0)
  const [isPending, startTransition] = useTransition()
  const deferredCount = useDeferredValue(count)
  const { width, height } = useContentRect()

  useInput((input, key) => {
    if (key.return) {
      startTransition(() => {
        setCount((c) => c + 1)
      })
    }
  })

  return (
    <Box flexDirection="column">
      <Text>Count: {count}</Text>
      <Text>Deferred: {deferredCount}</Text>
      <Text>Pending: {isPending ? "yes" : "no"}</Text>
      <Text dim>
        {width}x{height}
      </Text>
    </Box>
  )
}
```

### Suspense

Suspense boundaries work for lazy loading and data fetching patterns:

```tsx
import { Suspense, lazy } from "react"
import { Box, Text } from "@hightea/term"

const HeavyComponent = lazy(() => import("./HeavyComponent"))

function App() {
  return (
    <Suspense fallback={<Text>Loading...</Text>}>
      <HeavyComponent />
    </Suspense>
  )
}
```

::: tip
Terminal UIs typically don't benefit as much from Suspense as web apps, but it's fully supported if your architecture uses it.
:::

### StrictMode

StrictMode works correctly with hightea. Double-rendering in development mode (for detecting side effects) doesn't cause output issues:

```tsx
import { StrictMode } from "react"
import { Box, Text, render, createTerm } from "@hightea/term"

function App() {
  return (
    <Box>
      <Text>Hello World</Text>
    </Box>
  )
}

using term = createTerm()
await render(
  <StrictMode>
    <App />
  </StrictMode>,
  term,
)
```

### Concurrent Rendering

hightea supports React's concurrent rendering features. The reconciler properly handles:

- **useTransition**: For non-blocking state updates
- **useDeferredValue**: For deferring expensive re-renders
- **Automatic batching**: Multiple state updates are batched efficiently

```tsx
function SearchResults() {
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const deferredQuery = useDeferredValue(query)

  useInput((input) => {
    // Immediate feedback
    setQuery((q) => q + input)

    // Deferred expensive operation
    startTransition(() => {
      // Heavy computation here
    })
  })

  return (
    <Box flexDirection="column">
      <Text>Query: {query}</Text>
      <Text dim={isPending}>Results for: {deferredQuery}</Text>
    </Box>
  )
}
```

## Testing with React 19

The hightea testing library is configured for React 19's act() requirements:

```tsx
import { createRenderer } from "@hightea/term/testing"

const render = createRenderer()

test("component renders correctly", () => {
  const { lastFrame } = render(<MyComponent />)
  expect(lastFrame()).toContain("expected content")
})
```

The testing environment automatically:

- Sets `IS_REACT_ACT_ENVIRONMENT = true`
- Wraps updates in `act()` for proper state flushing
- Supports stdin simulation for input testing

## Migration from React 18

If upgrading from React 18, no changes to your hightea code are required. The transition is seamless:

1. Update React to version 19
2. hightea automatically uses the appropriate reconciler APIs
3. All existing code continues to work

## Known Limitations

### Terminal-Specific Constraints

Some React 19 features have terminal-specific considerations:

- **Server Components**: Not applicable to terminal UIs
- **Server Actions**: Not applicable to terminal UIs
- **Streaming**: Terminal output is synchronous by nature

### Concurrent Feature Notes

While concurrent features are supported, terminal rendering is fundamentally different from browser DOM:

- Updates are buffered and written to stdout in full frames
- There's no concept of "painting" partial updates
- Transitions still help with perceived responsiveness but the visual effect differs from web

## Troubleshooting

### "Warning: Invalid hook call"

Ensure you have a single React version in your dependency tree:

```bash
npm ls react
# or
bun pm ls react
```

### Console Warnings About Deprecated APIs

hightea's reconciler implementation uses the modern 0.33+ API. If you see deprecation warnings, they're likely from other dependencies. Check that all dependencies are up to date.

### StrictMode Double Effects

In development, React 19 StrictMode intentionally double-invokes effects to help find bugs. This is expected behavior and doesn't affect production builds.
