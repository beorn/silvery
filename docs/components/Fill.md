# Fill

Repeats its children's text content to fill the parent's allocated width. Uses single-pass rendering -- generates a long repeated string that gets hard-clipped by wrap="clip". No `useBoxRect`, no layout re-render cycle.

## Import

```tsx
import { Fill } from "silvery"
```

## Props

| Prop       | Type        | Default      | Description                                                         |
| ---------- | ----------- | ------------ | ------------------------------------------------------------------- |
| `children` | `ReactNode` | **required** | Content to repeat (typically a styled Text element or plain string) |
| `measurer` | `Measurer`  | --           | Optional explicit measurer for width calculation                    |

## Usage

```tsx
// Dot leaders -- parent needs flexGrow={1} flexBasis={0}
<Box flexDirection="row">
  <Text color="yellow">hjkl</Text>
  <Box flexGrow={1} flexBasis={0}>
    <Fill><Text dimColor>.</Text></Fill>
  </Box>
  <Text>navigate</Text>
</Box>

// Section header fill
<Box flexDirection="row">
  <Text dimColor>-- </Text>
  <Text bold color="cyan">NAVIGATION</Text>
  <Box flexGrow={1} flexBasis={0}>
    <Fill><Text dimColor> -</Text></Fill>
  </Box>
</Box>
```

## Notes

Parent Box **must** use `flexBasis={0}` to prevent the long content from inflating the flex item's minimum size.

## See Also

- [Box](./Box.md) -- layout container
- [Divider](./Divider.md) -- horizontal separator line
