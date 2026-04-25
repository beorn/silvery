# Tooltip

Shows contextual help text near the target element. In a terminal UI, the tooltip renders inline below the target since there is no floating layer. Visibility is controlled via the `show` prop.

## Import

```tsx
import { Tooltip } from "silvery"
```

## Props

| Prop       | Type        | Default      | Description                    |
| ---------- | ----------- | ------------ | ------------------------------ |
| `content`  | `string`    | **required** | Tooltip text content           |
| `show`     | `boolean`   | `false`      | Whether the tooltip is visible |
| `children` | `ReactNode` | **required** | Target element                 |

## Usage

```tsx
<Tooltip content="Delete permanently" show={isFocused}>
  <Button label="Delete" onPress={handleDelete} />
</Tooltip>

// Always visible
<Tooltip content="This action cannot be undone" show>
  <Text>Dangerous action</Text>
</Tooltip>
```

## Rendering

Tooltip text is rendered below the target in `$fg-muted` for subtlety.

## See Also

- [Badge](./Badge.md) -- inline status label
