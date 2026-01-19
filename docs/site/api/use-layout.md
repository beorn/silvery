# useLayout

**InkX only** - Returns the computed dimensions of the component's container.

This is the key addition in InkX. Components can query their actual size instead of manually threading width props.

## Import

```tsx
import { useLayout } from "inkx";
```

## Usage

```tsx
function SizedBox() {
  const { width, height } = useLayout();

  return (
    <Box borderStyle="single">
      <Text>Size: {width}x{height}</Text>
    </Box>
  );
}
```

## Return Value

| Property | Type | Description |
|----------|------|-------------|
| `width` | `number` | Computed width in characters |
| `height` | `number` | Computed height in lines |
| `x` | `number` | X position from terminal left edge |
| `y` | `number` | Y position from terminal top edge |

## First Render Behavior

On the first render, dimensions are `{ width: 0, height: 0, x: 0, y: 0 }`. This happens because:

1. **First render**: React renders component structure
2. **Layout phase**: Yoga computes dimensions
3. **Second render**: Components re-render with actual dimensions

Both renders happen before the first terminal paint, so this is usually invisible.

### Handling Zero Dimensions

If your component breaks on `width=0`, add a guard:

```tsx
function Header() {
  const { width } = useLayout();

  if (width === 0) return null; // Or a loading state

  return <Text>{"=".repeat(width)}</Text>;
}
```

Or handle it in your rendering logic:

```tsx
function ProgressBar({ progress }: { progress: number }) {
  const { width } = useLayout();

  // Safe even when width=0
  const filled = Math.floor(width * progress);
  const empty = Math.max(0, width - filled);

  return (
    <Text>
      {"█".repeat(filled)}{"░".repeat(empty)}
    </Text>
  );
}
```

## Examples

### Responsive Layout

```tsx
function ResponsiveBox() {
  const { width } = useLayout();

  // Stack vertically on narrow terminals
  const direction = width < 60 ? "column" : "row";

  return (
    <Box flexDirection={direction}>
      <Box flexGrow={1}><Text>Panel 1</Text></Box>
      <Box flexGrow={1}><Text>Panel 2</Text></Box>
    </Box>
  );
}
```

### Centered Text

```tsx
function CenteredText({ children }: { children: string }) {
  const { width } = useLayout();

  const padding = Math.max(0, Math.floor((width - children.length) / 2));

  return <Text>{" ".repeat(padding)}{children}</Text>;
}
```

### Truncating Long Text

```tsx
function TruncatedTitle({ title }: { title: string }) {
  const { width } = useLayout();

  if (title.length <= width) {
    return <Text>{title}</Text>;
  }

  return <Text>{title.slice(0, width - 1)}…</Text>;
}
```

### Debug Overlay

```tsx
function DebugOverlay({ children }: { children: React.ReactNode }) {
  const { width, height, x, y } = useLayout();

  return (
    <Box flexDirection="column">
      {children}
      <Text dimColor>
        {width}x{height} @ ({x},{y})
      </Text>
    </Box>
  );
}
```

### Proportional Columns

```tsx
function ProportionalColumns() {
  const { width } = useLayout();

  // 30% / 70% split
  const leftWidth = Math.floor(width * 0.3);
  const rightWidth = width - leftWidth;

  return (
    <Box flexDirection="row">
      <Box width={leftWidth} borderStyle="single">
        <Text>Sidebar</Text>
      </Box>
      <Box width={rightWidth} borderStyle="single">
        <Text>Main content</Text>
      </Box>
    </Box>
  );
}
```

## Comparison with Ink

**Ink**: No way to get dimensions. Must calculate and pass width manually.

```tsx
// Ink: Thread width through props
function App({ terminalWidth }) {
  const contentWidth = terminalWidth - 4; // Account for borders
  return (
    <Box borderStyle="single">
      <Content width={contentWidth} />
    </Box>
  );
}

function Content({ width }) {
  const columnWidth = Math.floor(width / 3);
  return (
    <Box flexDirection="row">
      <Column width={columnWidth} />
      <Column width={columnWidth} />
      <Column width={columnWidth} />
    </Box>
  );
}
```

**InkX**: Just ask for dimensions where needed.

```tsx
// InkX: Components know their size
function App() {
  return (
    <Box borderStyle="single">
      <Content />
    </Box>
  );
}

function Content() {
  return (
    <Box flexDirection="row">
      <Column />
      <Column />
      <Column />
    </Box>
  );
}

function Column() {
  const { width } = useLayout(); // Only query where actually needed
  // Use width for truncation, responsive behavior, etc.
}
```
