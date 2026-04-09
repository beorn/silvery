# Divider

A horizontal separator line with optional centered title. Uses `useBoxRect` for responsive width.

## Import

```tsx
import { Divider } from "silvery"
```

## Props

| Prop    | Type     | Default | Description                                       |
| ------- | -------- | ------- | ------------------------------------------------- |
| `char`  | `string` | `"--"`  | Character to repeat                               |
| `title` | `string` | --      | Title text centered in divider                    |
| `width` | `number` | auto    | Width (uses available width via `useBoxRect`) |

## Usage

```tsx
// Simple divider
<Divider />

// With title
<Divider title="Section" />

// Custom character and width
<Divider char="=" width={40} />
```

## See Also

- [Fill](./Fill.md) -- repeats content to fill width
- [HR](./typography.md) -- typography horizontal rule
