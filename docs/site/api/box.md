# Box

The primary layout component. Uses Yoga (flexbox) for layout.

## Import

```tsx
import { Box } from "inkx"
```

## Usage

```tsx
<Box flexDirection="row" padding={1} borderStyle="single">
  <Text>Hello</Text>
  <Text>World</Text>
</Box>
```

## Props

### Layout - Flex Direction

| Prop            | Type                                                     | Default    | Description                               |
| --------------- | -------------------------------------------------------- | ---------- | ----------------------------------------- |
| `flexDirection` | `"row" \| "column" \| "row-reverse" \| "column-reverse"` | `"column"` | Main axis direction                       |
| `flexWrap`      | `"wrap" \| "nowrap" \| "wrap-reverse"`                   | `"nowrap"` | Whether to wrap children                  |
| `gap`           | `number`                                                 | `0`        | Gap between children (in both directions) |

### Layout - Flex Item

| Prop         | Type               | Default | Description                             |
| ------------ | ------------------ | ------- | --------------------------------------- |
| `flexGrow`   | `number`           | `0`     | How much to grow relative to siblings   |
| `flexShrink` | `number`           | `1`     | How much to shrink relative to siblings |
| `flexBasis`  | `number \| string` | -       | Initial size before grow/shrink         |

### Layout - Alignment

| Prop             | Type                                                                                            | Default        | Description                      |
| ---------------- | ----------------------------------------------------------------------------------------------- | -------------- | -------------------------------- |
| `alignItems`     | `"flex-start" \| "flex-end" \| "center" \| "stretch" \| "baseline"`                             | `"stretch"`    | Cross-axis alignment of children |
| `alignSelf`      | `"auto" \| "flex-start" \| "flex-end" \| "center" \| "stretch" \| "baseline"`                   | `"auto"`       | Override parent's alignItems     |
| `alignContent`   | `"flex-start" \| "flex-end" \| "center" \| "stretch" \| "space-between" \| "space-around"`      | -              | Alignment of wrapped lines       |
| `justifyContent` | `"flex-start" \| "flex-end" \| "center" \| "space-between" \| "space-around" \| "space-evenly"` | `"flex-start"` | Main-axis alignment of children  |

### Sizing

| Prop        | Type               | Default | Description                               |
| ----------- | ------------------ | ------- | ----------------------------------------- |
| `width`     | `number \| string` | -       | Fixed width or percentage (e.g., `"50%"`) |
| `height`    | `number \| string` | -       | Fixed height or percentage                |
| `minWidth`  | `number \| string` | -       | Minimum width                             |
| `minHeight` | `number \| string` | -       | Minimum height                            |
| `maxWidth`  | `number \| string` | -       | Maximum width                             |
| `maxHeight` | `number \| string` | -       | Maximum height                            |

### Spacing - Padding

| Prop            | Type     | Default | Description                       |
| --------------- | -------- | ------- | --------------------------------- |
| `padding`       | `number` | `0`     | Padding on all sides              |
| `paddingTop`    | `number` | `0`     | Top padding                       |
| `paddingBottom` | `number` | `0`     | Bottom padding                    |
| `paddingLeft`   | `number` | `0`     | Left padding                      |
| `paddingRight`  | `number` | `0`     | Right padding                     |
| `paddingX`      | `number` | `0`     | Horizontal padding (left + right) |
| `paddingY`      | `number` | `0`     | Vertical padding (top + bottom)   |

### Spacing - Margin

| Prop           | Type     | Default | Description         |
| -------------- | -------- | ------- | ------------------- |
| `margin`       | `number` | `0`     | Margin on all sides |
| `marginTop`    | `number` | `0`     | Top margin          |
| `marginBottom` | `number` | `0`     | Bottom margin       |
| `marginLeft`   | `number` | `0`     | Left margin         |
| `marginRight`  | `number` | `0`     | Right margin        |
| `marginX`      | `number` | `0`     | Horizontal margin   |
| `marginY`      | `number` | `0`     | Vertical margin     |

### Position

| Prop           | Type                                   | Default      | Description                                                    |
| -------------- | -------------------------------------- | ------------ | -------------------------------------------------------------- |
| `position`     | `"relative" \| "absolute" \| "sticky"` | `"relative"` | Positioning mode                                               |
| `stickyTop`    | `number`                               | `0`          | Offset from top when sticky (only with `position="sticky"`)    |
| `stickyBottom` | `number`                               | -            | Offset from bottom when sticky (only with `position="sticky"`) |

### Display

| Prop      | Type               | Default  | Description                    |
| --------- | ------------------ | -------- | ------------------------------ |
| `display` | `"flex" \| "none"` | `"flex"` | Whether to display the element |

### Border

| Prop           | Type                                                                                         | Default | Description        |
| -------------- | -------------------------------------------------------------------------------------------- | ------- | ------------------ |
| `borderStyle`  | `"single" \| "double" \| "round" \| "bold" \| "singleDouble" \| "doubleSingle" \| "classic"` | -       | Border style       |
| `borderColor`  | `string`                                                                                     | -       | Border color       |
| `borderTop`    | `boolean`                                                                                    | `true`  | Show top border    |
| `borderBottom` | `boolean`                                                                                    | `true`  | Show bottom border |
| `borderLeft`   | `boolean`                                                                                    | `true`  | Show left border   |
| `borderRight`  | `boolean`                                                                                    | `true`  | Show right border  |

### Style (Colors and Text Formatting)

| Prop              | Type      | Default | Description                                      |
| ----------------- | --------- | ------- | ------------------------------------------------ |
| `backgroundColor` | `string`  | -       | Fill the entire box area with a background color |
| `color`           | `string`  | -       | Text color for child content                     |
| `bold`            | `boolean` | `false` | Bold text                                        |
| `dim`             | `boolean` | `false` | Dimmed (faint) text                              |
| `dimColor`        | `boolean` | `false` | Alias for `dim` (Ink compatibility)              |
| `italic`          | `boolean` | `false` | Italic text                                      |
| `underline`       | `boolean` | `false` | Underlined text                                  |
| `strikethrough`   | `boolean` | `false` | Strikethrough text                               |
| `inverse`         | `boolean` | `false` | Swap foreground/background colors                |

::: tip Box vs Text backgroundColor
Unlike Ink, inkx's Box supports `backgroundColor` directly. The background fills
the entire computed layout area, so you don't need Text elements with spaces to
create filled regions.
:::

### Overflow (Inkx Only)

| Prop       | Type                                | Default     | Description                                           |
| ---------- | ----------------------------------- | ----------- | ----------------------------------------------------- |
| `overflow` | `"visible" \| "hidden" \| "scroll"` | `"visible"` | Overflow behavior                                     |
| `scrollTo` | `number`                            | -           | Child index to keep visible (for `overflow="scroll"`) |

### Callbacks

| Prop       | Type                               | Default | Description                    |
| ---------- | ---------------------------------- | ------- | ------------------------------ |
| `onLayout` | `(layout: ComputedLayout) => void` | -       | Called when layout is computed |

The `ComputedLayout` type:

```ts
interface ComputedLayout {
  x: number // X position relative to root
  y: number // Y position relative to root
  width: number // Computed width in columns
  height: number // Computed height in rows
}
```

## Border Styles Reference

| Style          | Example                   | Characters Used                    |
| -------------- | ------------------------- | ---------------------------------- |
| `single`       | `┌─┐`<br>`│ │`<br>`└─┘`   | Light box-drawing characters       |
| `double`       | `╔═╗`<br>`║ ║`<br>`╚═╝`   | Double-line box-drawing            |
| `round`        | `╭─╮`<br>`│ │`<br>`╰─╯`   | Rounded corners, single lines      |
| `bold`         | `┏━┓`<br>`┃ ┃`<br>`┗━┛`   | Heavy/bold box-drawing             |
| `singleDouble` | `╓─╖`<br>`║ ║`<br>`╙─╜`   | Single horizontal, double vertical |
| `doubleSingle` | `╒═╕`<br>`│ │`<br>`╘═╛`   | Double horizontal, single vertical |
| `classic`      | `+-+`<br>`\| \|`<br>`+-+` | ASCII characters only              |

## Examples

### Row Layout

```tsx
<Box flexDirection="row" gap={2}>
  <Text>Left</Text>
  <Text>Middle</Text>
  <Text>Right</Text>
</Box>
```

Output:

```
Left  Middle  Right
```

### Column Layout

```tsx
<Box flexDirection="column">
  <Text>Line 1</Text>
  <Text>Line 2</Text>
  <Text>Line 3</Text>
</Box>
```

Output:

```
Line 1
Line 2
Line 3
```

### Equal Width Columns

```tsx
<Box flexDirection="row">
  <Box flexGrow={1} borderStyle="single">
    <Text>Column 1</Text>
  </Box>
  <Box flexGrow={1} borderStyle="single">
    <Text>Column 2</Text>
  </Box>
  <Box flexGrow={1} borderStyle="single">
    <Text>Column 3</Text>
  </Box>
</Box>
```

### Centered Content

```tsx
<Box justifyContent="center" alignItems="center" height={10}>
  <Text>Centered!</Text>
</Box>
```

### Fixed and Flexible Layout

Use `flexShrink={0}` for fixed elements and `flexGrow={1}` for flexible areas:

```tsx
<Box flexDirection="column" height="100%">
  {/* Fixed header - won't shrink */}
  <Box height={1} flexShrink={0} backgroundColor="blue">
    <Text color="white" bold>
      Header
    </Text>
  </Box>

  {/* Flexible content - fills remaining space */}
  <Box flexGrow={1}>
    <Text>Content area</Text>
  </Box>

  {/* Fixed footer - won't shrink */}
  <Box height={1} flexShrink={0}>
    <Text dimColor>Footer</Text>
  </Box>
</Box>
```

### Scrollable List

```tsx
const [selected, setSelected] = useState(0)

;<Box flexDirection="column" height={5} overflow="scroll" scrollTo={selected}>
  {items.map((item, i) => (
    <Text key={i} inverse={i === selected}>
      {item}
    </Text>
  ))}
</Box>
```

### Sticky Header in Scrollable Container

```tsx
<Box flexDirection="column" height={10} overflow="scroll" scrollTo={selected}>
  {/* This header stays visible when scrolling */}
  <Box position="sticky" stickyTop={0} backgroundColor="blue">
    <Text color="white" bold>
      Pinned Header
    </Text>
  </Box>

  {items.map((item, i) => (
    <Text key={i} inverse={i === selected}>
      {item}
    </Text>
  ))}
</Box>
```

### Absolute Positioning

```tsx
<Box position="relative" width={40} height={10}>
  <Text>Background content</Text>

  {/* Positioned absolutely within the parent */}
  <Box position="absolute">
    <Text color="red">Overlay</Text>
  </Box>
</Box>
```

### Border Styles

```tsx
// Single line border
<Box borderStyle="single">
  <Text>Content</Text>
</Box>

// Rounded corners
<Box borderStyle="round">
  <Text>Content</Text>
</Box>

// Double line border
<Box borderStyle="double">
  <Text>Content</Text>
</Box>

// Colored border
<Box borderStyle="single" borderColor="green">
  <Text>Content</Text>
</Box>

// Partial borders
<Box borderStyle="single" borderTop borderBottom borderLeft={false} borderRight={false}>
  <Text>Top and bottom only</Text>
</Box>
```

### Filled Background

```tsx
// Header bar with cyan background
<Box backgroundColor="cyan" paddingX={1}>
  <Text color="black" bold>
    Title
  </Text>
</Box>

// Sidebar indicator that fills available height
<Box
  width={1}
  flexGrow={1}
  backgroundColor="gray"
  justifyContent="center"
  alignItems="center"
>
  <Text color="white">›</Text>
</Box>
```

### Using onLayout

```tsx
function MeasuredBox() {
  const [size, setSize] = useState({ width: 0, height: 0 })

  return (
    <Box flexGrow={1} onLayout={(layout) => setSize({ width: layout.width, height: layout.height })}>
      <Text>
        Size: {size.width}x{size.height}
      </Text>
    </Box>
  )
}
```

### Conditional Display

```tsx
<Box flexDirection="column">
  <Text>Always visible</Text>
  <Box display={showDetails ? "flex" : "none"}>
    <Text>Conditionally shown</Text>
  </Box>
</Box>
```

### Space Distribution

```tsx
// Evenly distributed items
<Box flexDirection="row" justifyContent="space-between" width={40}>
  <Text>Left</Text>
  <Text>Center</Text>
  <Text>Right</Text>
</Box>

// Equal spacing around items
<Box flexDirection="row" justifyContent="space-around" width={40}>
  <Text>A</Text>
  <Text>B</Text>
  <Text>C</Text>
</Box>

// Equal spacing between items (including edges)
<Box flexDirection="row" justifyContent="space-evenly" width={40}>
  <Text>A</Text>
  <Text>B</Text>
  <Text>C</Text>
</Box>
```

### Percentage Sizing

```tsx
<Box flexDirection="row" width="100%">
  {/* Takes 30% of parent width */}
  <Box width="30%" backgroundColor="blue">
    <Text>Sidebar</Text>
  </Box>

  {/* Takes 70% of parent width */}
  <Box width="70%" backgroundColor="gray">
    <Text>Main content</Text>
  </Box>
</Box>
```
