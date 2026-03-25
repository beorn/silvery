# CommandPalette

Filterable command list with fuzzy search, keyboard navigation, and shortcut hints. Type to filter, navigate with arrows, confirm with Enter, dismiss with Escape.

## Import

```tsx
import { CommandPalette } from "silvery"
```

## Usage

```tsx
const commands = [
  { name: "Save", description: "Save current file", shortcut: "Ctrl+S" },
  { name: "Quit", description: "Exit application", shortcut: "Ctrl+Q" },
  { name: "Help", description: "Show help" },
]

<CommandPalette
  commands={commands}
  onSelect={(cmd) => exec(cmd.name)}
  onClose={() => setShowPalette(false)}
/>
```

## Props

| Prop          | Type                             | Default                | Description                               |
| ------------- | -------------------------------- | ---------------------- | ----------------------------------------- |
| `commands`    | `CommandItem[]`                  | _required_             | Available commands                        |
| `onSelect`    | `(command: CommandItem) => void` | —                      | Called when Enter is pressed on a command |
| `onClose`     | `() => void`                     | —                      | Called when Escape is pressed             |
| `placeholder` | `string`                         | `"Search commands..."` | Placeholder for the filter input          |
| `maxVisible`  | `number`                         | `10`                   | Maximum visible results                   |
| `isActive`    | `boolean`                        | `true`                 | Whether keyboard input is captured        |

### CommandItem

```ts
interface CommandItem {
  /** Command display name */
  name: string
  /** Command description */
  description?: string
  /** Keyboard shortcut hint */
  shortcut?: string
}
```

## Keyboard Shortcuts

| Key               | Action                       |
| ----------------- | ---------------------------- |
| `Up`              | Move selection up            |
| `Down`            | Move selection down          |
| `Enter`           | Execute selected command     |
| `Escape`          | Close the palette            |
| `Backspace`       | Delete last filter character |
| Any printable key | Append to filter             |

## Filtering

Commands are filtered using case-insensitive fuzzy matching against both `name` and `description`. All typed characters must appear in order, but not necessarily adjacent:

- Typing `"sv"` matches `"Save"`
- Typing `"ext"` matches `"Exit application"` (via description)

## Examples

### Toggle Visibility

```tsx
function App() {
  const [showPalette, setShowPalette] = useState(false)

  useInput((input, key) => {
    if (key.ctrl && input === "p") setShowPalette(true)
  })

  return (
    <Box flexDirection="column">
      <MainContent />
      {showPalette && (
        <CommandPalette commands={commands} onSelect={handleCommand} onClose={() => setShowPalette(false)} />
      )}
    </Box>
  )
}
```

### Editor Commands

```tsx
<CommandPalette
  commands={[
    { name: "New File", description: "Create a new file", shortcut: "Ctrl+N" },
    { name: "Open File", description: "Open existing file", shortcut: "Ctrl+O" },
    { name: "Find", description: "Search in file", shortcut: "Ctrl+F" },
    { name: "Replace", description: "Find and replace", shortcut: "Ctrl+H" },
    { name: "Toggle Sidebar", description: "Show/hide sidebar", shortcut: "Ctrl+B" },
  ]}
  onSelect={(cmd) => dispatch(cmd.name)}
  onClose={closePalette}
  placeholder="Type a command..."
/>
```
