# Components

## Box

Flexbox container with borders, padding, and overflow control.

```tsx
<Box flexDirection="column" padding={1} borderStyle="single">
  <Text>Content</Text>
</Box>
```

Box supports all standard flexbox props: `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `alignSelf`, `justifyContent`, `flexWrap`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `padding`, `paddingX`, `paddingY`, `margin`, `gap`, `borderStyle`, `borderColor`, `overflow`.

### Scrollable Containers

```tsx
<Box overflow="scroll" height={10} scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i}>{item.name}</Text>
  ))}
</Box>
```

## Text

Styled text with auto-truncation.

```tsx
<Text color="green" bold>Success</Text>
<Text underlineStyle="curly" underlineColor="red">Error</Text>
```

### Text Style Props

| Prop              | Type           | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `color`           | string         | Foreground color (named, hex, or rgb())                           |
| `backgroundColor` | string         | Background color                                                  |
| `bold`            | boolean        | Bold text                                                         |
| `dim`             | boolean        | Dimmed text                                                       |
| `italic`          | boolean        | Italic text                                                       |
| `underline`       | boolean        | Simple underline                                                  |
| `underlineStyle`  | UnderlineStyle | `'single'` \| `'double'` \| `'curly'` \| `'dotted'` \| `'dashed'` |
| `underlineColor`  | string         | Underline color (independent of text color)                       |
| `strikethrough`   | boolean        | Strikethrough text                                                |
| `inverse`         | boolean        | Swap foreground/background                                        |

Text auto-truncates by default. Use `wrap="wrap"` to wrap instead, or `wrap="overflow"` to allow overflow.

## VirtualList

Efficient rendering for large lists (100+ items). Only renders visible items.

```tsx
<VirtualList
  items={cards}
  height={20}
  itemHeight={1}
  scrollTo={selectedIndex}
  renderItem={(card, index) => <Text key={card.id}>{card.name}</Text>}
/>
```

### Frozen Items (Scrollback)

VirtualList supports a `frozen` prop that excludes a contiguous prefix of items from rendering. Pair with `useScrollback` to push frozen items to terminal scrollback:

```tsx
const frozenCount = useScrollback(items, {
  frozen: (item) => item.complete,
  render: (item) => `  ✓ ${item.title}`,
})

<VirtualList
  items={items}
  frozen={(item) => item.complete}
  renderItem={(item) => <Text>{item.title}</Text>}
/>
```

## Static

Renders content once above the dynamic output. Useful for completed items in a stream.

```tsx
<Static items={completedTasks}>
  {(task) => <Text key={task.id}>✓ {task.name}</Text>}
</Static>
```

## Console

Captures `console.log` / `console.error` output and renders it as a component.

```tsx
import { render, Console, patchConsole } from "inkx"

function App({ console: patched }) {
  return (
    <Box flexDirection="column">
      <Console console={patched} />
      <Text>Status: running</Text>
    </Box>
  )
}

using patched = patchConsole(console)
await render(<App console={patched} />, term)
```

## TextInput

Basic text input with onChange/onSubmit:

```tsx
import { TextInput } from "inkx"
;<TextInput
  value={query}
  onChange={setQuery}
  onSubmit={(value) => console.log("Submitted:", value)}
  placeholder="type here..."
/>
```

## ReadlineInput

Text input with full readline shortcuts (Ctrl+A/E start/end, Ctrl+W delete word, Ctrl+K kill to end, Ctrl+Y yank):

```tsx
import { ReadlineInput } from "inkx"
;<ReadlineInput
  value={command}
  onChange={setCommand}
  onSubmit={executeCommand}
  prompt="$ "
/>
```

## TextArea

Multi-line text input with word wrapping, scrolling, and cursor movement.

```tsx
import { TextArea } from "inkx"

const [value, setValue] = useState("")
<TextArea
  value={value}
  onChange={setValue}
  onSubmit={(val) => console.log("Submitted:", val)}
  height={10}
  placeholder="Type here..."
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `value` | `string` | Current value (controlled) |
| `defaultValue` | `string` | Initial value (uncontrolled) |
| `onChange` | `(value: string) => void` | Called when value changes |
| `onSubmit` | `(value: string) => void` | Called on submit |
| `submitKey` | `"ctrl+enter" \| "enter"` | Submit key (default: `"ctrl+enter"`) |
| `placeholder` | `string` | Placeholder text when empty |
| `isActive` | `boolean` | Whether input is focused |
| `height` | `number` | Visible height in rows (required) |
| `cursorStyle` | `"block" \| "underline"` | Cursor style (default: `"block"`) |

Keyboard shortcuts: Arrow keys, Home/End, Ctrl+A/E (line start/end), Ctrl+K/U (kill line), PageUp/PageDown, Backspace/Delete.

## InputBoundary

Isolates input for embedded interactive components. When active, input flows to children only; the parent's handlers don't fire.

```tsx
import { InputBoundary } from "inkx"

<InputBoundary active={focused} onEscape={() => setFocused(false)}>
  <EmbeddedInteractiveComponent />
</InputBoundary>
```

| Prop | Type | Description |
|------|------|-------------|
| `active` | `boolean` | Whether input flows to children |
| `onEscape` | `() => void` | Called when escape is pressed while active |
| `exitKey` | `string \| null` | Key to exit (default: Escape, null to disable) |
| `children` | `ReactNode` | Components inside the isolated scope |

## Newline

Inserts a line break:

```tsx
<Text>First line</Text>
<Newline />
<Text>Second line</Text>
```

## Spacer

Fills available space (equivalent to `flexGrow: 1`):

```tsx
<Box>
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>
```
