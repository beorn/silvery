# Badge

A small inline label for status display. Extends `TextProps` for style inheritance.

## Import

```tsx
import { Badge } from "silvery"
```

## Props

`BadgeProps` extends `TextProps` (excluding `children`).

| Prop      | Type                                                          | Default      | Description   |
| --------- | ------------------------------------------------------------- | ------------ | ------------- |
| `label`   | `string`                                                      | **required** | Badge text    |
| `variant` | `"default" \| "primary" \| "success" \| "warning" \| "error"` | `"default"`  | Color variant |

All `TextProps` style props (color, bold, etc.) are also accepted. Explicit `color` overrides the variant color.

### Variant Colors

| Variant   | Token         |
| --------- | ------------- |
| `default` | `$fg`         |
| `primary` | `$fg-accent`  |
| `success` | `$fg-success` |
| `warning` | `$fg-warning` |
| `error`   | `$fg-error`   |

## Usage

```tsx
<Badge label="Active" variant="success" />
<Badge label="Warning" variant="warning" />
<Badge label="Custom" color="magenta" />
```

## See Also

- [Text](./Text.md) -- base text component
