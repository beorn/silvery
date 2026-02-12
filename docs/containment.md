# Layout Containment: Preventing Feedback Loops

When a component reads its own size and uses that to change its content, a potential infinite loop exists: the content changes layout, the layout changes size, the size changes content, and so on. inkx prevents this with a bounded feedback loop in its render pipeline, similar to how CSS containment rules prevent infinite relayout with Container Queries.

This document explains the problem, how inkx solves it, and what patterns are safe or dangerous.

---

## The Problem

Consider a component that uses `useContentRect()` to read its own dimensions:

```tsx
function Header() {
  const { width } = useContentRect()
  return <Text>{"=".repeat(width)}</Text>
}
```

This creates a circular dependency:

1. React renders `Header` -- but dimensions are unknown yet (returns `0x0`)
2. Layout engine calculates dimensions (say, `width: 60`)
3. `useContentRect()` receives the new dimensions via layout notification
4. `forceUpdate()` triggers a React re-render
5. `Header` re-renders with `width: 60`, producing 60 `=` characters
6. Layout engine runs again -- but the content didn't change the box width, so layout is stable

In step 6, if the component instead changed its own box dimensions based on the size it read, layout would change again, triggering another notification, another re-render, another layout -- an infinite loop.

This is the same fundamental problem that CSS Container Queries face. Browsers solve it with CSS containment (size containment prevents a container's children from affecting its size). inkx solves it with a bounded iteration loop.

---

## How inkx Solves It

### The Layout Feedback Loop

inkx's render pipeline has a feedback loop in its `doRender()` function (in `renderer.ts`). After each pipeline execution, it checks whether React committed new work from layout notifications. If so, it re-runs the pipeline, up to a maximum number of iterations:

```
for iteration in 0..MAX_LAYOUT_ITERATIONS:
    hadReactCommit = false

    act(() => {
        executeRender(root, cols, rows, prevBuffer)
        // Phase 2.7: notifyLayoutSubscribers fires forceUpdate/setState
        // from useContentRect, onLayout, etc.
    })
    // act() flushes all pending React state updates

    if !hadReactCommit:
        break   // Layout is stable, done
```

`MAX_LAYOUT_ITERATIONS` is 5. This means inkx allows up to 5 rounds of layout-then-React-update before it stops iterating. In practice, well-behaved components stabilize in 2 iterations (first render with `0x0`, second render with real dimensions).

### How Stability Detection Works

The key mechanism is the `hadReactCommit` flag:

1. The `createContainer()` callback sets `hadReactCommit = true` whenever React commits new work.
2. `executeRender()` runs inside `act()`, which flushes all pending React state updates synchronously.
3. After `act()` completes, if `hadReactCommit` is false, no component re-rendered in response to layout notifications -- the layout is stable.

### The Pipeline Phases

Each iteration of the loop runs the full 5-phase pipeline:

| Phase | Name          | What Happens                                                          |
| ----- | ------------- | --------------------------------------------------------------------- |
| 1     | Measure       | Measure intrinsic content sizes for `fit-content` nodes               |
| 2     | Layout        | Run flexbox layout engine, propagate dimensions to all nodes          |
| 2.5   | Scroll        | Calculate scroll state for `overflow="scroll"` containers             |
| 2.6   | Screen Rect   | Calculate screen-relative positions (accounting for scroll offsets)   |
| 2.7   | Notify        | Fire layout subscriber callbacks (`useContentRect`, `onLayout`, etc.) |
| 3     | Content       | Render each node to the terminal buffer                               |
| 4     | Diff & Output | Compare with previous buffer, emit minimal ANSI                       |

Phase 2.7 is where the feedback happens. Layout subscribers call `forceUpdate()` or `setState()`, which queue React updates. These are flushed by `act()`, and if any committed, the loop runs another iteration.

---

## Safe Patterns

These patterns are safe because they converge to a stable layout within 2 iterations.

### Reading size to adapt content (not layout)

The most common pattern: use dimensions to decide _what content to show_, without changing the component's own layout constraints.

```tsx
// SAFE: Reading width to truncate text
function Breadcrumb({ path }: { path: string }) {
  const { width } = useContentRect()
  const display = path.length > width ? "..." + path.slice(-(width - 3)) : path
  return <Text>{display}</Text>
}
```

```tsx
// SAFE: Reading width to repeat a character
function Divider() {
  const { width } = useContentRect()
  return <Text dim>{"─".repeat(width)}</Text>
}
```

```tsx
// SAFE: Reading dimensions to choose between layouts
function Sidebar({ items }: { items: Item[] }) {
  const { width } = useContentRect()
  const compact = width < 30

  return (
    <Box flexDirection="column">
      {items.map((item) => (
        <Text key={item.id}>{compact ? item.short : item.full}</Text>
      ))}
    </Box>
  )
}
```

### Using onLayout to report dimensions to a parent

The `onLayout` prop on `Box` receives the computed layout and can call `setState` on a parent. This is safe as long as the parent doesn't use those dimensions to change the child's layout constraints.

```tsx
// SAFE: Reporting layout to parent state
function Panel({ onLayoutChange }: { onLayoutChange: (rect: Rect) => void }) {
  return (
    <Box borderStyle="single" flexGrow={1} onLayout={onLayoutChange}>
      <Text>Panel content</Text>
    </Box>
  )
}

function Dashboard() {
  const [panelSize, setPanelSize] = useState<Rect | null>(null)
  return (
    <Box flexDirection="column">
      <Panel onLayoutChange={setPanelSize} />
      {panelSize && (
        <Text dim>
          Panel: {panelSize.width}x{panelSize.height}
        </Text>
      )}
    </Box>
  )
}
```

### Using useContentRectCallback for large lists

For components that appear many times (list items, cards), use the callback variant to avoid re-renders:

```tsx
// SAFE: No re-render, just registers position
function Card({ id, onPosition }: { id: string; onPosition: (id: string, rect: Rect) => void }) {
  useContentRectCallback((rect) => onPosition(id, rect))
  return (
    <Box>
      <Text>{id}</Text>
    </Box>
  )
}
```

---

## Dangerous Patterns

These patterns risk infinite loops or wasted iterations because the component changes its own layout in response to reading its size.

### Changing own width/height based on measured size

```tsx
// DANGEROUS: Reading width to set width -- potential infinite loop
function BadComponent() {
  const { width } = useContentRect()
  // This changes the component's own layout, which changes its size,
  // which triggers another useContentRect update, which changes layout...
  return (
    <Box width={width > 40 ? 30 : 50}>
      <Text>Content</Text>
    </Box>
  )
}
```

If `width` starts at 0 (first render), the box gets `width: 50`. After layout, `useContentRect` reports `width: 50`, so the box switches to `width: 30`. After layout again, `useContentRect` reports `width: 30`, so the box switches back to `width: 50`. This oscillates until `MAX_LAYOUT_ITERATIONS` is hit.

### Conditionally adding/removing children based on size

```tsx
// DANGEROUS: Adding children changes layout, which changes size
function BadList() {
  const { height } = useContentRect()
  const itemCount = Math.floor(height / 2)

  return (
    <Box flexDirection="column" flexGrow={1}>
      {Array.from({ length: itemCount }, (_, i) => (
        <Text key={i}>Item {i}</Text>
      ))}
    </Box>
  )
}
```

This is only dangerous if the number of children affects the container's height (e.g., with `fit-content` or no explicit height constraint). With `flexGrow={1}` and a fixed parent height, this is actually safe because the container's height doesn't change when children are added.

### Setting flexGrow or flex based on measured size

```tsx
// DANGEROUS: Changing flex ratio changes layout, which changes size
function BadSplit() {
  const { width } = useContentRect()
  return (
    <Box flexGrow={width > 40 ? 2 : 1}>
      <Text>Content</Text>
    </Box>
  )
}
```

---

## How Infinite Loops Are Stopped

When a component does oscillate, inkx stops after `MAX_LAYOUT_ITERATIONS` (currently 5). The last iteration's output is used. This means:

- The component will render with whatever dimensions the 5th iteration produced.
- There is no error or warning -- the system silently stabilizes by capping iterations.
- The output may be inconsistent (the component's state may not match its actual dimensions).

This is analogous to how browsers handle Container Query cycles: the spec mandates a single layout pass, and containment rules prevent the cycle from even starting. In inkx, containment is enforced by the iteration cap rather than static rules.

### In the test renderer

The test renderer (`render()` in `renderer.ts`) uses the same feedback loop:

```typescript
function doRender(): string {
  const MAX_LAYOUT_ITERATIONS = 5

  for (let iteration = 0; iteration < MAX_LAYOUT_ITERATIONS; iteration++) {
    hadReactCommit = false

    withActEnvironment(() => {
      act(() => {
        const root = getContainerRoot(instance.container)
        executeRender(root, columns, rows, prevBuffer)
      })
    })

    if (!hadReactCommit) break
  }
  // ...
}
```

### In the production scheduler

The production `RenderScheduler` calls `executeRender()` once per scheduled render. Layout notifications fire during Phase 2.7, and any resulting React state updates trigger a new `scheduleRender()` call. The microtask-based batching coalesces rapid updates, and the scheduler's frame rate limiting (`minFrameTime: 16ms`) prevents runaway CPU usage. The feedback loop in the test renderer explicitly handles this; in production, React's own scheduling provides the same convergence.

---

## Design Rules

To keep your components safe from layout feedback loops:

1. **Never change your own layout props based on your measured size.** Reading `useContentRect()` to adapt content (text, color, visibility of child elements) is fine. Using it to set `width`, `height`, `flexGrow`, or `flexBasis` on your own container creates a cycle risk.

2. **Treat useContentRect values as read-only inputs.** Think of the dimensions like props: you can use them to decide what to render, but changing them triggers the same kind of update cascade as setting props in a `useEffect`.

3. **Use the callback variants for large lists.** `useContentRectCallback` and `useScreenRectCallback` don't trigger re-renders, eliminating the feedback loop entirely. Use them when you need position data but don't need to re-render.

4. **Fixed containers are safe.** If a component's size is determined by its parent (via `flexGrow`, fixed `width`/`height`, or percentage), then adding or removing children inside it won't change its dimensions, making layout feedback safe.

5. **Two iterations is normal.** The first render produces `0x0` dimensions. After layout, `useContentRect` fires, causing a second render with real dimensions. If your component needs more than 2 iterations, it's likely oscillating.

---

## Comparison with CSS Containment

| Aspect               | CSS Container Queries                      | inkx                               |
| -------------------- | ------------------------------------------ | ---------------------------------- |
| Prevention mechanism | Static containment rules (`contain: size`) | Bounded iteration loop (max 5)     |
| Cycle detection      | Compile-time (containment is declarative)  | Runtime (hadReactCommit flag)      |
| When cycles occur    | Browser ignores the query (spec-defined)   | Last iteration wins (silent cap)   |
| Developer feedback   | DevTools warnings                          | None (silent convergence)          |
| Typical iterations   | 1 (containment prevents re-layout)         | 2 (first render + layout feedback) |

The key difference: CSS containment prevents cycles statically by ensuring a container's size can't depend on its children's queries. inkx allows the dependency but bounds the iteration count. This is more flexible (any pattern that converges is allowed) but less predictable (oscillating patterns silently produce arbitrary results).
