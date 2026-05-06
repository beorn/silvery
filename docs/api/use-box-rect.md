# useBoxRect

Returns the computed dimensions of the component's content area — width, height, and position. Components use this to adapt to their available space during render.

Two call signatures: a **reactive** form that re-renders the component on every rect change, and a **callback** form that observes without triggering React updates. Pick deliberately — see [Layout decisions vs. observation](#layout-decisions-vs-observation).

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

## Return Value

| Property | Type     | Description                        |
| -------- | -------- | ---------------------------------- |
| `width`  | `number` | Computed width in characters       |
| `height` | `number` | Computed height in lines           |
| `x`      | `number` | X position from terminal left edge |
| `y`      | `number` | Y position from terminal top edge  |

## First Render Behavior

On the first render, dimensions are `{ width: 0, height: 0, x: 0, y: 0 }`. This happens because:

1. **First render**: React renders component structure
2. **Layout phase**: Layout engine computes dimensions
3. **Second render**: Components re-render with actual dimensions

Both renders happen before the first terminal paint, so this is usually invisible.

### Handling Zero Dimensions

If your component breaks on `width=0`, add a guard:

```tsx
function Header() {
  const { width } = useBoxRect()

  if (width === 0) return null // Or a loading state

  return <Text>{"=".repeat(width)}</Text>
}
```

Or handle it in your rendering logic:

```tsx
function ProgressBar({ progress }: { progress: number }) {
  const { width } = useBoxRect()

  // Safe even when width=0
  const filled = Math.floor(width * progress)
  const empty = Math.max(0, width - filled)

  return (
    <Text>
      {"#".repeat(filled)}
      {"-".repeat(empty)}
    </Text>
  )
}
```

## Examples

### Responsive Layout

```tsx
function ResponsiveBox() {
  const { width } = useBoxRect()

  // Stack vertically on narrow terminals
  const direction = width < 60 ? "column" : "row"

  return (
    <Box flexDirection={direction}>
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

## Layout decisions vs. observation

Silvery's renderer runs **measure → layout → React render** in a bounded convergence loop. A component that reads `useBoxRect()` and renders something whose width feeds back into the parent's layout participates in that loop. The convergence cap stops it from running forever, but the visible churn during a burst is the bug. There are two valid patterns; pick deliberately.

### 1. Observation — use the callback form

If you only need the rect to update an external registry, register a position for cross-component navigation, or feed a debug overlay, use the callback form. It subscribes to the layout signal without re-rendering the component.

```tsx
function Card({ id }: { id: string }) {
  useBoxRect((rect) => positionRegistry.set(id, rect))
  return <Box>...</Box>
}
```

This is the right choice for hot paths like large lists. Re-rendering on every rect change there is prohibitive; the callback form has zero re-render cost.

### 2. Bucketed decisions — classify, don't compare raw widths

When the rect drives a layout decision, route the measurement through a small stable set of zones rather than branching on raw width. [`useResponsiveValue()`](/api/use-responsive-value) is the canonical bucketer. Decisions branch on the zone (`"sm" | "md" | "lg"`), so two consecutive renders that measure 89 and 91 columns both resolve to the same `"md"` zone and produce the same tree.

```tsx
const zone = useResponsiveValue<Zone>({
  default: "default", sm: "sm", md: "md", lg: "lg",
})
return zone === "lg" ? <Wide /> : <Narrow />
```

Add **hysteresis** when the zone boundary triggers a structural change (mounting/unmounting a subtree, toggling a panel) and the two branches contribute different widths to the parent — otherwise a measurement near the boundary will ping-pong, especially under bursty resizes from terminal multiplexers that fire several `SIGWINCH`s per workspace switch. A small debounce on the zone (e.g. 200–300 ms before the new zone "settles") lets the layout converge before the structural change re-enters the loop.

### The trap

The trap is a width-driven binary structural toggle whose two branches have different widths and whose boundary lives at a frequently-measured value. Each pass measures, picks the *other* branch, re-measures, picks the *first* branch.

```tsx
// Wrong — binary structural toggle on raw width
function Panel() {
  const { width } = useBoxRect()
  if (width >= 90) return <Wide />   // contributes 80 cols
  return <Narrow />                  // contributes 60 cols
  // Wide unmounts → parent measures 60 → "<90" → renders Narrow
  // Narrow renders → siblings give Panel more space → "≥90" → renders Wide
  // Loop until convergence cap or accidental settle.
}
```

The fix is one of the two patterns above. The natural choice for "panel mounts above width N" is bucketing with hysteresis at the boundary.

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
