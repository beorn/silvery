# SelectList

A keyboard-navigable single-select list. Supports controlled and uncontrolled modes. Items can be disabled.

## Import

```tsx
import { SelectList } from "silvery"
```

## Props

| Prop               | Type                                            | Default       | Description                                 |
| ------------------ | ----------------------------------------------- | ------------- | ------------------------------------------- |
| `items`            | `SelectOption[]`                                | **required**  | List of options                             |
| `highlightedIndex` | `number`                                        | --            | Controlled: current highlighted index       |
| `onHighlight`      | `(index: number) => void`                       | --            | Called when highlight changes               |
| `onSelect`         | `(option: SelectOption, index: number) => void` | --            | Called when user confirms selection (Enter) |
| `initialIndex`     | `number`                                        | first enabled | Initial index for uncontrolled mode         |
| `maxVisible`       | `number`                                        | --            | Max visible items (rest scrolled)           |
| `isActive`         | `boolean`                                       | `true`        | Whether this list captures input            |
| `indicator`        | `string`                                        | `"▸ "`        | Selection indicator prefix (`""` to hide)   |

### SelectOption

```ts
interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}
```

## Keyboard Shortcuts

| Key      | Action                     |
| -------- | -------------------------- |
| j / Down | Move highlight down        |
| k / Up   | Move highlight up          |
| Enter    | Confirm selection          |
| Ctrl+A   | Jump to first enabled item |
| Ctrl+E   | Jump to last enabled item  |

## Usage

```tsx
const items = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry", disabled: true },
]

<SelectList items={items} onSelect={(opt) => console.log(opt.value)} />

// Controlled mode
<SelectList
  items={items}
  highlightedIndex={selected}
  onHighlight={setSelected}
  onSelect={handleSelect}
/>
```

## See Also

- [ListView](./ListView.md) -- virtualized list with navigation
- [PickerDialog](./PickerDialog.md) -- search-and-select dialog
