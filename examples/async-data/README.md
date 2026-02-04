# Async Data Example

Demonstrates React Suspense for async data loading in terminal UIs.

## Run

```bash
bun run examples/async-data/index.tsx
```

## Controls

- **r**: Refresh all data (clears cache)
- **Esc**: Quit

## Features Demonstrated

### React.use() for Data Fetching

```tsx
function UserProfile() {
  const user = use(fetchData("user", 1500, userData))
  return <Text>{user.name}</Text>
}
```

The `use()` hook suspends the component until the promise resolves. During suspension, the nearest Suspense boundary shows its fallback.

### Independent Suspense Boundaries

```tsx
<Box flexDirection="row">
  <Suspense fallback={<Loading />}>
    <UserProfile />
  </Suspense>
  <Suspense fallback={<Loading />}>
    <Statistics />
  </Suspense>
</Box>
```

Each component has its own Suspense boundary, so they load independently. User profile might show before statistics, creating a progressive loading experience.

### ErrorBoundary Integration

```tsx
<ErrorBoundary fallback={<Text color="red">Error</Text>}>
  <Suspense fallback={<Loading />}>
    <DataComponent />
  </Suspense>
</ErrorBoundary>
```

If the async operation throws an error (instead of suspending), the ErrorBoundary catches it and displays the error fallback.

## Implementation Notes

inkx implements Suspense support via `hideInstance`/`unhideInstance` in the React reconciler. When a component suspends:

1. React calls `hideInstance` on the suspending subtree
2. The fallback renders in its place
3. When the promise resolves, `unhideInstance` reveals the content

This preserves component state during suspension - the component isn't unmounted, just hidden.
