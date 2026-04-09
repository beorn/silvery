# EditContextDisplay

Pure rendering component for multi-line text display with scrolling and cursor highlighting. Unlike TextArea, this component has no input handling -- the command system handles all input. This is the rendering half of the edit context pattern.

## Import

```tsx
import { EditContextDisplay } from "silvery"
```

## Props

| Prop            | Type                       | Default      | Description                                           |
| --------------- | -------------------------- | ------------ | ----------------------------------------------------- |
| `value`         | `string`                   | **required** | Current text value                                    |
| `cursor`        | `number`                   | **required** | Cursor position as character offset                   |
| `height`        | `number`                   | --           | Visible height in rows (renders all lines if omitted) |
| `wrapWidth`     | `number`                   | --           | Width for word wrapping (no wrapping if omitted)      |
| `cursorStyle`   | `"block" \| "underline"`   | `"block"`    | Cursor style                                          |
| `placeholder`   | `string`                   | `""`         | Placeholder text when value is empty                  |
| `showCursor`    | `boolean`                  | `true`       | Whether to show the cursor                            |
| `onCursorClick` | `(offset: number) => void` | --           | Called when clicked, provides character offset        |

## Usage

```tsx
const { value, cursor } = useEditContext({ ... })
const { width } = useBoxRect()

<EditContextDisplay
  value={value}
  cursor={cursor}
  height={10}
  wrapWidth={width}
/>
```

## Behavior

- Word wrapping uses the provided `wrapWidth`
- Scroll offset is tracked internally via ref (no useState needed)
- Cursor is kept visible by auto-scrolling the viewport
- Click-to-position maps mouse coordinates to character offsets

## See Also

- [TextArea](./TextArea.md) -- multi-line input with built-in editing
- [CursorLine](./CursorLine.md) -- single-line cursor rendering
