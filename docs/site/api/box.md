# Box

The primary layout component. Uses Yoga (flexbox) for layout.

## Import

```tsx
import { Box } from "inkx";
```

## Usage

```tsx
<Box flexDirection="row" padding={1} borderStyle="single">
  <Text>Hello</Text>
  <Text>World</Text>
</Box>
```

## Props

### Layout

| Prop             | Type                                                                                            | Default        | Description                             |
| ---------------- | ----------------------------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| `flexDirection`  | `"row" \| "column" \| "row-reverse" \| "column-reverse"`                                        | `"row"`        | Main axis direction                     |
| `flexGrow`       | `number`                                                                                        | `0`            | How much to grow relative to siblings   |
| `flexShrink`     | `number`                                                                                        | `1`            | How much to shrink relative to siblings |
| `flexBasis`      | `number \| string`                                                                              | -              | Initial size before grow/shrink         |
| `flexWrap`       | `"wrap" \| "nowrap" \| "wrap-reverse"`                                                          | `"nowrap"`     | Whether to wrap children                |
| `alignItems`     | `"flex-start" \| "flex-end" \| "center" \| "stretch"`                                           | `"stretch"`    | Cross-axis alignment of children        |
| `alignSelf`      | `"auto" \| "flex-start" \| "flex-end" \| "center" \| "stretch"`                                 | `"auto"`       | Override parent's alignItems            |
| `justifyContent` | `"flex-start" \| "flex-end" \| "center" \| "space-between" \| "space-around" \| "space-evenly"` | `"flex-start"` | Main-axis alignment of children         |

### Sizing

| Prop        | Type               | Default | Description                               |
| ----------- | ------------------ | ------- | ----------------------------------------- |
| `width`     | `number \| string` | -       | Fixed width or percentage (e.g., `"50%"`) |
| `height`    | `number \| string` | -       | Fixed height or percentage                |
| `minWidth`  | `number`           | -       | Minimum width                             |
| `minHeight` | `number`           | -       | Minimum height                            |
| `maxWidth`  | `number`           | -       | Maximum width                             |
| `maxHeight` | `number`           | -       | Maximum height                            |

### Spacing

| Prop            | Type     | Default | Description                       |
| --------------- | -------- | ------- | --------------------------------- |
| `padding`       | `number` | `0`     | Padding on all sides              |
| `paddingTop`    | `number` | `0`     | Top padding                       |
| `paddingBottom` | `number` | `0`     | Bottom padding                    |
| `paddingLeft`   | `number` | `0`     | Left padding                      |
| `paddingRight`  | `number` | `0`     | Right padding                     |
| `paddingX`      | `number` | `0`     | Horizontal padding (left + right) |
| `paddingY`      | `number` | `0`     | Vertical padding (top + bottom)   |
| `margin`        | `number` | `0`     | Margin on all sides               |
| `marginTop`     | `number` | `0`     | Top margin                        |
| `marginBottom`  | `number` | `0`     | Bottom margin                     |
| `marginLeft`    | `number` | `0`     | Left margin                       |
| `marginRight`   | `number` | `0`     | Right margin                      |
| `marginX`       | `number` | `0`     | Horizontal margin                 |
| `marginY`       | `number` | `0`     | Vertical margin                   |
| `gap`           | `number` | `0`     | Gap between children              |

### Style (Inkx Only)

| Prop              | Type     | Default | Description                                      |
| ----------------- | -------- | ------- | ------------------------------------------------ |
| `backgroundColor` | `string` | -       | Fill the entire box area with a background color |

::: tip Box vs Text backgroundColor
Unlike Ink, inkx's Box supports `backgroundColor` directly. The background fills
the entire computed layout area, so you don't need Text elements with spaces to
create filled regions.
:::

### Border

| Prop           | Type                                                                                         | Default | Description        |
| -------------- | -------------------------------------------------------------------------------------------- | ------- | ------------------ |
| `borderStyle`  | `"single" \| "double" \| "round" \| "bold" \| "singleDouble" \| "doubleSingle" \| "classic"` | -       | Border style       |
| `borderColor`  | `string`                                                                                     | -       | Border color       |
| `borderTop`    | `boolean`                                                                                    | `true`  | Show top border    |
| `borderBottom` | `boolean`                                                                                    | `true`  | Show bottom border |
| `borderLeft`   | `boolean`                                                                                    | `true`  | Show left border   |
| `borderRight`  | `boolean`                                                                                    | `true`  | Show right border  |

### Overflow (Inkx Only)

| Prop       | Type                                | Default     | Description                                           |
| ---------- | ----------------------------------- | ----------- | ----------------------------------------------------- |
| `overflow` | `"visible" \| "hidden" \| "scroll"` | `"visible"` | Overflow behavior                                     |
| `scrollTo` | `number`                            | -           | Child index to keep visible (for `overflow="scroll"`) |

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

### Scrollable List

```tsx
const [selected, setSelected] = useState(0);

<Box flexDirection="column" height={5} overflow="scroll" scrollTo={selected}>
  {items.map((item, i) => (
    <Text key={i} inverse={i === selected}>
      {item}
    </Text>
  ))}
</Box>;
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
