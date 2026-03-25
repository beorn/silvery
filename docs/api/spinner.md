# Spinner

Animated loading spinner with multiple built-in animation styles. Extends `Text` props for styling.

## Import

```tsx
import { Spinner } from "silvery"
```

## Usage

```tsx
<Spinner />
<Spinner type="arc" label="Loading..." />
<Spinner type="bounce" interval={120} />
```

## Props

All [`Text` props](./text) are supported (color, bold, dim, etc.) in addition to:

| Prop       | Type                                    | Default  | Description                        |
| ---------- | --------------------------------------- | -------- | ---------------------------------- |
| `type`     | `"dots" \| "line" \| "arc" \| "bounce"` | `"dots"` | Animation style                    |
| `label`    | `string`                                | —        | Label text shown after spinner     |
| `interval` | `number`                                | `80`     | Animation interval in milliseconds |

## Animation Styles

| Type     | Frames                | Description                   |
| -------- | --------------------- | ----------------------------- |
| `dots`   | `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏` | Braille dot spinner (default) |
| `line`   | `\| / — \`            | Classic line spinner          |
| `arc`    | `◜ ◠ ◝ ◞ ◡ ◟`         | Arc rotation                  |
| `bounce` | `⠁ ⠂ ⠄ ⡀ ⢀ ⠠ ⠐ ⠈`     | Bouncing braille dot          |

## Examples

### With Label

```tsx
<Spinner label="Fetching data..." color="$primary" />
```

Output: `⠋ Fetching data...` (animated)

### Styled Spinner

```tsx
<Spinner type="arc" color="$success" bold />
```

### Loading State

```tsx
function DataView({ isLoading, data }) {
  if (isLoading) {
    return <Spinner label="Loading..." />
  }
  return <Text>{data}</Text>
}
```
