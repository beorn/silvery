# Components

Inkx provides the same components as Ink, with some enhancements.

## Box

The primary layout component. Uses Yoga (flexbox) for layout.

```tsx
import { Box, Text } from "inkx"

;<Box flexDirection="row" justifyContent="space-between">
  <Text>Left</Text>
  <Text>Right</Text>
</Box>
```

### New in Inkx: Scrolling

Use `overflow="scroll"` with `scrollTo` for automatic scrolling:

```tsx
<Box flexDirection="column" overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i} inverse={i === selectedIndex}>
      {item}
    </Text>
  ))}
</Box>
```

See [Scrolling Guide](/guide/scrolling) for details.

### Props

| Prop             | Type                                                                          | Default        | Description                                |
| ---------------- | ----------------------------------------------------------------------------- | -------------- | ------------------------------------------ |
| `flexDirection`  | `"row" \| "column" \| "row-reverse" \| "column-reverse"`                      | `"row"`        | Main axis direction                        |
| `flexGrow`       | `number`                                                                      | `0`            | Grow factor                                |
| `flexShrink`     | `number`                                                                      | `1`            | Shrink factor                              |
| `flexBasis`      | `number \| string`                                                            | -              | Initial size                               |
| `justifyContent` | `"flex-start" \| "flex-end" \| "center" \| "space-between" \| "space-around"` | `"flex-start"` | Main axis alignment                        |
| `alignItems`     | `"flex-start" \| "flex-end" \| "center" \| "stretch"`                         | `"stretch"`    | Cross axis alignment                       |
| `padding`        | `number`                                                                      | `0`            | Padding on all sides                       |
| `paddingX`       | `number`                                                                      | `0`            | Horizontal padding                         |
| `paddingY`       | `number`                                                                      | `0`            | Vertical padding                           |
| `margin`         | `number`                                                                      | `0`            | Margin on all sides                        |
| `width`          | `number \| string`                                                            | -              | Fixed or percentage width                  |
| `height`         | `number \| string`                                                            | -              | Fixed or percentage height                 |
| `minWidth`       | `number`                                                                      | -              | Minimum width                              |
| `minHeight`      | `number`                                                                      | -              | Minimum height                             |
| `borderStyle`    | `"single" \| "double" \| "round" \| "bold" \| "classic"`                      | -              | Border style                               |
| `borderColor`    | `string`                                                                      | -              | Border color                               |
| `overflow`       | `"visible" \| "hidden" \| "scroll"`                                           | `"visible"`    | **Inkx only**: Overflow behavior           |
| `scrollTo`       | `number`                                                                      | -              | **Inkx only**: Child index to keep visible |

## Text

Renders text with styling. Supports Chalk strings.

```tsx
import { Text } from "inkx";
import chalk from "chalk";

// Basic styling
<Text color="green" bold>Success!</Text>

// Chalk strings work too
<Text>{chalk.red.bold("Error!")}</Text>
```

### New in Inkx: Auto-Truncation

Text automatically truncates to fit available width:

```tsx
<Box width={20}>
  <Text>This is a very long text that will be truncated</Text>
</Box>
// Output: "This is a very lon…"
```

Opt out with `wrap={false}` if you need overflow behavior.

### Props

| Prop              | Type                                                                              | Default      | Description                |
| ----------------- | --------------------------------------------------------------------------------- | ------------ | -------------------------- |
| `color`           | `string`                                                                          | -            | Text color                 |
| `backgroundColor` | `string`                                                                          | -            | Background color           |
| `bold`            | `boolean`                                                                         | `false`      | Bold text                  |
| `italic`          | `boolean`                                                                         | `false`      | Italic text                |
| `underline`       | `boolean`                                                                         | `false`      | Underlined text            |
| `strikethrough`   | `boolean`                                                                         | `false`      | Strikethrough text         |
| `dimColor`        | `boolean`                                                                         | `false`      | Dimmed color               |
| `inverse`         | `boolean`                                                                         | `false`      | Swap foreground/background |
| `wrap`            | `"wrap" \| "truncate" \| "truncate-start" \| "truncate-middle" \| "truncate-end"` | `"truncate"` | Text wrapping behavior     |

## Newline

Renders a newline character.

```tsx
import { Newline, Text } from "inkx";

<Text>Line 1</Text>
<Newline />
<Text>Line 2</Text>
```

## Spacer

Flexible space that expands to fill available room.

```tsx
import { Box, Spacer, Text } from "inkx"

;<Box>
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>
```

## Static

Renders content that won't be updated. Useful for logs or output that scrolls up.

```tsx
import { Static, Box, Text } from "inkx"

function App() {
  const [logs, setLogs] = useState<string[]>([])

  return (
    <Box flexDirection="column">
      <Static items={logs}>{(log, i) => <Text key={i}>{log}</Text>}</Static>
      <Text>Current status...</Text>
    </Box>
  )
}
```

### Props

| Prop       | Type                                    | Description              |
| ---------- | --------------------------------------- | ------------------------ |
| `items`    | `T[]`                                   | Array of items to render |
| `children` | `(item: T, index: number) => ReactNode` | Render function          |
