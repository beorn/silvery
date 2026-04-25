# ModalDialog

Reusable modal dialog with consistent styling: double border, title bar, optional footer, and solid background that covers board content.

## Import

```tsx
import { ModalDialog, formatTitleWithHotkey } from "silvery"
```

## Props

| Prop          | Type                                     | Default      | Description                                             |
| ------------- | ---------------------------------------- | ------------ | ------------------------------------------------------- |
| `children`    | `ReactNode`                              | **required** | Dialog content                                          |
| `title`       | `string`                                 | --           | Dialog title (rendered bold in titleColor)              |
| `titleColor`  | `string`                                 | `"$fg-accent"` | Title color override                                  |
| `titleAlign`  | `"center" \| "flex-start" \| "flex-end"` | `"center"`   | Title alignment                                         |
| `hotkey`      | `string`                                 | --           | Toggle hotkey character (renders `[X]` prefix in title) |
| `titleRight`  | `ReactNode`                              | --           | Content on the right side of the title bar              |
| `borderColor` | `string`                                 | `"$border-default"` | Border color (focus ring uses `$border-focus`)   |
| `width`       | `number`                                 | --           | Dialog width                                            |
| `height`      | `number`                                 | --           | Dialog height (auto-height if omitted)                  |
| `footer`      | `ReactNode`                              | --           | Footer hint text (dimColor at bottom)                   |
| `footerAlign` | `"center" \| "flex-start" \| "flex-end"` | `"center"`   | Footer alignment                                        |
| `onClose`     | `() => void`                             | --           | Called when ESC is pressed                              |
| `focusScope`  | `boolean`                                | `true`       | Whether to create a focus scope                         |

## Helper: formatTitleWithHotkey

Formats a dialog title with a hotkey prefix. If the hotkey letter appears in the title, highlights it inline.

```tsx
formatTitleWithHotkey("Details", "D") // [D]etails
formatTitleWithHotkey("Help", "?") // [?] Help
```

## Usage

```tsx
<ModalDialog title="Settings" width={60} footer="ESC to close">
  <Text>Dialog content here</Text>
</ModalDialog>

<ModalDialog title="Help" hotkey="?" titleRight={<Text>1/3</Text>}>
  <Text>Help content</Text>
</ModalDialog>
```

## Visual Structure

```
+==========================+
|       Dialog Title       |
|                          |
|   Content area           |
|                          |
|       Footer hint        |
+==========================+
```

Double border, `$surface-bg` background, `paddingX={2}`, `paddingY={1}`.

## See Also

- [PickerDialog](./PickerDialog.md) -- search-and-select dialog built on ModalDialog
