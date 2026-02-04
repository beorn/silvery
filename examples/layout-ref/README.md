# Layout Ref Example

Demonstrates imperative access to layout information via refs and callbacks.

## Run

```bash
bun run examples/layout-ref/index.tsx
```

## Controls

- **i**: Inspect the imperative access demo box
- **Esc**: Quit

## Features Demonstrated

### forwardRef on Box

```tsx
import { Box, type BoxHandle } from "inkx"

function MyComponent() {
  const boxRef = useRef<BoxHandle>(null)

  return <Box ref={boxRef}>Content</Box>
}
```

Box (and Text) support `forwardRef`, allowing you to attach a ref and access the underlying layout node.

### BoxHandle Methods

```tsx
const boxRef = useRef<BoxHandle>(null)

// After render:
const content = boxRef.current?.getContentRect() // { x, y, width, height }
const screen = boxRef.current?.getScreenRect() // Absolute screen coordinates
const node = boxRef.current?.getNode() // Underlying Yoga/Flexx node
```

- `getContentRect()`: Returns the component's dimensions in content coordinates (relative to parent padding)
- `getScreenRect()`: Returns absolute screen coordinates (useful for overlays)
- `getNode()`: Returns the underlying layout engine node (Yoga or Flexx)

### onLayout Callback

```tsx
<Box onLayout={(layout) => console.log("Size:", layout.width, layout.height)}>
  <Text>Resizable content</Text>
</Box>
```

The `onLayout` prop is called whenever the component's dimensions change. The callback receives `{ x, y, width, height }` in content coordinates.

## Use Cases

- **Overlays**: Position tooltips or popups relative to a component
- **Animations**: Respond to size changes for smooth transitions
- **Debugging**: Log layout information during development
- **Integration**: Pass dimensions to non-React code (e.g., canvas drawing)

## Declarative vs Imperative

Most of the time, use `useContentRect()` for declarative access:

```tsx
function ResponsiveComponent() {
  const { width } = useContentRect()
  return <Text>{width > 40 ? "Wide" : "Narrow"}</Text>
}
```

Use refs and `onLayout` when you need:

- Access from outside React's render cycle
- To pass dimensions to parent components
- Integration with imperative APIs
