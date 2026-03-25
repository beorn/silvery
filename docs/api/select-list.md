# SelectList

Keyboard-navigable single-select list with built-in j/k, arrow keys, and Enter to confirm.

## Import

```tsx
import { SelectList } from "silvery"
```

## Usage

```tsx
const items = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry", disabled: true },
]

<SelectList items={items} onSelect={(opt) => console.log(opt.value)} />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `SelectOption[]` | *required* | List of options to display |
| `highlightedIndex` | `number` | — | Controlled: current highlighted index |
| `onHighlight` | `(index: number) => void` | — | Called when highlight changes |
| `onSelect` | `(option: SelectOption, index: number) => void` | — | Called when Enter is pressed on an item |
| `initialIndex` | `number` | first enabled | Starting index for uncontrolled mode |
| `maxVisible` | `number` | — | Max visible items before scrolling |
| `isActive` | `boolean` | `true` | Whether this list captures keyboard input |

### SelectOption

```ts
interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}
```

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `j` / `Down` | Move highlight down |
| `k` / `Up` | Move highlight up |
| `Enter` | Select the highlighted item |
| `Ctrl+A` | Jump to first enabled item |
| `Ctrl+E` | Jump to last enabled item |

Disabled items are automatically skipped during navigation.

## Examples

### Uncontrolled (Internal State)

```tsx
<SelectList
  items={[
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
  ]}
  onSelect={(opt) => setSize(opt.value)}
/>
```

### Controlled (External State)

```tsx
const [index, setIndex] = useState(0)

<SelectList
  items={options}
  highlightedIndex={index}
  onHighlight={setIndex}
  onSelect={(opt) => handleSelect(opt)}
/>
```

### Scrollable with Max Visible

```tsx
<SelectList
  items={longList}
  maxVisible={5}
  onSelect={(opt) => console.log(opt.value)}
/>
```

The visible window auto-centers around the highlighted item.
