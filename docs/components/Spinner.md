# Spinner

An animated loading spinner with multiple built-in styles. Extends `TextProps` for style inheritance.

## Import

```tsx
import { Spinner } from "silvery"
```

## Props

`SpinnerProps` extends `TextProps` (excluding `children`).

| Prop       | Type                                    | Default  | Description                    |
| ---------- | --------------------------------------- | -------- | ------------------------------ |
| `type`     | `"dots" \| "line" \| "arc" \| "bounce"` | `"dots"` | Spinner style preset           |
| `label`    | `string`                                | --       | Label text shown after spinner |
| `interval` | `number`                                | `80`     | Animation interval in ms       |

All `TextProps` style props (color, bold, etc.) are also accepted.

### Frame Sequences

| Type     | Frames            |
| -------- | ----------------- |
| `dots`   | `"..."`           |
| `line`   | `\|` `/` `--` `\` |
| `arc`    | curved arcs       |
| `bounce` | bouncing dots     |

## Usage

```tsx
<Spinner />
<Spinner type="arc" label="Loading..." />
<Spinner type="bounce" interval={120} />
<Spinner color="$fg-accent" label="Processing" />
```

## See Also

- [ProgressBar](./ProgressBar.md) -- progress indicator with percentage
