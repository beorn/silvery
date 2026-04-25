# Text

The primitive for rendering text content. Supports styling (colors, bold, italic, etc.), text wrapping/truncation modes, and nested Text elements for inline style changes.

## Import

```tsx
import { Text } from "silvery"
```

## Props

`TextProps` extends `StyleProps`, `TestProps`, and `MouseEventProps`.

| Prop              | Type                                                                                                   | Default  | Description                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------ |
| `children`        | `ReactNode`                                                                                            | --       | Text content (string, number, or nested Text elements) |
| `color`           | `string`                                                                                               | --       | Foreground color (name, hex, or `$token`)              |
| `backgroundColor` | `string`                                                                                               | --       | Background color                                       |
| `bold`            | `boolean`                                                                                              | --       | Bold text                                              |
| `dim`             | `boolean`                                                                                              | --       | Dim text                                               |
| `dimColor`        | `boolean`                                                                                              | --       | Dim text (alias, Ink compatibility)                    |
| `italic`          | `boolean`                                                                                              | --       | Italic text                                            |
| `underline`       | `boolean`                                                                                              | --       | Enable underline                                       |
| `underlineStyle`  | `"single" \| "double" \| "curly" \| "dotted" \| "dashed" \| false`                                     | --       | Underline style variant                                |
| `underlineColor`  | `string`                                                                                               | --       | Underline color                                        |
| `strikethrough`   | `boolean`                                                                                              | --       | Strikethrough text                                     |
| `inverse`         | `boolean`                                                                                              | --       | Inverse (swap fg/bg)                                   |
| `wrap`            | `"wrap" \| "truncate" \| "truncate-start" \| "truncate-middle" \| "truncate-end" \| "clip" \| boolean` | `"wrap"` | Text wrapping/truncation mode                          |

### Ref: TextHandle

```ts
interface TextHandle {
  getNode(): AgNode | null
}
```

## Usage

```tsx
// Basic text
<Text>Hello, world!</Text>

// Colored text
<Text color="green">Success!</Text>
<Text color="#ff6600">Orange text</Text>

// Styled text
<Text bold>Important</Text>
<Text italic underline>Emphasized</Text>

// Combined styles
<Text color="red" bold inverse>Alert!</Text>

// Nested text with different styles
<Text>
  Normal <Text bold>bold</Text> normal
</Text>

// Truncation modes
<Text wrap="truncate">This long text will be truncated...</Text>
<Text wrap="truncate-middle">Long...text</Text>

// Semantic theme colors (Sterling)
<Text color="$fg-accent">Brand emphasis</Text>
<Text color="$fg-muted">Secondary info</Text>
```

## See Also

- [Box](./Box.md) -- layout container
- [Typography](./typography.md) -- semantic text presets (H1, H2, P, etc.)
