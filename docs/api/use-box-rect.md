# useBoxRect

Returns the computed dimensions of the component's content area — width, height, and position. Components use this to adapt to their available space during render.

The hook returns the **committed** rect: the value as of the most recent event-batch commit boundary. Within a single batch the returned rect is invariant across every convergence pass; React renders see one stable value per batch. After the batch's commit boundary fires, the next batch sees the new value.

This is the structural fix for the "render reads useBoxRect AND writes a layout-affecting prop based on it" feedback loop. A render that branches on the read value produces the same output every pass, so the convergence loop terminates in one pass — no feedback edge can form by construction.

## Import

```tsx
import { useBoxRect } from "silvery"
```

## Usage

```tsx
function SizedBox() {
  const { width, height } = useBoxRect()

  return (
    <Box borderStyle="single">
      <Text>
        Size: {width}x{height}
      </Text>
    </Box>
  )
}
```

## Signature

```ts
function useBoxRect(): Rect
```

| Property | Type     | Description                        |
| -------- | -------- | ---------------------------------- |
| `width`  | `number` | Computed width in characters       |
| `height` | `number` | Computed height in lines           |
| `x`      | `number` | X position from terminal left edge |
| `y`      | `number` | Y position from terminal top edge  |

## First Render Behavior — one frame late by design

On the first render, `useBoxRect()` returns `{ width: 0, height: 0, x: 0, y: 0 }`. After the first commit boundary, the hook re-renders with the measured dimensions. Both renders happen before the first paint reaches the terminal in the typical case, so the empty-rect frame is invisible — but components that build on top of measurement (e.g. a banner that picks an ASCII-art tier from the available width) may show their fallback for one frame on mount.

```tsx
function Header() {
  const { width } = useBoxRect()

  if (width === 0) return null // skip the empty-rect frame

  return <Text>{"=".repeat(width)}</Text>
}
```

For components that need same-frame measurements (e.g. an `Image` that publishes Kitty escape sequences positioned at the host node's rect), use a layout effect with `useAgNode()` to read `node.boxRect` directly — that's the in-flight value, written every layout pass. This is recommended only for leaf primitives in the silvery framework itself.

## Examples

### Responsive Layout — prefer `useResponsiveBoxProps`

For responsive layout decisions, use [`useResponsiveBoxProps`](/api/use-responsive-box-props) — it's declarative, batch-invariant, and never reads measured rects:

```tsx
function ResponsiveBox({ children }: { children: React.ReactNode }) {
  const layout = useResponsiveBoxProps({
    default: { flexDirection: "column" },
    md: { flexDirection: "row" },
  })
  return (
    <Box {...layout}>
      <Box flexGrow={1}>
        <Text>Panel 1</Text>
      </Box>
      <Box flexGrow={1}>
        <Text>Panel 2</Text>
      </Box>
    </Box>
  )
}
```

When the breakpoint logic genuinely depends on a measured rect (not the global terminal width), branching on `useBoxRect()` is safe under deferred semantics:

```tsx
function ResponsiveCard() {
  const { width } = useBoxRect()
  const direction = width < 60 ? "column" : "row"
  return (
    <Box flexDirection={direction}>
      <Box flexGrow={1}><Text>Panel 1</Text></Box>
      <Box flexGrow={1}><Text>Panel 2</Text></Box>
    </Box>
  )
}
```

The committed rect is invariant within a batch, so the render produces the same output every convergence pass — the historical "ping-pong at boundary" anti-pattern is impossible by construction.

### Centered Text

```tsx
function CenteredText({ children }: { children: string }) {
  const { width } = useBoxRect()

  const padding = Math.max(0, Math.floor((width - children.length) / 2))

  return (
    <Text>
      {" ".repeat(padding)}
      {children}
    </Text>
  )
}
```

### Truncating Long Text

```tsx
function TruncatedTitle({ title }: { title: string }) {
  const { width } = useBoxRect()

  if (title.length <= width) {
    return <Text>{title}</Text>
  }

  return <Text>{title.slice(0, width - 1)}...</Text>
}
```

### Debug Overlay

```tsx
function DebugOverlay({ children }: { children: React.ReactNode }) {
  const { width, height, x, y } = useBoxRect()

  return (
    <Box flexDirection="column">
      {children}
      <Text dimColor>
        {width}x{height} @ ({x},{y})
      </Text>
    </Box>
  )
}
```

### Proportional Columns

```tsx
function ProportionalColumns() {
  const { width } = useBoxRect()

  // 30% / 70% split
  const leftWidth = Math.floor(width * 0.3)
  const rightWidth = width - leftWidth

  return (
    <Box flexDirection="row">
      <Box width={leftWidth} borderStyle="single">
        <Text>Sidebar</Text>
      </Box>
      <Box width={rightWidth} borderStyle="single">
        <Text>Main content</Text>
      </Box>
    </Box>
  )
}
```

## Comparison with Ink

**Ink**: No way to get dimensions. Must calculate and pass width manually.

```tsx
// Ink: Thread width through props
function App({ terminalWidth }) {
  const contentWidth = terminalWidth - 4 // Account for borders
  return (
    <Box borderStyle="single">
      <Content width={contentWidth} />
    </Box>
  )
}

function Content({ width }) {
  const columnWidth = Math.floor(width / 3)
  return (
    <Box flexDirection="row">
      <Column width={columnWidth} />
      <Column width={columnWidth} />
      <Column width={columnWidth} />
    </Box>
  )
}
```

**Silvery**: Just ask for dimensions where needed.

```tsx
// Silvery: Components know their size
function App() {
  return (
    <Box borderStyle="single">
      <Content />
    </Box>
  )
}

function Content() {
  return (
    <Box flexDirection="row">
      <Column />
      <Column />
      <Column />
    </Box>
  )
}

function Column() {
  const { width } = useBoxRect() // Only query where actually needed
  // Use width for truncation, responsive behavior, etc.
}
```

## See also

- [`useScrollRect`](/api/use-scroll-rect) — scroll-adjusted position (pre-sticky clamping)
- [`useScreenRect`](/api/use-screen-rect) — actual paint position on the terminal screen
- [`useResponsiveBoxProps`](/api/use-responsive-box-props) — declarative responsive layout primitive
- [`useResponsiveValue`](/api/use-responsive-value) — for non-Box-prop responsive values
