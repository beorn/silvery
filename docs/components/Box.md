# Box

Flexbox container component -- the primary layout primitive. Supports all standard flexbox properties, dimensions, spacing, borders, outlines, and theming. Provides `NodeContext` to children, enabling `useBoxRect`/`useScrollRect` hooks.

## Import

```tsx
import { Box } from "silvery"
```

## Props

`BoxProps` extends `FlexboxProps`, `StyleProps`, `TestProps`, `MouseEventProps`, and `FocusEventProps`.

### Layout (FlexboxProps)

| Prop             | Type                                                                                                         | Default    | Description                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------- |
| `width`          | `number \| string`                                                                                           | --         | Box width                                                |
| `height`         | `number \| string`                                                                                           | --         | Box height                                               |
| `minWidth`       | `number \| string`                                                                                           | --         | Minimum width                                            |
| `minHeight`      | `number \| string`                                                                                           | --         | Minimum height                                           |
| `maxWidth`       | `number \| string`                                                                                           | --         | Maximum width                                            |
| `maxHeight`      | `number \| string`                                                                                           | --         | Maximum height                                           |
| `flexGrow`       | `number`                                                                                                     | --         | Flex grow factor                                         |
| `flexShrink`     | `number`                                                                                                     | --         | Flex shrink factor                                       |
| `flexBasis`      | `number \| string`                                                                                           | --         | Flex basis                                               |
| `flexDirection`  | `"row" \| "column" \| "row-reverse" \| "column-reverse"`                                                     | `"column"` | Main axis direction                                      |
| `flexWrap`       | `"nowrap" \| "wrap" \| "wrap-reverse"`                                                                       | --         | Wrap behavior                                            |
| `alignItems`     | `"flex-start" \| "flex-end" \| "center" \| "stretch" \| "baseline"`                                          | --         | Cross-axis alignment of children                         |
| `alignSelf`      | `"auto" \| "flex-start" \| "flex-end" \| "center" \| "stretch" \| "baseline"`                                | --         | Cross-axis alignment of self                             |
| `alignContent`   | `"flex-start" \| "flex-end" \| "center" \| "stretch" \| "space-between" \| "space-around" \| "space-evenly"` | --         | Multi-line cross-axis alignment                          |
| `justifyContent` | `"flex-start" \| "flex-end" \| "center" \| "space-between" \| "space-around" \| "space-evenly"`              | --         | Main-axis alignment                                      |
| `padding`        | `number`                                                                                                     | --         | Padding on all sides                                     |
| `paddingX`       | `number`                                                                                                     | --         | Horizontal padding                                       |
| `paddingY`       | `number`                                                                                                     | --         | Vertical padding                                         |
| `paddingTop`     | `number`                                                                                                     | --         | Top padding                                              |
| `paddingBottom`  | `number`                                                                                                     | --         | Bottom padding                                           |
| `paddingLeft`    | `number`                                                                                                     | --         | Left padding                                             |
| `paddingRight`   | `number`                                                                                                     | --         | Right padding                                            |
| `margin`         | `number`                                                                                                     | --         | Margin on all sides                                      |
| `marginX`        | `number`                                                                                                     | --         | Horizontal margin                                        |
| `marginY`        | `number`                                                                                                     | --         | Vertical margin                                          |
| `marginTop`      | `number`                                                                                                     | --         | Top margin                                               |
| `marginBottom`   | `number`                                                                                                     | --         | Bottom margin                                            |
| `marginLeft`     | `number`                                                                                                     | --         | Left margin                                              |
| `marginRight`    | `number`                                                                                                     | --         | Right margin                                             |
| `gap`            | `number`                                                                                                     | --         | Gap between children                                     |
| `columnGap`      | `number`                                                                                                     | --         | Gap between columns                                      |
| `rowGap`         | `number`                                                                                                     | --         | Gap between rows                                         |
| `position`       | `"relative" \| "absolute" \| "sticky" \| "static"`                                                           | --         | Positioning mode                                         |
| `top`            | `number \| string`                                                                                           | --         | Top offset (for absolute/relative)                       |
| `left`           | `number \| string`                                                                                           | --         | Left offset                                              |
| `bottom`         | `number \| string`                                                                                           | --         | Bottom offset                                            |
| `right`          | `number \| string`                                                                                           | --         | Right offset                                             |
| `stickyTop`      | `number`                                                                                                     | --         | Sticky top offset                                        |
| `stickyBottom`   | `number`                                                                                                     | --         | Sticky bottom offset                                     |
| `aspectRatio`    | `number`                                                                                                     | --         | Aspect ratio                                             |
| `display`        | `"flex" \| "none"`                                                                                           | `"flex"`   | Display mode                                             |
| `overflow`       | `"visible" \| "hidden" \| "scroll"`                                                                          | --         | Overflow behavior                                        |
| `overflowX`      | `"visible" \| "hidden"`                                                                                      | --         | Horizontal overflow                                      |
| `overflowY`      | `"visible" \| "hidden"`                                                                                      | --         | Vertical overflow                                        |
| `scrollTo`       | `number`                                                                                                     | --         | Child index to ensure visible (when `overflow="scroll"`) |
| `scrollOffset`   | `number`                                                                                                     | --         | Explicit scroll offset in rows                           |

### Style (StyleProps)

| Prop              | Type                                                               | Default | Description                                   |
| ----------------- | ------------------------------------------------------------------ | ------- | --------------------------------------------- |
| `color`           | `string`                                                           | --      | Foreground color (name, hex, or `$token`)     |
| `backgroundColor` | `string`                                                           | --      | Background color                              |
| `bold`            | `boolean`                                                          | --      | Bold text                                     |
| `dim`             | `boolean`                                                          | --      | Dim text                                      |
| `dimColor`        | `boolean`                                                          | --      | Dim text (alias for `dim`, Ink compatibility) |
| `italic`          | `boolean`                                                          | --      | Italic text                                   |
| `underline`       | `boolean`                                                          | --      | Enable underline                              |
| `underlineStyle`  | `"single" \| "double" \| "curly" \| "dotted" \| "dashed" \| false` | --      | Underline style variant                       |
| `underlineColor`  | `string`                                                           | --      | Underline color (independent of text color)   |
| `strikethrough`   | `boolean`                                                          | --      | Strikethrough text                            |
| `inverse`         | `boolean`                                                          | --      | Inverse (swap fg/bg)                          |

### Border & Outline

| Prop              | Type                                                                                         | Default | Description                      |
| ----------------- | -------------------------------------------------------------------------------------------- | ------- | -------------------------------- |
| `borderStyle`     | `"single" \| "double" \| "round" \| "bold" \| "singleDouble" \| "doubleSingle" \| "classic"` | --      | Border style                     |
| `borderColor`     | `string`                                                                                     | --      | Border color                     |
| `borderTop`       | `boolean`                                                                                    | --      | Show top border                  |
| `borderBottom`    | `boolean`                                                                                    | --      | Show bottom border               |
| `borderLeft`      | `boolean`                                                                                    | --      | Show left border                 |
| `borderRight`     | `boolean`                                                                                    | --      | Show right border                |
| `outlineStyle`    | `"single" \| "double" \| "round" \| "bold" \| "singleDouble" \| "doubleSingle" \| "classic"` | --      | Outline style (no layout impact) |
| `outlineColor`    | `string`                                                                                     | --      | Outline color                    |
| `outlineDimColor` | `boolean`                                                                                    | --      | Dim outline                      |
| `outlineTop`      | `boolean`                                                                                    | `true`  | Show top outline                 |
| `outlineBottom`   | `boolean`                                                                                    | `true`  | Show bottom outline              |
| `outlineLeft`     | `boolean`                                                                                    | `true`  | Show left outline                |
| `outlineRight`    | `boolean`                                                                                    | `true`  | Show right outline               |

### Other

| Prop                | Type                     | Default  | Description                                  |
| ------------------- | ------------------------ | -------- | -------------------------------------------- |
| `children`          | `ReactNode`              | --       | Child elements                               |
| `theme`             | `Theme`                  | --       | Override theme for this subtree              |
| `pointerEvents`     | `"auto" \| "none"`       | `"auto"` | CSS pointer-events equivalent                |
| `onLayout`          | `(layout: Rect) => void` | --       | Called when layout changes                   |
| `overflowIndicator` | `boolean`                | --       | Show scroll overflow indicators              |
| `id`                | `string`                 | --       | Element ID for DOM queries                   |
| `testID`            | `string`                 | --       | Test ID for querying nodes                   |
| `focusable`         | `boolean`                | --       | Whether this node participates in focus tree |
| `focusScope`        | `boolean`                | --       | Whether this node is a focus scope boundary  |

### Ref: BoxHandle

```ts
interface BoxHandle {
  getNode(): AgNode | null
  getboxRect(): Rect | null
  getScrollRect(): Rect | null
}
```

## Usage

```tsx
// Basic vertical layout (default)
<Box>
  <Text>Line 1</Text>
  <Text>Line 2</Text>
</Box>

// Horizontal layout with spacing
<Box flexDirection="row" gap={2}>
  <Box width={10}><Text>Left</Text></Box>
  <Box flexGrow={1}><Text>Center</Text></Box>
  <Box width={10}><Text>Right</Text></Box>
</Box>

// With border
<Box borderStyle="single" borderColor="green" padding={1}>
  <Text>Boxed content</Text>
</Box>

// With ref and onLayout
const boxRef = useRef<BoxHandle>(null)
<Box
  ref={boxRef}
  onLayout={(layout) => console.log('Size:', layout.width, layout.height)}
>
  <Text>Content</Text>
</Box>
```

## See Also

- [Text](./Text.md) -- text rendering primitive
- [Spacer](./Spacer.md) -- fills available space
- [Fill](./Fill.md) -- repeats content to fill width
